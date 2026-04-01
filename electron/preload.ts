import { contextBridge, ipcRenderer } from 'electron';

interface UpdateStatusPayload {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message?: string;
  progress?: number;
  version?: string;
}

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  windows: {
    openSettings: () => ipcRenderer.invoke('window:open-settings'),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (callback: (payload: UpdateStatusPayload) => void) => {
      const listener = (_event: unknown, payload: UpdateStatusPayload) => callback(payload);
      ipcRenderer.on('updates:status', listener);

      return () => {
        ipcRenderer.removeListener('updates:status', listener);
      };
    },
  },
});
