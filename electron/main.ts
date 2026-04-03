import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  session,
  shell,
  type MessageBoxOptions,
  type WebContents,
} from 'electron';
import { execFileSync } from 'node:child_process';
import http, { type Server as HttpServer } from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import updater from 'electron-updater';

const { autoUpdater } = updater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_FLOW_TIMEOUT_MS = 3 * 60 * 1000;
const MEDIA_SEARCH_RESULTS_LIMIT = 24;
const LOCATION_SEARCH_RESULTS_LIMIT = 8;
const TENOR_PUBLIC_API_KEY = 'LIVDSRZULELA';
const isMac = process.platform === 'darwin';
const UNSIGNED_MAC_UPDATER_MESSAGE =
  'Automatic install updates are unavailable for this macOS build. Use Get latest from GitHub to install updates manually.';
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

type NotificationPermissionState = 'default' | 'granted' | 'denied';
type LocationPermissionState = 'prompt' | 'granted' | 'denied';

interface SystemNotificationPayload {
  title: string;
  body: string;
  conversationId?: string;
  silent?: boolean;
}

type MediaSearchKind = 'gifs' | 'images' | 'videos';

interface MediaSearchPayload {
  query: string;
  kind: MediaSearchKind;
}

interface MediaSearchResultPayload {
  id: string;
  mediaType: 'gif' | 'image' | 'video';
  title: string;
  mediaUrl: string;
  previewUrl: string;
  source: 'tenor' | 'wikimedia';
}

interface LocationSearchPayload {
  query: string;
}

interface LocationSearchResultPayload {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

interface CurrentLocationLookupResultPayload {
  name: string;
  lat: string;
  lng: string;
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let updateDownloadReadyVersion: string | null = null;
let lastKnownAvailableVersion: string | null = null;
let isUpdateCheckInProgress = false;
let isMacBuildCodeSignatureValid: boolean | null = null;
let isOAuthFlowInProgress = false;
const geolocationPermissionByOrigin = new Map<string, LocationPermissionState>();

function resolveAppBundlePath(): string | null {
  const executablePath = app.getPath('exe');
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = executablePath.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return executablePath.slice(0, markerIndex);
}

function checkMacCodeSignatureValidity(): boolean {
  const appBundlePath = resolveAppBundlePath();
  if (!appBundlePath) {
    return false;
  }

  try {
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundlePath], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function canUseMacAutoInstallUpdates(): boolean {
  if (!isMac || !app.isPackaged) {
    return true;
  }

  if (isMacBuildCodeSignatureValid === null) {
    isMacBuildCodeSignatureValid = checkMacCodeSignatureValidity();
  }

  return isMacBuildCodeSignatureValid;
}

function toSafeUpdaterErrorMessage(error: unknown): string {
  const defaultMessage = 'Failed to check for updates.';
  const rawMessage =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? defaultMessage)
      : defaultMessage;

  if (
    isMac &&
    /code signature|ShipIt|did not pass validation/i.test(rawMessage)
  ) {
    return UNSIGNED_MAC_UPDATER_MESSAGE;
  }

  return rawMessage;
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

function notifyNotificationClick(conversationId?: string) {
  for (const windowInstance of BrowserWindow.getAllWindows()) {
    windowInstance.webContents.send('notifications:click', { conversationId: conversationId ?? null });
  }
}

function showSystemNotification(payload: SystemNotificationPayload): boolean {
  if (!Notification.isSupported()) {
    return false;
  }

  try {
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: payload.silent ?? false,
    });

    notification.on('click', () => {
      focusMainWindow();
      notifyNotificationClick(payload.conversationId);
    });

    notification.show();
    return true;
  } catch (error) {
    console.error('Failed to display system notification:', error);
    return false;
  }
}

function normalizeCallbackPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '');
}

function isTrustedRendererUrl(urlValue: string): boolean {
  if (!urlValue) {
    return false;
  }

  if (urlValue.startsWith('file://')) {
    return true;
  }

  try {
    const parsedUrl = new URL(urlValue);
    if (
      parsedUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)
    ) {
      return true;
    }

    const configuredRendererUrl = process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL;
    if (configuredRendererUrl) {
      try {
        return parsedUrl.origin === new URL(configuredRendererUrl).origin;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function normalizePermissionOrigin(originOrUrl: string | null | undefined): string | null {
  if (!originOrUrl) {
    return null;
  }

  const trimmedOriginOrUrl = originOrUrl.trim();
  if (!trimmedOriginOrUrl || trimmedOriginOrUrl === 'null') {
    return null;
  }

  if (trimmedOriginOrUrl.startsWith('file://')) {
    return 'file://';
  }

  try {
    const parsedUrl = new URL(trimmedOriginOrUrl);
    if (parsedUrl.protocol === 'file:') {
      return 'file://';
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function resolvePermissionOrigin(
  webContents: WebContents | null | undefined,
  requestingOrigin?: string,
): string | null {
  const requestOrigin = normalizePermissionOrigin(requestingOrigin);
  if (requestOrigin) {
    return requestOrigin;
  }

  return normalizePermissionOrigin(webContents?.getURL());
}

function isTrustedPermissionRequest(
  webContents: WebContents | null | undefined,
  requestingOrigin?: string,
): boolean {
  const trustedByWebContents = webContents ? isTrustedRendererUrl(webContents.getURL()) : false;
  const trustedByOrigin = requestingOrigin ? isTrustedRendererUrl(requestingOrigin) : false;
  return trustedByWebContents || trustedByOrigin;
}

function getLocationPermissionStateForOrigin(permissionOrigin: string | null): LocationPermissionState {
  if (!permissionOrigin) {
    return 'prompt';
  }

  return geolocationPermissionByOrigin.get(permissionOrigin) ?? 'prompt';
}

async function promptForGeolocationPermission(
  webContents: WebContents,
  permissionOrigin: string | null,
): Promise<boolean> {
  const ownerWindow = BrowserWindow.fromWebContents(webContents) ?? mainWindow ?? undefined;
  const permissionScope = permissionOrigin ?? normalizePermissionOrigin(webContents.getURL()) ?? 'this app';

  const promptOptions: MessageBoxOptions = {
    type: 'question',
    title: 'Allow location access?',
    message: 'GroupUs can use your precise location when you choose Current location in the composer.',
    detail:
      `Permission scope: ${permissionScope}\n\n` +
      'If you do not allow this, you can still share a place manually or use approximate lookup.',
    buttons: ['Allow location', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };

  const response = ownerWindow
    ? await dialog.showMessageBox(ownerWindow, promptOptions)
    : await dialog.showMessageBox(promptOptions);

  return response.response === 0;
}

function normalizeExternalUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const normalizedWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;

  try {
    return new URL(normalizedWithProtocol).toString();
  } catch {
    return null;
  }
}

function getPreferredMediaUrl(
  mediaFormats: Record<string, { url?: string }> | undefined,
  preferredKeys: string[],
): string | null {
  if (!mediaFormats) {
    return null;
  }

  for (const key of preferredKeys) {
    const candidateUrl = mediaFormats[key]?.url;
    if (!candidateUrl) {
      continue;
    }

    const normalizedUrl = normalizeExternalUrl(candidateUrl);
    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  return null;
}

async function searchTenorGifsLegacy(query: string): Promise<MediaSearchResultPayload[]> {
  const params = new URLSearchParams({
    key: TENOR_PUBLIC_API_KEY,
    q: query,
    limit: String(MEDIA_SEARCH_RESULTS_LIMIT),
    media_filter: 'minimal',
  });

  const response = await fetch(`https://g.tenor.com/v1/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Tenor legacy request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      content_description?: string;
      media?: Array<Record<string, { url?: string }>>;
    }>;
  };

  const results: MediaSearchResultPayload[] = [];

  for (const result of data.results ?? []) {
    const firstMediaVariant = result.media?.[0];
    const mediaUrl = getPreferredMediaUrl(firstMediaVariant, ['gif', 'mediumgif', 'tinygif', 'mp4']);
    const previewUrl = getPreferredMediaUrl(firstMediaVariant, ['tinygif', 'gif', 'nanogif', 'mp4']);
    if (!mediaUrl || !previewUrl) {
      continue;
    }

    results.push({
      id: result.id ?? `${Date.now()}-${results.length}`,
      mediaType: 'gif',
      title: result.content_description?.trim() || 'GIF',
      mediaUrl,
      previewUrl,
      source: 'tenor',
    });
  }

  return results;
}

async function searchTenorGifs(query: string): Promise<MediaSearchResultPayload[]> {
  const params = new URLSearchParams({
    key: TENOR_PUBLIC_API_KEY,
    q: query,
    limit: String(MEDIA_SEARCH_RESULTS_LIMIT),
    media_filter: 'gif,tinygif,mediumgif,mp4',
    client_key: 'groupus-desktop',
  });

  const response = await fetch(`https://tenor.googleapis.com/v2/search?${params.toString()}`);
  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      return searchTenorGifsLegacy(query);
    }

    throw new Error(`Tenor request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      content_description?: string;
      media_formats?: Record<string, { url?: string }>;
    }>;
  };

  const results: MediaSearchResultPayload[] = [];

  for (const result of data.results ?? []) {
    const mediaUrl = getPreferredMediaUrl(result.media_formats, ['gif', 'mediumgif', 'tinygif', 'mp4']);
    const previewUrl = getPreferredMediaUrl(result.media_formats, ['tinygif', 'gif', 'nanogif', 'mp4']);
    if (!mediaUrl || !previewUrl) {
      continue;
    }

    results.push({
      id: result.id ?? `${Date.now()}-${results.length}`,
      mediaType: 'gif',
      title: result.content_description?.trim() || 'GIF',
      mediaUrl,
      previewUrl,
      source: 'tenor',
    });
  }

  return results;
}

async function searchWikimediaMedia(
  query: string,
  kind: Extract<MediaSearchKind, 'images' | 'videos'>,
): Promise<MediaSearchResultPayload[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(MEDIA_SEARCH_RESULTS_LIMIT * 2),
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime',
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {
      'User-Agent': 'GroupUsDesktop/1.0 (+https://github.com/kpulik/GroupUs)',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikimedia request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid?: number;
          title?: string;
          imageinfo?: Array<{
            url?: string;
            mime?: string;
          }>;
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages ?? {});
  const results: MediaSearchResultPayload[] = [];

  for (const page of pages) {
    const mediaUrlRaw = page.imageinfo?.[0]?.url;
    const mediaMime = page.imageinfo?.[0]?.mime?.toLowerCase() ?? '';
    const mediaUrl = mediaUrlRaw ? normalizeExternalUrl(mediaUrlRaw) : null;
    if (!mediaUrl) {
      continue;
    }

    if (kind === 'images' && !mediaMime.startsWith('image/')) {
      continue;
    }

    if (kind === 'videos' && !mediaMime.startsWith('video/')) {
      continue;
    }

    results.push({
      id: `${page.pageid ?? page.title ?? mediaUrl}-${results.length}`,
      mediaType: kind === 'videos' ? 'video' : 'image',
      title: (page.title ?? 'Untitled').replace(/^File:/i, '').replace(/_/g, ' '),
      mediaUrl,
      previewUrl: mediaUrl,
      source: 'wikimedia',
    });

    if (results.length >= MEDIA_SEARCH_RESULTS_LIMIT) {
      break;
    }
  }

  return results;
}

async function searchLocationPlaces(query: string): Promise<LocationSearchResultPayload[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(LOCATION_SEARCH_RESULTS_LIMIT),
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'GroupUsDesktop/1.0 (+https://github.com/kpulik/GroupUs)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Location search request failed (${response.status})`);
  }

  const data = (await response.json()) as Array<{
    place_id?: number | string;
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;

  const results: LocationSearchResultPayload[] = [];

  for (const result of data ?? []) {
    if (!result.display_name || !result.lat || !result.lon) {
      continue;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    results.push({
      id: String(result.place_id ?? `${result.display_name}-${results.length}`),
      name: result.display_name,
      lat: latitude.toFixed(6),
      lng: longitude.toFixed(6),
    });
  }

  return results;
}

async function lookupApproximateCurrentLocation(): Promise<CurrentLocationLookupResultPayload | null> {
  const requestHeaders = {
    'User-Agent': 'GroupUsDesktop/1.0 (+https://github.com/kpulik/GroupUs)',
    Accept: 'application/json',
  };

  const buildApproximateLocation = (
    latitudeRaw: number | string | undefined,
    longitudeRaw: number | string | undefined,
    cityRaw: string | undefined,
    regionRaw: string | undefined,
    countryRaw: string | undefined,
  ): CurrentLocationLookupResultPayload | null => {
    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const nameParts = [cityRaw, regionRaw, countryRaw]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter((part) => part.length > 0);

    return {
      name:
        nameParts.length > 0
          ? `Approximate location (${nameParts.join(', ')})`
          : 'Approximate current location',
      lat: latitude.toFixed(6),
      lng: longitude.toFixed(6),
    };
  };

  const locationProviders: Array<{
    name: string;
    lookup: () => Promise<CurrentLocationLookupResultPayload | null>;
  }> = [
    {
      name: 'ipwho.is',
      lookup: async () => {
        const response = await fetch('https://ipwho.is/?output=json&lang=en', {
          headers: requestHeaders,
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          success?: boolean;
          latitude?: number | string;
          longitude?: number | string;
          city?: string;
          region?: string;
          country?: string;
        };

        if (payload.success === false) {
          return null;
        }

        return buildApproximateLocation(
          payload.latitude,
          payload.longitude,
          payload.city,
          payload.region,
          payload.country,
        );
      },
    },
    {
      name: 'ipapi.co',
      lookup: async () => {
        const response = await fetch('https://ipapi.co/json/', {
          headers: requestHeaders,
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          error?: boolean;
          latitude?: number | string;
          longitude?: number | string;
          city?: string;
          region?: string;
          country_name?: string;
        };

        if (payload.error) {
          return null;
        }

        return buildApproximateLocation(
          payload.latitude,
          payload.longitude,
          payload.city,
          payload.region,
          payload.country_name,
        );
      },
    },
    {
      name: 'ipinfo.io',
      lookup: async () => {
        const response = await fetch('https://ipinfo.io/json', {
          headers: requestHeaders,
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          loc?: string;
          city?: string;
          region?: string;
          country?: string;
        };

        const [latitude, longitude] = (payload.loc ?? '').split(',').map((part) => part.trim());
        return buildApproximateLocation(
          latitude,
          longitude,
          payload.city,
          payload.region,
          payload.country,
        );
      },
    },
  ];

  for (const locationProvider of locationProviders) {
    try {
      const approximateLocation = await locationProvider.lookup();
      if (approximateLocation) {
        return approximateLocation;
      }
    } catch (error) {
      console.warn(`Approximate location lookup failed via ${locationProvider.name}:`, error);
    }
  }

  return null;
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

  if (!canUseMacAutoInstallUpdates()) {
    sendUpdateStatus({
      state: 'idle',
      message: UNSIGNED_MAC_UPDATER_MESSAGE,
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
    lastKnownAvailableVersion = info.version;
    sendUpdateStatus({
      state: 'available',
      message: `Update available: v${info.version}. Downloading now...`,
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    isUpdateCheckInProgress = false;
    lastKnownAvailableVersion = null;
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
      message: toSafeUpdaterErrorMessage(error),
      version: lastKnownAvailableVersion ?? undefined,
    });
  });

  autoUpdater.checkForUpdates().catch((error) => {
    sendUpdateStatus({ state: 'error', message: toSafeUpdaterErrorMessage(error) });
  });

  updateCheckInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      sendUpdateStatus({ state: 'error', message: toSafeUpdaterErrorMessage(error) });
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
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    backgroundColor: '#f5f5f7',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
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
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    backgroundColor: '#f5f5f7',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
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
  const appSession = session.defaultSession;
  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingOrigin =
      (details as { requestingOrigin?: string; requestingUrl?: string } | undefined)
        ?.requestingOrigin ??
      (details as { requestingOrigin?: string; requestingUrl?: string } | undefined)?.requestingUrl;
    if (!isTrustedPermissionRequest(webContents, requestingOrigin)) {
      callback(false);
      return;
    }

    if (permission === 'geolocation') {
      const permissionOrigin = resolvePermissionOrigin(webContents, requestingOrigin);
      const locationPermissionState = getLocationPermissionStateForOrigin(permissionOrigin);

      if (locationPermissionState === 'granted') {
        callback(true);
        return;
      }

      void promptForGeolocationPermission(webContents, permissionOrigin)
        .then((isAllowed) => {
          if (permissionOrigin) {
            geolocationPermissionByOrigin.set(permissionOrigin, isAllowed ? 'granted' : 'denied');
          }

          callback(isAllowed);
        })
        .catch((error) => {
          console.warn('Unable to prompt for geolocation permission:', error);
          callback(false);
        });

      return;
    }

    const isSupportedPermission =
      permission === 'media' ||
      permission === 'notifications';

    callback(isSupportedPermission);
  });

  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (!isTrustedPermissionRequest(webContents, requestingOrigin)) {
      return false;
    }

    if (permission === 'geolocation') {
      const permissionOrigin = resolvePermissionOrigin(webContents, requestingOrigin);
      return getLocationPermissionStateForOrigin(permissionOrigin) === 'granted';
    }

    return permission === 'media' || permission === 'notifications';
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:set-badge-count', (_event, count: number) => {
    const safeCount = Math.max(0, Math.round(count));
    app.setBadgeCount(safeCount);

    if ((process.platform === 'win32' || process.platform === 'linux') && mainWindow) {
      mainWindow.setTitle(safeCount > 0 ? `(${safeCount}) GroupUs` : 'GroupUs');
    }
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

  ipcMain.handle('notifications:is-supported', () => {
    return Notification.isSupported();
  });

  ipcMain.handle('notifications:get-web-permission', (): NotificationPermissionState => {
    return Notification.isSupported() ? 'granted' : 'denied';
  });

  ipcMain.handle('notifications:request-web-permission', (): NotificationPermissionState => {
    return Notification.isSupported() ? 'granted' : 'denied';
  });

  ipcMain.handle('notifications:show', (_event, payload: SystemNotificationPayload) => {
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') {
      return false;
    }

    return showSystemNotification(payload);
  });

  ipcMain.handle('media:search', async (_event, payload: MediaSearchPayload) => {
    const query = payload?.query?.trim();
    const kind = payload?.kind;

    if (!query) {
      return [];
    }

    if (kind === 'gifs') {
      return searchTenorGifs(query);
    }

    if (kind === 'images' || kind === 'videos') {
      return searchWikimediaMedia(query, kind);
    }

    return [];
  });

  ipcMain.handle('locations:search', async (_event, payload: LocationSearchPayload) => {
    const query = payload?.query?.trim();
    if (!query) {
      return [];
    }

    return searchLocationPlaces(query);
  });

  ipcMain.handle('locations:get-precise-permission-state', (event): LocationPermissionState => {
    if (!isTrustedPermissionRequest(event.sender)) {
      return 'denied';
    }

    const permissionOrigin = resolvePermissionOrigin(event.sender);
    return getLocationPermissionStateForOrigin(permissionOrigin);
  });

  ipcMain.handle('locations:clear-precise-permission-state', (event) => {
    if (!isTrustedPermissionRequest(event.sender)) {
      return false;
    }

    const permissionOrigin = resolvePermissionOrigin(event.sender);
    if (!permissionOrigin) {
      return false;
    }

    geolocationPermissionByOrigin.delete(permissionOrigin);
    return true;
  });

  ipcMain.handle('locations:lookup-current', async () => {
    try {
      return await lookupApproximateCurrentLocation();
    } catch (error) {
      console.warn('Approximate location lookup handler failed:', error);
      return null;
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
      const result = await autoUpdater.checkForUpdates();

      if (!canUseMacAutoInstallUpdates()) {
        isUpdateCheckInProgress = false;
        const version = result?.updateInfo?.version ?? lastKnownAvailableVersion ?? undefined;
        if (version && version !== app.getVersion()) {
          sendUpdateStatus({
            state: 'error',
            message: UNSIGNED_MAC_UPDATER_MESSAGE,
            version,
          });
        } else {
          sendUpdateStatus({
            state: 'not-available',
            message: 'You are on the latest version.',
          });
        }
      }
    } catch (error) {
      isUpdateCheckInProgress = false;
      sendUpdateStatus({
        state: 'error',
        message: toSafeUpdaterErrorMessage(error),
        version: lastKnownAvailableVersion ?? undefined,
      });
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

    if (!canUseMacAutoInstallUpdates()) {
      sendUpdateStatus({
        state: 'error',
        message: UNSIGNED_MAC_UPDATER_MESSAGE,
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
