-- The Gazette's stats tables (Pete, Nov 24 2026: build the Gazette from the
-- approved TEST 3 proof, docs/newsletter-reference/).
--
-- weekly_player_lines.stats: each alum's week exactly as his school's stored
-- bracket game shows it (the Stat Ledger): bat [PA,AB,H,2B,3B,HR,BB,HBP,SF],
-- pit [outs,HR,BB,HBP,K,H,R,ER,FIP], OPS+, FIP-, club W-L, plus his latest
-- team ID for the logo. Written once by scripts/newsletter-publish.ts.
--
-- weekly_player_totals: every player's week from his own game lines, plus a
-- zero row for every favorited player who did not play; one shared row per
-- player, so each fan's Superfan favorites are read, never computed per email. bat [PA,AB,H,2B,3B,HR,BB,HBP,SF],
-- pit [outs,HR,BB,HBP,K,H,R,ER,W,L].
--
-- Published rows are never changed: the same guard and log as the other
-- weekly tables. The newsletter's read-only role may read them.

ALTER TABLE public.weekly_player_lines ADD COLUMN IF NOT EXISTS stats jsonb;

CREATE TABLE IF NOT EXISTS public.weekly_player_totals (
  period_start date NOT NULL,
  yatid text NOT NULL CHECK (yatid ~ '^YAT[0-9]{6,}$'),
  period_end date NOT NULL,
  season_key text NOT NULL,
  week smallint NOT NULL,
  player_name text,
  teamid text,
  team_name text,
  level text,
  games smallint NOT NULL,
  bat integer[] NOT NULL,
  pit integer[],
  pitcher boolean NOT NULL DEFAULT false,
  PRIMARY KEY (period_start, yatid)
);

DROP TRIGGER IF EXISTS weekly_player_totals_guard ON public.weekly_player_totals;
CREATE TRIGGER weekly_player_totals_guard BEFORE DELETE OR UPDATE ON public.weekly_player_totals
  FOR EACH ROW EXECUTE FUNCTION public.publication_guard();
DROP TRIGGER IF EXISTS weekly_player_totals_log ON public.weekly_player_totals;
CREATE TRIGGER weekly_player_totals_log AFTER DELETE OR UPDATE ON public.weekly_player_totals
  FOR EACH ROW EXECUTE FUNCTION public.publication_log();

GRANT SELECT, INSERT ON public.weekly_player_totals TO authenticator;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yatstats_tribune_app') THEN
    GRANT SELECT ON public.weekly_player_totals TO yatstats_tribune_app;
  END IF;
END $$;

-- The Gazette letter ("Hamilton's Week"), one per school per week, written by
-- the publisher (src/lib/newsletter/weeklyStory.ts): { title, paragraphs[] }.
ALTER TABLE public.weekly_box_scores ADD COLUMN IF NOT EXISTS home_story jsonb;
ALTER TABLE public.weekly_box_scores ADD COLUMN IF NOT EXISTS away_story jsonb;

-- The fan's favorites' transactions in the Daily and the Weekly (Pete, Nov 24
-- 2026): the period's MLB transactions saved once, in MLB's own words
-- (player_transactions); each email shows only its fan's favorites.
CREATE TABLE IF NOT EXISTS public.newsletter_transactions (
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  transaction_id bigint NOT NULL,
  yatid text NOT NULL CHECK (yatid ~ '^YAT[0-9]{6,}$'),
  effective_date date NOT NULL,
  transaction_type text,
  description text NOT NULL,
  PRIMARY KEY (cadence, period_start, transaction_id)
);
CREATE INDEX IF NOT EXISTS newsletter_transactions_yatid_idx ON public.newsletter_transactions (cadence, period_start, yatid);
DROP TRIGGER IF EXISTS newsletter_transactions_guard ON public.newsletter_transactions;
CREATE TRIGGER newsletter_transactions_guard BEFORE DELETE OR UPDATE ON public.newsletter_transactions
  FOR EACH ROW EXECUTE FUNCTION public.publication_guard();
DROP TRIGGER IF EXISTS newsletter_transactions_log ON public.newsletter_transactions;
CREATE TRIGGER newsletter_transactions_log AFTER DELETE OR UPDATE ON public.newsletter_transactions
  FOR EACH ROW EXECUTE FUNCTION public.publication_log();
GRANT SELECT, INSERT ON public.newsletter_transactions TO authenticator;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yatstats_tribune_app') THEN
    GRANT SELECT ON public.newsletter_transactions TO yatstats_tribune_app;
  END IF;
END $$;
