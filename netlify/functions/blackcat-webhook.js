const { jsonResponse, recordWebhookEvent, updatePaymentStatus, findPaymentById } = require("./blackcat-lib.js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Metodo nao permitido" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { success: false, error: "JSON invalido" });
  }

  const eventName = event.headers["x-webhook-event"] || payload.event || "unknown";
  const gatewayTransactionId = payload.transactionId || payload.id || null;
  const externalRef = payload.externalReference || payload.externalRef || null;

  try {
    const isNew = await recordWebhookEvent({ eventName, gatewayTransactionId, externalRef, payload });

    if (isNew && gatewayTransactionId) {
      const status = String(payload.status || "").toUpperCase();
      const isPaid = eventName === "transaction.paid" || status === "PAID";
      const isFailed = eventName === "transaction.failed" || status === "CANCELLED" || status === "FAILED";

      if (isPaid || isFailed) {
        const payment = await findPaymentById(gatewayTransactionId);
        if (payment) {
          await updatePaymentStatus(payment.id, {
            status: isPaid ? "PAID" : status === "CANCELLED" ? "CANCELLED" : "FAILED",
            paidAt: isPaid ? new Date(payload.paidAt || Date.now()) : undefined,
            endToEndId: payload.endToEndId || undefined,
            gatewayFeesCents: Number.isFinite(payload.fees) ? payload.fees : undefined,
            netAmountCents: Number.isFinite(payload.netAmount) ? payload.netAmount : undefined,
            updatedAt: new Date()
          });
        }
      }
    }
  } catch (dbError) {
    console.error("Falha ao processar webhook:", dbError);
  }

  return jsonResponse(200, { success: true, received: eventName });
};
