import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthPage } from './components/Auth/AuthPage';
import { AppLayout } from './components/Layout/AppLayout';
import { GroupsList } from './components/Sidebar/GroupsList';
import { SettingsMenu } from './components/Sidebar/SettingsMenu';
import { MessageView } from './components/Messages/MessageView';
import {
  groupMeService,
  mapGroupToConversation,
  Conversation,
  GroupMeApiError,
  User,
} from './services/groupme';
import { MessageSquare } from 'lucide-react';

export type ConversationFilter = 'all' | 'groups' | 'chats';
export type AppearancePreference = 'light' | 'dark' | 'system';
export type ColorTheme = 'blue' | 'emerald' | 'rose' | 'amber' | 'custom';
export type DarkSurfaceStyle = 'default' | 'black';
const MUTED_CONVERSATIONS_STORAGE_KEY = 'groupus_muted_conversations';
const READ_STATE_STORAGE_KEY = 'groupus_conversation_read_state';
const APPEARANCE_STORAGE_KEY = 'groupus_appearance_preference';
const COLOR_THEME_STORAGE_KEY = 'groupus_color_theme';
const CUSTOM_ACCENT_COLOR_STORAGE_KEY = 'groupus_custom_accent_color';
const DARK_SURFACE_STORAGE_KEY = 'groupus_dark_surface_style';
const IN_APP_NOTIFICATIONS_STORAGE_KEY = 'groupus_in_app_notifications_enabled';
const SYSTEM_NOTIFICATIONS_STORAGE_KEY = 'groupus_system_notifications_enabled';
const DEFAULT_OAUTH_CALLBACK_URL = 'http://127.0.0.1:53682/oauth/callback';
const DEFAULT_GROUPME_OAUTH_CLIENT_ID = '9Xn74NSjQ36eHFjIuYIfcSoqKu3ELBJEB7qBTsIxkWlNmbBu';
const GROUPME_OAUTH_CLIENT_ID =
  (import.meta.env.VITE_GROUPME_OAUTH_CLIENT_ID ?? '').trim() || DEFAULT_GROUPME_OAUTH_CLIENT_ID;
const GROUPME_OAUTH_CALLBACK_URL =
  (import.meta.env.VITE_GROUPME_OAUTH_CALLBACK_URL ?? '').trim() || DEFAULT_OAUTH_CALLBACK_URL;
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/kpulik/GroupUs/releases/latest';
const CONVERSATION_REFRESH_INTERVAL_MS = 5000;
const IN_APP_NOTIFICATION_DURATION_MS = 6000;
const MAX_IN_APP_NOTIFICATIONS = 4;

interface LatestReleasePayload {
  tag_name?: string;
}

interface ConversationAlert {
  conversationId: string;
  conversationName: string;
  newMessagesCount: number;
}

interface InAppNotificationItem {
  id: string;
  conversationId: string;
  title: string;
  body: string;
}

interface AccentPalette {
  accent400: string;
  accent500: string;
  accent600: string;
  accent700: string;
}

function normalizeHexColor(value: string | null): string {
  if (!value) {
    return '#3b82f6';
  }

  const candidate = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    const short = candidate.slice(1);
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`;
  }

  return '#3b82f6';
}

function parseStoredBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }

  return value === 'true';
}

function hexToRgb(hexColor: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hexColor);
  const color = normalized.slice(1);

  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((component) => Math.max(0, Math.min(255, Math.round(component))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function blendHex(colorA: string, colorB: string, colorAWeight: number): string {
  const left = hexToRgb(colorA);
  const right = hexToRgb(colorB);
  const rightWeight = 1 - colorAWeight;

  return rgbToHex(
    left.r * colorAWeight + right.r * rightWeight,
    left.g * colorAWeight + right.g * rightWeight,
    left.b * colorAWeight + right.b * rightWeight,
  );
}

function createCustomAccentPalette(baseColor: string): AccentPalette {
  const normalizedBase = normalizeHexColor(baseColor);

  return {
    accent400: blendHex(normalizedBase, '#ffffff', 0.72),
    accent500: normalizedBase,
    accent600: blendHex(normalizedBase, '#000000', 0.86),
    accent700: blendHex(normalizedBase, '#000000', 0.72),
  };
}

interface ConversationReadState {
  lastReadUpdatedAt: number;
  lastReadMessageCount: number | null;
}

function createReadStateSnapshot(conversation: Conversation): ConversationReadState {
  return {
    lastReadUpdatedAt: conversation.updated_at,
    lastReadMessageCount: conversation.message_count,
  };
}

function createUnreadStateSnapshot(conversation: Conversation): ConversationReadState {
  return {
    lastReadUpdatedAt: Math.max(0, conversation.updated_at - 1),
    lastReadMessageCount:
      conversation.message_count === null
        ? null
        : Math.max(0, conversation.message_count - 1),
  };
}

function isSameReadState(
  firstState: ConversationReadState | undefined,
  secondState: ConversationReadState,
): boolean {
  if (!firstState) {
    return false;
  }

  return (
    firstState.lastReadUpdatedAt === secondState.lastReadUpdatedAt &&
    firstState.lastReadMessageCount === secondState.lastReadMessageCount
  );
}

function normalizeVersionTag(version: string | null | undefined): string | null {
  if (!version) {
    return null;
  }

  const trimmedVersion = version.trim();
  if (!trimmedVersion) {
    return null;
  }

  const withoutPrefix = trimmedVersion.replace(/^v/i, '');
  const stablePart = withoutPrefix.split('-')[0];

  return stablePart || null;
}

function parseSemverParts(version: string): number[] {
  return version
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));
}

function compareSemverVersions(leftVersion: string, rightVersion: string): number {
  const leftParts = parseSemverParts(leftVersion);
  const rightParts = parseSemverParts(rightVersion);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart === rightPart) {
      continue;
    }

    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

function countNewMessages(previousConversation: Conversation | undefined, nextConversation: Conversation): number {
  if (!previousConversation) {
    return 0;
  }

  if (
    previousConversation.message_count !== null &&
    nextConversation.message_count !== null
  ) {
    return Math.max(0, nextConversation.message_count - previousConversation.message_count);
  }

  return nextConversation.updated_at > previousConversation.updated_at ? 1 : 0;
}

function App() {
  const isSettingsWindow = new URLSearchParams(window.location.search).get('view') === 'settings';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedSubgroupByGroup, setSelectedSubgroupByGroup] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>('all');
  const [appearancePreference, setAppearancePreference] = useState<AppearancePreference>(() => {
    const storedValue = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (storedValue === 'light' || storedValue === 'dark' || storedValue === 'system') {
      return storedValue;
    }

    return 'system';
  });
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const storedValue = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    if (
      storedValue === 'blue' ||
      storedValue === 'emerald' ||
      storedValue === 'rose' ||
      storedValue === 'amber' ||
      storedValue === 'custom'
    ) {
      return storedValue;
    }

    return 'blue';
  });
  const [darkSurfaceStyle, setDarkSurfaceStyle] = useState<DarkSurfaceStyle>(() => {
    const storedValue = localStorage.getItem(DARK_SURFACE_STORAGE_KEY);
    if (storedValue === 'default' || storedValue === 'black') {
      return storedValue;
    }

    return 'default';
  });
  const [customAccentColor, setCustomAccentColor] = useState<string>(() => {
    return normalizeHexColor(localStorage.getItem(CUSTOM_ACCENT_COLOR_STORAGE_KEY));
  });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [oauthStatusMessage, setOauthStatusMessage] = useState<string | null>(null);
  const [isOAuthAuthenticating, setIsOAuthAuthenticating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload>({ state: 'idle' });
  const [subgroupsLoadedByGroupSourceId, setSubgroupsLoadedByGroupSourceId] = useState<Record<string, boolean>>({});
  const [mutedConversationIds, setMutedConversationIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(MUTED_CONVERSATIONS_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return parsed as Record<string, boolean>;
    } catch (error) {
      console.warn('Failed to restore muted conversation settings:', error);
      return {};
    }
  });
  const [conversationReadState, setConversationReadState] = useState<Record<string, ConversationReadState>>(() => {
    try {
      const raw = localStorage.getItem(READ_STATE_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return parsed as Record<string, ConversationReadState>;
    } catch (error) {
      console.warn('Failed to restore read state:', error);
      return {};
    }
  });
  const [loading, setLoading] = useState(true);
  const [showInlineSettingsFallback, setShowInlineSettingsFallback] = useState(false);
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(IN_APP_NOTIFICATIONS_STORAGE_KEY), true);
  });
  const [systemNotificationsEnabled, setSystemNotificationsEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(SYSTEM_NOTIFICATIONS_STORAGE_KEY), false);
  });
  const [systemNotificationPermission, setSystemNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification === 'undefined') {
      return 'denied';
    }

    return Notification.permission;
  });
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotificationItem[]>([]);
  const hasSyncedConversationsOnceRef = useRef(false);
  const inAppNotificationTimerIdsRef = useRef<Record<string, number>>({});
  const conversationsRef = useRef<Conversation[]>([]);
  const systemNotificationsSupported = typeof Notification !== 'undefined';

  const isUnauthorizedGroupMeError = (error: unknown) => {
    return error instanceof GroupMeApiError && (error.status === 401 || error.status === 403);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (!isSettingsWindow) {
        loadUserData();
      }
    }
  }, [isAuthenticated, isSettingsWindow]);

  useEffect(() => {
    const unsubscribe = window.electron?.updates?.onStatus((status) => {
      setUpdateStatus(status);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!systemNotificationsSupported) {
      setSystemNotificationPermission('denied');
      setSystemNotificationsEnabled(false);
      return;
    }

    setSystemNotificationPermission(Notification.permission);

    if (Notification.permission !== 'granted' && systemNotificationsEnabled) {
      setSystemNotificationsEnabled(false);
    }
  }, [systemNotificationsEnabled, systemNotificationsSupported]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== 'groupme_access_token') {
        return;
      }

      if (!event.newValue) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        conversationsRef.current = [];
        hasSyncedConversationsOnceRef.current = false;
        setConversations([]);
        setSelectedConversationId(null);
        setSelectedSubgroupByGroup({});
        setConversationReadState({});
        setAccessToken(null);
        setInAppNotifications([]);
        setOauthStatusMessage(null);
        setIsOAuthAuthenticating(false);
        return;
      }

      setAccessToken(event.newValue);
      hasSyncedConversationsOnceRef.current = false;
      setIsAuthenticated(true);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(MUTED_CONVERSATIONS_STORAGE_KEY, JSON.stringify(mutedConversationIds));
  }, [mutedConversationIds]);

  useEffect(() => {
    localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(conversationReadState));
  }, [conversationReadState]);

  useEffect(() => {
    localStorage.setItem(IN_APP_NOTIFICATIONS_STORAGE_KEY, String(inAppNotificationsEnabled));
  }, [inAppNotificationsEnabled]);

  useEffect(() => {
    localStorage.setItem(SYSTEM_NOTIFICATIONS_STORAGE_KEY, String(systemNotificationsEnabled));
  }, [systemNotificationsEnabled]);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearancePreference);
  }, [appearancePreference]);

  useEffect(() => {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
    document.documentElement.dataset.colorTheme = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    localStorage.setItem(DARK_SURFACE_STORAGE_KEY, darkSurfaceStyle);
    document.documentElement.dataset.darkSurface = darkSurfaceStyle;
  }, [darkSurfaceStyle]);

  useEffect(() => {
    const normalizedColor = normalizeHexColor(customAccentColor);
    if (normalizedColor !== customAccentColor) {
      setCustomAccentColor(normalizedColor);
      return;
    }

    localStorage.setItem(CUSTOM_ACCENT_COLOR_STORAGE_KEY, normalizedColor);

    const root = document.documentElement;
    if (colorTheme !== 'custom') {
      root.style.removeProperty('--accent-400');
      root.style.removeProperty('--accent-500');
      root.style.removeProperty('--accent-600');
      root.style.removeProperty('--accent-700');
      return;
    }

    const customPalette = createCustomAccentPalette(normalizedColor);
    root.style.setProperty('--accent-400', customPalette.accent400);
    root.style.setProperty('--accent-500', customPalette.accent500);
    root.style.setProperty('--accent-600', customPalette.accent600);
    root.style.setProperty('--accent-700', customPalette.accent700);
  }, [colorTheme, customAccentColor]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyAppearance = (preference: AppearancePreference) => {
      const useDarkMode = preference === 'dark' || (preference === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', useDarkMode);
      document.documentElement.style.colorScheme = useDarkMode ? 'dark' : 'light';
    };

    applyAppearance(appearancePreference);

    const handleSystemThemeChange = () => {
      if (appearancePreference === 'system') {
        applyAppearance('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [appearancePreference]);

  useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(inAppNotificationTimerIdsRef.current)) {
        window.clearTimeout(timeoutId);
      }

      inAppNotificationTimerIdsRef.current = {};
    };
  }, []);

  const dismissInAppNotification = useCallback((notificationId: string) => {
    const timeoutId = inAppNotificationTimerIdsRef.current[notificationId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete inAppNotificationTimerIdsRef.current[notificationId];
    }

    setInAppNotifications((currentNotifications) =>
      currentNotifications.filter((notification) => notification.id !== notificationId),
    );
  }, []);

  const enqueueInAppNotification = useCallback((alert: ConversationAlert) => {
    const notificationId = `${alert.conversationId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const body =
      alert.newMessagesCount === 1
        ? '1 new message'
        : `${alert.newMessagesCount} new messages`;

    setInAppNotifications((currentNotifications) => {
      const nextNotifications = [
        ...currentNotifications,
        {
          id: notificationId,
          conversationId: alert.conversationId,
          title: alert.conversationName,
          body,
        },
      ];

      return nextNotifications.slice(-MAX_IN_APP_NOTIFICATIONS);
    });

    const timeoutId = window.setTimeout(() => {
      dismissInAppNotification(notificationId);
    }, IN_APP_NOTIFICATION_DURATION_MS);

    inAppNotificationTimerIdsRef.current[notificationId] = timeoutId;
  }, [dismissInAppNotification]);

  const sendSystemNotification = useCallback((alert: ConversationAlert) => {
    if (!systemNotificationsSupported || !systemNotificationsEnabled || systemNotificationPermission !== 'granted') {
      return;
    }

    const body =
      alert.newMessagesCount === 1
        ? '1 new message'
        : `${alert.newMessagesCount} new messages`;

    const notification = new Notification(alert.conversationName, { body });
    notification.onclick = () => {
      window.focus();
      setSelectedConversationId(alert.conversationId);
      notification.close();
    };

    window.setTimeout(() => {
      notification.close();
    }, IN_APP_NOTIFICATION_DURATION_MS);
  }, [systemNotificationsEnabled, systemNotificationsSupported, systemNotificationPermission]);

  const emitConversationAlerts = useCallback((alerts: ConversationAlert[]) => {
    if (alerts.length === 0) {
      return;
    }

    for (const alert of alerts) {
      if (inAppNotificationsEnabled) {
        enqueueInAppNotification(alert);
      }

      sendSystemNotification(alert);
    }
  }, [enqueueInAppNotification, inAppNotificationsEnabled, sendSystemNotification]);

  const handleToggleInAppNotifications = useCallback((enabled: boolean) => {
    setInAppNotificationsEnabled(enabled);
  }, []);

  const handleToggleSystemNotifications = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setSystemNotificationsEnabled(false);
      return;
    }

    if (!systemNotificationsSupported) {
      setSystemNotificationPermission('denied');
      setSystemNotificationsEnabled(false);
      return;
    }

    if (Notification.permission === 'granted') {
      setSystemNotificationPermission('granted');
      setSystemNotificationsEnabled(true);
      return;
    }

    const requestedPermission = await Notification.requestPermission();
    setSystemNotificationPermission(requestedPermission);
    setSystemNotificationsEnabled(requestedPermission === 'granted');
  }, [systemNotificationsSupported]);

  const refreshConversations = useCallback(async (notifyOnIncomingMessages: boolean) => {
    const activeConversationId = selectedConversationId;

    try {
      const loadedConversations = await groupMeService.getConversations();
      const previousConversations = conversationsRef.current;
      const previousConversationsById = new Map(
        previousConversations.map((conversation) => [conversation.id, conversation]),
      );

      const shouldEmitAlerts = notifyOnIncomingMessages && hasSyncedConversationsOnceRef.current;
      const incomingAlerts: ConversationAlert[] = [];

      if (shouldEmitAlerts) {
        for (const conversation of loadedConversations) {
          const previousConversation = previousConversationsById.get(conversation.id);
          const newMessagesCount = countNewMessages(previousConversation, conversation);

          if (
            newMessagesCount > 0 &&
            conversation.id !== activeConversationId &&
            !mutedConversationIds[conversation.id]
          ) {
            incomingAlerts.push({
              conversationId: conversation.id,
              conversationName: conversation.name,
              newMessagesCount,
            });
          }
        }
      }

      const preservedSubgroups = previousConversations.filter(
        (conversation) => conversation.type === 'subgroup',
      );

      const mergedConversationsById = new Map<string, Conversation>();

      for (const subgroupConversation of preservedSubgroups) {
        mergedConversationsById.set(subgroupConversation.id, subgroupConversation);
      }

      for (const loadedConversation of loadedConversations) {
        const existingConversation = mergedConversationsById.get(loadedConversation.id);
        mergedConversationsById.set(loadedConversation.id, {
          ...existingConversation,
          ...loadedConversation,
        });
      }

      const nextConversations = Array.from(mergedConversationsById.values()).sort(
        (leftConversation, rightConversation) => rightConversation.updated_at - leftConversation.updated_at,
      );

      conversationsRef.current = nextConversations;
      setConversations(nextConversations);

      hasSyncedConversationsOnceRef.current = true;

      setSelectedConversationId((currentConversationId) => {
        const rootConversations = loadedConversations.filter(
          (conversation) => conversation.type !== 'subgroup',
        );

        if (
          currentConversationId &&
          rootConversations.some((conversation) => conversation.id === currentConversationId)
        ) {
          return currentConversationId;
        }

        return rootConversations.length > 0 ? rootConversations[0].id : null;
      });

      emitConversationAlerts(incomingAlerts);
    } catch (error) {
      if (isUnauthorizedGroupMeError(error)) {
        groupMeService.clearAccessToken();
        setAccessToken(null);
        setIsAuthenticated(false);
        setCurrentUser(null);
        conversationsRef.current = [];
        setConversations([]);
        setSelectedConversationId(null);
        setSelectedSubgroupByGroup({});
        setConversationReadState({});
        setSubgroupsLoadedByGroupSourceId({});
        hasSyncedConversationsOnceRef.current = false;
        return;
      }

      console.error('Failed to refresh conversations:', error);
    }
  }, [emitConversationAlerts, isUnauthorizedGroupMeError, mutedConversationIds, selectedConversationId]);

  useEffect(() => {
    if (!isAuthenticated || isSettingsWindow) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshConversations(true);
    }, CONVERSATION_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, isSettingsWindow, refreshConversations]);

  const checkAuth = async () => {
    const isAuth = groupMeService.isAuthenticated();
    if (isAuth) {
      try {
        await groupMeService.getMyUser();
        setAccessToken(groupMeService.getAccessToken());
        setIsAuthenticated(true);
      } catch (error) {
        if (isUnauthorizedGroupMeError(error)) {
          groupMeService.clearAccessToken();
          setAccessToken(null);
          setIsAuthenticated(false);
        } else {
          console.warn('Token validation failed due to a non-auth error, keeping existing session:', error);
          setAccessToken(groupMeService.getAccessToken());
          setIsAuthenticated(true);
        }
      }
    }
    setLoading(false);
  };

  const loadUserData = async () => {
    try {
      const user = await groupMeService.getMyUser();
      setCurrentUser(user);

      await refreshConversations(false);
    } catch (error) {
      if (isUnauthorizedGroupMeError(error)) {
        groupMeService.clearAccessToken();
        setAccessToken(null);
        setIsAuthenticated(false);
        setCurrentUser(null);
        conversationsRef.current = [];
        setConversations([]);
        setSelectedConversationId(null);
        setSelectedSubgroupByGroup({});
        setConversationReadState({});
        setSubgroupsLoadedByGroupSourceId({});
        hasSyncedConversationsOnceRef.current = false;
        return;
      }

      console.error('Failed to load user data:', error);
    }
  };

  const handleAuthenticateWithOAuth = useCallback(async () => {
    const authBridge = window.electron?.auth;
    const clientId = GROUPME_OAUTH_CLIENT_ID;
    const callbackUrl = GROUPME_OAUTH_CALLBACK_URL;

    if (!clientId) {
      setOauthStatusMessage('OAuth is not configured. Set VITE_GROUPME_OAUTH_CLIENT_ID and restart the app.');
      return;
    }

    if (!callbackUrl) {
      setOauthStatusMessage('OAuth callback URL is missing. Set VITE_GROUPME_OAUTH_CALLBACK_URL and restart the app.');
      return;
    }

    if (!authBridge?.startOAuth) {
      setOauthStatusMessage('OAuth is unavailable. Please restart the app or use an access token instead.');
      return;
    }

    setIsOAuthAuthenticating(true);
    setOauthStatusMessage('Opening GroupMe OAuth in your browser...');

    try {
      const result = await authBridge.startOAuth({
        clientId,
        callbackUrl,
      });

      const nextAccessToken = result.accessToken?.trim();
      if (!nextAccessToken) {
        throw new Error('GroupMe OAuth did not return an access token.');
      }

      groupMeService.setAccessToken(nextAccessToken);
      setAccessToken(nextAccessToken);
      hasSyncedConversationsOnceRef.current = false;
      setIsAuthenticated(true);
      setOauthStatusMessage('OAuth sign-in completed successfully.');
    } catch (error) {
      setOauthStatusMessage(
        error instanceof Error ? error.message : 'OAuth sign-in failed. Please try again.',
      );
    } finally {
      setIsOAuthAuthenticating(false);
    }
  }, []);

  const handleAuthenticate = (token: string) => {
    groupMeService.setAccessToken(token);
    setAccessToken(token);
    hasSyncedConversationsOnceRef.current = false;
    setIsAuthenticated(true);
    setOauthStatusMessage(null);
  };

  const handleSignOut = () => {
    groupMeService.clearAccessToken();

    for (const timeoutId of Object.values(inAppNotificationTimerIdsRef.current)) {
      window.clearTimeout(timeoutId);
    }

    inAppNotificationTimerIdsRef.current = {};

    setIsAuthenticated(false);
    setCurrentUser(null);
    conversationsRef.current = [];
    hasSyncedConversationsOnceRef.current = false;
    setConversations([]);
    setSelectedConversationId(null);
    setSelectedSubgroupByGroup({});
    setConversationReadState({});
    setSubgroupsLoadedByGroupSourceId({});
    setAccessToken(null);
    setInAppNotifications([]);
    setOauthStatusMessage(null);
    setIsOAuthAuthenticating(false);
    setUpdateStatus({ state: 'idle' });
    window.electron?.app?.setBadgeCount(0);
  };

  const handleToggleConversationMute = (conversationId: string) => {
    setMutedConversationIds((previousMutedConversationIds) => {
      const nextMutedConversationIds = { ...previousMutedConversationIds };

      if (nextMutedConversationIds[conversationId]) {
        delete nextMutedConversationIds[conversationId];
      } else {
        nextMutedConversationIds[conversationId] = true;
      }

      return nextMutedConversationIds;
    });
  };

  const handleSetConversationReadStatus = (conversationId: string, markAsRead: boolean) => {
    const targetConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (!targetConversation) {
      return;
    }

    const nextReadState = markAsRead
      ? createReadStateSnapshot(targetConversation)
      : createUnreadStateSnapshot(targetConversation);

    setConversationReadState((previousReadState) => {
      if (isSameReadState(previousReadState[conversationId], nextReadState)) {
        return previousReadState;
      }

      return {
        ...previousReadState,
        [conversationId]: nextReadState,
      };
    });
  };

  const handleMarkAllConversationsRead = () => {
    setConversationReadState((previousReadState) => {
      let hasChanges = false;
      const nextReadState = { ...previousReadState };

      for (const conversation of conversations) {
        const nextConversationReadState = createReadStateSnapshot(conversation);
        if (isSameReadState(nextReadState[conversation.id], nextConversationReadState)) {
          continue;
        }

        nextReadState[conversation.id] = nextConversationReadState;
        hasChanges = true;
      }

      return hasChanges ? nextReadState : previousReadState;
    });
  };

  const handleCheckForUpdates = async () => {
    const updatesBridge = window.electron?.updates;

    setUpdateStatus({ state: 'checking', message: 'Checking for updates...' });

    if (updatesBridge?.check) {
      try {
        await updatesBridge.check();
      } catch (error) {
        setUpdateStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Failed to check updates',
        });
      }

      return;
    }

    try {
      const releaseResponse = await fetch(LATEST_RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });

      if (!releaseResponse.ok) {
        throw new Error(`Unable to check latest release (${releaseResponse.status}).`);
      }

      const releasePayload = (await releaseResponse.json()) as LatestReleasePayload;
      const latestVersion = normalizeVersionTag(releasePayload.tag_name);

      if (!latestVersion) {
        throw new Error('Latest release version could not be determined.');
      }

      const appVersionRaw = await window.electron?.app?.getVersion?.();
      const installedVersion = normalizeVersionTag(appVersionRaw ?? null);

      if (installedVersion && compareSemverVersions(installedVersion, latestVersion) >= 0) {
        setUpdateStatus({
          state: 'not-available',
          version: installedVersion,
          message: `You already have the latest version installed (v${installedVersion}).`,
        });
        return;
      }

      setUpdateStatus({
        state: 'available',
        version: latestVersion,
        message: installedVersion
          ? `Current version: v${installedVersion}. Latest available: v${latestVersion}.`
          : `Latest available version: v${latestVersion}.`,
      });
    } catch (error) {
      setUpdateStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to check updates',
      });
    }
  };

  const handleInstallUpdate = async () => {
    const updatesBridge = window.electron?.updates;
    if (!updatesBridge?.install) {
      setUpdateStatus((currentStatus) => ({
        state: 'available',
        version: currentStatus.version,
        message: currentStatus.version
          ? `In-app install is unavailable. Opening GitHub release for v${currentStatus.version}.`
          : 'In-app install is unavailable. Opening the latest GitHub release.',
      }));

      await handleOpenLatestRelease();
      return;
    }

    setUpdateStatus((currentStatus) => ({
      ...currentStatus,
      state: 'installing',
      message: currentStatus.version
        ? `Installing update v${currentStatus.version} and restarting...`
        : 'Installing update and restarting...',
    }));

    try {
      await updatesBridge.install();
    } catch (error) {
      setUpdateStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to install update',
      });
    }
  };

  const handleOpenLatestRelease = async () => {
    const updatesBridge = window.electron?.updates;

    if (!updatesBridge?.openLatestRelease) {
      window.open('https://github.com/kpulik/GroupUs/releases/latest', '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await updatesBridge.openLatestRelease();
    } catch (error) {
      setUpdateStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to open the latest release page',
      });
    }
  };

  const rootConversations = useMemo(
    () => conversations.filter((conversation) => conversation.type !== 'subgroup'),
    [conversations],
  );

  const filteredConversations = rootConversations.filter((conversation) => {
    if (activeFilter === 'all') {
      return true;
    }

    if (activeFilter === 'groups') {
      return conversation.type === 'group';
    }

    return conversation.type === 'chat';
  });

  const selectedConversation = filteredConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  const subgroupOptionsByGroupId = useMemo(() => {
    const byParentSourceId: Record<string, Conversation[]> = {};

    for (const conversation of conversations) {
      if (conversation.type !== 'subgroup' || !conversation.parentSourceId) {
        continue;
      }

      if (!byParentSourceId[conversation.parentSourceId]) {
        byParentSourceId[conversation.parentSourceId] = [];
      }

      byParentSourceId[conversation.parentSourceId].push(conversation);
    }

    const mappedOptions: Record<string, Conversation[]> = {};

    for (const conversation of rootConversations) {
      if (conversation.type !== 'group') {
        continue;
      }

      mappedOptions[conversation.id] = (byParentSourceId[conversation.sourceId] ?? []).sort(
        (a, b) => b.updated_at - a.updated_at,
      );
    }

    return mappedOptions;
  }, [conversations, rootConversations]);

  const subgroupOptions =
    selectedConversation?.type === 'group'
      ? subgroupOptionsByGroupId[selectedConversation.id] ?? []
      : [];

  const selectedSubgroupConversationId =
    selectedConversation?.type === 'group'
      ? selectedSubgroupByGroup[selectedConversation.id] ?? selectedConversation.id
      : selectedConversation?.id ?? '';

  const activeConversation =
    selectedConversation?.type === 'group'
      ? [selectedConversation, ...subgroupOptions].find(
          (conversation) => conversation.id === selectedSubgroupConversationId,
        ) ?? selectedConversation
      : selectedConversation;

  useEffect(() => {
    if (conversations.length === 0) {
      return;
    }

    setConversationReadState((previousReadState) => {
      let hasChanges = false;
      const nextReadState = { ...previousReadState };

      for (const conversation of conversations) {
        if (!nextReadState[conversation.id]) {
          nextReadState[conversation.id] = createReadStateSnapshot(conversation);
          hasChanges = true;
        }
      }

      return hasChanges ? nextReadState : previousReadState;
    });
  }, [conversations]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }

    setConversationReadState((previousReadState) => {
      const nextReadState = createReadStateSnapshot(activeConversation);

      if (isSameReadState(previousReadState[activeConversation.id], nextReadState)) {
        return previousReadState;
      }

      return {
        ...previousReadState,
        [activeConversation.id]: nextReadState,
      };
    });
  }, [activeConversation?.id, activeConversation?.updated_at, activeConversation?.message_count]);

  const unreadCountByConversationId = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const conversation of conversations) {
      const readState = conversationReadState[conversation.id];
      if (!readState) {
        counts[conversation.id] = 0;
        continue;
      }

      if (
        conversation.message_count !== null &&
        readState.lastReadMessageCount !== null
      ) {
        counts[conversation.id] = Math.max(0, conversation.message_count - readState.lastReadMessageCount);
        continue;
      }

      counts[conversation.id] = conversation.updated_at > readState.lastReadUpdatedAt ? 1 : 0;
    }

    return counts;
  }, [conversations, conversationReadState]);

  const totalUnreadCount = useMemo(() => {
    return Object.values(unreadCountByConversationId).reduce((sum, count) => sum + count, 0);
  }, [unreadCountByConversationId]);

  useEffect(() => {
    window.electron?.app?.setBadgeCount(totalUnreadCount);
  }, [totalUnreadCount]);

  const handleSelectSubgroupForGroup = (groupConversationId: string, conversationId: string) => {
    setSelectedSubgroupByGroup((previousSelections) => ({
      ...previousSelections,
      [groupConversationId]: conversationId,
    }));
  };

  const groupConversations = useMemo(
    () => rootConversations.filter((conversation) => conversation.type === 'group'),
    [rootConversations],
  );

  useEffect(() => {
    if (groupConversations.length === 0) {
      return;
    }

    const groupsToLoad = groupConversations.filter(
      (groupConversation) => !subgroupsLoadedByGroupSourceId[groupConversation.sourceId],
    );

    if (groupsToLoad.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all(
      groupsToLoad.map(async (groupConversation) => {
        try {
          const subgroups = await groupMeService.getSubgroups(groupConversation.sourceId);
          return {
            groupSourceId: groupConversation.sourceId,
            subgroups,
          };
        } catch (error) {
          console.warn(`Unable to load subgroup channels for group ${groupConversation.sourceId}:`, error);
          return {
            groupSourceId: groupConversation.sourceId,
            subgroups: [],
          };
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      setSubgroupsLoadedByGroupSourceId((previousState) => {
        const nextState = { ...previousState };
        for (const result of results) {
          nextState[result.groupSourceId] = true;
        }
        return nextState;
      });

      if (results.every((result) => result.subgroups.length === 0)) {
        return;
      }

      setConversations((previousConversations) => {
        const mergedById = new Map(previousConversations.map((conversation) => [conversation.id, conversation]));

        for (const result of results) {
          for (const subgroup of result.subgroups) {
            const mappedSubgroup = mapGroupToConversation(subgroup, result.groupSourceId);
            const existingConversation = mergedById.get(mappedSubgroup.id);

            if (!existingConversation) {
              mergedById.set(mappedSubgroup.id, mappedSubgroup);
              continue;
            }

            mergedById.set(mappedSubgroup.id, {
              ...existingConversation,
              ...mappedSubgroup,
            });
          }
        }

        return Array.from(mergedById.values()).sort((a, b) => b.updated_at - a.updated_at);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [groupConversations, subgroupsLoadedByGroupSourceId]);

  const handleFilterChange = (nextFilter: ConversationFilter) => {
    setActiveFilter(nextFilter);

    const nextVisibleConversations = rootConversations.filter((conversation) => {
      if (nextFilter === 'all') {
        return true;
      }
      if (nextFilter === 'groups') {
        return conversation.type === 'group';
      }
      return conversation.type === 'chat';
    });

    if (nextVisibleConversations.length > 0) {
      setSelectedConversationId(nextVisibleConversations[0].id);
      return;
    }

    setSelectedConversationId(null);
  };

  const handleInAppNotificationClick = (notification: InAppNotificationItem) => {
    setSelectedConversationId(notification.conversationId);
    dismissInAppNotification(notification.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-3xl mb-4 shadow-lg animate-pulse">
            <MessageSquare className="w-10 h-10 text-white" />
          </div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthPage
        onAuthenticate={handleAuthenticate}
        onAuthenticateWithOAuth={handleAuthenticateWithOAuth}
        oauthStatusMessage={oauthStatusMessage}
        isOAuthAuthenticating={isOAuthAuthenticating}
      />
    );
  }

  if (isSettingsWindow) {
    return (
      <SettingsMenu
        accessToken={accessToken}
        updateStatus={updateStatus}
        onClose={() => window.close()}
        onCheckForUpdates={handleCheckForUpdates}
        onInstallUpdate={handleInstallUpdate}
        onOpenLatestRelease={handleOpenLatestRelease}
        inAppNotificationsEnabled={inAppNotificationsEnabled}
        systemNotificationsEnabled={systemNotificationsEnabled}
        systemNotificationsSupported={systemNotificationsSupported}
        systemNotificationPermission={systemNotificationPermission}
        onToggleInAppNotifications={handleToggleInAppNotifications}
        onToggleSystemNotifications={handleToggleSystemNotifications}
        onSignOut={() => {
          handleSignOut();
          window.close();
        }}
        onDeleteToken={() => {
          handleSignOut();
          window.close();
        }}
        appearancePreference={appearancePreference}
        onChangeAppearance={setAppearancePreference}
        colorTheme={colorTheme}
        onChangeColorTheme={setColorTheme}
        darkSurfaceStyle={darkSurfaceStyle}
        onChangeDarkSurfaceStyle={setDarkSurfaceStyle}
        customAccentColor={customAccentColor}
        onChangeCustomAccentColor={setCustomAccentColor}
        standalone
      />
    );
  }

  return (
    <>
      <AppLayout
        sidebar={
          <GroupsList
            conversations={filteredConversations}
            allConversations={conversations}
            activeFilter={activeFilter}
            currentUser={currentUser}
            selectedConversationId={selectedConversationId}
            mutedConversationIds={mutedConversationIds}
            unreadCountByConversationId={unreadCountByConversationId}
            subgroupOptionsByGroupId={subgroupOptionsByGroupId}
            selectedSubgroupByGroup={selectedSubgroupByGroup}
            onSelectConversation={setSelectedConversationId}
            onChangeFilter={handleFilterChange}
            onSelectSubgroupForGroup={handleSelectSubgroupForGroup}
            onToggleConversationMute={handleToggleConversationMute}
            onMarkAllConversationsRead={handleMarkAllConversationsRead}
            onSetConversationReadStatus={handleSetConversationReadStatus}
            onOpenSettingsWindow={() => {
              setShowInlineSettingsFallback(true);
            }}
          />
        }
        main={
          activeConversation && selectedConversation && currentUser ? (
            <MessageView
              conversation={selectedConversation}
              activeConversation={activeConversation}
              currentUserId={currentUser.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-300">Select a conversation to start messaging</p>
              </div>
            </div>
          )
        }
      />

      {inAppNotificationsEnabled && inAppNotifications.length > 0 && (
        <div className="fixed right-4 top-14 z-[95] w-[min(360px,92vw)] space-y-2 pointer-events-none">
          {inAppNotifications.map((notification) => (
            <div
              key={notification.id}
              className="pointer-events-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-xl"
            >
              <button
                onClick={() => handleInAppNotificationClick(notification)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors rounded-t-xl"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {notification.title}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                  {notification.body}
                </p>
              </button>
              <div className="px-3 pb-2 pt-0.5 flex justify-end">
                <button
                  onClick={() => dismissInAppNotification(notification.id)}
                  className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInlineSettingsFallback && (
        <SettingsMenu
          accessToken={accessToken}
          updateStatus={updateStatus}
          onClose={() => setShowInlineSettingsFallback(false)}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
          onOpenLatestRelease={handleOpenLatestRelease}
          inAppNotificationsEnabled={inAppNotificationsEnabled}
          systemNotificationsEnabled={systemNotificationsEnabled}
          systemNotificationsSupported={systemNotificationsSupported}
          systemNotificationPermission={systemNotificationPermission}
          onToggleInAppNotifications={handleToggleInAppNotifications}
          onToggleSystemNotifications={handleToggleSystemNotifications}
          onSignOut={() => {
            handleSignOut();
            setShowInlineSettingsFallback(false);
          }}
          onDeleteToken={() => {
            handleSignOut();
            setShowInlineSettingsFallback(false);
          }}
          appearancePreference={appearancePreference}
          onChangeAppearance={setAppearancePreference}
          colorTheme={colorTheme}
          onChangeColorTheme={setColorTheme}
          darkSurfaceStyle={darkSurfaceStyle}
          onChangeDarkSurfaceStyle={setDarkSurfaceStyle}
          customAccentColor={customAccentColor}
          onChangeCustomAccentColor={setCustomAccentColor}
        />
      )}
    </>
  );
}

export default App;
