-- Connect: personal player videos (Cameo-style), MVP. Nov 3 2026.
-- Additive only: two new tables, nothing else is touched.

-- Players who opted in (set up by a YAT?STATS reviewer on the player's
-- CONNECT tab). A player is never a team: playerid is the YAT?STATS playerid.
CREATE TABLE IF NOT EXISTS public.connect_video_players (
  playerid           text PRIMARY KEY,
  hsid               text,
  player_name        text,
  school_name        text,
  enabled            boolean NOT NULL DEFAULT false,
  price_cents        integer NOT NULL DEFAULT 5000 CHECK (price_cents BETWEEN 500 AND 100000),
  turnaround_days    integer NOT NULL DEFAULT 7 CHECK (turnaround_days BETWEEN 1 AND 7),
  -- Who gets the player's share: 'player' (NIL earnings) or 'school' (donated
  -- to the high school program on the player's behalf).
  beneficiary        text NOT NULL DEFAULT 'player' CHECK (beneficiary IN ('player', 'school')),
  player_email       text,
  player_phone       text,
  -- The reviewer confirmed the player is 18+, not a current high school
  -- player, and signed the player agreement.
  adult_confirmed    boolean NOT NULL DEFAULT false,
  agreement_signed   boolean NOT NULL DEFAULT false,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text
);

-- One fan request.
--   pending_payment -> requested (card authorized, waiting on the player)
--   requested -> submitted (player uploaded) -> delivered (approved, charged)
--   requested/submitted -> declined | expired | canceled (hold released)
CREATE TABLE IF NOT EXISTS public.connect_video_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playerid              text NOT NULL,
  hsid                  text,
  player_name           text,
  school_name           text,
  status                text NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment', 'requested', 'submitted', 'delivered', 'declined', 'expired', 'canceled')),
  occasion              text NOT NULL,
  for_self              boolean NOT NULL DEFAULT false,
  recipient_name        text,
  from_name             text,
  instructions          text NOT NULL,
  fan_email             text NOT NULL,
  fan_firebase_uid      text,
  allow_public          boolean NOT NULL DEFAULT false,
  price_cents           integer NOT NULL,
  platform_fee_cents    integer NOT NULL,
  beneficiary           text NOT NULL,
  stripe_session_id     text UNIQUE,
  stripe_payment_intent text,
  authorized_at         timestamptz,
  due_at                timestamptz,
  video_key             text,
  submitted_at          timestamptz,
  delivered_at          timestamptz,
  decline_reason        text,
  payout_status         text NOT NULL DEFAULT 'unpaid' CHECK (payout_status IN ('unpaid', 'paid', 'n/a')),
  payout_note           text,
  terms_accepted_at     timestamptz NOT NULL,
  page_url              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connect_video_requests_status_idx ON public.connect_video_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS connect_video_requests_player_idx ON public.connect_video_requests (playerid, created_at DESC);
