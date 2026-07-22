# Faith Apparel

AI design → review → Shopify + Instagram publish → print-on-demand
fulfillment, for a single-operator Christian apparel brand.

**What this repo owns:** artwork generation (Recraft), print prep, the
quality gate, the `/desk` review UI, and the publish step (Shopify Admin
API + Instagram Graph API).

**What it deliberately does not own:** checkout, payments, tax
(Shopify), order routing and fulfillment (Gelato/Printful Shopify apps),
Instagram catalog sync (Shopify's Facebook & Instagram channel). See
[`docs/setup.md`](docs/setup.md).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Postgres (Supabase) via
Drizzle · Supabase Storage · Vercel.

## Develop

```sh
cp .env.example .env   # fill in every value — boot fails loudly on any missing var
npm install
npm run dev            # /desk is the whole UI
npm test               # vitest
npm run db:generate    # regenerate SQL after schema changes
```

## Status

- [x] Phase 1 — scaffold, schema, env validation, `/desk` shell (seeded fake data)
- [ ] Phase 2 — quality gate + scripture corpus
- [ ] Phase 3 — Recraft generation + background job
- [ ] Phase 4 — mockups (supplier flat + on-model)
- [ ] Phase 5 — `/desk` on real data, approve/kill
- [ ] Phase 6 — Shopify publish (idempotent)
- [ ] Phase 7 — Instagram publish + rolling-24h rate limiter
- [ ] Phase 8 — Vercel deploy, migrations, smoke test
