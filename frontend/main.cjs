// main.cjs
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let backendProcess = null;

function startBackend() {
  // 1. Default to global python
  let pythonExec = process.platform === 'win32' ? 'python' : 'python3';

  // 2. Automatically detect virtual environments (venv or .venv)
  const venvPaths =[
    path.join(__dirname, 'venv', 'Scripts', 'python.exe'),     // Windows venv
    path.join(__dirname, 'venv', 'bin', 'python'),             // Mac/Linux venv
    path.join(__dirname, '.venv', 'Scripts', 'python.exe'),    // Windows .venv
    path.join(__dirname, '.venv', 'bin', 'python')             // Mac/Linux .venv
  ];

  for (const vPath of venvPaths) {
    if (fs.existsSync(vPath)) {
      pythonExec = vPath;
      break;
    }
  }

  console.log(`\n[Electron] Starting Python backend using: ${pythonExec}\n`);

  backendProcess = spawn(pythonExec, ['app.py'], {
    cwd: __dirname,
    env: {
      ...process.env,
      WERKZEUG_RUN_MAIN: 'true' // Bypasses Flask's double-process reloader
    }
  });

  // 3. Explicitly capture and print logs so we can see if it crashes
  backendProcess.stdout.on('data', (data) => {
    console.log(`[Flask]: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Flask Log/Error]: ${data.toString().trim()}`);
  });

  backendProcess.on('error', (err) => {
    console.error('[Electron] Failed to start Python backend:', err.message);
  });

  backendProcess.on('close', (code) => {
    console.log(`[Electron] Python backend exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Safely kill the Python process when Electron is closed
app.on('will-quit', () => {
  if (backendProcess) {
    console.log('[Electron] Shutting down Python backend...');
    backendProcess.kill();
  }
});