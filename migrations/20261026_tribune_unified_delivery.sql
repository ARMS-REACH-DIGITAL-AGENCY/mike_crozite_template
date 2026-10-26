-- Isolated-only proposal. NOT approved for production.
BEGIN;
CREATE SCHEMA IF NOT EXISTS tribune_private;
CREATE TABLE IF NOT EXISTS tribune_private.newsletter_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false,
 approved_layout_version text,
 cutover_complete_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT enabled OR (approved_layout_version IS NOT NULL AND cutover_complete_at IS NOT NULL))
);
INSERT INTO tribune_private.newsletter_control(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tribune_private.newsletter_preferences (
 firebase_uid text PRIMARY KEY,
 daily_enabled boolean NOT NULL DEFAULT false,
 weekly_enabled boolean NOT NULL DEFAULT false,
 format text NOT NULL DEFAULT 'html' CHECK (format IN ('html','text')),
 unsubscribed_all_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (unsubscribed_all_at IS NULL OR (NOT daily_enabled AND NOT weekly_enabled))
);
CREATE TABLE IF NOT EXISTS tribune_private.newsletter_deliveries (
 id uuid PRIMARY KEY,
 firebase_uid text NOT NULL,
 recipient_email text NOT NULL CHECK (recipient_email = lower(btrim(recipient_email))),
 publication_type text NOT NULL CHECK (publication_type IN ('daily','weekly')),
 report_start date NOT NULL,
 report_end date NOT NULL,
 layout_version text NOT NULL,
 edition_id uuid,
 status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','claimed','accepted','rejected','failed','ambiguous','delivered')),
 provider text,
 provider_message_id text,
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz,
 delivered_at timestamptz,
 CHECK (report_start <= report_end),
 CHECK ((publication_type='daily' AND report_start=report_end) OR (publication_type='weekly' AND report_end=report_start+6)),
 UNIQUE(firebase_uid,publication_type,report_start,report_end)
);
CREATE TABLE IF NOT EXISTS tribune_private.newsletter_delivery_attempts (
 id uuid PRIMARY KEY,
 delivery_id uuid NOT NULL REFERENCES tribune_private.newsletter_deliveries(id),
 attempt_number integer NOT NULL CHECK (attempt_number > 0),
 status text NOT NULL CHECK (status IN ('started','accepted','rejected','failed','ambiguous','delivered')),
 http_status integer,
 provider_message_id text,
 provider_response jsonb,
 error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(delivery_id,attempt_number)
);
-- Runtime role can write delivery history, never approval.
GRANT USAGE ON SCHEMA tribune_private TO yatstats_tribune_app;
GRANT SELECT ON tribune_private.newsletter_control TO yatstats_tribune_app;
GRANT SELECT,INSERT,UPDATE ON tribune_private.newsletter_preferences TO yatstats_tribune_app;
GRANT SELECT ON tribune_private.newsletter_deliveries,tribune_private.newsletter_delivery_attempts TO yatstats_tribune_app;
-- Claims are serialized by the logical delivery identity and fail closed.
-- A missing/disabled control, wrong version, or unsubscribed recipient cannot claim.
CREATE OR REPLACE FUNCTION tribune_private.claim_newsletter_delivery(
 p_id uuid,p_uid text,p_email text,p_type text,p_start date,p_end date,p_version text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,tribune_private AS $
DECLARE existing_status text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM tribune_private.newsletter_control
    WHERE singleton AND enabled AND approved_layout_version=p_version AND cutover_complete_at IS NOT NULL)
 THEN RETURN 'held_approval'; END IF;
 IF NOT EXISTS (SELECT 1 FROM tribune_private.newsletter_preferences
    WHERE firebase_uid=p_uid AND unsubscribed_all_at IS NULL
    AND CASE WHEN p_type='daily' THEN daily_enabled WHEN p_type='weekly' THEN weekly_enabled ELSE false END)
 THEN RETURN 'unsubscribed'; END IF;
 IF p_type NOT IN ('daily','weekly') OR p_start>p_end OR
   (p_type='daily' AND p_start<>p_end) OR
   (p_type='weekly' AND p_end<>p_start+6)
 THEN RETURN 'invalid_period'; END IF;
 INSERT INTO tribune_private.newsletter_deliveries
 (id,firebase_uid,recipient_email,publication_type,report_start,report_end,layout_version,status)
 VALUES(p_id,p_uid,lower(btrim(p_email)),p_type,p_start,p_end,p_version,'claimed')
 ON CONFLICT(firebase_uid,publication_type,report_start,report_end) DO NOTHING;
 IF FOUND THEN RETURN 'claimed'; END IF;
 SELECT status INTO existing_status FROM tribune_private.newsletter_deliveries
 WHERE firebase_uid=p_uid AND publication_type=p_type AND report_start=p_start AND report_end=p_end;
 RETURN 'previously_attempted';
END $;
REVOKE ALL ON FUNCTION tribune_private.claim_newsletter_delivery(uuid,text,text,text,date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tribune_private.claim_newsletter_delivery(uuid,text,text,text,date,date,text) TO yatstats_tribune_app;
COMMIT;
