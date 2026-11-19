# Deployment and production readiness

## Deployment shape

- Build `client/` as static assets and serve from a CDN/static host with HTTPS and SPA fallback.
- Deploy `server/` as a stateless Node.js service behind TLS ingress. Configure `/api` routing, health probe `/api/v1/health`, readiness probe `/api/v1/ready`, and graceful termination.
- Use managed MongoDB with replica-set support, private networking where available, TLS, automated backups, and least-privilege database users. Set an appropriate connection pool for expected replicas and database connection limits.
- Keep sessions stateless only while JWT revocation requirements permit; otherwise introduce managed server-side sessions/token revocation.
- Store secrets in the deployment platform's secret manager. Do not commit `.env` files or expose backend secrets to the client build.

## Backup and restore (MongoDB Database Tools)

Use a protected operator workstation/network. Store encrypted archives in access-controlled offsite storage. Commands below use a database URI supplied securely in the shell environment; do not paste credentials in shell history.

```powershell
mongodump --uri="$env:MONGODB_URI" --archive="morrow-cafe.archive.gz" --gzip
mongorestore --uri="$env:RESTORE_MONGODB_URI" --archive="morrow-cafe.archive.gz" --gzip --drop
```

Confirm restore with record counts and a staging application smoke test. Define retention, RPO/RTO, encryption, access approvals, and routine restore drills before production.

## Launch checklist

- [ ] Replace placeholder brand/address/contact/hours and all Unsplash images with licensed café assets.
- [ ] Configure HTTPS domains, strict CORS, production `JWT_SECRET`, database TLS/private access, secret management, and production cookie/token policy.
- [ ] Persist order tracking token securely for customers across browser sessions; it is currently held only in client memory.
- [ ] Configure Stripe test/live keys and webhook endpoint, verify signatures and retries, test payment success/failure/refund workflows end-to-end.
- [ ] Add email/SMS provider credentials and templates; verify retry, bounce, opt-out, and delivery failure monitoring.
- [ ] Configure object storage and safe upload scanning before accepting customer media uploads.
- [ ] Complete shop variants, shipping/tax/returns, promos, customer support, menu administration, staff dashboard, audit logs, reports, and role provisioning.
- [ ] Confirm local tax, allergen disclosures, privacy/consent language, retention, accessibility, and consumer-protection requirements with qualified reviewers.
- [ ] Add automated integration tests against a replica-set MongoDB test environment, including authorization, oversell contention, webhook signature verification, reservations, and moderation.
- [ ] Configure uptime, error-rate, payment-webhook, database saturation, queue-lag, and low-stock alerts.
- [ ] Set backup retention and perform a documented restore drill. Define on-call ownership and incident response steps.
- [ ] Load test menu reads and checkout; tune indexes, connection pool, rate limits, CDN caching, and horizontal scaling to observed traffic.
- [ ] Verify keyboard/screen-reader flows, responsive layouts, contrast, reduced motion, metadata, sitemap, canonical URL, and structured data.

Do not promise uninterrupted service. Monitor actual availability and publish realistic service/incident communications.
