# Morrow & Moss Café

A full-stack café storefront and operations foundation built with React, TypeScript, Vite, Express, Node.js, MongoDB, and Mongoose.

## Architecture overview

- `client/`: responsive React + TypeScript public storefront. It loads the published menu from the API and submits pickup orders and reservation requests.
- `server/`: versioned REST API, Mongoose models/indexes, password hashing, JWT authentication, role-based staff routes, server-side pricing/stock reservation, Stripe Checkout/webhook hooks, and seed data.
- `docs/`: system design, endpoint inventory, deployment guidance, and operational readiness checklist.
- MongoDB is the source of truth. Order prices are recomputed from catalog records; checkout creation is idempotent; stock is reserved with atomic conditional updates and compensated if order persistence fails. Reservation capacity is atomically held per date/time slot.
- Customer submissions to the community endpoint are private and pending moderation. No social platform publishing is performed.

## Current milestone

This workspace implements the product foundation: café storefront and responsive design system, menu browsing/search/filtering, pickup cart and order creation, reservation requests, account registration/login, core Mongoose schemas, Stripe checkout/webhook hooks, and staff order/reservation/community moderation APIs.

The following are intentionally not represented as working integrations yet: card checkout from the storefront, email/SMS notifications, delivery dispatch, media uploads/object storage, shop/merchandise checkout, full staff dashboard, promotions, refunds, event/newsletter publishing, analytics, and third-party social publishing. These require provider credentials, operational policies, or the next implementation milestone. The app reports when card payments are unconfigured rather than simulating payment success.

## Requirements

- Node.js 20+ (tested target: Node 22)
- npm 10+
- MongoDB 7+; local standalone is suitable for development. Use a managed replica set for production.

## Local setup

1. Install dependencies from the project root:

   ```powershell
   npm install
   ```

2. Copy `server/.env.example` to `server/.env`; set a long random `JWT_SECRET`, MongoDB URI, tax rate, and café details.
3. Copy `client/.env.example` to `client/.env.local` and customize the public brand values. `VITE_*` values are public and must never contain secrets.
4. Start MongoDB, then seed menu items and the owner account:

   ```powershell
   npm run seed
   ```

   Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in `server/.env` first. The seed command refuses an absent or short password. Seeded data is idempotently upserted.
5. Start frontend and API together:

   ```powershell
   npm run dev
   ```

   Web: `http://localhost:5173` · API health: `http://localhost:4000/api/v1/health` · readiness: `http://localhost:4000/api/v1/ready`
6. Build and run tests:

   ```powershell
   npm test
   npm run build
   ```

## Configuration and third parties

- `server/.env.example` documents the backend's required settings. `JWT_SECRET` must be explicitly set in production.
- `client/.env.example` contains display-only café identity and contact values. Never put credentials in Vite variables.
- Stripe integration uses Checkout and signed webhook events. Configure test-mode `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, success/cancel URLs, and register `/api/v1/payments/stripe/webhook` in Stripe before enabling it. The API only marks an order paid after a verified Stripe webhook. The customer storefront currently supports pickup order requests and does not initiate a card charge.
- Email, SMS, object storage, malware scanning, delivery dispatch, and social platform integrations require provider setup and are not falsely reported as active.
- Menu and gallery imagery uses remote Unsplash image URLs as design placeholders. Replace these with licensed café-owned assets and configure an image CDN before launch.

## Security and operational notes

- API payloads are validated with strict Zod schemas. Helmet, configured CORS, JSON body limits, and global rate limits are enabled.
- Passwords are bcrypt-hashed. Role checks reload the user's persisted role rather than trusting the role claim alone.
- Configure MongoDB network access, TLS, least-privilege credentials, automated backups, restore drills, and alerting in the chosen hosting platform.
- Never expose the owner seed password, JWT secret, Stripe secrets, or database URI to the browser.
- Production should use a managed MongoDB replica set, TLS-only ingress, secret management, structured log shipping, error monitoring, and tested restore procedures. Review the launch checklist in `docs/operations.md`.

## Data handling

See `docs/architecture.md` for models and indexes, `docs/api.md` for the current HTTP contract, and `docs/operations.md` for deployment and backup/restore guidance.
