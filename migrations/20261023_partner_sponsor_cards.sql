-- Explicit title-sponsor gallery inventory. All new objects are private;
-- shared player, sponsor, order, and school tables receive no definitions,
-- policies, triggers, foreign-key dependencies, or legacy-role grant changes.
BEGIN;

CREATE TABLE IF NOT EXISTS tribune_private.school_sponsor_card_placements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sponsor_id bigint NOT NULL CHECK (sponsor_id>0),
  hsid text NOT NULL CHECK (hsid ~ '^[1-9][0-9]*$'),
  sponsor_order_id bigint CHECK (sponsor_order_id>0),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused','cancelled')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  requires_approval boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS sponsor_card_active_school
  ON tribune_private.school_sponsor_card_placements(hsid,priority DESC,starts_at DESC,id DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS sponsor_card_placement_sponsor
  ON tribune_private.school_sponsor_card_placements(sponsor_id,hsid);

CREATE TABLE IF NOT EXISTS tribune_private.sponsor_flip_cards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sponsor_id bigint NOT NULL CHECK (sponsor_id>0),
  previous_id bigint REFERENCES tribune_private.sponsor_flip_cards(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','published','archived')),
  level text NOT NULL DEFAULT 'SPONSOR' CHECK (level='SPONSOR'),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND content ? 'level' AND content->>'level'='SPONSOR'),
  school_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(school_ids)<=1000),
  starts_at timestamptz,
  ends_at timestamptz,
  publisher_approved boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
  CHECK (status<>'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sponsor_card_live_versions
  ON tribune_private.sponsor_flip_cards(sponsor_id,starts_at DESC,id DESC) WHERE status='published';

DO $$
DECLARE object_name text; untrusted_role text; identity_sequence text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yatstats_tribune_app' AND rolcanlogin
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
     OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member='yatstats_tribune_app'::regrole) THEN
    RAISE EXCEPTION 'Apply the reviewed dedicated application-role prerequisites first';
  END IF;
  FOREACH object_name IN ARRAY ARRAY['school_sponsor_card_placements','sponsor_flip_cards'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE tribune_private.%I FROM PUBLIC,yatstats_tribune_app',object_name);
    FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
      EXECUTE format('REVOKE ALL ON TABLE tribune_private.%I FROM %I',object_name,untrusted_role);
    END LOOP;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE tribune_private.%I TO yatstats_tribune_app',object_name);
    EXECUTE format('ALTER TABLE tribune_private.%I ENABLE ROW LEVEL SECURITY',object_name);
    EXECUTE format('DROP POLICY IF EXISTS tribune_server_access ON tribune_private.%I',object_name);
    EXECUTE format('CREATE POLICY tribune_server_access ON tribune_private.%I FOR ALL TO yatstats_tribune_app USING(true) WITH CHECK(true)',object_name);
    identity_sequence := pg_get_serial_sequence('tribune_private.'||object_name,'id');
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,yatstats_tribune_app',identity_sequence);
    FOR untrusted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated','authenticator') LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I',identity_sequence,untrusted_role);
    END LOOP;
    EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %s TO yatstats_tribune_app',identity_sequence);
  END LOOP;
END;
$$;

COMMENT ON TABLE tribune_private.school_sponsor_card_placements IS
  'Publisher-granted title-sponsor card inventory. Newsletter and splash placements do not implicitly grant a gallery card.';
COMMENT ON TABLE tribune_private.sponsor_flip_cards IS
  'Two-face sponsor content, never a player roster/stat row. Published revisions are forked for editing.';
COMMIT;
