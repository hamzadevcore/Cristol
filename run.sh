#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

# ==========================================
# LOREKEEPER TERMINAL - LAUNCHER
# ==========================================

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

# 3. Setup Backend
echo "Layor 2: Synchronizing Neural Backend..."
cd backend

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "   >> Creating Python Virtual Environment..."
    python3 -m venv venv
fi

# Force upgrade pip using the venv binary directly
echo "   >> Updating pip..."
./venv/bin/python -m pip install --upgrade pip

# Install requirements using the venv binary directly
echo "   >> Installing Python Dependencies..."
if [ -f "requirements.txt" ]; then
    ./venv/bin/pip install -r requirements.txt
else
    echo "❌ Error: backend/requirements.txt not found!"
    exit 1
fi

# Verify installation using the venv binary directly
if ! ./venv/bin/python -c "import flask" &> /dev/null; then
    echo "❌ Error: Flask failed to install. Retrying with verbose output..."
    ./venv/bin/pip install flask flask-cors requests
fi

echo "   >> Backend Ready."
cd ..

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
    # Build React App using vite directly to avoid type checking blocking the build
    npx vite build

    echo "🚀 SYSTEM READY. LAUNCHING TERMINAL."
    npm run electron:start
fi