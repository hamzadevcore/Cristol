const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

let mainWindow;
let backendProcess;
const BACKEND_PORT = 5000;

function killBackend() {
  if (backendProcess) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${backendProcess.pid} /f /t`, {
          stdio: 'ignore', windowsHide: true, timeout: 4000
        });
      } else {
        process.kill(-backendProcess.pid, 'SIGKILL');
      }
    } catch {}
    backendProcess = null;
  }
  // Sync port cleanup only on EXIT — never on startup
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${BACKEND_PORT} | findstr LISTENING`,
        { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      for (const line of out.trim().split('\n')) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== '0' && /^\d+$/.test(pid)) {
          try { execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore', windowsHide: true }); } catch {}
        }
      }
    } else {
      execSync(`lsof -ti:${BACKEND_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {}
}

function spawnBackend() {
  const isWin = process.platform === 'win32';
  try {
    backendProcess = spawn(isWin ? 'python' : 'python3', ['app.py'], {
      cwd: path.join(__dirname, '..', 'backend'),
      stdio: 'ignore',
      detached: !isWin,
      shell: isWin,
      windowsHide: true
    });
    backendProcess.on('error', (err) => console.error('Backend error:', err));
  } catch (e) {
    console.error('Backend start failed:', e);
  }
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.round(screenW * 0.85),
    height: Math.round(screenH * 0.85),
    minWidth: 900, minHeight: 600,
    center: true, frame: false,
    backgroundColor: '#080808',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state-changed', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state-changed', 'normal'));
  mainWindow.on('close', (e) => { e.preventDefault(); killBackend(); app.exit(0); });
}

ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window-close', () => { killBackend(); app.exit(0); });
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

// ── KEY CHANGE: Window first, backend after ──
app.on('ready', () => {
  createWindow();    // Window appears INSTANTLY
  spawnBackend();    // Non-blocking spawn (no killPort on startup)
});

app.on('window-all-closed', () => { killBackend(); app.exit(0); });
