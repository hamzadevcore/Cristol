#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

# ==========================================
# LOREKEEPER TERMINAL - LAUNCHER
# ==========================================

# Resolve script root (portable, symlink-safe)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Layor 1: Initializing System..."

# Delete legacy config artifacts to prevent build confusion
rm -f vite.config.js vite.config.js.map

# 1. Check for Node.js
if ! command -v npm &> /dev/null; then
    echo "❌ Error: Node.js/npm is not installed."
    exit 1
fi

# 2. Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed."
    exit 1
fi

if [ ! -x "venv/bin/python" ]; then
    echo "   >> Broken venv detected. Rebuilding..."
    rm -rf venv
    python3 -m venv .venv
fi


# 3. Setup Backend
echo "Layor 2: Synchronizing Neural Backend..."
cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "   >> Creating Python Virtual Environment..."
    python3 -m venv venv
fi

echo "   >> Updating pip..."
./venv/bin/python -m pip install --upgrade pip

echo "   >> Installing Python Dependencies..."
if [ -f "requirements.txt" ]; then
    ./venv/bin/pip install -r requirements.txt
else
    echo "❌ Error: backend/requirements.txt not found!"
    exit 1
fi

if ! ./venv/bin/python -c "import flask" &> /dev/null; then
    echo "❌ Flask missing. Repairing..."
    ./venv/bin/pip install flask flask-cors requests
fi

echo "   >> Backend Ready."

# Back to root explicitly (no vibes-based cd ..)
cd "$ROOT_DIR"

# 4. Setup Frontend
echo "Layor 3: Compiling Interface Matrices..."
if [ ! -d "node_modules" ]; then
    echo "   >> Installing Node Modules..."
    npm install
fi

# 5. Build and Run
echo "Layor 4: Engaging Visual Systems..."

if [ "$1" == "--dev" ]; then
    echo "   >> Starting in DEVELOPMENT MODE..."
    npm run electron:dev
else
    echo "   >> Building Production Assets..."
    npx vite build
    echo "🚀 SYSTEM READY. LAUNCHING TERMINAL."
    npm run electron:start
fi

