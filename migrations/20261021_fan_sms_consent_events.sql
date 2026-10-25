-- Durable, append-only evidence of registration SMS opt-in. Never infer consent from account creation.
CREATE TABLE IF NOT EXISTS fan_sms_consent_events (
 id BIGSERIAL PRIMARY KEY,
 firebase_uid TEXT NOT NULL,
 email TEXT NOT NULL,
 contact_id TEXT,
 home_hsid TEXT,
 school_name TEXT,
 phone_e164 TEXT,
 informational_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
 promotional_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
 disclosure_version TEXT NOT NULL,
 informational_disclosure TEXT NOT NULL,
 promotional_disclosure TEXT NOT NULL,
 shared_disclosure TEXT NOT NULL,
 source_url TEXT NOT NULL,
 ip_address INET,
 user_agent TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fan_sms_consent_uid ON fan_sms_consent_events(firebase_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_sms_consent_contact ON fan_sms_consent_events(contact_id, created_at DESC);
