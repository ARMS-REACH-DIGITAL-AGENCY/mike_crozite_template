## Summary

<!-- Describe what this PR changes and why. -->

## Preview Validation Links

> **Note:** This application uses dynamic routes. The root deployment URL (`/`) redirects to the marketing site, so alwa ys validate using a valid HSID path such as `/5004` (Hamilton High School).

| What to test | Link |
|---|---|
| Hamilton microsite | `https://DEPLOYMENT_URL.vercel.app/5004` |
| School search modal | `https://DEPLOYMENT_URL.vercel.app/5004` → click 🔍 |
| Player cards | `https://DEPLOYMENT_URL.vercel.app/5004` → scroll to alumni grid |
| Filters drawer | `https://DEPLOYMENT_URL.vercel.app/5004` → click filter icon |

<!-- Replace `DEPLOYMENT_URL` with the Vercel preview URL shown on this PR. -->

## Checklist

- [ ] Lint passes (`npm run lint`)
- [ ] Build passes (`npm run build`)
- [ ] Tested with Hamilton microsite preview at `/5004`
