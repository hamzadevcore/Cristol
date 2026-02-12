#!/usr/bin/env python3
"""
CRISTOL ZERO-CONFIG LAUNCHER
---------------------------
1. Auto-elevates to Admin/Sudo (to bind Port 80 & fix DNS).
2. Auto-patches hosts file for 'cristol.com'.
3. Auto-creates isolated Python environment (bypassing Arch restrictions).
4. Auto-installs dependencies.
5. Auto-builds Frontend.
6. Runs everything.
"""

import os
import sys
import subprocess
import threading
import time
import socket
import platform
import shutil
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.request
import urllib.error

# --- CONFIGURATION ---
DOMAIN = "cristol.com"
PORT = 80  # Standard HTTP port
INTERNAL_PORT = 5000  # Flask Backend
BIND_HOST = "0.0.0.0"  # Open to network

# --- PATHS ---
RP_ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(RP_ROOT, 'backend')
FRONTEND_DIR = os.path.join(RP_ROOT, 'frontend')
DIST_DIR = os.path.join(FRONTEND_DIR, 'dist')
VENV_DIR = os.path.join(RP_ROOT, '.venv')

# Detect OS
IS_WIN = os.name == 'nt'
HOSTS_FILE = r"C:\Windows\System32\drivers\etc\hosts" if IS_WIN else "/etc/hosts"

# Venv Executables
if IS_WIN:
    XY_PYTHON = os.path.join(VENV_DIR, 'Scripts', 'python.exe')
    XY_PIP = os.path.join(VENV_DIR, 'Scripts', 'pip.exe')
else:
    XY_PYTHON = os.path.join(VENV_DIR, 'bin', 'python')
    XY_PIP = os.path.join(VENV_DIR, 'bin', 'pip')


# --- SYSTEM UTILS ---

def is_admin():
    try:
        if IS_WIN:
            import ctypes
            return ctypes.windll.shell32.IsUserAnAdmin()
        else:
            return os.geteuid() == 0
    except:
        return False


def elevate():
    """Re-launches the script with admin privileges."""
    print("🔒 Requesting Admin privileges for Port 80 & DNS setup...")
    if IS_WIN:
        import ctypes
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, __file__, None, 1)
        sys.exit()
    else:
        # Re-run with sudo, preserving environment
        os.execvp('sudo', ['sudo', 'python3'] + sys.argv)


def setup_dns():
    """Adds cristol.com to hosts file if missing."""
    try:
        with open(HOSTS_FILE, 'r') as f:
            content = f.read()

        if DOMAIN not in content:
            print(f"wb [DNS] Mapping {DOMAIN} to localhost...")
            entry = f"\n127.0.0.1       {DOMAIN}\n"
            with open(HOSTS_FILE, 'a') as f:
                f.write(entry)
            print("✅ [DNS] Domain mapped successfully.")
    except Exception as e:
        print(f"⚠️ [DNS] Failed to auto-configure hosts file: {e}")


def setup_environment():
    """Creates isolated Python environment."""
    if not os.path.exists(VENV_DIR):
        print("📦 [vn] Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
        # Install deps immediately after creation
        print("📦 [DEPS] Installing Flask & friends...")
        subprocess.run([XY_PIP, "install", "flask", "flask-cors", "python-dotenv", "requests"], check=True)


def check_dependencies():
    """Ensures backend deps are installed in venv."""
    try:
        subprocess.run([XY_PYTHON, "-c", "import flask"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       check=True)
    except:
        print("📦 [FIX] Repairing missing dependencies...")
        subprocess.run([XY_PIP, "install", "flask", "flask-cors", "python-dotenv", "requests"], check=True)


def build_frontend():
    """Builds frontend if missing."""
    if not os.path.exists(DIST_DIR):
        print("fq [UI] Building Frontend...")
        if not os.path.exists(os.path.join(FRONTEND_DIR, 'node_modules')):
            print("   Installing npm packages...")
            subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, shell=IS_WIN, check=True)

        print("   Compiling assets...")
        subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, shell=IS_WIN, check=True)


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
        s.close()
    except:
        IP = '127.0.0.1'
    return IP


# --- PROXY SERVER ---

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class UnifiedHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def log_message(self, format, *args):
        # Silence successful static file logs
        if int(args[1]) >= 400 or self.path.startswith(("/chat", "/shows")):
            sys.stderr.write("%s - - [%s] %s\n" %
                             (self.address_string(),
                              self.log_date_time_string(),
                              format % args))

    def proxy_request(self):
        url = f"http://127.0.0.1:{INTERNAL_PORT}{self.path}"
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length > 0 else None

            req = urllib.request.Request(url, data=body, method=self.command)
            for k, v in self.headers.items():
                if k.lower() != 'host':
                    req.add_header(k, v)

            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ['connection', 'transfer-encoding']:
                        self.send_header(k, v)
                self.end_headers()

                while True:
                    chunk = resp.read(4096)
                    if not chunk: break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except Exception as e:
            pass  # Client disconnected or backend error

    def do_GET(self):
        if self.path.startswith(("/chat", "/shows", "/instances", "/health")):
            self.proxy_request()
        else:
            path = self.translate_path(self.path)
            if not os.path.exists(path) or os.path.isdir(path):
                self.path = '/index.html'
            super().do_GET()

    def do_POST(self):
        self.proxy_request()

    def do_PUT(self):
        self.proxy_request()

    def do_DELETE(self):
        self.proxy_request()

    def do_OPTIONS(self):
        self.proxy_request()


# --- MAIN RUNNER ---

def run_flask():
    env = os.environ.copy()
    env['FLASK_DEBUG'] = '0'
    try:
        # Use Popen to allow us to kill it later if needed,
        # though daemon thread usually handles it.
        subprocess.run([XY_PYTHON, "app.py"], cwd=BACKEND_DIR, env=env, check=True)
    except:
        pass


if __name__ == "__main__":
    # 1. Elevate if needed (For Port 80 & Hosts file)
    if not is_admin():
        elevate()

    print("\n░▒▓ CRISTOL AUTO-LAUNCHER ▓▒░")

    try:
        # 2. Setup Venv (Safe from Arch restrictions)
        setup_environment()
        check_dependencies()

        # 3. Setup DNS (cristol.com)
        setup_dns()

        # 4. Build Frontend
        build_frontend()

        # 5. Start Backend
        print("🚀 Starting Backend Engine...")
        t = threading.Thread(target=run_flask, daemon=True)
        t.start()
        time.sleep(2)  # Warmup

        # 6. Start Web Server
        local_ip = get_local_ip()
        print("\n" + "═" * 50)
        print(f" ✅ SYSTEM ONLINE")
        print(f" 🏠 Local:    http://{DOMAIN}")
        print(f" 🌐 Network:  http://{local_ip}")
        print("═" * 50 + "\n")

        server = ThreadedHTTPServer((BIND_HOST, PORT), UnifiedHandler)
        server.serve_forever()

    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        input("Press Enter to exit...")  # Keep window open on Windows error