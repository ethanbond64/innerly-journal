#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
ENV_FILE="$SCRIPT_DIR/.env"
INNERLY_DIR="$HOME/.innerly"
CONFIG_FILE="$INNERLY_DIR/config.json"

if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "ERROR: $ENV_EXAMPLE not found" >&2
    exit 1
fi

# Generate secrets
SIGNATURE_SECRET="$(python3 -c 'import os, base64; print(base64.b64encode(os.urandom(32)).decode())')"
SECRET_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

# Copy .env.example -> .env, populating the two secret fields
if [ -f "$ENV_FILE" ]; then
    echo "Skipping .env (already exists)"
else
    sed \
        -e "s|<random bytes in base64>|$SIGNATURE_SECRET|" \
        -e "s|<Random string>|$SECRET_KEY|" \
        "$ENV_EXAMPLE" > "$ENV_FILE"
    echo "Wrote $ENV_FILE"
fi

# Create .innerly/ with config.json + subdirectories
mkdir -p "$INNERLY_DIR" "$INNERLY_DIR/static" "$INNERLY_DIR/imports"

if [ -f "$CONFIG_FILE" ]; then
    echo "Skipping $CONFIG_FILE (already exists)"
else
    SERVER_VALUE="$(grep -E '^SERVER_NAME=' "$ENV_FILE" | cut -d= -f2-)"
    cat > "$CONFIG_FILE" <<EOF
{
  "secret": "$SECRET_KEY",
  "server": "$SERVER_VALUE"
}
EOF
    echo "Wrote $CONFIG_FILE"
fi

echo "Setup complete."
