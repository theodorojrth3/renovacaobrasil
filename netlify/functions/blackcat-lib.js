const BLACKCAT_API_BASE = process.env.BLACKCAT_API_BASE || "https://api.blackcatoficial.com/api";

const CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function externalId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `RB_${Date.now()}_${rand}`;
}

function sellerEmailFallback(customer) {
  return customer.email || `${normalizeCpf(customer.cpf) || "cliente"}@email.com`;
}

function sellerPhoneFallback(customer) {
  return normalizeCpf(customer.phone).slice(0, 11) || "11999999999";
}

async function createPixSale({ kind, amountCents, customer, postbackUrl }) {
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) {
    return { error: "BLACKCAT_API_KEY nao configurada", status: 500 };
  }

  const externalRef = externalId();
  const payload = {
    amount: amountCents,
    currency: "BRL",
    paymentMethod: "pix",
    items: [
      {
        title: kind === "medico"
          ? "Exame Medico Obrigatorio"
          : kind === "psicologico"
            ? "Avaliacao Psicologica"
            : kind === "emissao"
              ? "Taxa de Emissao"
              : "Taxa Administrativa",
        quantity: 1,
        unitPrice: amountCents,
        tangible: false
      }
    ],
    customer: {
      name: customer.name,
      email: sellerEmailFallback(customer),
      phone: sellerPhoneFallback(customer),
      document: {
        number: normalizeCpf(customer.cpf),
        type: "cpf"
      }
    },
    pix: { expiresInDays: 1 },
    externalRef,
    postbackUrl
  };

  const response = await fetch(`${BLACKCAT_API_BASE}/sales/create-sale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data.success === false) {
    return {
      error: data.message || data.error || `Blackcat retornou HTTP ${response.status}`,
      status: response.status === 401 ? 500 : 502,
      details: data
    };
  }

  return { data: data.data || data, externalRef };
}

async function getSaleStatus(transactionId) {
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) {
    return { error: "BLACKCAT_API_KEY nao configurada", status: 500 };
  }

  const response = await fetch(
    `${BLACKCAT_API_BASE}/sales/${encodeURIComponent(transactionId)}/status`,
    { headers: { "X-API-Key": apiKey } }
  );

  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    return { error: data.message || `HTTP ${response.status}`, status: response.status };
  }

  return { data: data.data || data };
}

function mapStatusToSite(blackcatStatus) {
  const status = String(blackcatStatus || "").toUpperCase();
  if (status === "PAID") return "paid";
  if (status === "PENDING" || status === "PENDING_3DS") return "pending";
  if (status === "CANCELLED" || status === "FAILED") return "cancelled";
  if (status === "REFUNDED") return "cancelled";
  return "pending";
}

async function savePayment(paymentRow) {
  const { db } = require("../../db/index.js");
  const { payments } = require("../../db/schema.js");
  await db.insert(payments).values(paymentRow);
}

async function findPaymentById(id) {
  const { db } = require("../../db/index.js");
  const { payments } = require("../../db/schema.js");
  const { eq, or } = require("drizzle-orm");
  const rows = await db
    .select()
    .from(payments)
    .where(or(eq(payments.id, id), eq(payments.transactionId, id), eq(payments.externalRef, id)))
    .limit(1);
  return rows[0] || null;
}

async function updatePaymentStatus(id, fields) {
  const { db } = require("../../db/index.js");
  const { payments } = require("../../db/schema.js");
  const { eq } = require("drizzle-orm");
  await db.update(payments).set(fields).where(eq(payments.id, id));
}

async function recordWebhookEvent({ eventName, gatewayTransactionId, externalRef, payload }) {
  const { db } = require("../../db/index.js");
  const { webhookEvents } = require("../../db/schema.js");
  try {
    await db.insert(webhookEvents).values({
      eventName,
      gatewayTransactionId,
      externalRef,
      payload: JSON.stringify(payload).slice(0, 8000)
    });
    return true;
  } catch (error) {
    if (String(error.message || "").includes("webhook_events_dedup_idx")) return false;
    throw error;
  }
}

module.exports = {
  BLACKCAT_API_BASE,
  CORS_HEADERS,
  jsonResponse,
  normalizeCpf,
  toCents,
  externalId,
  createPixSale,
  getSaleStatus,
  mapStatusToSite,
  savePayment,
  findPaymentById,
  updatePaymentStatus,
  recordWebhookEvent
};
