const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

// Enforce single instance lock (prevents opening multiple dashboard windows)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    show: false, // Prevents white flash before CSS loads
    backgroundColor: '#0f172a',
    title: 'Sentinel Lab Surveillance System',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Remove standard default application menu bar (File, Edit, View...)
  Menu.setApplicationMenu(null);

  // Load dashboard template
  mainWindow.loadFile(path.join(__dirname, 'dashboard.html'));

  // Reveal window smoothly once content is rendered
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Security: Block unauthorized external window popups
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});