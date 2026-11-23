-- New-player publication inserts its YAT Registry source ID atomically with
-- the card. The existing trg_yat_school_links_fill_yatid statement trigger
-- then fills unresolved school-link YAT IDs, even when no rows match.
--
-- The school-links migration granted authenticator SELECT only. PostgreSQL
-- therefore rejected every registry insert with SQLSTATE 42501 and rolled
-- back the whole player creation. Give the existing invoker trigger only
-- the column permission it needs; school/source identity and row creation
-- or deletion remain unavailable to the application role.
GRANT UPDATE (yatid) ON TABLE public.yat_school_links TO authenticator;
