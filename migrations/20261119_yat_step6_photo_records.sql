-- YAT key transition, step 6 (docs/yat-key-transition.md; Pete, Nov 19 2026).
-- Approved uploads in media_upload remember where their photo was published
-- (description: published_assets etc.), named by the old card number
-- (players/then/231362.jpg). Every one of those files has a YAT ID copy in
-- the same folder since Nov 18-19 (players/then/YAT096917.jpg). This points
-- each upload's OWN player's paths at the YAT ID name. Other text in the
-- description (tagged player numbers, names, page links) is not touched.
-- Not changed: the three players whose files clashed in the copy
-- (209894, 224784 -> Pete's cropped photos; YAT000103 -> YAT058185).
-- TEST COPY FIRST, then live with Pete's approval.

CREATE TABLE IF NOT EXISTS public.media_upload_description_backup_20261119 AS
SELECT id, playerid, description FROM public.media_upload WHERE false;

INSERT INTO public.media_upload_description_backup_20261119 (id, playerid, description)
SELECT m.id, m.playerid, m.description
  FROM public.media_upload m
 WHERE m.playerid ~ '^[0-9]+$'
   AND m.playerid NOT IN ('209894', '224784')
   AND m.description ~ ('players/[a-z-]+/' || m.playerid || '[._]')
   AND public.yat_id_for(m.playerid) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.media_upload_description_backup_20261119 b WHERE b.id = m.id);

UPDATE public.media_upload m
   SET description = regexp_replace(m.description,
         '(players/[a-z-]+/)' || m.playerid || '([._])',
         '\1' || public.yat_id_for(m.playerid) || '\2', 'g')
  FROM public.media_upload_description_backup_20261119 b
 WHERE b.id = m.id
   AND m.description = b.description;
