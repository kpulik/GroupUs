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
  UpdateUserProfileInput,
  User,
} from './services/groupme';
import { MessageSquare } from 'lucide-react';

export type ConversationFilter = 'all' | 'groups' | 'chats' | 'unread';
export type AppearancePreference = 'light' | 'dark' | 'system';
export type ColorTheme = 'blue' | 'emerald' | 'rose' | 'amber' | 'custom';
export type LightBackgroundPreset = 'white' | 'cream' | 'sky' | 'mint' | 'blush' | 'custom';
export type DarkSurfaceStyle = 'default' | 'black' | 'charcoal' | 'ocean' | 'plum' | 'custom';
export type ConversationNotificationPreviewOverride = 'on' | 'off';
export type ConversationNotificationPreviewMode = 'default' | ConversationNotificationPreviewOverride;
const MUTED_CONVERSATIONS_STORAGE_KEY = 'groupus_muted_conversations';
const READ_STATE_STORAGE_KEY = 'groupus_conversation_read_state';
const APPEARANCE_STORAGE_KEY = 'groupus_appearance_preference';
const COLOR_THEME_STORAGE_KEY = 'groupus_color_theme';
const CUSTOM_ACCENT_COLOR_STORAGE_KEY = 'groupus_custom_accent_color';
const LIGHT_BG_STORAGE_KEY = 'groupus_light_background_preset';
const CUSTOM_LIGHT_BG_COLOR_STORAGE_KEY = 'groupus_custom_light_bg_color';
const CUSTOM_DARK_BG_COLOR_STORAGE_KEY = 'groupus_custom_dark_bg_color';
const DARK_SURFACE_STORAGE_KEY = 'groupus_dark_surface_style';
const IN_APP_NOTIFICATIONS_STORAGE_KEY = 'groupus_in_app_notifications_enabled';
const SYSTEM_NOTIFICATIONS_STORAGE_KEY = 'groupus_system_notifications_enabled';
const NOTIFICATION_PREVIEW_STORAGE_KEY = 'groupus_notification_message_preview_enabled';
const RECAP_SUMMARY_MODE_STORAGE_KEY = 'groupus_recap_summary_mode_enabled';
const NOTIFICATION_DIGEST_ENABLED_STORAGE_KEY = 'groupus_notification_digest_enabled';
const NOTIFICATION_DIGEST_WINDOW_MINUTES_STORAGE_KEY = 'groupus_notification_digest_window_minutes';
const COMPOSER_QUICK_EMOJIS_STORAGE_KEY = 'groupus_composer_quick_emojis';
const REACTION_QUICK_EMOJIS_STORAGE_KEY = 'groupus_reaction_quick_emojis';
const CONVERSATION_NOTIFICATION_PREVIEW_OVERRIDES_STORAGE_KEY =
  'groupus_conversation_notification_preview_overrides';
const DEFAULT_OAUTH_CALLBACK_URL = 'http://127.0.0.1:53682/oauth/callback';
const DEFAULT_GROUPME_OAUTH_CLIENT_ID = '9Xn74NSjQ36eHFjIuYIfcSoqKu3ELBJEB7qBTsIxkWlNmbBu';
const GROUPME_OAUTH_CLIENT_ID =
  (import.meta.env.VITE_GROUPME_OAUTH_CLIENT_ID ?? '').trim() || DEFAULT_GROUPME_OAUTH_CLIENT_ID;
const GROUPME_OAUTH_CALLBACK_URL =
  (import.meta.env.VITE_GROUPME_OAUTH_CALLBACK_URL ?? '').trim() || DEFAULT_OAUTH_CALLBACK_URL;
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/kpulik/GroupUs/releases/latest';
const CONVERSATION_REFRESH_INTERVAL_MS = 3000;
const IN_APP_NOTIFICATION_DURATION_MS = 6000;
const MAX_IN_APP_NOTIFICATIONS = 4;
const DEFAULT_NOTIFICATION_DIGEST_WINDOW_MINUTES = 3;
const MIN_NOTIFICATION_DIGEST_WINDOW_MINUTES = 1;
const MAX_NOTIFICATION_DIGEST_WINDOW_MINUTES = 15;
const MAX_COMPOSER_QUICK_EMOJIS = 16;
const MAX_REACTION_QUICK_EMOJIS = 12;
const DEFAULT_COMPOSER_QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🙏', '🎉', '🥲', '🤔', '😅'];
const DEFAULT_REACTION_QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];
const MODERATION_REMOVAL_TEXT_PATTERNS = [
  /removed by (the )?moderator/i,
  /moderator removed/i,
  /message (was )?(removed|deleted)/i,
  /removed (a|this) message/i,
  /deleted for violating/i,
  /content .* removed/i,
  /violat(?:e|ed|ing|ion).*(policy|guideline|rule)/i,
];

interface LatestReleasePayload {
  tag_name?: string;
}

interface ConversationAlert {
  conversationId: string;
  conversationName: string;
  newMessagesCount: number;
  previewText: string | null;
  notificationGroupId?: string;
}

interface InAppNotificationItem {
  id: string;
  groupId: string;
  conversationId: string;
  title: string;
  body: string;
}

interface UpdateNoticeItem {
  id: string;
  state: 'available' | 'downloaded';
  title: string;
  body: string;
  version?: string;
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

function normalizeNotificationDigestWindowMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_DIGEST_WINDOW_MINUTES;
  }

  return Math.max(
    MIN_NOTIFICATION_DIGEST_WINDOW_MINUTES,
    Math.min(MAX_NOTIFICATION_DIGEST_WINDOW_MINUTES, Math.round(value)),
  );
}

function parseNotificationDigestWindowMinutes(value: string | null): number {
  if (!value) {
    return DEFAULT_NOTIFICATION_DIGEST_WINDOW_MINUTES;
  }

  const parsedValue = Number.parseInt(value, 10);
  return normalizeNotificationDigestWindowMinutes(parsedValue);
}

function normalizeStoredEmojiList(
  value: unknown,
  fallbackEmojis: string[],
  maxCount: number,
): string[] {
  if (!Array.isArray(value)) {
    return fallbackEmojis;
  }

  const normalizedEmojis = Array.from(
    new Set(
      value
        .map((emojiValue) => (typeof emojiValue === 'string' ? emojiValue.trim() : ''))
        .filter((emojiValue) => emojiValue.length > 0),
    ),
  ).slice(0, maxCount);

  return normalizedEmojis.length > 0 ? normalizedEmojis : fallbackEmojis;
}

function parseStoredEmojiList(
  value: string | null,
  fallbackEmojis: string[],
  maxCount: number,
): string[] {
  if (!value) {
    return fallbackEmojis;
  }

  try {
    return normalizeStoredEmojiList(JSON.parse(value), fallbackEmojis, maxCount);
  } catch (error) {
    console.warn('Failed to restore emoji defaults:', error);
    return fallbackEmojis;
  }
}

function parseNotificationPreviewOverrides(
  value: string | null,
): Record<string, ConversationNotificationPreviewOverride> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const nextOverrides: Record<string, ConversationNotificationPreviewOverride> = {};
    for (const [conversationId, overrideMode] of Object.entries(parsed)) {
      if (overrideMode === 'on' || overrideMode === 'off') {
        nextOverrides[conversationId] = overrideMode;
      }
    }

    return nextOverrides;
  } catch (error) {
    console.warn('Failed to restore per-conversation notification preview overrides:', error);
    return {};
  }
}

function resolveNotificationPreviewEnabled(
  globalSetting: boolean,
  override: ConversationNotificationPreviewOverride | undefined,
): boolean {
  if (override === 'on') {
    return true;
  }

  if (override === 'off') {
    return false;
  }

  return globalSetting;
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

interface LightBgPalette {
  bgFrom: string;
  bgTo: string;
}

function createCustomLightBgPalette(baseColor: string): LightBgPalette {
  const normalized = normalizeHexColor(baseColor);
  return {
    bgFrom: blendHex('#ffffff', normalized, 0.9),
    bgTo: blendHex('#ffffff', normalized, 0.82),
  };
}

interface DarkBgPalette {
  surface900: string;
  surface800: string;
  surface700: string;
  surface600: string;
}

function createCustomDarkBgPalette(baseColor: string): DarkBgPalette {
  const normalized = normalizeHexColor(baseColor);
  return {
    surface900: normalized,
    surface800: blendHex(normalized, '#ffffff', 0.94),
    surface700: blendHex(normalized, '#ffffff', 0.88),
    surface600: blendHex(normalized, '#ffffff', 0.82),
  };
}

const VALID_LIGHT_BG_PRESETS: LightBackgroundPreset[] = ['white', 'cream', 'sky', 'mint', 'blush', 'custom'];
const VALID_DARK_SURFACE_STYLES: DarkSurfaceStyle[] = ['default', 'black', 'charcoal', 'ocean', 'plum', 'custom'];

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

function getUnreadCountForConversation(
  conversation: Conversation,
  readState: ConversationReadState | undefined,
): number {
  if (!readState) {
    return 0;
  }

  if (
    conversation.message_count !== null &&
    readState.lastReadMessageCount !== null
  ) {
    const unreadDelta = conversation.message_count - readState.lastReadMessageCount;
    if (unreadDelta > 0) {
      return unreadDelta;
    }

    if (conversation.updated_at > readState.lastReadUpdatedAt) {
      return 1;
    }

    return 0;
  }

  return conversation.updated_at > readState.lastReadUpdatedAt ? 1 : 0;
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
    const messageCountDelta = nextConversation.message_count - previousConversation.message_count;
    if (messageCountDelta > 0) {
      return messageCountDelta;
    }

    if (nextConversation.updated_at > previousConversation.updated_at) {
      return 1;
    }

    return 0;
  }

  return nextConversation.updated_at > previousConversation.updated_at ? 1 : 0;
}

function clampNotificationPreviewText(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 119).trimEnd()}…`;
}

function describeAttachmentType(attachmentTypeRaw: string): string {
  const attachmentType = attachmentTypeRaw.toLowerCase();

  if (attachmentType.includes('image') || attachmentType.includes('photo')) {
    return 'Photo';
  }

  if (attachmentType.includes('gif')) {
    return 'GIF';
  }

  if (attachmentType.includes('video')) {
    return 'Video';
  }

  if (attachmentType.includes('audio') || attachmentType.includes('voice')) {
    return 'Audio recording';
  }

  if (attachmentType.includes('location') || attachmentType.includes('map')) {
    return 'Location';
  }

  if (
    attachmentType.includes('file') ||
    attachmentType.includes('document') ||
    attachmentType.includes('pdf')
  ) {
    return 'File';
  }

  if (
    attachmentType.includes('link') ||
    attachmentType.includes('url') ||
    attachmentType.includes('article')
  ) {
    return 'Link';
  }

  if (attachmentType.includes('emoji')) {
    return 'Emoji';
  }

  return 'Attachment';
}

function getConversationPreviewText(conversation: Conversation): string | null {
  const messageText = conversation.last_message_text?.trim();
  if (messageText) {
    if (MODERATION_REMOVAL_TEXT_PATTERNS.some((pattern) => pattern.test(messageText))) {
      return 'Message removed by moderation';
    }

    return clampNotificationPreviewText(messageText);
  }

  if (conversation.last_message_attachments.length === 0) {
    return null;
  }

  const firstAttachment = conversation.last_message_attachments[0];
  const description = describeAttachmentType(firstAttachment.type ?? '');
  if (conversation.last_message_attachments.length === 1) {
    return description;
  }

  return `${description} +${conversation.last_message_attachments.length - 1} more`;
}

function getNotificationBody(alert: ConversationAlert, showPreview: boolean): string {
  const countBody =
    alert.newMessagesCount === 1
      ? '1 new message'
      : `${alert.newMessagesCount} new messages`;

  if (!showPreview || !alert.previewText) {
    return countBody;
  }

  if (alert.newMessagesCount === 1) {
    return alert.previewText;
  }

  return `${countBody} - ${alert.previewText}`;
}

function buildRecapSummaryAlert(alerts: ConversationAlert[]): ConversationAlert {
  const sortedAlerts = [...alerts].sort(
    (leftAlert, rightAlert) => rightAlert.newMessagesCount - leftAlert.newMessagesCount,
  );
  const primaryAlert = sortedAlerts[0];
  const totalMessages = alerts.reduce(
    (sum, alert) => sum + Math.max(0, alert.newMessagesCount),
    0,
  );
  const highlightedConversationNames = sortedAlerts
    .slice(0, 2)
    .map((alert) => alert.conversationName);
  const remainingConversationCount = Math.max(0, sortedAlerts.length - highlightedConversationNames.length);
  const conversationSummary =
    remainingConversationCount > 0
      ? `${highlightedConversationNames.join(', ')} +${remainingConversationCount} more`
      : highlightedConversationNames.join(', ');

  return {
    conversationId: primaryAlert.conversationId,
    notificationGroupId: 'recap-summary',
    conversationName: alerts.length > 1 ? 'Recap summary' : primaryAlert.conversationName,
    newMessagesCount: totalMessages,
    previewText:
      alerts.length > 1
        ? `Across ${alerts.length} conversations${conversationSummary ? `: ${conversationSummary}` : ''}`
        : primaryAlert.previewText,
  };
}

function mergeConversationAlerts(alerts: ConversationAlert[]): ConversationAlert[] {
  const alertsByConversationId = new Map<string, ConversationAlert>();

  for (const alert of alerts) {
    const existingAlert = alertsByConversationId.get(alert.conversationId);

    if (!existingAlert) {
      alertsByConversationId.set(alert.conversationId, {
        ...alert,
        notificationGroupId: alert.notificationGroupId ?? alert.conversationId,
      });
      continue;
    }

    alertsByConversationId.set(alert.conversationId, {
      ...existingAlert,
      conversationName: alert.conversationName || existingAlert.conversationName,
      newMessagesCount: existingAlert.newMessagesCount + Math.max(0, alert.newMessagesCount),
      previewText: alert.previewText ?? existingAlert.previewText,
      notificationGroupId:
        existingAlert.notificationGroupId ?? alert.notificationGroupId ?? alert.conversationId,
    });
  }

  return Array.from(alertsByConversationId.values());
}

function App() {
  const isSettingsWindow = new URLSearchParams(window.location.search).get('view') === 'settings';
  const shouldRenderDragRegion = window.electron?.platform === 'darwin';
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
  const [lightBackgroundPreset, setLightBackgroundPreset] = useState<LightBackgroundPreset>(() => {
    const storedValue = localStorage.getItem(LIGHT_BG_STORAGE_KEY);
    if (storedValue && VALID_LIGHT_BG_PRESETS.includes(storedValue as LightBackgroundPreset)) {
      return storedValue as LightBackgroundPreset;
    }
    return 'white';
  });
  const [customLightBgColor, setCustomLightBgColor] = useState<string>(() => {
    return normalizeHexColor(localStorage.getItem(CUSTOM_LIGHT_BG_COLOR_STORAGE_KEY));
  });
  const [customDarkBgColor, setCustomDarkBgColor] = useState<string>(() => {
    return normalizeHexColor(localStorage.getItem(CUSTOM_DARK_BG_COLOR_STORAGE_KEY));
  });
  const [darkSurfaceStyle, setDarkSurfaceStyle] = useState<DarkSurfaceStyle>(() => {
    const storedValue = localStorage.getItem(DARK_SURFACE_STORAGE_KEY);
    if (storedValue && VALID_DARK_SURFACE_STYLES.includes(storedValue as DarkSurfaceStyle)) {
      return storedValue as DarkSurfaceStyle;
    }
    return 'default';
  });
  const [customAccentColor, setCustomAccentColor] = useState<string>(() => {
    return normalizeHexColor(localStorage.getItem(CUSTOM_ACCENT_COLOR_STORAGE_KEY));
  });
  const [composerQuickEmojis, setComposerQuickEmojis] = useState<string[]>(() => {
    return parseStoredEmojiList(
      localStorage.getItem(COMPOSER_QUICK_EMOJIS_STORAGE_KEY),
      DEFAULT_COMPOSER_QUICK_EMOJIS,
      MAX_COMPOSER_QUICK_EMOJIS,
    );
  });
  const [reactionQuickEmojis, setReactionQuickEmojis] = useState<string[]>(() => {
    return parseStoredEmojiList(
      localStorage.getItem(REACTION_QUICK_EMOJIS_STORAGE_KEY),
      DEFAULT_REACTION_QUICK_EMOJIS,
      MAX_REACTION_QUICK_EMOJIS,
    );
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
  const [notificationPreviewEnabled, setNotificationPreviewEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(NOTIFICATION_PREVIEW_STORAGE_KEY), false);
  });
  const [recapSummaryModeEnabled, setRecapSummaryModeEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(RECAP_SUMMARY_MODE_STORAGE_KEY), false);
  });
  const [notificationDigestEnabled, setNotificationDigestEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(NOTIFICATION_DIGEST_ENABLED_STORAGE_KEY), false);
  });
  const [notificationDigestWindowMinutes, setNotificationDigestWindowMinutes] = useState<number>(() => {
    return parseNotificationDigestWindowMinutes(
      localStorage.getItem(NOTIFICATION_DIGEST_WINDOW_MINUTES_STORAGE_KEY),
    );
  });
  const [conversationNotificationPreviewOverrides, setConversationNotificationPreviewOverrides] =
    useState<Record<string, ConversationNotificationPreviewOverride>>(() => {
      return parseNotificationPreviewOverrides(
        localStorage.getItem(CONVERSATION_NOTIFICATION_PREVIEW_OVERRIDES_STORAGE_KEY),
      );
    });
  const [systemNotificationsEnabled, setSystemNotificationsEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(SYSTEM_NOTIFICATIONS_STORAGE_KEY), false);
  });
  const [systemNotificationsSupported, setSystemNotificationsSupported] = useState(false);
  const [systemNotificationPermission, setSystemNotificationPermission] = useState<NotificationPermission>('default');
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotificationItem[]>([]);
  const [updateNotice, setUpdateNotice] = useState<UpdateNoticeItem | null>(null);
  const hasSyncedConversationsOnceRef = useRef(false);
  const inAppNotificationTimerIdsRef = useRef<Record<string, number>>({});
  const digestAlertsByConversationIdRef = useRef<Record<string, ConversationAlert>>({});
  const digestFlushTimeoutIdRef = useRef<number | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const seenUpdateNoticeKeysRef = useRef<Record<string, boolean>>({});

  const isUnauthorizedGroupMeError = (error: unknown) => {
    return error instanceof GroupMeApiError && (error.status === 401 || error.status === 403);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (isSettingsWindow) {
      void loadCurrentUser();
      return;
    }

    void loadUserData();
  }, [isAuthenticated, isSettingsWindow]);

  useEffect(() => {
    const unsubscribe = window.electron?.updates?.onStatus((status) => {
      setUpdateStatus(status);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (isSettingsWindow) {
      return;
    }

    if (updateStatus.state !== 'available' && updateStatus.state !== 'downloaded') {
      return;
    }

    const noticeIdentity = `${updateStatus.state}:${updateStatus.version ?? updateStatus.message ?? 'latest'}`;
    if (seenUpdateNoticeKeysRef.current[noticeIdentity]) {
      return;
    }

    seenUpdateNoticeKeysRef.current[noticeIdentity] = true;
    setUpdateNotice({
      id: noticeIdentity,
      state: updateStatus.state,
      version: updateStatus.version,
      title: updateStatus.state === 'downloaded' ? 'Update Ready to Install' : 'Update Available',
      body:
        updateStatus.message ??
        (updateStatus.version
          ? `A new version (v${updateStatus.version}) is available.`
          : 'A new version is available.'),
    });
  }, [isSettingsWindow, updateStatus.message, updateStatus.state, updateStatus.version]);

  useEffect(() => {
    if (updateStatus.state !== 'installing') {
      return;
    }

    setUpdateNotice(null);
  }, [updateStatus.state]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    const syncNotificationSupportAndPermission = async () => {
      const notificationsBridge = window.electron?.notifications;
      if (!notificationsBridge) {
        if (!cancelled) {
          setSystemNotificationsSupported(false);
          setSystemNotificationPermission('denied');
          setSystemNotificationsEnabled(false);
        }
        return;
      }

      try {
        const supported = await notificationsBridge.isSupported();
        if (cancelled) {
          return;
        }

        setSystemNotificationsSupported(supported);

        if (!supported) {
          setSystemNotificationPermission('denied');
          setSystemNotificationsEnabled(false);
          return;
        }

        const permission = await notificationsBridge.getPermission();
        if (cancelled) {
          return;
        }

        setSystemNotificationPermission(permission);
        if (permission !== 'granted' && systemNotificationsEnabled) {
          setSystemNotificationsEnabled(false);
        }
      } catch (error) {
        console.warn('Failed to sync notification status:', error);
        if (!cancelled) {
          setSystemNotificationsSupported(false);
          setSystemNotificationPermission('denied');
          setSystemNotificationsEnabled(false);
        }
      }
    };

    void syncNotificationSupportAndPermission();

    const handleWindowFocus = () => {
      void syncNotificationSupportAndPermission();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [systemNotificationsEnabled]);

  useEffect(() => {
    const unsubscribe = window.electron?.notifications?.onClick((payload) => {
      window.focus();
      if (payload.conversationId) {
        setSelectedConversationId(payload.conversationId);
      }
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (!event.key) {
        return;
      }

      if (event.key === 'groupme_access_token') {
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
        return;
      }

      if (event.key === IN_APP_NOTIFICATIONS_STORAGE_KEY) {
        setInAppNotificationsEnabled(parseStoredBoolean(event.newValue, true));
        return;
      }

      if (event.key === NOTIFICATION_PREVIEW_STORAGE_KEY) {
        setNotificationPreviewEnabled(parseStoredBoolean(event.newValue, false));
        return;
      }

      if (event.key === RECAP_SUMMARY_MODE_STORAGE_KEY) {
        setRecapSummaryModeEnabled(parseStoredBoolean(event.newValue, false));
        return;
      }

      if (event.key === NOTIFICATION_DIGEST_ENABLED_STORAGE_KEY) {
        setNotificationDigestEnabled(parseStoredBoolean(event.newValue, false));
        return;
      }

      if (event.key === NOTIFICATION_DIGEST_WINDOW_MINUTES_STORAGE_KEY) {
        setNotificationDigestWindowMinutes(parseNotificationDigestWindowMinutes(event.newValue));
        return;
      }

      if (event.key === SYSTEM_NOTIFICATIONS_STORAGE_KEY) {
        setSystemNotificationsEnabled(parseStoredBoolean(event.newValue, false));
      }
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
    localStorage.setItem(NOTIFICATION_PREVIEW_STORAGE_KEY, String(notificationPreviewEnabled));
  }, [notificationPreviewEnabled]);

  useEffect(() => {
    localStorage.setItem(RECAP_SUMMARY_MODE_STORAGE_KEY, String(recapSummaryModeEnabled));
  }, [recapSummaryModeEnabled]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_DIGEST_ENABLED_STORAGE_KEY, String(notificationDigestEnabled));
  }, [notificationDigestEnabled]);

  useEffect(() => {
    localStorage.setItem(
      NOTIFICATION_DIGEST_WINDOW_MINUTES_STORAGE_KEY,
      String(notificationDigestWindowMinutes),
    );
  }, [notificationDigestWindowMinutes]);

  useEffect(() => {
    localStorage.setItem(
      CONVERSATION_NOTIFICATION_PREVIEW_OVERRIDES_STORAGE_KEY,
      JSON.stringify(conversationNotificationPreviewOverrides),
    );
  }, [conversationNotificationPreviewOverrides]);

  useEffect(() => {
    localStorage.setItem(SYSTEM_NOTIFICATIONS_STORAGE_KEY, String(systemNotificationsEnabled));
  }, [systemNotificationsEnabled]);

  useEffect(() => {
    localStorage.setItem(COMPOSER_QUICK_EMOJIS_STORAGE_KEY, JSON.stringify(composerQuickEmojis));
  }, [composerQuickEmojis]);

  useEffect(() => {
    localStorage.setItem(REACTION_QUICK_EMOJIS_STORAGE_KEY, JSON.stringify(reactionQuickEmojis));
  }, [reactionQuickEmojis]);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearancePreference);
  }, [appearancePreference]);

  useEffect(() => {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
    document.documentElement.dataset.colorTheme = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    localStorage.setItem(LIGHT_BG_STORAGE_KEY, lightBackgroundPreset);
    if (lightBackgroundPreset === 'white') {
      delete document.documentElement.dataset.lightBg;
    } else {
      document.documentElement.dataset.lightBg = lightBackgroundPreset;
    }
  }, [lightBackgroundPreset]);

  useEffect(() => {
    const normalizedColor = normalizeHexColor(customLightBgColor);
    if (normalizedColor !== customLightBgColor) {
      setCustomLightBgColor(normalizedColor);
      return;
    }

    localStorage.setItem(CUSTOM_LIGHT_BG_COLOR_STORAGE_KEY, normalizedColor);

    const root = document.documentElement;
    if (lightBackgroundPreset !== 'custom') {
      root.style.removeProperty('--light-bg-from');
      root.style.removeProperty('--light-bg-to');
      return;
    }

    const palette = createCustomLightBgPalette(normalizedColor);
    root.style.setProperty('--light-bg-from', palette.bgFrom);
    root.style.setProperty('--light-bg-to', palette.bgTo);
  }, [lightBackgroundPreset, customLightBgColor]);

  useEffect(() => {
    localStorage.setItem(DARK_SURFACE_STORAGE_KEY, darkSurfaceStyle);
    if (darkSurfaceStyle === 'default') {
      delete document.documentElement.dataset.darkSurface;
    } else {
      document.documentElement.dataset.darkSurface = darkSurfaceStyle;
    }
  }, [darkSurfaceStyle]);

  useEffect(() => {
    const normalizedColor = normalizeHexColor(customDarkBgColor);
    if (normalizedColor !== customDarkBgColor) {
      setCustomDarkBgColor(normalizedColor);
      return;
    }

    localStorage.setItem(CUSTOM_DARK_BG_COLOR_STORAGE_KEY, normalizedColor);

    const root = document.documentElement;
    if (darkSurfaceStyle !== 'custom') {
      root.style.removeProperty('--dark-surface-900');
      root.style.removeProperty('--dark-surface-800');
      root.style.removeProperty('--dark-surface-700');
      root.style.removeProperty('--dark-surface-600');
      return;
    }

    const palette = createCustomDarkBgPalette(normalizedColor);
    root.style.setProperty('--dark-surface-900', palette.surface900);
    root.style.setProperty('--dark-surface-800', palette.surface800);
    root.style.setProperty('--dark-surface-700', palette.surface700);
    root.style.setProperty('--dark-surface-600', palette.surface600);
  }, [darkSurfaceStyle, customDarkBgColor]);

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

      if (digestFlushTimeoutIdRef.current !== null) {
        window.clearTimeout(digestFlushTimeoutIdRef.current);
        digestFlushTimeoutIdRef.current = null;
      }

      digestAlertsByConversationIdRef.current = {};
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
    const groupId = alert.notificationGroupId ?? alert.conversationId;
    const body = getNotificationBody(
      alert,
      resolveNotificationPreviewEnabled(
        notificationPreviewEnabled,
        conversationNotificationPreviewOverrides[alert.conversationId],
      ),
    );

    setInAppNotifications((currentNotifications) => {
      const existingNotification = currentNotifications.find(
        (notification) => notification.groupId === groupId,
      );

      const targetNotificationId =
        existingNotification?.id ??
        `${groupId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const nextNotifications = existingNotification
        ? currentNotifications.map((notification) =>
            notification.id === existingNotification.id
              ? {
                  ...notification,
                  conversationId: alert.conversationId,
                  title: alert.conversationName,
                  body,
                }
              : notification,
          )
        : [
            ...currentNotifications,
            {
              id: targetNotificationId,
              groupId,
              conversationId: alert.conversationId,
              title: alert.conversationName,
              body,
            },
          ];

      const trimmedNotifications = nextNotifications.slice(-MAX_IN_APP_NOTIFICATIONS);
      const trimmedNotificationIds = new Set(
        trimmedNotifications.map((notification) => notification.id),
      );

      for (const currentNotification of currentNotifications) {
        if (trimmedNotificationIds.has(currentNotification.id)) {
          continue;
        }

        const timeoutId = inAppNotificationTimerIdsRef.current[currentNotification.id];
        if (!timeoutId) {
          continue;
        }

        window.clearTimeout(timeoutId);
        delete inAppNotificationTimerIdsRef.current[currentNotification.id];
      }

      const existingTimeoutId = inAppNotificationTimerIdsRef.current[targetNotificationId];
      if (existingTimeoutId) {
        window.clearTimeout(existingTimeoutId);
      }

      inAppNotificationTimerIdsRef.current[targetNotificationId] = window.setTimeout(() => {
        dismissInAppNotification(targetNotificationId);
      }, IN_APP_NOTIFICATION_DURATION_MS);

      return trimmedNotifications;
    });
  }, [
    conversationNotificationPreviewOverrides,
    dismissInAppNotification,
    notificationPreviewEnabled,
  ]);

  const sendSystemNotification = useCallback((alert: ConversationAlert) => {
    if (!systemNotificationsSupported || !systemNotificationsEnabled || systemNotificationPermission !== 'granted') {
      return;
    }

    const body = getNotificationBody(
      alert,
      resolveNotificationPreviewEnabled(
        notificationPreviewEnabled,
        conversationNotificationPreviewOverrides[alert.conversationId],
      ),
    );

    void window.electron?.notifications?.show({
      title: alert.conversationName,
      body,
      conversationId: alert.conversationId,
    });
  }, [
    conversationNotificationPreviewOverrides,
    notificationPreviewEnabled,
    systemNotificationsEnabled,
    systemNotificationsSupported,
    systemNotificationPermission,
  ]);

  const dispatchConversationAlerts = useCallback((alerts: ConversationAlert[]) => {
    if (alerts.length === 0) {
      return;
    }

    const groupedAlerts = mergeConversationAlerts(alerts);
    const alertsToEmit =
      recapSummaryModeEnabled && groupedAlerts.length > 1
        ? [buildRecapSummaryAlert(groupedAlerts)]
        : groupedAlerts;

    for (const alert of alertsToEmit) {
      if (inAppNotificationsEnabled) {
        enqueueInAppNotification(alert);
      }

      sendSystemNotification(alert);
    }
  }, [
    enqueueInAppNotification,
    inAppNotificationsEnabled,
    recapSummaryModeEnabled,
    sendSystemNotification,
  ]);

  const flushNotificationDigestBuffer = useCallback(() => {
    if (digestFlushTimeoutIdRef.current !== null) {
      window.clearTimeout(digestFlushTimeoutIdRef.current);
      digestFlushTimeoutIdRef.current = null;
    }

    const bufferedAlerts = Object.values(digestAlertsByConversationIdRef.current);
    digestAlertsByConversationIdRef.current = {};

    if (bufferedAlerts.length === 0) {
      return;
    }

    dispatchConversationAlerts(bufferedAlerts);
  }, [dispatchConversationAlerts]);

  const scheduleNotificationDigestFlush = useCallback(() => {
    if (digestFlushTimeoutIdRef.current !== null) {
      return;
    }

    digestFlushTimeoutIdRef.current = window.setTimeout(() => {
      flushNotificationDigestBuffer();
    }, notificationDigestWindowMinutes * 60 * 1000);
  }, [flushNotificationDigestBuffer, notificationDigestWindowMinutes]);

  useEffect(() => {
    if (!notificationDigestEnabled || digestFlushTimeoutIdRef.current === null) {
      return;
    }

    window.clearTimeout(digestFlushTimeoutIdRef.current);
    digestFlushTimeoutIdRef.current = null;
    scheduleNotificationDigestFlush();
  }, [notificationDigestEnabled, notificationDigestWindowMinutes, scheduleNotificationDigestFlush]);

  const emitConversationAlerts = useCallback((alerts: ConversationAlert[]) => {
    if (alerts.length === 0) {
      return;
    }

    const groupedAlerts = mergeConversationAlerts(alerts);
    if (!notificationDigestEnabled) {
      dispatchConversationAlerts(groupedAlerts);
      return;
    }

    for (const alert of groupedAlerts) {
      const existingBufferedAlert = digestAlertsByConversationIdRef.current[alert.conversationId];

      if (!existingBufferedAlert) {
        digestAlertsByConversationIdRef.current[alert.conversationId] = alert;
        continue;
      }

      digestAlertsByConversationIdRef.current[alert.conversationId] = {
        ...existingBufferedAlert,
        conversationName: alert.conversationName,
        newMessagesCount:
          existingBufferedAlert.newMessagesCount + Math.max(0, alert.newMessagesCount),
        previewText: alert.previewText ?? existingBufferedAlert.previewText,
        notificationGroupId:
          existingBufferedAlert.notificationGroupId ??
          alert.notificationGroupId ??
          alert.conversationId,
      };
    }

    scheduleNotificationDigestFlush();
  }, [
    dispatchConversationAlerts,
    notificationDigestEnabled,
    scheduleNotificationDigestFlush,
  ]);

  const handleToggleInAppNotifications = useCallback((enabled: boolean) => {
    setInAppNotificationsEnabled(enabled);
  }, []);

  const handleToggleNotificationPreview = useCallback((enabled: boolean) => {
    setNotificationPreviewEnabled(enabled);
  }, []);

  const handleToggleRecapSummaryMode = useCallback((enabled: boolean) => {
    setRecapSummaryModeEnabled(enabled);
  }, []);

  const handleToggleNotificationDigest = useCallback((enabled: boolean) => {
    setNotificationDigestEnabled(enabled);

    if (!enabled) {
      flushNotificationDigestBuffer();
    }
  }, [flushNotificationDigestBuffer]);

  const handleChangeNotificationDigestWindowMinutes = useCallback((nextWindowMinutes: number) => {
    setNotificationDigestWindowMinutes(normalizeNotificationDigestWindowMinutes(nextWindowMinutes));
  }, []);

  const handleSetConversationNotificationPreviewMode = useCallback(
    (conversationId: string, nextMode: ConversationNotificationPreviewMode) => {
      setConversationNotificationPreviewOverrides((currentOverrides) => {
        const existingMode = currentOverrides[conversationId];
        if (nextMode === 'default') {
          if (!existingMode) {
            return currentOverrides;
          }

          const nextOverrides = { ...currentOverrides };
          delete nextOverrides[conversationId];
          return nextOverrides;
        }

        if (existingMode === nextMode) {
          return currentOverrides;
        }

        return {
          ...currentOverrides,
          [conversationId]: nextMode,
        };
      });
    },
    [],
  );

  const handleToggleSystemNotifications = useCallback(async (enabled: boolean) => {
    const notificationsBridge = window.electron?.notifications;

    if (!enabled) {
      setSystemNotificationsEnabled(false);
      return;
    }

    if (!notificationsBridge) {
      setSystemNotificationsSupported(false);
      setSystemNotificationPermission('denied');
      setSystemNotificationsEnabled(false);
      return;
    }

    const supported = await notificationsBridge.isSupported();
    setSystemNotificationsSupported(supported);
    if (!supported) {
      setSystemNotificationPermission('denied');
      setSystemNotificationsEnabled(false);
      return;
    }

    let permission = await notificationsBridge.getPermission();
    if (permission !== 'granted') {
      permission = await notificationsBridge.requestPermission();
    }

    setSystemNotificationPermission(permission);
    setSystemNotificationsEnabled(permission === 'granted');
  }, []);

  const handleChangeComposerQuickEmojis = useCallback((nextEmojis: string[]) => {
    setComposerQuickEmojis(
      normalizeStoredEmojiList(
        nextEmojis,
        DEFAULT_COMPOSER_QUICK_EMOJIS,
        MAX_COMPOSER_QUICK_EMOJIS,
      ),
    );
  }, []);

  const handleChangeReactionQuickEmojis = useCallback((nextEmojis: string[]) => {
    setReactionQuickEmojis(
      normalizeStoredEmojiList(
        nextEmojis,
        DEFAULT_REACTION_QUICK_EMOJIS,
        MAX_REACTION_QUICK_EMOJIS,
      ),
    );
  }, []);

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
          const isWindowActive = document.visibilityState === 'visible' && document.hasFocus();
          const shouldSuppressAlertForActiveConversation =
            conversation.id === activeConversationId && isWindowActive;

          if (
            newMessagesCount > 0 &&
            !shouldSuppressAlertForActiveConversation &&
            !mutedConversationIds[conversation.id]
          ) {
            incomingAlerts.push({
              conversationId: conversation.id,
              conversationName: conversation.name,
              newMessagesCount,
              previewText: getConversationPreviewText(conversation),
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

  const loadCurrentUser = async () => {
    try {
      const user = await groupMeService.getMyUser();
      setCurrentUser(user);
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

      console.error('Failed to load current user profile:', error);
    }
  };

  const handleSaveProfile = async (updates: UpdateUserProfileInput) => {
    try {
      const updatedUser = await groupMeService.updateMyUser(updates);
      setCurrentUser(updatedUser);
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
        throw new Error('Session expired. Please sign in again.');
      }

      throw error;
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

    if (digestFlushTimeoutIdRef.current !== null) {
      window.clearTimeout(digestFlushTimeoutIdRef.current);
      digestFlushTimeoutIdRef.current = null;
    }

    digestAlertsByConversationIdRef.current = {};

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
    setUpdateNotice(null);
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

    if (activeFilter === 'unread') {
      return getUnreadCountForConversation(conversation, conversationReadState[conversation.id]) > 0;
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
      counts[conversation.id] = getUnreadCountForConversation(
        conversation,
        conversationReadState[conversation.id],
      );
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

      if (nextFilter === 'unread') {
        return getUnreadCountForConversation(conversation, conversationReadState[conversation.id]) > 0;
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
      <div className="relative h-screen">
        {shouldRenderDragRegion && (
          <div className="drag-region absolute top-0 left-0 right-0 h-8 z-[120]" />
        )}
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-3xl mb-4 shadow-lg animate-pulse">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
            <p className="text-gray-600 dark:text-gray-300">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative h-screen">
        {shouldRenderDragRegion && (
          <div className="drag-region absolute top-0 left-0 right-0 h-8 z-[120]" />
        )}
        <AuthPage
          onAuthenticate={handleAuthenticate}
          onAuthenticateWithOAuth={handleAuthenticateWithOAuth}
          oauthStatusMessage={oauthStatusMessage}
          isOAuthAuthenticating={isOAuthAuthenticating}
        />
      </div>
    );
  }

  if (isSettingsWindow) {
    return (
      <div className="relative h-screen">
        {shouldRenderDragRegion && (
          <div className="drag-region absolute top-0 left-0 right-0 h-8 z-[120]" />
        )}
        <SettingsMenu
          accessToken={accessToken}
          currentUser={currentUser}
          updateStatus={updateStatus}
          onClose={() => window.close()}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
          onOpenLatestRelease={handleOpenLatestRelease}
          onSaveProfile={handleSaveProfile}
          inAppNotificationsEnabled={inAppNotificationsEnabled}
          notificationPreviewEnabled={notificationPreviewEnabled}
          recapSummaryModeEnabled={recapSummaryModeEnabled}
          notificationDigestEnabled={notificationDigestEnabled}
          notificationDigestWindowMinutes={notificationDigestWindowMinutes}
          systemNotificationsEnabled={systemNotificationsEnabled}
          systemNotificationsSupported={systemNotificationsSupported}
          systemNotificationPermission={systemNotificationPermission}
          onToggleInAppNotifications={handleToggleInAppNotifications}
          onToggleNotificationPreview={handleToggleNotificationPreview}
          onToggleRecapSummaryMode={handleToggleRecapSummaryMode}
          onToggleNotificationDigest={handleToggleNotificationDigest}
          onChangeNotificationDigestWindowMinutes={handleChangeNotificationDigestWindowMinutes}
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
          lightBackgroundPreset={lightBackgroundPreset}
          onChangeLightBackgroundPreset={setLightBackgroundPreset}
          customLightBgColor={customLightBgColor}
          onChangeCustomLightBgColor={setCustomLightBgColor}
          colorTheme={colorTheme}
          onChangeColorTheme={setColorTheme}
          darkSurfaceStyle={darkSurfaceStyle}
          onChangeDarkSurfaceStyle={setDarkSurfaceStyle}
          customDarkBgColor={customDarkBgColor}
          onChangeCustomDarkBgColor={setCustomDarkBgColor}
          customAccentColor={customAccentColor}
          onChangeCustomAccentColor={setCustomAccentColor}
          composerQuickEmojis={composerQuickEmojis}
          reactionQuickEmojis={reactionQuickEmojis}
          onChangeComposerQuickEmojis={handleChangeComposerQuickEmojis}
          onChangeReactionQuickEmojis={handleChangeReactionQuickEmojis}
          standalone
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {shouldRenderDragRegion && (
        <div className="drag-region absolute top-0 left-0 right-0 h-8 z-[120]" />
      )}
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
              quickComposerEmojis={composerQuickEmojis}
              quickReactionEmojis={reactionQuickEmojis}
              isConversationMuted={Boolean(mutedConversationIds[activeConversation.id])}
              onToggleConversationMute={() => {
                handleToggleConversationMute(activeConversation.id);
              }}
              notificationPreviewMode={
                conversationNotificationPreviewOverrides[activeConversation.id] ?? 'default'
              }
              onSetNotificationPreviewMode={(nextMode) => {
                handleSetConversationNotificationPreviewMode(activeConversation.id, nextMode);
              }}
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

      {updateNotice && (
        <div className="fixed right-4 top-14 z-[96] w-[min(420px,94vw)] pointer-events-none">
          <div className="pointer-events-auto rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/95 dark:bg-blue-950/85 backdrop-blur-xl shadow-xl px-3 py-2.5">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{updateNotice.title}</p>
            <p className="text-xs text-blue-800/90 dark:text-blue-200/90 mt-0.5">{updateNotice.body}</p>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                onClick={() => {
                  if (updateNotice.state === 'downloaded') {
                    void handleInstallUpdate();
                    return;
                  }

                  setShowInlineSettingsFallback(true);
                }}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                {updateNotice.state === 'downloaded' ? 'Install now' : 'Open updates'}
              </button>
              <button
                onClick={() => {
                  void handleOpenLatestRelease();
                }}
                className="px-2 py-1 rounded-md text-[11px] font-semibold border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-blue-100/80 dark:hover:bg-blue-900/60"
              >
                Release notes
              </button>
              <button
                onClick={() => setUpdateNotice(null)}
                className="px-2 py-1 rounded-md text-[11px] font-semibold border border-transparent text-blue-700 dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-900/50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {inAppNotificationsEnabled && inAppNotifications.length > 0 && (
        <div
          className={`fixed right-4 ${updateNotice ? 'top-44' : 'top-14'} z-[95] w-[min(360px,92vw)] space-y-2 pointer-events-none`}
        >
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
          currentUser={currentUser}
          updateStatus={updateStatus}
          onClose={() => setShowInlineSettingsFallback(false)}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
          onOpenLatestRelease={handleOpenLatestRelease}
          onSaveProfile={handleSaveProfile}
          inAppNotificationsEnabled={inAppNotificationsEnabled}
          notificationPreviewEnabled={notificationPreviewEnabled}
          recapSummaryModeEnabled={recapSummaryModeEnabled}
          notificationDigestEnabled={notificationDigestEnabled}
          notificationDigestWindowMinutes={notificationDigestWindowMinutes}
          systemNotificationsEnabled={systemNotificationsEnabled}
          systemNotificationsSupported={systemNotificationsSupported}
          systemNotificationPermission={systemNotificationPermission}
          onToggleInAppNotifications={handleToggleInAppNotifications}
          onToggleNotificationPreview={handleToggleNotificationPreview}
          onToggleRecapSummaryMode={handleToggleRecapSummaryMode}
          onToggleNotificationDigest={handleToggleNotificationDigest}
          onChangeNotificationDigestWindowMinutes={handleChangeNotificationDigestWindowMinutes}
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
          lightBackgroundPreset={lightBackgroundPreset}
          onChangeLightBackgroundPreset={setLightBackgroundPreset}
          customLightBgColor={customLightBgColor}
          onChangeCustomLightBgColor={setCustomLightBgColor}
          colorTheme={colorTheme}
          onChangeColorTheme={setColorTheme}
          darkSurfaceStyle={darkSurfaceStyle}
          onChangeDarkSurfaceStyle={setDarkSurfaceStyle}
          customDarkBgColor={customDarkBgColor}
          onChangeCustomDarkBgColor={setCustomDarkBgColor}
          customAccentColor={customAccentColor}
          onChangeCustomAccentColor={setCustomAccentColor}
          composerQuickEmojis={composerQuickEmojis}
          reactionQuickEmojis={reactionQuickEmojis}
          onChangeComposerQuickEmojis={handleChangeComposerQuickEmojis}
          onChangeReactionQuickEmojis={handleChangeReactionQuickEmojis}
        />
      )}
    </div>
  );
}

export default App;
