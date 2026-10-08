#!/usr/bin/env bash
# Run on the server: bash deploy.sh
# Asks for the keys (hidden input), stores them in a private .env (chmod 600), starts Filmore in Docker.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  read -rsp "TMDB API key: " tmdb; echo
  read -rsp "Anthropic API key (Enter to skip, demo mode): " ant; echo
  umask 077
  printf 'TMDB_API_KEY=%s\nANTHROPIC_API_KEY=%s\n' "$tmdb" "$ant" > .env
fi
chmod 600 .env
docker compose up -d --build
echo "Filmore is running on port 3000."
