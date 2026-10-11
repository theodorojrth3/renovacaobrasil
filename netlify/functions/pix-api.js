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

// Store com configuracoes do site (ex.: credenciais do gateway escritas server-side).
function configStore() {
  return getStore({ name: "site_config", consistency: "strong" });
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

// ---------- Gateway BlackCat (https://docs.blackcatoficial.com) ----------
// A chave do gateway NAO fica no repositorio: vive no Blobs (store "site_config",
// chave "gateway") escrito server-side. Variaveis de ambiente (PIX_API_BASE /
// PIX_API_TOKEN) sao o fallback para quem preferir configura-las no painel.
const BLACKCAT_DEFAULT_BASE_URL = "https://api.blackcatoficial.com/api";

let cachedGatewayConfig = null;
let gatewayConfigFetchedAt = 0;

async function getGatewayConfig() {
  if (cachedGatewayConfig && Date.now() - gatewayConfigFetchedAt < 60000) {
    return cachedGatewayConfig;
  }
  let config = null;
  let blobConfig = null;
  try {
    blobConfig = await configStore().get("gateway", { type: "json" });
  } catch {
    blobConfig = null;
  }
  if (blobConfig && blobConfig.provider === "blackcat" && blobConfig.api_key) {
    config = {
      baseUrl: String(blobConfig.api_base || BLACKCAT_DEFAULT_BASE_URL),
      apiKey: String(blobConfig.api_key)
    };
  }
  if (!config) {
    const envBase = process.env.PIX_API_BASE;
    const envToken = process.env.PIX_API_TOKEN;
    if (envToken) {
      config = { baseUrl: envBase || BLACKCAT_DEFAULT_BASE_URL, apiKey: envToken };
    }
  }
  if (config) {
    cachedGatewayConfig = config;
    gatewayConfigFetchedAt = Date.now();
  }
  return config;
}

function centavos(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

// Extrai o codigo PIX (copy-paste) de qualquer variacao de resposta do gateway.
// Resposta real: { success, data: { transactionId, paymentData: { copyPaste, qrCode } } }
function extractPixCode(data) {
  if (!data || typeof data !== "object") return null;
  const inner = data.data && typeof data.data === "object" ? data.data : data;
  const pd = inner.paymentData || inner.payment_data || data.paymentData || data.payment_data || {};
  return (
    pd.copyPaste || pd.copy_paste || pd.qrCode || pd.qr_code ||
    inner.pix_code || inner.pixCode || inner.qr_code || inner.qrcode ||
    data.pix_code || data.pixCode || data.qr_code || data.qrcode ||
    data.copyPaste || data.copy_paste_code || null
  );
}

function extractGatewayTxId(data) {
  if (!data || typeof data !== "object") return null;
  const d = data.data && typeof data.data === "object" ? data.data : data;
  return d.transactionId || d.transaction_id || d.id || null;
}

// Cria uma venda PIX no gateway BlackCat e retorna { pixCode, gatewayTxId } ou erro.
async function createBlackCatSale(body, transactionId, amount) {
  const gatewayConfig = await getGatewayConfig();
  if (!gatewayConfig) {
    return { error: "Gateway PIX nao configurado (credenciais ausentes)" };
  }
  const { baseUrl: BLACKCAT_BASE_URL, apiKey: BLACKCAT_API_KEY } = gatewayConfig;

  const customerName = String(body.customer_name || "").trim() || "Cliente";
  const customerEmail = String(body.customer_email || "").trim() || "cliente@exemplo.com";
  const customerPhoneRaw = normalizeCpf(body.customer_phone).slice(0, 13) || "11999999999";
  const customerCpf = normalizeCpf(body.customer_cpf);
  const documento = customerCpf.length === 11 ? customerCpf : "00000000000";

  const payload = {
    amount: centavos(amount),
    currency: "BRL",
    paymentMethod: "pix",
    items: [
      {
        title: "Taxa de servico",
        quantity: 1,
        unitPrice: centavos(amount),
        tangible: false
      }
    ],
    customer: {
      name: customerName,
      email: customerEmail,
      phone: customerPhoneRaw,
      document: {
        number: documento,
        type: "cpf"
      }
    },
    externalRef: transactionId
  };

  const callbackUrl =
    process.env.PIX_CALLBACK_URL ||
    (process.env.URL ? `${String(process.env.URL).replace(/\/$/, "")}/api/webhooks/blackcat` : "");
  if (callbackUrl) {
    payload.postbackUrl = callbackUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(BLACKCAT_BASE_URL.replace(/\/$/, "") + "/sales/create-sale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BLACKCAT_API_KEY
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await resp.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const pixCode = extractPixCode(data);
    if (resp.ok && pixCode) {
      return { pixCode, gatewayTxId: extractGatewayTxId(data) };
    }
    return {
      error: data.message || data.error || `HTTP ${resp.status}`,
      status: resp.status,
      detail: typeof text === "string" ? text.slice(0, 300) : ""
    };
  } catch (err) {
    return { error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

// Consulta o status de uma venda no gateway (PENDING/PAID/CANCELLED/REFUNDED).
async function getBlackCatStatus(gatewayTxId) {
  const gatewayConfig = await getGatewayConfig();
  if (!gatewayConfig || !gatewayTxId) return null;
  const { baseUrl: BLACKCAT_BASE_URL, apiKey: BLACKCAT_API_KEY } = gatewayConfig;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(
      `${BLACKCAT_BASE_URL.replace(/\/$/, "")}/sales/${encodeURIComponent(gatewayTxId)}/status`,
      { method: "GET", headers: { "X-API-Key": BLACKCAT_API_KEY }, signal: controller.signal }
    );
    const text = await resp.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (resp.ok && data && data.data) {
      return String(data.data.status || "").toUpperCase();
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createPixTransaction(body, kind) {
  const amount = Number(body.amount) > 0 ? Number(body.amount) : 95.6;
  const transactionId = randomId("tx");
  const depositId = randomId("dep", 6);

  const sale = await createBlackCatSale(body, transactionId, amount);
  let pixCode = sale.pixCode || null;
  const gatewayTxId = sale.gatewayTxId || null;
  const gatewayError = sale.error || null;

  if (!pixCode) {
    // Gateway falhou: registra o erro e retorna falha sem codigo demo.
    console.error("gateway error:", gatewayError);
    return {
      success: false,
      error: "Falha ao gerar PIX no gateway",
      details: gatewayError,
      transaction_id: transactionId
    };
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
    gateway_transaction_id: gatewayTxId,
    status: "pending",
    created_at: new Date().toISOString()
  };

  try {
    await query(
      `INSERT INTO pix_transactions
        (transaction_id, deposit_id, kind, amount, customer_name, customer_email,
         customer_phone, customer_cpf, detran_uf, detran_nome, pix_code, gateway_transaction_id, status)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')`,
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
        pixCode,
        gatewayTxId
      ]
    );
  } catch (err) {
    persisted = false;
    console.error("pix insert failed:", String(err).slice(0, 500));
  }

  // Sempre grava no Blobs: fonte de verdade do status mesmo sem Postgres.
  await blobPut(transactionId, record);
  await blobPut(depositId, { ...record, is_deposit_id: true });
  if (gatewayTxId) {
    // Permite ao webhook localizar a transacao pelo id do gateway sem Postgres.
    await blobPut(gatewayTxId, { transaction_id: transactionId, deposit_id: depositId, gateway_alias: true });
  }

  return {
    success: true,
    transaction_id: transactionId,
    deposit_id: depositId,
    amount,
    status: "pending",
    pix_code: pixCode,
    gateway_transaction_id: gatewayTxId || undefined,
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
      `SELECT transaction_id, deposit_id, status, bank_tx_id, kind, amount, gateway_transaction_id, created_at
       FROM pix_transactions
       WHERE transaction_id = $1 OR deposit_id = $1
       LIMIT 1`,
      [id]
    );
  } catch (err) {
    console.error("pix status query failed:", String(err).slice(0, 500));
  }

  let tx = rows && rows[0];
  if (!tx) {
    // Postgres indisponivel/sem registro: consulta o Blobs.
    const rec = await blobGet(id);
    if (rec) {
      tx = {
        transaction_id: rec.transaction_id || id,
        deposit_id: rec.deposit_id || id,
        status: rec.status,
        bank_tx_id: rec.bank_tx_id,
        gateway_transaction_id: rec.gateway_transaction_id
      };
    }
  }

  if (!tx) {
    return json(404, { success: false, error: "Transaction not found" });
  }

  // Transacao pendente com id do gateway: pergunta ao BlackCat e sincroniza.
  if (tx.status !== "paid" && tx.gateway_transaction_id) {
    const remoteStatus = await getBlackCatStatus(tx.gateway_transaction_id);
    if (remoteStatus === "PAID") {
      await markPaid(tx.transaction_id, tx.gateway_transaction_id);
      tx = { ...tx, status: "paid" };
    } else if (remoteStatus === "CANCELLED" || remoteStatus === "FAILED") {
      try {
        await query(
          `UPDATE pix_transactions
           SET status = 'expired'
           WHERE (transaction_id = $1 OR deposit_id = $1) AND status <> 'paid'`,
          [id]
        );
      } catch (err) {
        console.error("pg expire failed:", String(err).slice(0, 300));
      }
      const rec = await blobGet(id);
      if (rec) {
        await blobPut(id, { ...rec, status: "expired" });
      }
      tx = { ...tx, status: "expired" };
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

  // POST /api/webhooks/blackcat — webhook do gateway (transaction.paid etc.)
  if (event.httpMethod === "POST" && path === "/api/webhooks/blackcat") {
    const body = await readJsonBody(event.body);
    const eventName = String(
      (event.headers && (event.headers["x-webhook-event"] || event.headers["X-Webhook-Event"])) ||
      body.event ||
      ""
    );
    const gatewayTxId = String(body.transactionId || body.transaction_id || "").trim();
    let localId = String(body.externalReference || body.externalRef || "").trim();

    // Webhook sem externalRef: localiza a transacao pelo id do gateway.
    if (!localId && gatewayTxId) {
      try {
        const rows = await query(
          `SELECT transaction_id FROM pix_transactions WHERE gateway_transaction_id = $1 LIMIT 1`,
          [gatewayTxId]
        );
        if (rows && rows[0]) localId = rows[0].transaction_id;
      } catch (err) {
        console.error("webhook lookup failed:", String(err).slice(0, 300));
      }
      if (!localId) {
        const rec = await blobGet(gatewayTxId);
        if (rec) localId = rec.transaction_id || "";
      }
    }

    if (eventName === "transaction.paid" && localId) {
      await markPaid(localId, gatewayTxId || "blackcat");
    } else if ((eventName === "transaction.failed" || body.status === "CANCELLED") && localId) {
      try {
        await query(
          `UPDATE pix_transactions
           SET status = 'expired'
           WHERE (transaction_id = $1 OR deposit_id = $1) AND status <> 'paid'`,
          [localId]
        );
      } catch (err) {
        console.error("webhook expire failed:", String(err).slice(0, 300));
      }
      const rec = await blobGet(localId);
      if (rec) {
        await blobPut(localId, { ...rec, status: "expired" });
      }
    }

    return json(200, { success: true, received: eventName || "unknown" });
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
