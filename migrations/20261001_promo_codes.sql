-- 20261001_promo_codes.sql
-- Promo codes for free Superfan grants (no Stripe checkout involved).
-- A fan redeems a code (e.g. WOODY10) and is granted Superfan directly.
-- Only touches the existing user_profiles table: no new tables.
--
-- promo_code:       which code the fan redeemed (NULL = none).
-- promo_expires_at: when the grant lapses (NULL = lifetime). The valid codes
--                   and their durations live in PROMO_CODES in src/lib/promo.ts.
--                   Expiry is enforced at login via isSuperfan().

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMPTZ;
