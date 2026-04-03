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

interface SystemNotificationPayload {
	title: string;
	body: string;
	conversationId?: string;
	silent?: boolean;
}

interface NotificationClickPayload {
	conversationId: string | null;
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

type LocationPermissionState = 'prompt' | 'granted' | 'denied';

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
		setBadgeCount: (count: number) => Promise<void>;
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
	notifications?: {
		isSupported: () => Promise<boolean>;
		getPermission: () => Promise<NotificationPermission>;
		requestPermission: () => Promise<NotificationPermission>;
		show: (payload: SystemNotificationPayload) => Promise<boolean>;
		onClick: (callback: (payload: NotificationClickPayload) => void) => () => void;
	};
	media?: {
		search: (payload: MediaSearchPayload) => Promise<MediaSearchResultPayload[]>;
	};
	locations?: {
		search: (payload: LocationSearchPayload) => Promise<LocationSearchResultPayload[]>;
		getPrecisePermissionState: () => Promise<LocationPermissionState>;
		clearPrecisePermissionState: () => Promise<boolean>;
		lookupCurrent: () => Promise<CurrentLocationLookupResultPayload | null>;
	};
}

interface Window {
	electron?: ElectronBridge;
}
