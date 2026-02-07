const { app, BrowserWindow, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// Check if we should use dev server or built files
const distPath = path.join(__dirname, '../dist/index.html');
const isDev = process.env.NODE_ENV === 'development' ||
              process.argv.includes('--dev') ||
              !fs.existsSync(distPath);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#000000',
    autoHideMenuBar: true, // Hides it on Windows/some Linux DEs
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  // 1. This is the specific fix for Linux to remove the top bar
  mainWindow.setMenu(null);

  if (isDev) {
    console.log('Running in DEVELOPMENT mode - loading from localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Running in PRODUCTION mode - loading from dist/index.html');
    mainWindow.loadFile(distPath);
  }

  // Allow F12 to open DevTools in Production (since we removed the menu)
  globalShortcut.register('F12', () => {
    mainWindow.webContents.toggleDevTools();
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow.webContents.toggleDevTools();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(createWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});