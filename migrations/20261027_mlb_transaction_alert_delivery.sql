-- Idempotent transaction-alert sends and controlled retries.
CREATE TABLE IF NOT EXISTS public.mlb_transaction_alert_delivery (
  transaction_id bigint NOT NULL REFERENCES public.player_transactions(id),
  recipient_email text NOT NULL,
  firebase_uid text NOT NULL,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending','sent','retry','failed')),
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  retry_after timestamptz,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, recipient_email)
);
CREATE INDEX IF NOT EXISTS mlb_alert_delivery_retry_idx
  ON public.mlb_transaction_alert_delivery (retry_after)
  WHERE status = 'retry';
DO $$
DECLARE login_role record;
BEGIN
 FOR login_role IN
  SELECT rolname FROM pg_roles
  WHERE rolcanlogin
    AND has_table_privilege(rolname,'public.user_favorites','INSERT')
 LOOP
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.mlb_transaction_alert_delivery TO %I',login_role.rolname);
 END LOOP;
END $$;
