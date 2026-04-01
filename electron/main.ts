import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import updater from 'electron-updater';

const { autoUpdater } = updater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const shouldOpenDevTools =
  process.env.ELECTRON_OPEN_DEVTOOLS === '1' || process.env.ELECTRON_OPEN_DEVTOOLS === 'true';

interface UpdateStatusPayload {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  message?: string;
  progress?: number;
  version?: string;
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let updateDownloadReadyVersion: string | null = null;
let isUpdateCheckInProgress = false;

function sendUpdateStatus(payload: UpdateStatusPayload) {
  for (const windowInstance of BrowserWindow.getAllWindows()) {
    windowInstance.webContents.send('updates:status', payload);
  }
}

function initializeAutoUpdates() {
  if (!app.isPackaged) {
    sendUpdateStatus({
      state: 'idle',
      message: 'Auto-updates are enabled in packaged builds.',
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    isUpdateCheckInProgress = true;
    sendUpdateStatus({ state: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    updateDownloadReadyVersion = null;
    sendUpdateStatus({
      state: 'available',
      message: `Update available: v${info.version}. Downloading now...`,
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    isUpdateCheckInProgress = false;
    sendUpdateStatus({ state: 'not-available', message: 'You are on the latest version.' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      state: 'downloading',
      message: 'Downloading update...',
      progress: progress.percent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    isUpdateCheckInProgress = false;
    updateDownloadReadyVersion = info.version;
    sendUpdateStatus({
      state: 'downloaded',
      message: `Update v${info.version} ready to install.`,
      version: info.version,
    });
  });

  autoUpdater.on('error', (error) => {
    isUpdateCheckInProgress = false;
    sendUpdateStatus({
      state: 'error',
      message: error.message,
    });
  });

  autoUpdater.checkForUpdates().catch((error) => {
    sendUpdateStatus({ state: 'error', message: error.message });
  });

  updateCheckInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      sendUpdateStatus({ state: 'error', message: error.message });
    });
  }, WEEK_IN_MS);
}

function loadAppUrl(windowInstance: BrowserWindow, view: 'main' | 'settings') {
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL ??
    process.env.ELECTRON_RENDERER_URL ??
    (!app.isPackaged ? 'http://localhost:5173' : undefined);

  if (devServerUrl) {
    const url =
      view === 'settings'
        ? `${devServerUrl}?view=settings`
        : devServerUrl;
    windowInstance.loadURL(url);
    return;
  }

  if (view === 'settings') {
    windowInstance.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { view: 'settings' },
    });
    return;
  }

  windowInstance.loadFile(path.join(__dirname, '../dist/index.html'));
}

function configureWindowOpenHandler(windowInstance: BrowserWindow) {
  windowInstance.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);
      const isSettingsRequest = parsedUrl.searchParams.get('view') === 'settings';

      if (isSettingsRequest) {
        createSettingsWindow();
        return { action: 'deny' };
      }
    } catch {
      // Keep default handling below for malformed URLs.
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f5f5f7',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadAppUrl(mainWindow, 'main');
  configureWindowOpenHandler(mainWindow);

  if (!app.isPackaged && shouldOpenDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f5f5f7',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    resizable: true,
    parent: mainWindow ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadAppUrl(settingsWindow, 'settings');
  configureWindowOpenHandler(settingsWindow);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      sendUpdateStatus({
        state: 'idle',
        message: 'Update checks are available in packaged builds.',
      });
      return;
    }

    if (isUpdateCheckInProgress) {
      sendUpdateStatus({ state: 'checking', message: 'Update check already in progress...' });
      return;
    }

    isUpdateCheckInProgress = true;
    sendUpdateStatus({ state: 'checking', message: 'Checking for updates...' });

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      isUpdateCheckInProgress = false;
      throw error;
    }
  });

  ipcMain.handle('updates:install', async () => {
    if (!app.isPackaged) {
      sendUpdateStatus({
        state: 'idle',
        message: 'Install updates from packaged builds.',
      });
      return;
    }

    if (!updateDownloadReadyVersion) {
      sendUpdateStatus({
        state: 'error',
        message: 'No downloaded update is ready yet. Check for updates and wait for the download to finish.',
      });
      return;
    }

    sendUpdateStatus({
      state: 'installing',
      message: `Installing update v${updateDownloadReadyVersion} and restarting...`,
      version: updateDownloadReadyVersion,
    });

    setImmediate(() => {
      autoUpdater.quitAndInstall();
    });
  });

  ipcMain.handle('updates:open-latest-release', async () => {
    await shell.openExternal('https://github.com/kpulik/GroupUs/releases/latest');
  });

  ipcMain.handle('window:open-settings', () => {
    createSettingsWindow();
  });

  createMainWindow();
  initializeAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
