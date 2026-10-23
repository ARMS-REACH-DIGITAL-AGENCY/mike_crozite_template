-- Shared corporate partner portal and Tribune publication controls.
-- Additive only. Existing splash/footer/player sponsorships remain independent.
-- No users, paid entitlements, recipients, or newsletter activation are seeded.
BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_portal_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firebase_uid text NOT NULL CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  sponsor_id bigint REFERENCES public.sponsor_brands(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('publisher','sponsor')),
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role='publisher' AND sponsor_id IS NULL) OR (role='sponsor' AND sponsor_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_portal_publisher_uid
  ON public.partner_portal_memberships(firebase_uid) WHERE role='publisher';
CREATE UNIQUE INDEX IF NOT EXISTS partner_portal_sponsor_uid
  ON public.partner_portal_memberships(firebase_uid,sponsor_id) WHERE role='sponsor';

CREATE TABLE IF NOT EXISTS public.partner_portal_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id bigint REFERENCES public.sponsor_brands(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('logo','ad','masthead','notice')),
  url text NOT NULL CHECK (url ~ '^https://'),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 4096),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('masthead','notice') AND sponsor_id IS NULL) OR (kind IN ('logo','ad') AND sponsor_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_portal_asset_url ON public.partner_portal_assets(url);

-- A paid order may cover multiple school placements, all for one sponsor.
-- The atomic claim prevents simultaneous editors assigning it to two brands.
CREATE TABLE IF NOT EXISTS public.partner_sponsor_order_claims (
  order_id bigint PRIMARY KEY REFERENCES public.sponsor_orders(id) ON DELETE RESTRICT,
  sponsor_id bigint NOT NULL REFERENCES public.sponsor_brands(id) ON DELETE RESTRICT,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_tribune_sponsorships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hsid text NOT NULL CHECK (hsid ~ '^[0-9]+$'),
  sponsor_id bigint NOT NULL REFERENCES public.sponsor_brands(id) ON DELETE RESTRICT,
  sponsor_order_id bigint REFERENCES public.sponsor_orders(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS school_tribune_active_school
  ON public.school_tribune_sponsorships(hsid,priority DESC,starts_at DESC,id DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS school_tribune_sponsor ON public.school_tribune_sponsorships(sponsor_id,hsid);

CREATE TABLE IF NOT EXISTS public.tribune_sponsor_creatives (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sponsor_id bigint NOT NULL REFERENCES public.sponsor_brands(id) ON DELETE RESTRICT,
  previous_id bigint REFERENCES public.tribune_sponsor_creatives(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','published','archived')),
  headline text NOT NULL CHECK (length(headline) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1200),
  image_url text,
  image_alt text NOT NULL DEFAULT '' CHECK (length(image_alt)<=240),
  destination_url text NOT NULL CHECK (destination_url ~ '^https://'),
  cta text NOT NULL DEFAULT 'Visit our sponsor' CHECK (length(cta) BETWEEN 1 AND 50),
  acknowledgment text NOT NULL DEFAULT '' CHECK (length(acknowledgment)<=500),
  starts_at timestamptz,
  ends_at timestamptz,
  evergreen boolean NOT NULL DEFAULT false,
  school_ids text[] NOT NULL DEFAULT '{}',
  cadence text NOT NULL DEFAULT 'both' CHECK (cadence IN ('both','daily','weekly')),
  created_by text NOT NULL,
  approved_by text,
  publisher_approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((evergreen AND ends_at IS NULL) OR (NOT evergreen AND starts_at IS NOT NULL AND ends_at>starts_at)),
  CHECK (cardinality(school_ids)<=1000),
  CHECK (status<>'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
-- Keep earlier isolated/pre-release installs compatible when this additive
-- migration is re-applied; CREATE TABLE IF NOT EXISTS does not add columns.
ALTER TABLE public.tribune_sponsor_creatives
  ADD COLUMN IF NOT EXISTS publisher_approved boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tribune_creative_live_sponsor
  ON public.tribune_sponsor_creatives(sponsor_id,evergreen,starts_at DESC,id DESC) WHERE status='published';

-- The existing site-message system owns the message text, dates and state.
-- Tribune-only metadata keeps its editor independent of ticker presentation.
ALTER TABLE public.site_message_campaigns ADD COLUMN IF NOT EXISTS tribune_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.site_message_campaigns ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS site_messages_tribune_published
  ON public.site_message_campaigns(starts_at,ends_at,id) WHERE page_key='tribune' AND status='published';

CREATE TABLE IF NOT EXISTS public.tribune_publication_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  masthead jsonb,
  official_rules_url text,
  sweepstakes_reminder text,
  postal_address text,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_portal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_uid text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_portal_audit_entity
  ON public.partner_portal_audit(entity_type,entity_id,created_at DESC);

COMMENT ON TABLE public.school_tribune_sponsorships IS
  'Explicit newsletter placements. A splash, footer or player sponsorship does not implicitly grant a Tribune placement.';
COMMENT ON TABLE public.tribune_sponsor_creatives IS
  'Dated creative revisions. Published content is cloned for edits; immutable issue snapshots retain resolved artwork and copy.';
COMMENT ON COLUMN public.site_message_campaigns.tribune_metadata IS
  'Publisher notes only: title, byline, schoolIds, cadence, optional publication issueDate (America/Phoenix).';
COMMIT;
