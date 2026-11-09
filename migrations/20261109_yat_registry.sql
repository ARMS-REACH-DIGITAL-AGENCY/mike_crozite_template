-- YAT? Baseball Registry (Pete, Nov 2026).
-- One row per person. The YAT ID is ours; every outside number (TBC playerid,
-- MLB ID, Perfect Game, MaxPreps, NCAA, INDY, ...) attaches to it in
-- yat_registry_ids. Model: geni.com - one person, many source records, merges.
-- Created in production on 2026-11-09: 94 existing YAT cards kept their IDs,
-- every TBC player got YAT000104-YAT208638 (counter yat_player_id_counter
-- advanced to 208638), MLB IDs attached from player_source_map and the
-- full MLB draft table.

CREATE TABLE IF NOT EXISTS public.yat_registry (
  yatid text PRIMARY KEY CHECK (yatid ~ '^YAT[0-9]{6,}$'),
  first_name text,
  last_name text,
  birth_date date,
  merged_into text REFERENCES public.yat_registry(yatid),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.yat_registry_ids (
  yatid text NOT NULL REFERENCES public.yat_registry(yatid),
  source text NOT NULL,          -- 'tbc', 'mlb', 'yat_card', 'sidearm', ...
  source_id text NOT NULL,
  match_method text,
  attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id) -- an outside number belongs to one person
);

CREATE INDEX IF NOT EXISTS idx_yat_registry_ids_yatid ON public.yat_registry_ids (yatid);
