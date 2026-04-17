#!/bin/bash
# Run the travel-concierge example app.
# You can either export API keys in the shell, put them in a .env file,
# or — easier — just start the server and set your key from the UI's
# Settings panel. The server boots without any key.

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "✅ Loaded environment variables from .env"
fi

cd "$(dirname "$0")/.."
echo "✅ Starting Travel Concierge demo…"
npx ts-node test/example-app/main.ts
