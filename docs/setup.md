# Faith Apparel — Operator setup

Every manual step you must perform, kept current as the build progresses.
Steps marked **⏳ later phase** are documented ahead of time so nothing
blocks when the code lands.

## Do these on day one

### 1. Meta App Review — start it NOW

`instagram_content_publish` permission requires Meta App Review, which takes
**days**. Nothing else in the build depends on it being approved, but Instagram
publishing (phase 7) cannot go live without it.

1. Create a Meta app at <https://developers.facebook.com/apps> (type: Business).
2. Add the **Instagram Graph API** product.
3. Under App Review → Permissions and Features, request
   `instagram_content_publish`, `instagram_basic`, and `pages_read_engagement`.
4. You'll need a screencast of the publishing flow for the review — record it
   once `/desk` publishing works, but **submit the request today** so the queue
   time overlaps the build.
5. Note `META_APP_ID` and `META_APP_SECRET` into `.env`.

### 2. Supabase project

1. Create a project at <https://supabase.com>.
2. Copy the **pooled** connection string (transaction mode) → `DATABASE_URL`.
3. Copy the project URL → `SUPABASE_URL`, and the `service_role` key →
   `SUPABASE_SERVICE_KEY` (server-only — never expose it).
4. Create a Storage bucket named `mockups` with **public read** access —
   Instagram can only fetch public HTTPS URLs. Create a second bucket
   `artwork` (public read as well; print files are not secret).

### 3. Shopify custom app

1. In Shopify admin: Settings → Apps and sales channels → Develop apps →
   Create an app (name it `faithmerch`).
2. Configure Admin API scopes: `write_products`, `read_products`,
   `write_publications`, `read_publications`, `write_inventory`.
3. Install the app, reveal the Admin API access token →
   `SHOPIFY_ADMIN_TOKEN`. Store domain (`xxx.myshopify.com`) →
   `SHOPIFY_STORE_DOMAIN`.

### 4. Environment file

```sh
cp .env.example .env
```

Fill in **every** value. The server refuses to boot if any are missing and
tells you which one.

### 5. Inngest (background jobs)

Generation takes 30–90s and never runs in a request handler — jobs run on
Inngest.

- **Local dev:** `npx inngest-cli@latest dev` in a second terminal, set
  `INNGEST_DEV=1` in `.env`, and put any non-empty placeholder in the two
  key vars.
- **Production:** create an app at <https://app.inngest.com>, connect the
  Vercel integration (it registers `/api/inngest` automatically), and set
  `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Vercel env vars.
- The weekly `refresh-meta-token` cron runs on Inngest too — no extra setup.

## Supplier apps (⏳ install before phase 6 acceptance)

Order routing is handled entirely by the suppliers' native Shopify apps —
there is deliberately **no order code in this repo**.

### Gelato — primary supplier (most SKUs)

1. Install the **Gelato: Print on Demand** app from the Shopify App Store.
2. Connect it to your Gelato account; create an API key at
   <https://dashboard.gelato.com> → Developer → API keys → `GELATO_API_KEY`.
3. Gelato owns: standard tees, sweatshirts — every SKU prefixed `gelato-`.

### Printful — premium / branded SKUs

1. Install the **Printful** app from the Shopify App Store.
2. Create an API key at Printful dashboard → Settings → API → `PRINTFUL_API_KEY`.
3. Printful owns: premium garments, inside-label branding — every SKU
   prefixed `printful-`.

**SKU ownership rule:** each design row carries a `supplier` field
(`gelato` | `printful`). The publish step attaches the print file via that
supplier's API, and that supplier's Shopify app fulfills the order. One
design, one supplier — never both.

How fulfillment works with zero code: order placed → supplier app receives
it → prints and ships → pushes tracking back to Shopify → Shopify emails
the customer.

## Instagram / Meta (⏳ finish before phase 7)

1. Convert the Instagram account to a **Business** account and link it to a
   Facebook Page.
2. Generate a long-lived user token (60-day expiry — the app refreshes it on
   a schedule automatically) → `META_LONG_LIVED_TOKEN`.
3. Get the IG user id (`GET /me/accounts` → page → `instagram_business_account`)
   → `IG_USER_ID`.
4. In Shopify: add the **Facebook & Instagram** sales channel and connect it
   to Commerce Manager. This syncs the product catalog to Meta automatically —
   product tagging in posts only works after this sync completes and the
   commerce account is approved.

## Supplier API notes (verify on first live run)

Every supplier call is isolated in `src/lib/clients/{gelato,printful}.ts`.
The Printful mockup-generator and sync-product endpoints follow their
published docs. The Gelato e-commerce endpoints could not be verified from
the build environment (network policy) — on your first run with a real
`GELATO_API_KEY`, if a Gelato call 404s, fix the path in that one client
file; nothing else touches it. Printful catalog variant ids in
`publish-design.ts` (`PRINTFUL_VARIANT_IDS`) assume Bella+Canvas 3001
S–2XL — adjust per garment.

## Vercel (phase 8)

1. Import the repo at <https://vercel.com/new>.
2. Add every var from `.env.example` to Project → Settings → Environment
   Variables.
3. Deploy. Run `npm run db:migrate` (drizzle-kit) with the production
   `DATABASE_URL` in your shell to create the tables.
4. Install the Inngest Vercel integration (see §5 above).
5. Smoke test: open `https://<app>/desk?key=<ADMIN_SECRET>`, submit a
   design ("Consider the lilies, Matthew 6:28, KJV"), watch it move
   generating → ready with checks, then approve and confirm the Shopify
   product, the IG post, and the quota meter ticking to 1/25.
