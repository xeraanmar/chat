#!/bin/sh

echo "🚀 Starting Telegram Ultimate Clone (V29 Safe Mode)..."

# Start the server directly
# We do NOT run migrations here anymore. The server handles it internally.
node dist-server/index.js
