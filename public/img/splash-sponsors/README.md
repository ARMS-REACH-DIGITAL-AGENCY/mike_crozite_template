# YAT?STATS school splash sponsor artwork

## New reusable, database-controlled sponsor system

Upload **one logo per sponsor**, not one logo per school. Example:

`public/img/splash-sponsors/brands/acme-auto-care.webp`

- Use a lowercase, hyphenated **sponsor slug** for the filename: `acme-auto-care.webp`.
- Recommended: transparent WebP or PNG, wide logo, ideally 800–1200 px wide with transparent padding trimmed.
- Aim for a light/white-on-transparent variant that reads on the black splash background.
- The same file can serve one, 10 or 8,000 school IDs. No copies required.
- The public URL once built is `/img/splash-sponsors/brands/acme-auto-care.webp`.

The new normalized tables in the **Players Neon database** are:
- `public.sponsor_brands` — reusable brand, slug, display name, logo path and optional website.
- `public.school_splash_sponsorships` — maps sponsor to numeric school `hsid`, optional `sponsor_orders.id`, priority, start/end dates and campaign status.

For a preview sponsor, first upload the artwork to `public/img/splash-sponsors/brands/`, commit it and wait for a preview deployment. Then use an authorized database interface (SQL or partner commerce webhook) to create the brand and assign it to one or more schools.

Example SQL (replace the example sponsor and file with your own):

```sql
INSERT INTO public.sponsor_brands (slug, name, logo_url, website_url)
VALUES ('acme-auto-care', 'Acme Auto Care',
        '/img/splash-sponsors/brands/acme-auto-care.webp',
        'https://example.com')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      logo_url = EXCLUDED.logo_url,
      website_url = EXCLUDED.website_url,
      updated_at = now();

INSERT INTO public.school_splash_sponsorships
  (hsid, sponsor_id, status, priority, source)
SELECT '5004', id, 'active', 100, 'manual'
FROM public.sponsor_brands
WHERE slug = 'acme-auto-care'
ON CONFLICT (hsid, sponsor_id, starts_at) DO NOTHING;
```

Note: the second statement inserts a new campaign; to reassign a current school sponsor, pause or end its earlier campaign first. The resolver chooses **one** active sponsor by descending priority, most recent starts_at, then id. Expired, paused or inactive sponsors never serve.

To see the full splash even after the 30-day first-visit cookie is set, open the school URL with `?splash=1`. In forced preview mode the Enter button still controls exit.

The sponsor endpoint is `/api/splash-sponsor/<hsid>`, cached for approximately two minutes. The public endpoint is GET-only and does not allow assignment writes. The authenticated partner commerce dashboard or ARMS webhook can maintain assignments using server-only credentials. Do not expose Neon or Stripe secrets in browser-side code.

## Legacy folder behavior (backward compatibility)

The former static test directories remain supported as a fallback:
- `public/img/splash-sponsors/5004/` for school 5004
- `public/img/splash-sponsors/global/` for generic fallback

Legacy static logos are build-indexed and may rotate randomly when **no active database sponsorship is assigned**. For paying sponsors, use the normalized DB path instead.
