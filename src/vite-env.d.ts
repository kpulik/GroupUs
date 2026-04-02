/// <reference types="vite/client" />

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

interface ImportMetaEnv {
	readonly VITE_GROUPME_OAUTH_CLIENT_ID?: string;
	readonly VITE_GROUPME_OAUTH_CALLBACK_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface ElectronBridge {
	platform: string;
	app?: {
		getVersion: () => Promise<string>;
	};
	windows?: {
		openSettings: () => Promise<void>;
	};
	auth?: {
		startOAuth: (payload: OAuthStartPayload) => Promise<OAuthStartResult>;
	};
	updates?: {
		check: () => Promise<void>;
		install: () => Promise<void>;
		openLatestRelease: () => Promise<void>;
		onStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
	};
}

interface Window {
	electron?: ElectronBridge;
}
