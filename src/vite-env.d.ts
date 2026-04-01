/// <reference types="vite/client" />

interface UpdateStatusPayload {
	state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
	message?: string;
	progress?: number;
	version?: string;
}

interface ElectronBridge {
	platform: string;
	windows?: {
		openSettings: () => Promise<void>;
	};
	updates?: {
		check: () => Promise<void>;
		install: () => Promise<void>;
		onStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
	};
}

interface Window {
	electron?: ElectronBridge;
}
