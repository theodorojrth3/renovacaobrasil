const { jsonResponse, getSaleStatus, mapStatusToSite, findPaymentById, updatePaymentStatus } = require("./blackcat-lib.js");

function resolveId(event) {
  const params = event.queryStringParameters || {};
  return String(params.id || params.transaction_id || params.gateway_transaction_id || "").trim();
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

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Metodo nao permitido" });
  }

  const id = resolveId(event);
  if (!id) {
    return jsonResponse(400, { success: false, error: "Informe o id da transacao" });
  }

  let payment;
  try {
    payment = await findPaymentById(id);
  } catch (dbError) {
    console.error("Falha ao consultar pagamento:", dbError);
    return jsonResponse(500, { success: false, error: "Erro ao consultar transacao" });
  }

  if (!payment) {
    return jsonResponse(404, { success: false, error: "Transacao nao encontrada" });
  }

  let siteStatus = mapStatusToSite(payment.status);

  if (siteStatus === "pending" && payment.transactionId) {
    try {
      const result = await getSaleStatus(payment.transactionId);
      if (result.data && !result.error) {
        const gatewayStatus = String(result.data.status || "").toUpperCase();
        siteStatus = mapStatusToSite(gatewayStatus);
        if (gatewayStatus && gatewayStatus !== payment.status) {
          await updatePaymentStatus(payment.id, {
            status: gatewayStatus,
            paidAt: gatewayStatus === "PAID" ? new Date() : undefined,
            endToEndId: result.data.endToEndId || undefined,
            updatedAt: new Date()
          });
        }
      }
    } catch (gwError) {
      console.error("Falha ao consultar Blackcat:", gwError);
    }
  }

  return jsonResponse(200, {
    success: true,
    status: siteStatus,
    transaction_id: payment.id,
    deposit_id: payment.id,
    gateway_transaction_id: payment.transactionId,
    amount: payment.amountCents / 100,
    paid_at: payment.paidAt || null
  });
};
