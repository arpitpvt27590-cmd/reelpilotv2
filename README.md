# ReelPilot

A Cloudflare Workers dashboard for preparing batches of 1–300 Reels and publishing them to selected Instagram professional accounts through Meta's official Instagram API.

## Important status / limitations

This is a deployable starter implementation, **not a claim of live Meta certification or end-to-end testing**. You must configure your own Meta app and test with accounts you control. Meta can require app review / Advanced Access before accounts outside app roles can authorize. The project uses Instagram Login scopes `instagram_business_basic` and `instagram_business_content_publish`; confirm the current requirements in Meta's documentation before production use.

- Batch account selection is stored at batch creation and expanded into one job per video × selected account. There are no per-video account selectors.
- Videos upload directly from the browser to R2 using signed URLs, so the video bytes do not pass through a Worker request body. The sample configuration limits each video to 95 MB; increase only after checking the Instagram API and storage limits.
- R2 is object storage, not a transcoder. Videos still need to meet Meta's codec, frame-rate, duration, dimensions, and file-size requirements.
- The official API's Reel cover behavior can differ by API login flow/version. ReelPilot sends the same `cover_url` on each Reel when a cover is provided. If Meta rejects this parameter, the job is marked failed with an error; it does not falsely claim the cover succeeded. Verify cover support against the endpoint you actually use before relying on it.
- The queue is durable, but this implementation is a minimal worker. The consumer currently waits for video processing status and is not suitable for unlimited concurrency or guaranteed no-duplicate publication in every network failure scenario. In particular, if Meta publishes but the response is lost, manually inspect Instagram before retrying. Test a 1–2 video batch first.
- Instagram's publishing limit is commonly documented as 25 API-published posts per account in a rolling 24-hour period. 300 videos across one account cannot be published immediately; jobs may need to be spread over days. Rate-limit / publishing-limit handling must be validated in your app and API version.
- R2 signed URLs are temporary. Keep the video objects until Meta has fetched and processed them. The worker currently signs each media URL for 24 hours.
- Session cookie is HttpOnly/Secure/SameSite=Lax, but this starter does not yet implement CSRF tokens or a full OAuth account-linking CSRF/session binding scheme suitable for a multi-user production service. Use only for a private, single-admin workspace until reviewed.
- Secrets are encrypted at rest in D1 with AES-GCM using `SESSION_SECRET`. If you rotate this secret, existing stored tokens cannot be decrypted and accounts must be reconnected.

## Free-tier cost and quotas

Cloudflare advertises free tiers, but quotas and account eligibility can change. No service can promise unlimited free operation.

- Workers Free: currently 100,000 requests/day and 10 ms CPU per invocation. Worker requests are not the same as background queue messages.
- D1 Free: currently 5 million rows read/day, 100,000 rows written/day, 5 GB total DB storage.
- R2 Standard Free: currently 10 GB-month storage, 1 million Class A operations/month, 10 million Class B operations/month, no egress charge. A 300-video batch can exceed 10 GB if average files are large. Delete old media after successful publishing to stay within the free allocation.
- Queues Free: message retention is 24 hours, so a job backlog cannot safely be left unprocessed for multiple days. For a multi-day publishing queue, persist job state in D1 and re-enqueue due work on a schedule; still monitor free-plan queue limits and test it. This starter's cron re-enqueues retry jobs but does not fully implement an account-aware long-term daily rate scheduler.
- Cloudflare may ask for account verification; do not assume all signup flows are identical. Avoid enabling a paid plan or adding a payment method if maintaining a strict ₹0 ceiling.

## 1. Create Cloudflare resources

1. Install Node.js LTS and npm on your computer for the one-time deployment only. Your laptop does **not** need to stay on after deployment.
2. Create a Cloudflare account. From the Cloudflare dashboard, create an R2 bucket named `reelpilot-media` and a D1 database named `reelpilot-db`.
3. Create an R2 API token with Object Read & Write for only this bucket. Record the account ID, access key ID and secret access key.
4. Configure R2 bucket CORS to allow your deployed Worker origin and browser `PUT` requests with the `Content-Type` header. Do not use `*` for production if avoidable.
5. In `wrangler.toml`, replace `REPLACE_WITH_D1_DATABASE_ID` with the D1 database ID from Cloudflare.
6. Install dependencies: `npm install`.
7. Create the queue: `npx wrangler queues create reelpilot-publish`.
8. Apply database migrations: `npm run db:remote`.
9. Set secrets. Use long unique random values:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put META_APP_ID
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_REDIRECT_URI
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

For `META_REDIRECT_URI`, use the exact deployed callback URL, for example `https://reelpilot.YOUR-SUBDOMAIN.workers.dev/auth/callback`. Update `APP_BASE_URL` in `wrangler.toml` to your real Worker URL.

10. Deploy: `npm run deploy`. Open the URL Wrangler prints. Log in with `ADMIN_PASSWORD`.

## 2. Meta / Instagram setup

1. Create a Meta developer app and add the Instagram API with Instagram Login product (the exact product labels may change).
2. Configure the OAuth redirect URL to exactly match `META_REDIRECT_URI`, including HTTPS and `/auth/callback`.
3. Configure Instagram Login and request `instagram_business_basic` and `instagram_business_content_publish`.
4. Add your test Instagram professional account to app roles / testers as required, and complete any verification/app review needed for accounts outside your app roles.
5. Use the dashboard's **Connect Instagram** button. Authorize on Instagram/Meta's official page; never type your Instagram password into ReelPilot.
6. If the OAuth callback reports a profile/token error, review Meta's app setup, redirect URI, login configuration, scopes and account eligibility.

Official references:
- Meta's Instagram API Postman workspace: https://www.postman.com/meta/instagram/documentation/23987686-7714-490f-9bfc-9442db5c8f00
- Reels publishing workflow: https://www.postman.com/meta/instagram/folder/y6xustx/reels-publishing
- Instagram Login API: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/

## 3. R2 browser upload CORS

In R2 bucket settings, add a CORS policy for the deployed Worker origin, allowing `PUT` and headers `Content-Type`. Browser uploads fail if this is missing. Keep the bucket private; ReelPilot signs temporary upload/download URLs.

## 4. First test

1. Connect one test Creator account.
2. Select just one or two small MP4 files that meet Meta's media requirements.
3. Select one account toggle ON and confirm the batch summary says `N videos · 1 accounts selected`.
4. Queue the batch and inspect History → Details. A job becomes **Published** only after the API returns a media ID. Verify the Reel appears on the account.
5. Try a second account with a 1-video batch and verify it receives the Reel. Then test shared cover behavior separately and inspect the resulting Reel in Instagram.
6. Do not start with 300 files. Only increase batch size after checking uploads, processing, errors, storage quota and the per-account publishing limit.

## Notes for maintainers

- Run `npm test` for basic unit tests.
- `MAX_VIDEO_BYTES` is set to 95,000,000 by default. Instagram's documented max file size may be larger, but Cloudflare request limits do not matter for the video bytes here because they are uploaded directly to R2. This conservative default is configurable.
- The worker's OAuth implementation is intentionally simple and should be reviewed before public or multi-user deployment.
- A production-grade no-duplicate guarantee needs reconciliation for uncertain `media_publish` outcomes and a proper idempotency state machine. Do not auto-retry an ambiguous publish outcome without checking Instagram.
