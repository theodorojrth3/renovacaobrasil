CREATE TABLE "payments" (
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"transaction_id" text NOT NULL,
	"external_ref" text,
	"amount_cents" integer NOT NULL,
	"payment_method" text DEFAULT 'PIX' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"customer_cpf" text,
	"detran_uf" text,
	"invoice_url" text,
	"pix_code" text,
	"pix_qr_base64" text,
	"pix_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"end_to_end_id" text,
	"gateway_fees_cents" integer,
	"net_amount_cents" integer,
	"raw_request" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY,
	"event_name" text NOT NULL,
	"gateway_transaction_id" text,
	"external_ref" text,
	"payload" text NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payments_transaction_id_idx" ON "payments" ("transaction_id");--> statement-breakpoint
CREATE INDEX "payments_external_ref_idx" ON "payments" ("external_ref");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedup_idx" ON "webhook_events" ("event_name","gateway_transaction_id");--> statement-breakpoint
CREATE INDEX "webhook_events_gateway_tx_idx" ON "webhook_events" ("gateway_transaction_id");