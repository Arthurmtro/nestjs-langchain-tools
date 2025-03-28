#!/bin/bash

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
  # Try to load from .env file
  if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "✅ Loaded environment variables from .env file"
  else
    echo "❌ ERROR: OPENAI_API_KEY is not set and .env file not found"
    exit 1
  fi
fi

# Check again to make sure it was loaded
if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ ERROR: OPENAI_API_KEY environment variable is not set!"
  echo "Please set it in your .env file or export it in your terminal."
  exit 1
fi

echo "✅ API key loaded, starting example app..."

# Run the example app
cd "$(dirname "$0")/.."
npx ts-node test/example-app/main.ts