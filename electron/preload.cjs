// Preload script - runs in renderer context but has access to Node.js
const { contextBridge } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

// You can add more APIs here if needed, for example:
// - File system access
// - Window controls (minimize, maximize, close)
// - Native notifications