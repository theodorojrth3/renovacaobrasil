const { pgTable, text, integer, serial, timestamp, index, uniqueIndex } = require("drizzle-orm/pg-core");

const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  transactionId: text("transaction_id").notNull(),
  externalRef: text("external_ref"),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method").notNull().default("PIX"),
  status: text("status").notNull().default("PENDING"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerCpf: text("customer_cpf"),
  detranUf: text("detran_uf"),
  invoiceUrl: text("invoice_url"),
  pixCode: text("pix_code"),
  pixQrBase64: text("pix_qr_base64"),
  pixExpiresAt: timestamp("pix_expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  endToEndId: text("end_to_end_id"),
  gatewayFeesCents: integer("gateway_fees_cents"),
  netAmountCents: integer("net_amount_cents"),
  rawRequest: text("raw_request"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("payments_transaction_id_idx").on(table.transactionId),
  index("payments_external_ref_idx").on(table.externalRef),
  index("payments_created_at_idx").on(table.createdAt)
]);

const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  eventName: text("event_name").notNull(),
  gatewayTransactionId: text("gateway_transaction_id"),
  externalRef: text("external_ref"),
  payload: text("payload").notNull(),
  processed: integer("processed").notNull().default(0),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("webhook_events_dedup_idx").on(table.eventName, table.gatewayTransactionId),
  index("webhook_events_gateway_tx_idx").on(table.gatewayTransactionId)
]);

module.exports = { payments, webhookEvents };
