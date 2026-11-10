-- School address rule (Pete, Nov 2026): a school whose name is unique in its
-- state uses school.state.yatstats.com (hamilton.az). A school that shares
-- its name with another school in its state uses school-city.state
-- (liberty-bakersfield.ca), plus -hsid only when name, city and state are all
-- identical. No exceptions for the original 1,024.
-- When a school's saved address changes, its old address is kept here and
-- the site 308-redirects it to the new one.
CREATE TABLE IF NOT EXISTS public.school_url_aliases (
  old_url text PRIMARY KEY,
  hsid integer NOT NULL,
  new_url text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
