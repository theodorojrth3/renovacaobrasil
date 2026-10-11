ALTER TABLE pix_transactions
  ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pix_transactions_gateway_tx_id
  ON pix_transactions (gateway_transaction_id);
