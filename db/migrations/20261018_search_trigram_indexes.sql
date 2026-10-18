-- Database reliability: run against a Neon preview branch first.
-- Each statement must execute outside an explicit transaction because of CONCURRENTLY.
-- Confirm pg_trgm availability before applying. Production requires a separate approval.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbc_players_firstname_trgm ON public.tbc_players_raw USING gin (firstname gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbc_players_lastname_trgm ON public.tbc_players_raw USING gin (lastname gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbc_players_fullname_trgm ON public.tbc_players_raw USING gin (((firstname || ' ' || lastname)) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_first_name_trgm ON public.flip_card_front_stage USING gin (first_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_last_name_trgm ON public.flip_card_front_stage USING gin (last_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_display_name_trgm ON public.flip_card_front_stage USING gin (display_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_full_name_trgm ON public.flip_card_front_stage USING gin (((coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops);
-- Check SELECT plans with representative queries; for 1-2 characters, trigram may not be useful.
