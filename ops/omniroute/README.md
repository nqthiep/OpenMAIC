# OmniRoute gateway (optional compose profile `omniroute`)

## What this is

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is a third-party, self-hosted LLM gateway: one OpenAI-compatible endpoint in front of many AI providers. This optional compose profile runs it next to the app, but only behind a gate:

- `omniroute` — the third-party image. It sits on its own `omniroute` network (shared only with `openmaic` and `omniroute-gate`), stores its data in the `omniroute-data` volume, and publishes no port of its own. Postgres stays on the `default` network, so OmniRoute cannot reach the database.
- `omniroute-gate` — Caddy. The profile's only published port, bound to `127.0.0.1:8081` on the host. Every path except the one-time `/__enter` hand-off is first checked by the app (`forward_auth` → `/api/admin/omniroute/check`); only when the app answers 2xx for a signed-in admin is the request proxied to OmniRoute's dashboard. A failed check (401/403 with a short text) is passed back to the browser unchanged.

Nothing changes unless you opt in: `docker compose up -d` still starts only `openmaic`.

## Files

- `docker-compose.yml` — services `omniroute` and `omniroute-gate` (both profile `omniroute`), network `omniroute`, volume `omniroute-data`; the `openmaic` service gains the `omniroute` network and four `OMNIROUTE_*` variables (empty by default = feature off).
- `ops/omniroute/Caddyfile` — the gate's configuration.
- `ops/omniroute/smoke.sh` — the smoke test (see **Verify**).
- `.env.example` — the commented `OMNIROUTE_*` block documenting every value.

## One-time setup

1. Generate the secrets and write them to `.env` next to `docker-compose.yml` — **not `.env.local`**: compose interpolates `${VAR}` from `.env`; `.env.local` is only passed to the app container.

   ```bash
   # Run each openssl command and paste its output in place of <...>.
   cat >> .env <<'EOF'
   OMNIROUTE_GATE_SECRET=<openssl rand -base64 48>
   OMNIROUTE_ADMIN_PASSWORD=<openssl rand -base64 36>
   OMNIROUTE_JWT_SECRET=<openssl rand -base64 48>
   OMNIROUTE_API_KEY_SECRET=<openssl rand -hex 32>
   OMNIROUTE_PUBLIC_URL=https://omniroute.khaitam.ai.vn
   EOF
   ```

   `OMNIROUTE_ADMIN_PASSWORD` is the OmniRoute dashboard password — the app signs the admin in with it, so nobody ever types it. `OMNIROUTE_JWT_SECRET` signs OmniRoute's session cookies and `OMNIROUTE_API_KEY_SECRET` encrypts the provider keys it stores; `OMNIROUTE_GATE_SECRET` signs the one-time ticket of the `/__enter` hand-off.

2. Point the public hostname at the gate: Cloudflare Zero Trust → Networks → Tunnels → your tunnel → add a public hostname `omniroute.khaitam.ai.vn` with service `http://localhost:8081`. TLS ends at Cloudflare, so `OMNIROUTE_COOKIE_SECURE` stays at its default `true`.

3. Start the profile:

   ```bash
   docker compose --profile omniroute up -d
   ```

Local development instead of the tunnel: set `OMNIROUTE_PUBLIC_URL=http://omniroute.localhost:8081` and `OMNIROUTE_COOKIE_SECURE=false`, then open that URL (`*.localhost` names resolve to 127.0.0.1 in browsers).

## Use

In the app, Settings popup (top bar) → language model → **OmniRoute**. The page has three steps:

1. **Providers in OmniRoute.** The connections you made in OmniRoute, with the active ones ticked (subscription plans are shown with a warning and not ticked). **Open OmniRoute** goes to OmniRoute's own providers page, where you add or fix a connection; **Refresh** reads them again. OmniRoute's providers that need no key are never used.
2. **Connect.** One button. The app signs in to OmniRoute with `OMNIROUTE_ADMIN_PASSWORD`, creates an API key named `OpenMAIC` that may use only the ticked connections (no chat content kept in OmniRoute, with an optional daily spending limit in USD) and stores it encrypted in the database. The key is never shown. **Update access** changes what it may use, **Issue a new key** replaces the secret, **Disconnect** deletes the key in OmniRoute, removes it here and clears the routes that point at OmniRoute.
3. **Models by role.** One model for each of four roles (create lesson content, chat and tutoring, grading, small helper tasks), picked from OmniRoute's `auto/*` routes, your combos, and the single models of the ticked connections. A suggestion (balanced, economical, high quality) fills all four. Saving writes the routes of every stage in the role and the default model, together with whether the model reads images, which is what lets image features work through OmniRoute. **Test** sends one tiny request through a saved role. **Customise each step** opens the per-stage routes.

Your own combos (Dashboard → Combos in OmniRoute) show up in the lists after **Refresh**; create them there. The app only reads what OmniRoute says a single model can do; for a combo or `auto/*` it knows nothing, so tick **This model reads images** yourself where it applies (a name with `vision` or `multimodal` is taken as images).

## Rules

- **Do not change the dashboard password inside OmniRoute.** The app signs in with `OMNIROUTE_ADMIN_PASSWORD` from `.env`; if one side ever changes, change both. Note OmniRoute's `INITIAL_PASSWORD` only takes effect while no password has been saved yet.
- Keep providers tagged `tos: avoid` disabled. OmniRoute already excludes them from automatic routing; connecting an account does not override the tag.
- Never switch the image to `latest`. `OMNIROUTE_VERSION` exists so upgrades are deliberate (see **Upgrade**).

## Upgrade

1. Read the target version's release notes: <https://github.com/diegosouzapw/OmniRoute/releases>
2. Set `OMNIROUTE_VERSION` in `.env`.
3. `docker compose --profile omniroute up -d` — provider endpoints, keys and settings survive in the `omniroute-data` volume.
4. Run the smoke test (below).

## Verify

```bash
ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn            # through the gate
ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn --internal # + inside the Docker network
```

Every gate test must PASS: anonymous requests, including one with a garbage `omniroute_gate` cookie, get 401/403, and `/__enter` without a valid ticket gets a 4xx. The script exits non-zero on any FAIL. Those tests only show that anonymous requests are refused. Two optional tests read the environment (never the command line, so nothing secret appears in `ps` or in the output):

```bash
# proves the Cookie header reaches the app and the secret matches: a cookie signed for an account that does not exist must get exactly 403
OMNIROUTE_GATE_SECRET=<value from .env> ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn
# proves a signed-in admin is let in and the dashboard answers with Cache-Control: no-store
# (copy the omniroute_gate cookie from the browser's developer tools after clicking the button)
OMNIROUTE_SMOKE_COOKIE=<cookie value> ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn
```

## Backup

The `omniroute-data` volume (OmniRoute's SQLite database: provider endpoints, keys, settings) is **not** yet included in `ops/backup/backup.sh` — that is remaining work. Until it is added, a lost volume means re-entering every provider endpoint and key by hand.

## Not verified yet

Checked against OmniRoute v3.8.52's own Dockerfile, `.env.example` and source, and against Caddy's documentation — but not against a running stack (`docker compose up` was not run on the authoring machine):

- `API_HOST=0.0.0.0`: OmniRoute's own material disagrees on the default (its `.env.example` shows `0.0.0.0`, its `src/lib/apiBridgeServer.ts` defaults to `127.0.0.1`). The explicit value is source-verified as what makes `omniroute:20129` reachable from other containers; it has not been observed in a running container.
- Checked on 2026-10-23 with a throwaway `caddy:2-alpine` container running this Caddyfile against fake app and OmniRoute backends (not the real ones): no cookie gives 401; a cookie is forwarded to the check route; the app's 401 is passed back; `/__enter` bypasses the check; `Host` is passed unchanged; `Cache-Control` from OmniRoute is replaced by `private, no-store`; the gate cookie is removed from what OmniRoute receives while its other cookies are kept. The `omniroute-gate` service from `docker-compose.yml` starts with only `CAP_NET_BIND_SERVICE` and `no-new-privileges`, and answers 502 when the app is absent (it fails closed). Without `cap_add: NET_BIND_SERVICE` the Caddy binary cannot even start under `cap_drop: ALL`.
- Run on 2026-10-23 against a real OmniRoute 3.8.52 container (on a developer Mac, not behind the gate), with a stand-in upstream: the app's sign-in, creating, limiting, replacing and deleting the key, the model list, the three-step panel in a browser, and a test request through `auto/cheap`. `tests/omniroute/live.test.ts` repeats the client part (opt-in, see its header). Not run: behind the Caddy gate with the real app, and with a real provider (images, tool calls, streaming).
- Whether OmniRoute accepts the server-side `POST /api/auth/login` from the app container (its login guard looks at the peer address and the Docker bridge address is private). The app answers 502 "OmniRoute did not accept the sign-in" if it does not.
- Whether the dashboard works at the root of its own hostname behind Caddy with `AUTH_COOKIE_SECURE=true` and the public URL set (it should: no base path is used).

## How the gate behaves

- The ticket from **Open OmniRoute settings** lives 60 seconds and works once. It names the OpenMAIC session it was created in. It is checked, then that session and its account are checked again (session live, account an enabled administrator), then the app signs in to OmniRoute.
- The browser gets two cookies on the OmniRoute hostname only: `omniroute_gate` (up to 8 hours, HttpOnly, no `Domain`) and OmniRoute's own `auth_token` (30 days). The `openmaic_session` cookie is never sent to this hostname.
- Every request asks the app first. The gate cookie is tied to the OpenMAIC session it was opened from, so signing out of OpenMAIC, an expired session, a demotion or a disabled account closes the gate within about 15 seconds (the answer is remembered that long per session). OmniRoute's own cookie lasts longer but is useless without the gate cookie. After 8 hours click the button again.
- Caddy sets `Cache-Control: private, no-store` on everything it takes from OmniRoute. Without it Cloudflare could keep OmniRoute's static files at its edge and hand them out without asking the app.
- Caddy removes `omniroute_gate` from the cookies it passes to OmniRoute. The cookie names the account and a prefix of the session digest, and OmniRoute is third-party code; its own `auth_token` and any other cookie pass unchanged.
- The `enter` route also answers on the main hostname if called there. It still needs a valid ticket, which only ever points at the OmniRoute hostname.
- The live-monitor WebSocket of OmniRoute is switched off (`OMNIROUTE_ENABLE_LIVE_WS=false`): the page that needs it will not update live.
- `ACCESS_CODE` and this feature do not mix: the app's middleware answers 401 to every `/api/*` call without the access cookie, including the gate's check. The production server no longer sets `ACCESS_CODE`.
- Same site, not same origin: `omniroute.khaitam.ai.vn` and `khaitam.ai.vn` are one site, so a browser attaches the app's session cookie to requests that code on the dashboard page sends to the app (it cannot read the answers, and the cookie itself is host-only and never goes to the dashboard). The app therefore refuses every write under `/api` (any method but GET, HEAD, OPTIONS) whose `Sec-Fetch-Site` header is present and not `same-origin` (`middleware.ts`, `lib/server/same-origin-writes.ts`); requests without the header (servers, curl, the render service) are not affected. What this cannot stop: code on a sibling hostname can still set a cookie named `openmaic_session` for the whole domain; the app then sees two and treats the visitor as signed out (a nuisance, not a way in). Only a hostname on a different registrable domain removes the sibling relationship. OmniRoute is third-party code: keep the image tag pinned and read release notes before upgrading.
- Network: the app and OmniRoute share the `omniroute` network, so OmniRoute can reach `openmaic:3000` directly (as any client on the internet can) and the internet. The `omniroute` service is not run with `cap_drop: ALL` or a read-only root file system because it was not tried against this image; both are worth testing on the server.

## Troubleshooting

- Browser shows "Sign in to OpenMAIC as an administrator, then open OmniRoute from Settings." (401): you came without the button. Open it from the Settings popup.
- "Administrators only." (403): the account is not an administrator (or was disabled or demoted in the last 15 seconds).
- "This link has expired." (403) on `/__enter`: the ticket was used or is older than 60 seconds; click the button again.
- "OmniRoute did not accept the sign-in." (502): `OMNIROUTE_ADMIN_PASSWORD` in `.env` differs from the password OmniRoute holds (it was changed inside OmniRoute, or the volume was created with another value), or OmniRoute locked the app's address after failed attempts, or it is not running (`docker compose --profile omniroute ps`). Fix the value or remove the `omniroute-data` volume to start OmniRoute again from `.env`.
- The app answers "not set up": one of `OMNIROUTE_PUBLIC_URL`, `OMNIROUTE_GATE_SECRET` (32+ characters), `OMNIROUTE_ADMIN_PASSWORD` (16+ characters) is missing or too short, or the public URL has a path.
