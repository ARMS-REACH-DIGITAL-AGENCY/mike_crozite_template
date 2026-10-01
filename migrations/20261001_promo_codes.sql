-- 20261001_promo_codes.sql
-- Promo codes for free Superfan grants (no Stripe checkout involved).
-- A fan redeems a code (e.g. WOODY10) and is granted Superfan directly.
--
-- duration_months NULL = lifetime grant. Set it later (e.g. 12) to make future
-- redemptions expire; the grant's promo_expires_at is enforced at login via
-- isSuperfan() in src/lib/entitlements.ts, so flipping a code from lifetime
-- to expiring later is a data change, not a code change.

CREATE TABLE IF NOT EXISTS promo_codes (
  code             TEXT PRIMARY KEY,
  label            TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  max_redemptions  INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  duration_months  INTEGER,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id               BIGSERIAL PRIMARY KEY,
  code             TEXT NOT NULL REFERENCES promo_codes(code),
  firebase_uid     TEXT NOT NULL,
  redeemed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grant_expires_at TIMESTAMPTZ,
  UNIQUE (code, firebase_uid)
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_uid ON promo_redemptions (firebase_uid);

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMPTZ;

-- Hamilton founding fans: lifetime Superfan, no card, no friction.
INSERT INTO promo_codes (code, label, active, duration_months)
VALUES ('WOODY10', 'Hamilton founding fans - lifetime Superfan', TRUE, NULL)
ON CONFLICT (code) DO NOTHING;
