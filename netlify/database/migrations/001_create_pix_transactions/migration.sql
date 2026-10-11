CREATE TABLE IF NOT EXISTS pix_transactions (
  id SERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,
  deposit_id TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'payment',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_cpf TEXT,
  detran_uf TEXT,
  detran_nome TEXT,
  pix_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  bank_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_transactions_deposit_id ON pix_transactions (deposit_id);
CREATE INDEX IF NOT EXISTS idx_pix_transactions_status ON pix_transactions (status);
