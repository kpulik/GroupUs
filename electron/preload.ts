import { contextBridge, ipcRenderer } from 'electron';

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

interface NotificationClickPayload {
  conversationId: string | null;
}

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),
  },
  windows: {
    openSettings: () => ipcRenderer.invoke('window:open-settings'),
  },
  auth: {
    startOAuth: (payload: OAuthStartPayload) =>
      ipcRenderer.invoke('auth:start-oauth', payload) as Promise<OAuthStartResult>,
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    openLatestRelease: () => ipcRenderer.invoke('updates:open-latest-release'),
    onStatus: (callback: (payload: UpdateStatusPayload) => void) => {
      const listener = (_event: unknown, payload: UpdateStatusPayload) => callback(payload);
      ipcRenderer.on('updates:status', listener);

      return () => {
        ipcRenderer.removeListener('updates:status', listener);
      };
    },
  },
  notifications: {
    isSupported: () => ipcRenderer.invoke('notifications:is-supported') as Promise<boolean>,
    getPermission: () =>
      ipcRenderer.invoke('notifications:get-web-permission') as Promise<NotificationPermissionState>,
    requestPermission: () =>
      ipcRenderer.invoke('notifications:request-web-permission') as Promise<NotificationPermissionState>,
    show: (payload: SystemNotificationPayload) =>
      ipcRenderer.invoke('notifications:show', payload) as Promise<boolean>,
    onClick: (callback: (payload: NotificationClickPayload) => void) => {
      const listener = (_event: unknown, payload: NotificationClickPayload) => callback(payload);
      ipcRenderer.on('notifications:click', listener);

      return () => {
        ipcRenderer.removeListener('notifications:click', listener);
      };
    },
  },
  media: {
    search: (payload: MediaSearchPayload) =>
      ipcRenderer.invoke('media:search', payload) as Promise<MediaSearchResultPayload[]>,
  },
  locations: {
    search: (payload: LocationSearchPayload) =>
      ipcRenderer.invoke('locations:search', payload) as Promise<LocationSearchResultPayload[]>,
    getPrecisePermissionState: () =>
      ipcRenderer.invoke('locations:get-precise-permission-state') as Promise<LocationPermissionState>,
    clearPrecisePermissionState: () =>
      ipcRenderer.invoke('locations:clear-precise-permission-state') as Promise<boolean>,
    lookupCurrent: () =>
      ipcRenderer.invoke('locations:lookup-current') as Promise<CurrentLocationLookupResultPayload | null>,
  },
});
