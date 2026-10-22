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

In the app: Settings popup (top bar) → language model → choose OmniRoute → save the base URL `http://omniroute:20129/v1` (service name over the Docker network, API port — the dashboard port 20128 is the app's own sign-in target) and an OmniRoute API key.

Create that key in OmniRoute itself: **"Open OmniRoute settings"** in the popup opens `<public-url>/__enter?t=<one-time ticket>`. The app checks the ticket (signed with `OMNIROUTE_GATE_SECRET`), signs in to OmniRoute for you with `OMNIROUTE_ADMIN_PASSWORD`, and answers with OmniRoute's `Set-Cookie` headers plus a redirect — the browser lands on the dashboard already signed in, without the password ever being shown. Then, in OmniRoute's **Dashboard → Endpoints** page, create the API key and paste it back into the app's Settings popup.

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

Every gate test must PASS: anonymous requests — including a garbage `omniroute_gate` cookie — get 401/403, and `/__enter` without a valid ticket gets a 4xx. The script exits non-zero on any FAIL. The garbage-cookie test is also the live check that Caddy's `forward_auth` forwards the browser's `Cookie` header to the app's check route (see **Not verified yet**).

## Backup

The `omniroute-data` volume (OmniRoute's SQLite database: provider endpoints, keys, settings) is **not** yet included in `ops/backup/backup.sh` — that is remaining work. Until it is added, a lost volume means re-entering every provider endpoint and key by hand.

## Not verified yet

Checked against OmniRoute v3.8.52's own Dockerfile, `.env.example` and source, and against Caddy's documentation — but not against a running stack (`docker compose up` was not run on the authoring machine):

- `API_HOST=0.0.0.0`: OmniRoute's own material disagrees on the default (its `.env.example` shows `0.0.0.0`, its `src/lib/apiBridgeServer.ts` defaults to `127.0.0.1`). The explicit value is source-verified as what makes `omniroute:20129` reachable from other containers; it has not been observed in a running container.
- Whether Caddy's `forward_auth` forwards the browser's `Cookie` header to the check route. Its documented expanded form is a `reverse_proxy` clone of the original request, which forwards original headers — the live behavior is exactly what `smoke.sh`'s garbage-cookie test checks.
- The gate passing the app's non-2xx answer (401/403 + short text) back to the browser — documented Caddy behavior (`forward_auth`), not yet observed through this gate.
- End to end: the `/__enter` sign-in, the dashboard behind the gate, and the app's calls to `omniroute:20129`. The app-side routes this depends on (`/api/admin/omniroute/enter` and `/check`) are not in this branch yet; until they land, the gate answers 404 and `smoke.sh` reports FAIL by design.
