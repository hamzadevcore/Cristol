import subprocess
import sys
import os
import signal
import time
from pathlib import Path

# Configuration
FRONTEND_DIR = "frontend"
BACKEND_SCRIPT = Path("backend") / "app.py"
NPM_COMMAND = "npm"
NPM_ARGS = ["run", "electron:dev"]

# Store processes globally to access them in the signal handler
processes = []


def get_creation_flags():
    """Returns flags needed to handle process groups correctly on Windows vs Linux."""
    if sys.platform == "win32":
        # On Windows, create a new process group so we can kill the whole tree
        return subprocess.CREATE_NEW_PROCESS_GROUP
    return 0


def start_frontend():
    print(f"[STARTER] Starting Frontend in '{FRONTEND_DIR}'...")
    # Use shell=False for security, pass args as list
    # On Windows, npm is often a batch file, subprocess handles this well usually.
    # If issues arise on Windows, you might need npm.cmd
    cmd = [NPM_COMMAND] + NPM_ARGS

    proc = subprocess.Popen(
        cmd,
        cwd=FRONTEND_DIR,
        creationflags=get_creation_flags()
    )
    processes.append(proc)
    return proc


def start_backend():
    print(f"[STARTER] Starting Backend '{BACKEND_SCRIPT}'...")
    # Use sys.executable to ensure we use the same Python interpreter running this script
    cmd = [sys.executable, str(BACKEND_SCRIPT)]

    proc = subprocess.Popen(
        cmd,
        creationflags=get_creation_flags()
    )
    processes.append(proc)
    return proc


def terminate_processes():
    """Gracefully terminate all child processes."""
    print("\n[STARTER] Shutting down processes...")

    for proc in processes:
        if proc.poll() is None:  # If process is still running
            try:
                if sys.platform == "win32":
                    # On Windows, send Ctrl+C event to the process group
                    proc.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    # On Linux/Mac, send SIGTERM
                    proc.terminate()
            except Exception as e:
                print(f"[STARTER] Error terminating process: {e}")

    # Wait for processes to exit gracefully (timeout 5 seconds)
    for proc in processes:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print(f"[STARTER] Process {proc.pid} did not close gracefully. Killing...")
            proc.kill()
            proc.wait()

    print("[STARTER] All processes stopped.")


def signal_handler(sig, frame):
    """Handle Ctrl+C"""
    print("\n[STARTER] Interrupt received.")
    terminate_processes()
    sys.exit(0)


def main():
    # Register signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)

    # On Windows, SIGTERM isn't handled the same way, but SIGINT covers Ctrl+C
    if sys.platform == "win32":
        try:
            signal.signal(signal.SIGBREAK, signal_handler)
        except ValueError:
            pass  # SIGBREAK might not be available in all contexts

    try:
        # Start services
        start_frontend()
        start_backend()

        print("[STARTER] Both services running. Press Ctrl+C to stop.")

        # Monitor processes
        while True:
            # Check if any process died unexpectedly
            for proc in processes:
                if proc.poll() is not None:
                    print(f"[STARTER] Process {proc.pid} exited unexpectedly (code {proc.returncode}).")
                    terminate_processes()
                    sys.exit(1)

            # Sleep briefly to avoid high CPU usage in the loop
            time.sleep(1)

    except Exception as e:
        print(f"[STARTER] An error occurred: {e}")
        terminate_processes()
        sys.exit(1)
    finally:
        # Ensure cleanup happens even if an exception occurs
        # (Though signal_handler usually exits, this is a safety net)
        if any(p.poll() is None for p in processes):
            terminate_processes()


if __name__ == "__main__":
    # Check if paths exist before starting
    if not Path(FRONTEND_DIR).is_dir():
        print(f"Error: Directory '{FRONTEND_DIR}' not found.")
        sys.exit(1)

    if not BACKEND_SCRIPT.exists():
        print(f"Error: File '{BACKEND_SCRIPT}' not found.")
        sys.exit(1)

    main()