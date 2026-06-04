#!/bin/bash
set -e

echo "🔒 Starting mongo-schema-fetch Security and PII Leak Tests..."

# Determine script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. Initialize Python virtual environments if not present
if [ ! -d ".venv-synth" ]; then
  echo "📦 Creating .venv-synth..."
  python3 -m venv .venv-synth
  ./.venv-synth/bin/pip install --upgrade pip
  ./.venv-synth/bin/pip install mongo-synth
fi

if [ ! -d ".venv-scan" ]; then
  echo "📦 Creating .venv-scan..."
  python3 -m venv .venv-scan
  ./.venv-scan/bin/pip install --upgrade pip
  ./.venv-scan/bin/pip install py-secret-scan
fi

# 2. Ensure test rules are set up
if [ ! -f "test/security/data/rules.json" ]; then
  echo "⚠️ test/security/data/rules.json not found, setting up..."
  mkdir -p test/security/data
  cat <<EOF > test/security/data/rules.json
[
  {
    "id": "email",
    "risk": "medium",
    "keywords": ["email", "mail"],
    "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}"
  },
  {
    "id": "api_key",
    "risk": "critical",
    "keywords": ["key", "api", "token"],
    "regex": "key_live_[a-f0-9]{32,48}"
  },
  {
    "id": "password",
    "risk": "high",
    "keywords": ["password", "pwd", "pass"],
    "regex": "(?i)\\\"(?:password|pwd|pass)\\\"\\\\s*:\\\\s*\\\"[^\\\"]+\\\""
  },
  {
    "id": "ssn",
    "risk": "high",
    "keywords": ["ssn", "social"],
    "regex": "\\\\d{3}-\\\\d{2}-\\\\d{4}"
  },
  {
    "id": "credit_card",
    "risk": "high",
    "keywords": ["card", "credit"],
    "regex": "\\\"[0-9]{12,19}\\\""
  },
  {
    "id": "ip_address",
    "risk": "medium",
    "keywords": ["ip", "host", "address"],
    "regex": "\\\\b\\\\d{1,3}\\\\.\\\\d{1,3}\\\\.\\\\d{1,3}\\\\.\\\\d{1,3}\\\\b"
  }
]
EOF
fi

# 3. Build Node.js CLI tool
echo "🏗️ Building project..."
npm run build

# 4. Run Cucumber Security Features
echo "🏃 Running Security Acceptance Scenarios..."
npx cucumber-js --import ./tsx-register.js --import 'features/step_definitions/**/*.ts' --tags "@security"

echo "✅ All security and PII leak tests passed successfully!"
