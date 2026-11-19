-- YAT key transition, step 9 (part 1: MLB). Pete, Nov 19 2026.
-- TEST COPY FIRST (claude-test), then live only with Pete's approval.
--
-- Every MLB job reads "which of our people is this MLB ID" from
-- yat_registry_ids (MLB ID -> YAT ID -> his card), not player_source_map.
-- Every non-rejected player_source_map MLB link is already in the registry
-- with the same YAT ID (checked Nov 19 2026: 40,918 links, 0 missing,
-- 0 disagreeing).
--
--   1. yat_registry_rejections: pairs proven NOT the same person, so no job
--      links them again (the 183 rejected MLB links).
--   2. yat_registry_review: an outside player who fits one of our people but
--      is not proven (or fits two) waits here for Pete; a daily job emails
--      pete@yatstats.com when one arrives.
--   3. yat_mlb_links: the view every MLB job reads.
--   4. yat_reject_link(): a rejection removes the registry link and records it.

-- 1 -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yat_registry_rejections (
  source      text NOT NULL,
  source_id   text NOT NULL,
  yatid       text NOT NULL,
  reason      text NOT NULL,
  notes       text,
  rejected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id, yatid)
);

INSERT INTO public.yat_registry_rejections (source, source_id, yatid, reason, notes, rejected_at)
SELECT 'mlb', m.source_player_id::text, public.yat_id_for(m.playerid::text),
       'not the same person (audit-mlb-player-links)', m.notes, coalesce(m.updated_at, now())
  FROM public.player_source_map m
 WHERE m.source = 'mlb_api'
   AND m.match_method = 'rejected_bad_identity_match'
   AND public.yat_id_for(m.playerid::text) IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2 -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yat_registry_review (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL,
  source_id     text NOT NULL,
  source_name   text,
  -- What the outside source says about him (birth date, birthplace, bats,
  -- throws, position, team ...), and each of our people he might be, with
  -- the same fields side by side.
  source_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidates    jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'same_person', 'new_person', 'not_same_person')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  notified_at   timestamptz,
  decided_at    timestamptz,
  decided_yatid text,
  decided_note  text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_yat_registry_review_pending
  ON public.yat_registry_review (source, source_id) WHERE status = 'pending';

-- 3 -------------------------------------------------------------------------
-- MLB ID -> YAT ID -> the key of his card (or, with no card yet, his TBC
-- number). "proven" is false while the link waits in yat_registry_review.
CREATE OR REPLACE VIEW public.yat_mlb_links AS
SELECT r.source_id AS mlb_id,
       r.yatid,
       coalesce(
         (SELECT f.playerid::text FROM public.flip_card_front_stage f WHERE f.yatid = r.yatid LIMIT 1),
         (SELECT min(t.source_id) FROM public.yat_registry_ids t WHERE t.yatid = r.yatid AND t.source = 'tbc')
       ) AS playerid,
       NOT EXISTS (SELECT 1 FROM public.yat_registry_review v
                    WHERE v.source = 'mlb' AND v.source_id = r.source_id AND v.status = 'pending') AS proven,
       r.match_method
  FROM public.yat_registry_ids r
 WHERE r.source = 'mlb';

-- 4 -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yat_reject_link(p_source text, p_source_id text, p_yatid text, p_reason text, p_notes text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_yatid IS NULL THEN RETURN; END IF;
  DELETE FROM public.yat_registry_ids
   WHERE source = p_source AND source_id = p_source_id AND yatid = p_yatid;
  INSERT INTO public.yat_registry_rejections (source, source_id, yatid, reason, notes)
  VALUES (p_source, p_source_id, p_yatid, p_reason, p_notes)
  ON CONFLICT (source, source_id, yatid) DO UPDATE SET reason = EXCLUDED.reason, notes = EXCLUDED.notes;
END
$f$;

-- A rejected pair is never attached again.
CREATE OR REPLACE FUNCTION public.yat_attach_mlb_id(p_card text, p_mlb text, p_method text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_yat text;
BEGIN
  IF p_mlb IS NULL OR btrim(p_mlb) !~ '^[0-9]+$' THEN RETURN; END IF;
  v_yat := public.yat_id_for(p_card);
  IF v_yat IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.yat_registry_rejections
              WHERE source = 'mlb' AND source_id = btrim(p_mlb) AND yatid = v_yat) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.yat_registry_ids WHERE source = 'mlb' AND source_id = btrim(p_mlb)) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.yat_registry_ids WHERE source = 'mlb' AND yatid = v_yat) THEN RETURN; END IF;
  INSERT INTO public.yat_registry_ids (yatid, source, source_id, match_method)
  VALUES (v_yat, 'mlb', btrim(p_mlb), p_method)
  ON CONFLICT (source, source_id) DO NOTHING;
END
$f$;

-- 5 -------------------------------------------------------------------------
-- Domenic Picone (MLB 822472, TBC 228130): linked before Sep 2026 with no
-- check. Everything agrees (Garnet Valley, PA; R/R; P) except the birth date
-- (MLB 2000-10-09, TBC 10/16/2000). His link stays until Pete decides.
INSERT INTO public.yat_registry_review (source, source_id, source_name, source_fields, candidates, reason)
SELECT 'mlb', '822472', 'Domenic Picone',
       jsonb_build_object('birth_date', p.birth_date, 'birth_city', p.birth_city, 'birth_state', p.birth_state,
                          'bats', p.bats, 'throws', p.throws, 'position', p.primary_position),
       jsonb_build_array(jsonb_build_object('yatid', public.yat_id_for('228130'), 'tbc_playerid', '228130',
                          'name', t.firstname || ' ' || t.lastname, 'birth_date', t.borndate, 'birthplace', t.place,
                          'high_school', t.high_school, 'bats', t.bats, 'throws', t.throws, 'position', t.posit,
                          'highest_level', t.highlevel)),
       'Linked earlier without a check. Everything agrees except the birth date (7 days apart).'
  FROM public.mlb_person_profile p, public.tbc_players_raw t
 WHERE p.mlb_id::text = '822472' AND t.playerid::text = '228130'
ON CONFLICT DO NOTHING;
