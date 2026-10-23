#!/bin/sh
# The one-shot job of the compose service `omniroute-init`. It makes the dashboard password that
# OmniRoute and OpenMAIC share, once, so nobody has to invent or paste it. Running it again keeps
# the password that is already there. OMNIROUTE_ADMIN_PASSWORD in .env overrides it.
set -eu

file=/secrets/admin_password

if [ -n "${ADMIN_PASSWORD:-}" ]; then
  if [ "${#ADMIN_PASSWORD}" -lt 16 ]; then
    echo "omniroute-init: OMNIROUTE_ADMIN_PASSWORD must be at least 16 characters" >&2
    exit 1
  fi
  password=$ADMIN_PASSWORD
elif [ -s "$file" ]; then
  password=$(cat "$file")
else
  password=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  echo "omniroute-init: made a new dashboard password"
fi

# Written beside the file and moved over it: the old one is read-only, even for root.
printf '%s' "$password" > "$file.new"
chmod 0444 "$file.new"
mv -f "$file.new" "$file"
