# OmniRoute gateway (a service beside the app, on by default)

## What this is

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is a third-party, self-hosted LLM gateway: one OpenAI-compatible endpoint in front of many AI providers. It is a service of its own in `docker-compose.yml`, a peer of `openmaic`, and the two connect without any value typed into `.env`:

- `omniroute-init` — a one-shot job (`ops/omniroute/init.sh`). It makes the dashboard password once, 64 random hex characters, and keeps it in the volume `omniroute-secrets`. Running it again keeps the password that is there.
- `omniroute` — the third-party image. It reads that password into `INITIAL_PASSWORD` when it starts (a wrapper around the image's entrypoint, so the password is not in `docker inspect`), and makes its own signing and encryption keys on first start, kept in `omniroute-data`. It sits on its own `omniroute` network (shared only with `openmaic` and `omniroute-gate`) and publishes no port. Postgres stays on the `default` network, so OmniRoute cannot reach the database.
- `omniroute-gate` — Caddy, bound to `127.0.0.1:8081` on the host. Every path except the one-time `/__enter` hand-off is first checked by the app (`forward_auth` → `/api/admin/omniroute/check`); only when the app answers 2xx for a signed-in admin is the request proxied to OmniRoute's dashboard. A failed check (401/403 with a short text) is passed back to the browser unchanged.
- `openmaic` mounts `omniroute-secrets` read-only, so the app can sign in to OmniRoute with the same password. It keeps its own gate secret in memory (random per process): a restart closes open dashboard sessions and the admin clicks **Open OmniRoute** again.

`docker compose up -d` starts all of it. To run the app alone: `docker compose up -d openmaic`; the Settings page then says the app cannot reach OmniRoute.

## Files

- `docker-compose.yml` — services `omniroute-init`, `omniroute`, `omniroute-gate`, network `omniroute`, volumes `omniroute-data` and `omniroute-secrets`; the `openmaic` service gains the network, the read-only secrets mount and optional `OMNIROUTE_*` overrides.
- `ops/omniroute/init.sh` — the password job.
- `ops/omniroute/Caddyfile` — the gate's configuration.
- `ops/omniroute/host-dev.yml` — for an app that runs on the host (see **Developing outside Docker**).
- `ops/omniroute/smoke.sh` — the smoke test (see **Verify**).
- `.env.example` — the commented `OMNIROUTE_*` block: every value is an optional override.

## Setup

Nothing goes in `.env`. One step lies outside this repository: the dashboard needs a public hostname that reaches the gate. In Cloudflare Zero Trust → Networks → Tunnels → your tunnel, add a public hostname `omniroute.<your domain>` with service `http://localhost:8081`. The app builds the address itself: `omniroute.` in front of the host of the page the admin is on (`www.` dropped), so `https://khaitam.ai.vn` gives `https://omniroute.khaitam.ai.vn`. Any other hostname: set `OMNIROUTE_PUBLIC_URL` in `.env`. TLS ends at Cloudflare; the app adds `Secure` to the cookies it hands the browser whenever the dashboard is not on localhost.

On a developer machine the dashboard is `http://omniroute.localhost:8081` (`*.localhost` names resolve to 127.0.0.1 in browsers); if that port is taken set `OMNIROUTE_GATE_PORT` in `.env`.

Optional overrides, all in `.env.example`: `OMNIROUTE_PUBLIC_URL`, `OMNIROUTE_ADMIN_PASSWORD` (16+ characters, instead of a generated one), `OMNIROUTE_GATE_SECRET` (32+), `OMNIROUTE_VERSION`, `OMNIROUTE_MEM_LIMIT`, `OMNIROUTE_GATE_PORT`. A value that is set but unusable switches the feature off and the Settings page names it.

### Developing outside Docker

With `pnpm dev` on the host the app cannot see the compose network or the volume. Start the services with the override, which publishes OmniRoute on `127.0.0.1:20128` and `:20129`, keeps the password in `./.omniroute/secrets` (ignored by git) and points the gate at the app on the host:

```bash
docker compose -f docker-compose.yml -f ops/omniroute/host-dev.yml up -d omniroute omniroute-gate
```

Under `next dev` the app finds that folder and those ports on its own, so no value goes in `.env.local`. The gate asks the app on `host.docker.internal:3000`; for another port run the command with `OMNIROUTE_APP_UPSTREAM=host.docker.internal:3002` in front. These ports skip the gate: use the override only on your own machine.

## Use

In the app, Settings popup (top bar) → language model → **OmniRoute**. The page has three steps:

1. **Providers in OmniRoute.** The connections you made in OmniRoute, with the active ones ticked (subscription plans are shown with a warning and not ticked). **Open OmniRoute** goes to OmniRoute's own providers page, where you add or fix a connection; **Refresh** reads them again. OmniRoute's providers that need no key are never used.
2. **Connect.** One button. The app signs in to OmniRoute with `OMNIROUTE_ADMIN_PASSWORD`, creates an API key named `OpenMAIC` that may use only the ticked connections (no chat content kept in OmniRoute, with an optional daily spending limit in USD) and stores it encrypted in the database. The key is never shown. **Update access** changes what it may use, **Issue a new key** replaces the secret, **Disconnect** deletes the key in OmniRoute, removes it here and clears the routes that point at OmniRoute.
3. **Models by role.** One model for each of four roles (create lesson content, chat and tutoring, grading, small helper tasks), picked from OmniRoute's `auto/*` routes, your combos, and the single models of the ticked connections. A suggestion (balanced, economical, high quality) fills all four. Saving writes the routes of every stage in the role and the default model, together with whether the model reads images, which is what lets image features work through OmniRoute. **Test** sends one tiny request through a saved role. **Customise each step** opens the per-stage routes.

Your own combos (Dashboard → Combos in OmniRoute) show up in the lists after **Refresh**; create them there. The app only reads what OmniRoute says a single model can do; for a combo or `auto/*` it knows nothing, so tick **This model reads images** yourself where it applies (a name with `vision` or `multimodal` is taken as images).

## Rules

- **Do not change the dashboard password inside OmniRoute**, and keep `omniroute-secrets` together with `omniroute-data` (same backup, same fate). The app signs in with the password in `omniroute-secrets`; OmniRoute's `INITIAL_PASSWORD` only takes effect while it has no password saved, so a new file does not replace a saved one.
- Keep providers tagged `tos: avoid` disabled. OmniRoute already excludes them from automatic routing; connecting an account does not override the tag.
- Never switch the image to `latest`. `OMNIROUTE_VERSION` exists so upgrades are deliberate (see **Upgrade**).

## Upgrade

1. Read the target version's release notes: <https://github.com/diegosouzapw/OmniRoute/releases>
2. Set `OMNIROUTE_VERSION` in `.env`.
3. `docker compose up -d` — provider endpoints, keys and settings survive in the `omniroute-data` volume.
4. Run the smoke test (below).

## Verify

```bash
ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn            # through the gate
ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn --internal # + inside the Docker network
```

Every gate test must PASS: anonymous requests, including one with a garbage `omniroute_gate` cookie, get 401/403, and `/__enter` without a valid ticket gets a 4xx. The script exits non-zero on any FAIL. Those tests only show that anonymous requests are refused. Two optional tests read the environment (never the command line, so nothing secret appears in `ps` or in the output):

```bash
# only when you pinned OMNIROUTE_GATE_SECRET in .env (otherwise the app's secret is random and nothing outside can sign): proves the Cookie header reaches the app and the secret matches; a cookie signed for an account that does not exist must get exactly 403
OMNIROUTE_GATE_SECRET=<value from .env> ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn
# proves a signed-in admin is let in and the dashboard answers with Cache-Control: no-store
# (copy the omniroute_gate cookie from the browser's developer tools after clicking the button)
OMNIROUTE_SMOKE_COOKIE=<cookie value> ops/omniroute/smoke.sh https://omniroute.khaitam.ai.vn
```

## Backup

The `omniroute-data` volume (OmniRoute's SQLite database: provider endpoints, keys, settings, and the signing and encryption keys it made itself) and the small `omniroute-secrets` volume (the dashboard password) are **not** yet included in `ops/backup/backup.sh` — that is remaining work. Back them up together: data without the password file leaves the app unable to sign in, and a lost data volume means re-entering every provider endpoint and key by hand.

## What was run, and what was not

Run on 2026-10-23 on a developer Mac with `diegosouzapw/omniroute:3.8.52`, a locally built app image and `caddy:2-alpine`, started with a plain `docker compose up -d` and no OmniRoute value in `.env` or `.env.local`:

- `omniroute-init` wrote the password file; OmniRoute took it (login 200, a wrong password 401); the password is not in `docker inspect`; running the job again kept the file, a password under 16 characters made it exit 1, a longer override replaced it.
- The app container reached OmniRoute and signed in with the file password (the Settings page state `no-providers`, version 3.8.52), also after `docker compose down` and `up` with the volumes kept.
- Through the gate in a browser: the button gave `http://omniroute.localhost:<port>/__enter?…`, the dashboard opened with no second sign-in, anonymous requests got 401, and creating an API key in OmniRoute's own page returned 201. `smoke.sh` with an admitted cookie and `--internal`: 10 passed, 0 failed (the signed-cookie test needs a pinned `OMNIROUTE_GATE_SECRET` and is skipped otherwise). After the app restarted, the old gate cookie got 401.
- Outside Docker: with `host-dev.yml`, the app's configuration found `./.omniroute/secrets`, chose `127.0.0.1:20128` and signed in; with `NODE_ENV=production` and no file it reported not connected.
- Earlier (same date, the Settings panel): a real OmniRoute container with a stand-in upstream: creating, limiting, replacing and deleting the key, the model list, the three-step panel, and a test request through `auto/cheap`. `tests/omniroute/live.test.ts` repeats the client part (opt-in, see its header).

Not run:

- Anything behind Cloudflare Tunnel with the real hostname (the derived address, `Secure` cookies and the `Host` the app sees were run on localhost only).
- The RAM of the whole stack on the 3.7 GiB VPS. OmniRoute used about 340 MiB idle on the Mac (`docker stats`).
- A real provider through OmniRoute: images, tool calls, streaming.
- Whether a provider-side change in a later OmniRoute version moves the password handling: `INITIAL_PASSWORD` is read once, before the first password is saved, and the first-run key generation is OmniRoute's own behaviour in 3.8.52.

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
- "OmniRoute did not accept the sign-in." (502), or the Settings page says the app cannot reach OmniRoute while the container is up: the password in `omniroute-secrets` differs from the one OmniRoute saved (it was changed inside OmniRoute, `omniroute-secrets` was deleted or restored without `omniroute-data`, or `OMNIROUTE_ADMIN_PASSWORD` was changed later), or OmniRoute locked the app's address after failed attempts, or it is not running (`docker compose ps`). Put the old password back, or remove both `omniroute-data` and `omniroute-secrets` (this deletes the providers and keys inside OmniRoute) to start again.
- The Settings page says OmniRoute is not connected to this app: the app found no password file. Check that `omniroute-init` ran (`docker compose logs omniroute-init`) and that `openmaic` was started from this compose file (it mounts `omniroute-secrets` at `/run/omniroute`). It also names any `OMNIROUTE_*` value that is set but unusable (a public URL with a path, a password under 16 characters, a gate secret under 32).
- "The address of this page is unknown; set OMNIROUTE_PUBLIC_URL." when you click **Open OmniRoute**: the browser sent no usable `Origin`; set `OMNIROUTE_PUBLIC_URL` in `.env`.
