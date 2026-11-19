# Architecture and data model

## Request flow

The Vite React client uses same-origin `/api/v1` requests in development through the Vite proxy. Express validates input, applies security middleware and authentication/role checks, then reads/writes MongoDB through Mongoose. Monetary values are stored as decimal currency numbers rounded to cents; production accounting integrations should use integer minor units if currency/rounding requirements expand.

Online orders are repriced against active catalog records. Item stock is conditionally decremented in MongoDB before order persistence, and compensated on persistence failure. An idempotency key prevents duplicate order records on client retries. Payment status remains unpaid/pending until a verified provider webhook reports payment success. Reservation requests atomically increment the capacity counter for a date/time slot; each slot currently has a configurable-in-code capacity of eight guests.

## Folder layout

```text
client/
  src/App.tsx            Storefront, menu/cart, reservation request
  src/styles.css         Responsive design tokens and UI
  vite.config.ts         Local API proxy
server/
  src/app.ts             REST routes, validation, middleware
  src/auth.ts            JWT issuance and role guards
  src/config.ts          Environment validation
  src/models.ts          Mongoose schemas and indexes
  src/orders.ts          Cart pricing and atomic stock reservation
  src/seed.ts            Idempotent sample menu and owner seed
  src/index.ts           Database connection and graceful shutdown
docs/
```

## Collections

| Collection | Purpose | Important indexes |
|---|---|---|
| `User` | Customer and staff identities, bcrypt hash, role | unique normalized email; role |
| `MenuItem` | Public food/drink catalog, modifiers, allergens, stock | unique slug; category+availability; text search |
| `Order` | Customer contact, immutable priced lines, fulfillment, status, payment state | unique idempotency key; status+created date; unique sparse Stripe session |
| `Reservation` | Guest, party size, date/time, requests, moderation-like confirmation status | date; date+time+status |
| `ReservationSlot` | Atomic guest capacity counter per date/time | unique `_id` date/time key |
| `CommunityPost` | Review/feedback/media URL and required consent, queued for moderation | status |

Large media files are not stored in MongoDB. A future upload service should use private object storage, short-lived upload grants, content-type/size verification, malware scanning, and moderation before publication.

## Role matrix

`customer` can register and use public ordering/reservation APIs. `owner`, `manager`, `cashier`, `kitchen`, and `moderator` are available role values. Current protected route policies:

- Orders queue/status: owner, manager, cashier, kitchen.
- Reservation list/status: owner, manager, cashier.
- Community review queue/moderation: owner, manager, moderator.

Staff account provisioning and a complete dashboard are next-milestone work; do not promote users by editing public registration input.

## Current API groups

See [api.md](./api.md) for methods and payload expectations.
