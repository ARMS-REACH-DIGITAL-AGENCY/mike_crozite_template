# Opening splash sponsor logos

Drop logo images into **public/img/splash-sponsors/5004/** for Hamilton High School (HSID 5004), or into **public/img/splash-sponsors/global/** as a fallback for schools without school-specific sponsors.

For example:

- public/img/splash-sponsors/5004/ONSITE.webp
- public/img/splash-sponsors/5004/Another-Sponsor.png
- public/img/splash-sponsors/global/National-Sponsor.svg

Supported formats: PNG, WebP, JPG, JPEG, SVG, AVIF. Transparent PNG/WebP logos that contrast against black work best. The visible sponsor name is derived from the filename by replacing hyphens/underscores with spaces; use readable filenames.

Commit logo files to GitHub on the deploying branch. Each Vercel build runs the sponsor-indexing script automatically: there is no sponsor list to edit. On each genuine splash-page request, one sponsor is selected at random from the school's folder, or the global pool if the school has no local sponsors. The image stays stable during that page load.

The opener is deliberately suppressed during normal internal navigation after the first view. To review another random logo, refresh a school URL with **?splash=1**. If there are no eligible files, existing configured title partners or the current placeholder remain in use.
