#!/bin/bash

# Move to the folder where the script is located
cd "$(dirname "$0")"

cleanup() {
    echo "Stopping processes..."
    kill -TERM -$$ 2>/dev/null
}
trap cleanup EXIT

echo "🚀 Starting Cristol..."

# 1. Start Python Backend (Found in root)
export PYTHONDONTWRITEBYTECODE=1
python3 backend/app.py &
BACKEND_PID=$!

# 2. Find the JS binaries (Checks root first, then 'frontend' folder)
if [ -f "./node_modules/.bin/vite" ]; then
    VITE="./node_modules/.bin/vite"
    ELECTRON="./node_modules/.bin/electron"
    ROOT="."
elif [ -f "./frontend/node_modules/.bin/vite" ]; then
    VITE="./frontend/node_modules/.bin/vite"
    ELECTRON="./frontend/node_modules/.bin/electron"
    ROOT="./frontend"
else
    echo "❌ Error: node_modules not found. Please run 'npm install' first."
    exit 1
fi

# 3. Start Vite and Electron in parallel
$VITE $ROOT --clearScreen false &
$ELECTRON $ROOT &

echo "[✓] All systems launching..."

# Wait for the first process to crash or close
wait -n