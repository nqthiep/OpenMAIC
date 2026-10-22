# khaitam.ai.vn backup

Written every 6 hours by `ops/backup/backup.sh` on the VPS. Nothing here is the live site.

| Path | What | Encrypted |
|---|---|---|
| `db/openmaic.dump.age` | `pg_dump -Fc` of the `openmaic` database (accounts, courses, memberships, asset bytes) | yes |
| `data/app-data.tar.gz.age` | the `/app/data` volume (classrooms, jobs, uploads) | yes |
| `secrets/env-and-config.tar.gz.age` | `.env`, `.env.local`, `docker-compose.override.yml` | yes |
| `source/` | the application source on the server (no `node_modules`, `.next`, `.git`, env files) | no |
| `MANIFEST.txt` | time, app commit, sha256 of the encrypted files | no |

Encrypted files are `age` files. The private key is NOT on the VPS and NOT in this repo. Without it
the three encrypted items cannot be read, so keep it somewhere that survives losing your laptop.

## Restore (new Ubuntu VPS with Docker)

```bash
git clone git@github.com:nqthiep/khaitam.ai.vn.git && cd khaitam.ai.vn
KEY=~/openmaic-backup-key.txt                       # the age private key

# 1. source and config
cp -r source ~/OpenMAIC && cd ~/OpenMAIC
age -d -i $KEY ../khaitam.ai.vn/secrets/env-and-config.tar.gz.age | tar -xz   # .env, .env.local, override

# 2. database (start only postgres, then load the dump)
docker compose --profile server-persistence up -d postgres
age -d -i $KEY ../khaitam.ai.vn/db/openmaic.dump.age \
  | docker compose --profile server-persistence exec -T postgres pg_restore -U openmaic -d openmaic --clean --if-exists

# 3. app data volume (start the app once so the volume exists, then fill it)
docker compose --profile server-persistence up -d --build openmaic
age -d -i $KEY ../khaitam.ai.vn/data/app-data.tar.gz.age \
  | docker compose exec -T -u root openmaic tar -C /app/data -xzf -
docker compose exec -T -u root openmaic chown -R 1001:65533 /app/data
docker compose --profile server-persistence up -d --force-recreate openmaic
```

The Cloudflare Tunnel token is not backed up. Create it again in the Cloudflare dashboard.
