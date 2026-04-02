import { app, BrowserWindow, ipcMain, shell } from 'electron';
import http, { type Server as HttpServer } from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import updater from 'electron-updater';

const { autoUpdater } = updater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_FLOW_TIMEOUT_MS = 3 * 60 * 1000;
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

interface OAuthStartPayload {
  clientId: string;
  callbackUrl: string;
}

interface OAuthStartResult {
  accessToken: string;
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let updateDownloadReadyVersion: string | null = null;
let isUpdateCheckInProgress = false;
let isOAuthFlowInProgress = false;

function normalizeCallbackPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '');
}

const OAUTH_HASH_RELAY_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GroupUs OAuth</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; color: #1f2937; background: #f8fafc;">
    <main style="max-width: 420px; text-align: center; padding: 24px; border-radius: 16px; background: white; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">
      <h1 style="font-size: 18px; margin: 0 0 8px;">Finishing sign in…</h1>
      <p style="margin: 0; font-size: 14px; color: #4b5563;">You can close this tab after GroupUs confirms authentication.</p>
    </main>
    <script>
      (() => {
        if (window.location.hash.length <= 1) {
          return;
        }

        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const query = hashParams.toString();
        window.location.replace(window.location.pathname + (query ? ('?' + query) : ''));
      })();
    </script>
  </body>
</html>`;

const OAUTH_SUCCESS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GroupUs OAuth</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; color: #1f2937; background: #f8fafc;">
    <main style="max-width: 420px; text-align: center; padding: 24px; border-radius: 16px; background: white; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">
      <h1 style="font-size: 18px; margin: 0 0 8px;">Signed in successfully</h1>
      <p style="margin: 0; font-size: 14px; color: #4b5563;">You can close this tab and return to GroupUs.</p>
    </main>
  </body>
</html>`;

const OAUTH_ERROR_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GroupUs OAuth</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; color: #1f2937; background: #fef2f2;">
    <main style="max-width: 420px; text-align: center; padding: 24px; border-radius: 16px; background: white; box-shadow: 0 10px 25px rgba(127, 29, 29, 0.08);">
      <h1 style="font-size: 18px; margin: 0 0 8px; color: #b91c1c;">Sign in failed</h1>
      <p style="margin: 0; font-size: 14px; color: #7f1d1d;">Return to GroupUs and try again.</p>
    </main>
  </body>
</html>`;

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
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('auth:start-oauth', async (_event, payload: OAuthStartPayload): Promise<OAuthStartResult> => {
    if (isOAuthFlowInProgress) {
      throw new Error('An OAuth sign-in flow is already in progress.');
    }

    const clientId = payload?.clientId?.trim();
    const callbackUrlRaw = payload?.callbackUrl?.trim();

    if (!clientId) {
      throw new Error('Missing GroupMe OAuth Client ID.');
    }

    if (!callbackUrlRaw) {
      throw new Error('Missing OAuth callback URL.');
    }

    let callbackUrl: URL;

    try {
      callbackUrl = new URL(callbackUrlRaw);
    } catch {
      throw new Error('OAuth callback URL is invalid.');
    }

    if (callbackUrl.protocol !== 'http:') {
      throw new Error('OAuth callback URL must use http://.');
    }

    const callbackHost = callbackUrl.hostname.toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(callbackHost)) {
      throw new Error('OAuth callback URL must use localhost, 127.0.0.1, or ::1.');
    }

    const callbackPort = Number.parseInt(callbackUrl.port, 10);
    if (!Number.isInteger(callbackPort) || callbackPort <= 0) {
      throw new Error('OAuth callback URL must include a valid port.');
    }

    const callbackPath = normalizeCallbackPath(callbackUrl.pathname);
    let oauthServer: HttpServer | null = null;
    isOAuthFlowInProgress = true;

    try {
      const accessToken = await new Promise<string>((resolve, reject) => {
        let completed = false;
        const timeoutId = setTimeout(() => {
          if (completed) {
            return;
          }

          completed = true;
          reject(new Error('OAuth authorization timed out. Please try again.'));
        }, OAUTH_FLOW_TIMEOUT_MS);

        const completeWithSuccess = (token: string) => {
          if (completed) {
            return;
          }

          completed = true;
          clearTimeout(timeoutId);
          resolve(token);
        };

        const completeWithError = (error: Error) => {
          if (completed) {
            return;
          }

          completed = true;
          clearTimeout(timeoutId);
          reject(error);
        };

        oauthServer = http.createServer((request, response) => {
          const requestUrl = new URL(request.url ?? '/', `http://${callbackUrl.host}`);
          const requestPath = normalizeCallbackPath(requestUrl.pathname);

          if (requestPath !== callbackPath) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found.');
            return;
          }

          const accessTokenFromQuery = requestUrl.searchParams.get('access_token')?.trim();
          if (accessTokenFromQuery) {
            response.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            });
            response.end(OAUTH_SUCCESS_PAGE);
            completeWithSuccess(accessTokenFromQuery);
            return;
          }

          const oauthError = requestUrl.searchParams.get('error')?.trim();
          const oauthErrorDescription = requestUrl.searchParams.get('error_description')?.trim();

          if (oauthError || oauthErrorDescription) {
            response.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            });
            response.end(OAUTH_ERROR_PAGE);

            const errorMessage = oauthErrorDescription
              ? `OAuth authorization failed: ${oauthErrorDescription}`
              : `OAuth authorization failed${oauthError ? ` (${oauthError})` : ''}.`;

            completeWithError(new Error(errorMessage));
            return;
          }

          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          response.end(OAUTH_HASH_RELAY_PAGE);
        });

        const runOAuthFlow = async () => {
          try {
            await new Promise<void>((resolveListen, rejectListen) => {
              oauthServer?.once('error', rejectListen);
              oauthServer?.listen(callbackPort, callbackUrl.hostname, () => {
                oauthServer?.removeListener('error', rejectListen);
                resolveListen();
              });
            });
          } catch (error) {
            const errorCode = (error as NodeJS.ErrnoException)?.code;
            if (errorCode === 'EADDRINUSE') {
              completeWithError(
                new Error(
                  `Callback port ${callbackPort} is already in use. Update your callback URL or close the conflicting app.`,
                ),
              );
              return;
            }

            completeWithError(error instanceof Error ? error : new Error('Failed to start OAuth callback server.'));
            return;
          }

          const authorizationUrl = new URL('https://oauth.groupme.com/oauth/authorize');
          authorizationUrl.searchParams.set('client_id', clientId);

          try {
            await shell.openExternal(authorizationUrl.toString());
          } catch {
            completeWithError(new Error('Unable to open the browser for OAuth sign-in.'));
          }
        };

        void runOAuthFlow();
      });

      return { accessToken };
    } finally {
      isOAuthFlowInProgress = false;

      const serverToClose = oauthServer as HttpServer | null;
      if (serverToClose && serverToClose.listening) {
        await new Promise<void>((resolve) => {
          serverToClose.close(() => resolve());
        });
      }
    }
  });

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
