#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Layor 1: Initializing System..."

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
cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "   >> Creating Python Virtual Environment..."
    python3 -m venv venv
fi

echo "   >> Installing Python Dependencies..."
if [ -f "requirements.txt" ]; then
    ./venv/bin/pip install -q -r requirements.txt
else
    echo "❌ Error: backend/requirements.txt not found!"
    exit 1
fi

echo "   >> Backend Ready."
cd "$ROOT_DIR"

# 4. Setup Frontend
echo "Layor 3: Compiling Interface Matrices..."
if [ ! -d "node_modules" ]; then
    echo "   >> Installing Node Modules..."
    npm install
fi

# 5. Start Backend in background
echo "Layor 4: Starting Backend Server..."
cd "$ROOT_DIR/backend"
./venv/bin/python app.py &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# 6. Build and Run
echo "Layor 5: Engaging Visual Systems..."

if [ "$1" == "--dev" ]; then
    echo "   >> Starting in DEVELOPMENT MODE..."

    # Start Vite in background
    npm run dev &
    VITE_PID=$!

    # Update cleanup to also kill Vite
    cleanup() {
        echo ""
        echo "Shutting down..."
        kill $BACKEND_PID 2>/dev/null
        kill $VITE_PID 2>/dev/null
        exit 0
    }
    trap cleanup SIGINT SIGTERM

    # Wait for Vite to be ready
    echo "   >> Waiting for Vite server..."
    while ! curl -s http://localhost:5173 > /dev/null 2>&1; do
        sleep 0.5
    done
    echo "   >> Vite ready!"

    # Start Electron
    echo "🚀 LAUNCHING TERMINAL..."
    npx electron .

    # When Electron exits, cleanup
    cleanup
else
    echo "   >> Building Production Assets..."
    npx vite build
    echo "🚀 SYSTEM READY. LAUNCHING TERMINAL."
    npx electron .

    # When Electron exits, kill backend
    kill $BACKEND_PID 2>/dev/null
fi