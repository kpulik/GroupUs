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

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
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
});
