-- ============================================================
-- Credit system migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- User credit balances
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction log
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,           -- positive = added, negative = deducted
  type TEXT NOT NULL,                -- 'purchase' | 'usage' | 'bonus'
  description TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own credits"
  ON user_credits FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can read own transactions"
  ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Atomically deduct 1 credit; returns TRUE on success, FALSE if insufficient
CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id UUID,
  p_amount INT,
  p_description TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  current_balance INT;
BEGIN
  SELECT balance INTO current_balance
    FROM user_credits
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE user_credits
     SET balance = balance - p_amount, updated_at = NOW()
   WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -p_amount, 'usage', p_description);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add credits (called by Stripe webhook via service role)
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INT,
  p_description TEXT,
  p_stripe_session_id TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = user_credits.balance + p_amount, updated_at = NOW();

  INSERT INTO credit_transactions (user_id, amount, type, description, stripe_session_id)
    VALUES (p_user_id, p_amount, 'purchase', p_description, p_stripe_session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
