const {
  jsonResponse,
  normalizeCpf,
  toCents,
  createPixSale,
  savePayment
} = require("./blackcat-lib.js");

const PAYMENT_VALUES = {
  "payment.php": 95.6,
  "payment_second.php": 127.0,
  "payment_fixo.php": 95.6
};

const KIND_BY_ENDPOINT = {
  "payment.php": "taxa",
  "payment_second.php": "medico",
  "payment_fixo.php": "fixo"
};

const KIND_TITLES = {
  taxa: "Taxa Administrativa",
  medico: "Exame Medico Obrigatorio",
  fixo: "Taxa Unica",
  psicologico: "Avaliacao Psicologica",
  emissao: "Taxa de Emissao"
};

function endpointFile(event) {
  const parts = String(event.path || "").split("/");
  return parts[parts.length - 1] || "payment.php";
}

function siteUrl(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  return process.env.URL || (host ? `${proto}://${host}` : "");
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

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Metodo nao permitido" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { success: false, error: "JSON invalido" });
  }

  const file = endpointFile(event);
  const kind = KIND_TITLES[String(body.payment_type || "").trim()]
    ? String(body.payment_type).trim()
    : KIND_BY_ENDPOINT[file] || "taxa";
  const declaredAmount = Number(body.amount);
  const amount = Number.isFinite(declaredAmount) && declaredAmount > 0
    ? declaredAmount
    : PAYMENT_VALUES[file] || 95.6;
  const amountCents = toCents(amount);
  if (!amountCents) {
    return jsonResponse(400, { success: false, error: "Valor invalido" });
  }

  const customer = {
    name: String(body.customer_name || "").trim(),
    email: String(body.customer_email || "").trim(),
    phone: String(body.customer_phone || "").trim(),
    cpf: normalizeCpf(body.customer_cpf).slice(0, 11)
  };
  if (!customer.name || customer.cpf.length !== 11) {
    return jsonResponse(400, {
      success: false,
      error: "Nome e CPF (11 digitos) do cliente sao obrigatorios"
    });
  }

  const base = siteUrl(event);
  const result = await createPixSale({
    kind,
    amountCents,
    customer,
    postbackUrl: base ? `${base}/api/blackcat/webhook` : undefined
  });
  if (result.error) {
    return jsonResponse(result.status || 502, {
      success: false,
      error: result.error,
      details: result.details || undefined
    });
  }

  const sale = result.data;
  const transactionId = sale.transactionId || sale.id || result.externalRef;
  const paymentData = sale.paymentData || {};
  const pixCode = paymentData.copyPaste || paymentData.qrCode || "";

  if (!pixCode) {
    return jsonResponse(502, {
      success: false,
      error: "Blackcat nao retornou o codigo PIX",
      details: sale
    });
  }

  const localId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const depositId = `deposit_${Math.random().toString(36).slice(2, 10)}`;

  try {
    await savePayment({
      id: localId,
      kind,
      transactionId,
      externalRef: result.externalRef,
      amountCents,
      paymentMethod: String(sale.paymentMethod || "PIX").toUpperCase(),
      status: String(sale.status || "PENDING").toUpperCase(),
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerCpf: customer.cpf,
      detranUf: body.detran_uf ? String(body.detran_uf).slice(0, 2).toUpperCase() : null,
      invoiceUrl: sale.invoiceUrl || null,
      pixCode,
      pixQrBase64: paymentData.qrCodeBase64 || null,
      pixExpiresAt: paymentData.expiresAt ? new Date(paymentData.expiresAt) : null,
      gatewayFeesCents: Number.isFinite(sale.fees) ? sale.fees : null,
      netAmountCents: Number.isFinite(sale.netAmount) ? sale.netAmount : null,
      rawRequest: JSON.stringify(body).slice(0, 4000)
    });
  } catch (dbError) {
    console.error("Falha ao registrar pagamento:", dbError);
  }

  return jsonResponse(200, {
    success: true,
    transaction_id: localId,
    deposit_id: depositId,
    gateway_transaction_id: transactionId,
    amount,
    status: "pending",
    pix_code: pixCode,
    qr_code_image: paymentData.qrCodeBase64 || null
  });
};
