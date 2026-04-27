-- Backfill missing school-player links from the curated flip card stage table.
-- This is intentionally additive only: it does not delete, truncate, or overwrite existing links.
-- Purpose: active card stats queries that still use player_hsids can resolve staged players
-- like Cody Bellinger whose hsid exists in flip_card_front_stage but not player_hsids.

insert into public.player_hsids (playerid, hsid)
select distinct
  f.playerid,
  f.hsid::integer
from public.flip_card_front_stage f
where f.playerid is not null
  and f.hsid is not null
  and trim(f.playerid::text) <> ''
  and trim(f.hsid::text) <> ''
  and f.hsid::text ~ '^[0-9]+$'
  and not exists (
    select 1
    from public.player_hsids ph
    where ph.playerid::text = f.playerid::text
      and ph.hsid::text = f.hsid::text
  );

-- Verification examples:
-- select * from public.player_hsids where playerid::text = '180827';
-- select count(*) from public.player_hsids;
