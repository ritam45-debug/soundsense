# Security

Controls that exist in the code, how they were tested, and what is still open. "Tested" refers to `tests/security.test.ts`, `tests/api-auth.test.ts`, `tests/api-flow.test.ts` and the Chrome run (`e2e/run.ts`).

## Controls

| Area | Control | Tested |
|---|---|---|
| Passwords | bcrypt (cost 12 by default); ≥ 10 characters with a letter and a digit, ≤ 200 (length over symbols, per NIST SP 800-63B); never returned by any endpoint | yes |
| Sessions | JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` and `__Host-` prefixed in production), **and** a row in `sessions`: logout, deactivation and password reset revoke it server-side; 7-day expiry | yes |
| Brute force | per-account lockout (5 failures → 15 min), per-IP login limit (15 / 15 min), register 8 / h, forgot 5 / h, global 240 / min / IP; counters in the database so they hold across serverless instances | yes |
| Enumeration | login, forgot-password and resend-verification give identical responses for unknown and known accounts | yes |
| Tokens | e-mail verification (24 h) and password reset (60 min) tokens are random, stored as SHA-256 hashes, single use | yes |
| Authorisation | role check in the API **and** PostgreSQL row-level security: every request runs as `soundsense_app` with the caller's id/role; customers see only their rows, consultants only assigned cases; `password_hash`/token tables are not granted to the app role | yes (API and direct DB-level queries; PGlite and PostgreSQL 18) |
| CSRF | `SameSite=Lax` cookies plus an `Origin`/`Host` match on every state-changing request; JSON-only bodies (415 otherwise) | yes |
| Input | zod schemas on every state-changing route; NUL bytes rejected (they would otherwise cause a 500 in PostgreSQL); all SQL is parameterised; unknown questionnaire answers are dropped, oversized ones rejected per field | yes |
| Output | the API only emits JSON; React escapes on render; no `dangerouslySetInnerHTML` apart from a fixed theme bootstrap script | yes (stored `<img onerror>` returned as data) |
| Uploads | ≤ 3 MB, MIME allow-list, magic-byte sniffing, sanitised filename, served as `attachment` with `nosniff`, only to people who can see the assessment | partly (type checks covered; no malware scanning) |
| Headers | `Content-Security-Policy` (self-only; see below), `X-Frame-Options: DENY` and `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (microphone for self only), HSTS | yes (E2E) |
| Secrets | server-side only; the settings page reports *whether* SMTP/LLM are configured, never the values; the app refuses to start in production without a strong `SESSION_SECRET` | yes |
| AI | the LLM is called from the server; an assessment is included in the prompt only when the customer ticked consent; a prompt-injection attempt cannot make the bot read an unshared assessment because it is never in the prompt | yes |
| Audit | sign-ins, account changes, consent toggles, price edits, report issuing, booking actions, uploads and assignments are written to `audit_logs` (admins read; nobody edits) | yes |
| Privacy | microphone audio never leaves the device; only summary statistics are stored if the user saves a recording | by design / E2E |

## Known gaps and hardening still to do

1. **CSP allows `'unsafe-inline'` for scripts.** Next.js injects inline bootstrap scripts; removing the allowance needs a per-request nonce via middleware (and makes pages dynamic). Everything else in the policy is locked to the same origin.
2. **Client IP is read from `X-Forwarded-For`.** Behind Vercel/Render this is set by the platform; if the app is ever exposed *directly*, a client can spoof it and evade IP rate limits. Account lockout still applies per account. Put the app behind a trusted proxy.
3. **Requests with no `Origin` header are accepted** (needed for non-browser clients). They still need the session cookie, and browsers always send `Origin` on cross-site POSTs, so this is not a CSRF path, but an API-token model would be cleaner for machine clients.
4. **Database TLS uses `rejectUnauthorized: false`** so managed-provider certificates work out of the box; pin the CA for stricter environments.
5. **No MFA**, no CAPTCHA on registration, no breached-password check (e.g. HIBP k-anonymity). Recommended for the admin role before wide release.
6. **No malware scanning** of uploaded documents; documents are only ever offered as downloads.
7. **No external log/alert pipeline** and no automated dependency audit in CI. Run `npm audit` and a Dependabot-style update routine.
8. **E-mail deliverability** (SPF/DKIM/DMARC) is the deployer's responsibility; without it verification mails may land in spam.
9. **No penetration test** has been performed. The tests here are the author's own and cover the cases listed above, not an adversarial review.
10. **Data-protection obligations** (consent wording, retention, deletion on request, cross-border transfer if the LLM is used) must be settled by the organisation operating the service. Customers can delete their drafts and chat conversations; there is no self-service "delete my account" yet.

## Reporting

Treat any finding as private: contact the project owner directly rather than opening a public issue.
