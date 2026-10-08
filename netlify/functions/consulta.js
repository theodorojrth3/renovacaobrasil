const CPF_API_BASE = process.env.CPF_API_BASE;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function buildCpfApiUrl(cpf) {
  if (!CPF_API_BASE) return null;
  try {
    const apiUrl = new URL("/api/v2/generic/cpf", CPF_API_BASE);
    if (!["http:", "https:"].includes(apiUrl.protocol)) return null;
    apiUrl.searchParams.set("cpf", cpf);
    return apiUrl.toString();
  } catch {
    return null;
  }
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      },
      body: ""
    };
  }

  const cpf = normalizeCpf(event.queryStringParameters?.cpf).slice(0, 11);
  if (!cpf) {
    return jsonResponse(400, { status: 400, statusMsg: "Informe o CPF" });
  }

  const token = process.env.CPF_API_TOKEN;
  if (!token) {
    return jsonResponse(500, { status: 500, statusMsg: "CPF_API_TOKEN nao configurado" });
  }

  const apiUrl = buildCpfApiUrl(cpf);
  if (!apiUrl) {
    return jsonResponse(500, { status: 500, statusMsg: "CPF_API_BASE nao configurado ou invalido" });
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
          "User-Agent": "Mozilla/5.0",
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        signal: controller.signal
      });
      text = await apiResp.text();
      if (apiResp.ok) break;
    } catch (error) {
      if (attempt === 3) {
        return jsonResponse(502, { status: 502, statusMsg: "Falha ao consultar CPF", details: String(error) });
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
    return jsonResponse(apiStatus, data);
  }

  if (!apiResp || !apiResp.ok) {
    return jsonResponse(apiResp ? apiResp.status : 502, data);
  }

  return jsonResponse(200, { success: true, DADOS: extractCpfData(data, cpf) });
};
