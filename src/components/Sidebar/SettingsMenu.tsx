import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clipboard,
  Coffee,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Laptop,
  Loader2,
  LucideIcon,
  Palette,
  Moon,
  LogOut,
  Download,
  Trash2,
  RefreshCw,
  Settings2,
  Sun,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { AppearancePreference, ColorTheme, DarkSurfaceStyle, LightBackgroundPreset } from '../../App';
import type {
  UpdateUserProfileInput,
  User,
} from '../../services/groupme';
import { Avatar } from '../Common/Avatar';
import buyMeACoffeeQr from '../../assets/support/buy-me-a-coffee-qr.png';

interface SettingsMenuProps {
  accessToken: string | null;
  currentUser: User | null;
  updateStatus: UpdateStatusPayload;
  inAppNotificationsEnabled: boolean;
  notificationPreviewEnabled: boolean;
  recapSummaryModeEnabled: boolean;
  notificationDigestEnabled: boolean;
  notificationDigestWindowMinutes: number;
  systemNotificationsEnabled: boolean;
  systemNotificationsSupported: boolean;
  systemNotificationPermission: NotificationPermission;
  appearancePreference: AppearancePreference;
  lightBackgroundPreset: LightBackgroundPreset;
  customLightBgColor: string;
  colorTheme: ColorTheme;
  darkSurfaceStyle: DarkSurfaceStyle;
  customDarkBgColor: string;
  customAccentColor: string;
  composerQuickEmojis: string[];
  reactionQuickEmojis: string[];
  onClose: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onOpenLatestRelease: () => void;
  onSaveProfile: (updates: UpdateUserProfileInput) => Promise<void>;
  onToggleInAppNotifications: (enabled: boolean) => void;
  onToggleNotificationPreview: (enabled: boolean) => void;
  onToggleRecapSummaryMode: (enabled: boolean) => void;
  onToggleNotificationDigest: (enabled: boolean) => void;
  onChangeNotificationDigestWindowMinutes: (minutes: number) => void;
  onToggleSystemNotifications: (enabled: boolean) => void;
  onSignOut: () => void;
  onDeleteToken: () => void;
  onChangeAppearance: (nextPreference: AppearancePreference) => void;
  onChangeLightBackgroundPreset: (nextPreset: LightBackgroundPreset) => void;
  onChangeCustomLightBgColor: (nextColor: string) => void;
  onChangeColorTheme: (nextTheme: ColorTheme) => void;
  onChangeDarkSurfaceStyle: (nextStyle: DarkSurfaceStyle) => void;
  onChangeCustomDarkBgColor: (nextColor: string) => void;
  onChangeCustomAccentColor: (nextColor: string) => void;
  onChangeComposerQuickEmojis: (nextEmojis: string[]) => void;
  onChangeReactionQuickEmojis: (nextEmojis: string[]) => void;
  standalone?: boolean;
}

const MAX_COMPOSER_DEFAULT_EMOJIS = 16;
const MAX_REACTION_DEFAULT_EMOJIS = 12;

function parseEmojiListInput(rawInput: string, maxCount: number): string[] {
  return Array.from(
    new Set(
      rawInput
        .split(/[\s,]+/u)
        .map((emojiToken) => emojiToken.trim())
        .filter((emojiToken) => emojiToken.length > 0),
    ),
  ).slice(0, maxCount);
}

export function SettingsMenu({
  accessToken,
  currentUser,
  updateStatus,
  inAppNotificationsEnabled,
  notificationPreviewEnabled,
  recapSummaryModeEnabled,
  notificationDigestEnabled,
  notificationDigestWindowMinutes,
  systemNotificationsEnabled,
  systemNotificationsSupported,
  systemNotificationPermission,
  appearancePreference,
  lightBackgroundPreset,
  customLightBgColor,
  colorTheme,
  darkSurfaceStyle,
  customDarkBgColor,
  customAccentColor,
  composerQuickEmojis,
  reactionQuickEmojis,
  onClose,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenLatestRelease,
  onSaveProfile,
  onToggleInAppNotifications,
  onToggleNotificationPreview,
  onToggleRecapSummaryMode,
  onToggleNotificationDigest,
  onChangeNotificationDigestWindowMinutes,
  onToggleSystemNotifications,
  onSignOut,
  onDeleteToken,
  onChangeAppearance,
  onChangeLightBackgroundPreset,
  onChangeCustomLightBgColor,
  onChangeColorTheme,
  onChangeDarkSurfaceStyle,
  onChangeCustomDarkBgColor,
  onChangeCustomAccentColor,
  onChangeComposerQuickEmojis,
  onChangeReactionQuickEmojis,
  standalone = false,
}: SettingsMenuProps) {
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [confirmDeleteToken, setConfirmDeleteToken] = useState(false);
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState<Date | null>(null);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileEmailDraft, setProfileEmailDraft] = useState('');
  const [profileAvatarUrlDraft, setProfileAvatarUrlDraft] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [composerQuickEmojisDraft, setComposerQuickEmojisDraft] = useState('');
  const [reactionQuickEmojisDraft, setReactionQuickEmojisDraft] = useState('');
  const [emojiDefaultsMessage, setEmojiDefaultsMessage] = useState<string | null>(null);
  const [emojiDefaultsError, setEmojiDefaultsError] = useState<string | null>(null);

  const isCheckingUpdates = updateStatus.state === 'checking';
  const isDownloadingUpdate = updateStatus.state === 'downloading';
  const isInstallingUpdate = updateStatus.state === 'installing';
  const canCheckForUpdates = !isCheckingUpdates && !isInstallingUpdate;
  const canInstallUpdate = updateStatus.state === 'downloaded' && !isInstallingUpdate;

  const updateStatePresentation = useMemo<{
    icon: LucideIcon;
    iconClassName: string;
    message: string;
  }>(() => {
    switch (updateStatus.state) {
      case 'checking':
        return {
          icon: Loader2,
          iconClassName: 'text-blue-500 animate-spin',
          message: 'Checking for updates...',
        };
      case 'available':
        return {
          icon: Info,
          iconClassName: 'text-blue-500',
          message:
            updateStatus.message ??
            (updateStatus.version
              ? `Update v${updateStatus.version} found. Downloading now...`
              : 'Update found. Downloading now...'),
        };
      case 'downloading':
        return {
          icon: Download,
          iconClassName: 'text-blue-500',
          message: `Downloading update${
            typeof updateStatus.progress === 'number'
              ? ` (${Math.round(updateStatus.progress)}%)`
              : '...'
          }`,
        };
      case 'downloaded':
        return {
          icon: CheckCircle2,
          iconClassName: 'text-emerald-500',
          message:
            updateStatus.message ??
            (updateStatus.version
              ? `Update v${updateStatus.version} is ready to install.`
              : 'Update is ready to install.'),
        };
      case 'not-available':
        return {
          icon: CheckCircle2,
          iconClassName: 'text-emerald-500',
          message: updateStatus.message ?? 'You already have the latest version installed.',
        };
      case 'installing':
        return {
          icon: Loader2,
          iconClassName: 'text-blue-500 animate-spin',
          message: updateStatus.message ?? 'Installing update and restarting...',
        };
      case 'error':
        return {
          icon: AlertTriangle,
          iconClassName: 'text-rose-500',
          message: updateStatus.message ?? 'Update check failed. Try again.',
        };
      case 'idle':
      default:
        return {
          icon: Info,
          iconClassName: 'text-gray-500 dark:text-gray-300',
          message: updateStatus.message ?? 'Click the refresh icon to check for updates.',
        };
    }
  }, [updateStatus]);

  useEffect(() => {
    if (
      updateStatus.state === 'available' ||
      updateStatus.state === 'not-available' ||
      updateStatus.state === 'downloaded' ||
      updateStatus.state === 'error'
    ) {
      setLastUpdateCheckAt(new Date());
    }
  }, [updateStatus.state]);

  const UpdateStateIcon = updateStatePresentation.icon;
  const systemNotificationsStatusMessage = !systemNotificationsSupported
    ? 'System notifications are not supported on this device.'
    : systemNotificationPermission === 'denied'
      ? 'System notification permission is blocked. Enable it in your OS settings.'
      : systemNotificationPermission === 'default'
        ? 'Enable to request permission and show OS notifications for new messages.'
        : 'System notifications are enabled.';

  const themeOptions: Array<{ key: ColorTheme; label: string; swatchHex?: string }> = [
    { key: 'blue', label: 'Ocean', swatchHex: '#3b82f6' },
    { key: 'emerald', label: 'Forest', swatchHex: '#10b981' },
    { key: 'rose', label: 'Rose', swatchHex: '#f43f5e' },
    { key: 'amber', label: 'Amber', swatchHex: '#f59e0b' },
    { key: 'custom', label: 'Custom' },
  ];

  useEffect(() => {
    setProfileNameDraft(currentUser?.name ?? '');
    setProfileEmailDraft(currentUser?.email ?? '');
    setProfileAvatarUrlDraft(currentUser?.avatar_url ?? '');
    setProfileSaveError(null);
  }, [currentUser]);

  useEffect(() => {
    setComposerQuickEmojisDraft(composerQuickEmojis.join(' '));
    setReactionQuickEmojisDraft(reactionQuickEmojis.join(' '));
  }, [composerQuickEmojis, reactionQuickEmojis]);

  const profileUpdatePayload = useMemo<UpdateUserProfileInput>(() => {
    if (!currentUser) {
      return {};
    }

    const nextPayload: UpdateUserProfileInput = {};

    const currentName = currentUser.name.trim();
    const currentEmail = currentUser.email.trim();
    const currentAvatarUrl = (currentUser.avatar_url ?? '').trim();
    const nextName = profileNameDraft.trim();
    const nextEmail = profileEmailDraft.trim();
    const nextAvatarUrl = profileAvatarUrlDraft.trim();

    if (nextName !== currentName) {
      nextPayload.name = nextName;
    }

    if (nextEmail !== currentEmail) {
      nextPayload.email = nextEmail;
    }

    if (nextAvatarUrl !== currentAvatarUrl) {
      nextPayload.avatar_url = nextAvatarUrl;
    }

    return nextPayload;
  }, [currentUser, profileAvatarUrlDraft, profileEmailDraft, profileNameDraft]);

  const hasProfileChanges = useMemo(() => {
    return Object.keys(profileUpdatePayload).length > 0;
  }, [profileUpdatePayload]);

  const handleResetProfileDraft = () => {
    if (!currentUser) {
      return;
    }

    setProfileNameDraft(currentUser.name);
    setProfileEmailDraft(currentUser.email);
    setProfileAvatarUrlDraft(currentUser.avatar_url ?? '');
    setProfileSaveMessage(null);
    setProfileSaveError(null);
  };

  const handleSaveProfile = async () => {
    if (!currentUser || isSavingProfile) {
      return;
    }

    if (!hasProfileChanges) {
      setProfileSaveMessage('No profile changes to save.');
      setProfileSaveError(null);
      return;
    }

    if (typeof profileUpdatePayload.name === 'string' && !profileUpdatePayload.name.trim()) {
      setProfileSaveError('Name cannot be empty.');
      setProfileSaveMessage(null);
      return;
    }

    if (typeof profileUpdatePayload.email === 'string' && !profileUpdatePayload.email.trim()) {
      setProfileSaveError('Email cannot be empty.');
      setProfileSaveMessage(null);
      return;
    }

    if (
      typeof profileUpdatePayload.avatar_url === 'string' &&
      profileUpdatePayload.avatar_url.length > 0 &&
      !/^https?:\/\//i.test(profileUpdatePayload.avatar_url)
    ) {
      setProfileSaveError('Avatar URL must start with http:// or https://');
      setProfileSaveMessage(null);
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);
    setProfileSaveMessage(null);

    try {
      await onSaveProfile(profileUpdatePayload);
      setProfileSaveMessage('Profile updated successfully.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile.';
      setProfileSaveError(errorMessage);
      setProfileSaveMessage(null);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCopyToken = async () => {
    if (!accessToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(accessToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1500);
    } catch (error) {
      console.error('Failed to copy token:', error);
    }
  };

  const handleSaveEmojiDefaults = () => {
    const nextComposerEmojis = parseEmojiListInput(
      composerQuickEmojisDraft,
      MAX_COMPOSER_DEFAULT_EMOJIS,
    );
    const nextReactionEmojis = parseEmojiListInput(
      reactionQuickEmojisDraft,
      MAX_REACTION_DEFAULT_EMOJIS,
    );

    if (nextComposerEmojis.length === 0) {
      setEmojiDefaultsError('Add at least one quick composer emoji.');
      setEmojiDefaultsMessage(null);
      return;
    }

    if (nextReactionEmojis.length === 0) {
      setEmojiDefaultsError('Add at least one quick reaction emoji.');
      setEmojiDefaultsMessage(null);
      return;
    }

    onChangeComposerQuickEmojis(nextComposerEmojis);
    onChangeReactionQuickEmojis(nextReactionEmojis);
    setComposerQuickEmojisDraft(nextComposerEmojis.join(' '));
    setReactionQuickEmojisDraft(nextReactionEmojis.join(' '));
    setEmojiDefaultsError(null);
    setEmojiDefaultsMessage('Emoji defaults saved.');
  };

  return (
    <div
      className={
        standalone
          ? 'h-screen w-screen p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-gray-900'
          : 'fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4'
      }
    >
      <div className={`relative rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col ${standalone ? 'h-full w-full' : 'w-[min(1120px,96vw)] h-[min(860px,92vh)]'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-gray-700 dark:text-gray-200" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
            title="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 flex-1 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Appearance</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onChangeAppearance('light')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  appearancePreference === 'light'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light
              </button>
              <button
                onClick={() => onChangeAppearance('dark')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  appearancePreference === 'dark'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
              <button
                onClick={() => onChangeAppearance('system')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  appearancePreference === 'system'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                <Laptop className="w-4 h-4" />
                System
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Light Background</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Applies when light mode is active.</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'white' as const, label: 'White', swatch: '#f9fafb' },
                { key: 'cream' as const, label: 'Cream', swatch: '#faf7f2' },
                { key: 'sky' as const, label: 'Sky', swatch: '#e4edfc' },
                { key: 'mint' as const, label: 'Mint', swatch: '#e2f5e9' },
                { key: 'blush' as const, label: 'Blush', swatch: '#f9e4ea' },
                { key: 'custom' as const, label: 'Custom' },
              ]).map((option) => {
                const selected = lightBackgroundPreset === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => onChangeLightBackgroundPreset(option.key)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                    }`}
                  >
                    {option.key === 'custom' ? (
                      <span
                        className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500"
                        style={{ backgroundColor: customLightBgColor }}
                      />
                    ) : (
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: option.swatch }}
                      />
                    )}
                    {option.label}
                  </button>
                );
              })}
            </div>
            {lightBackgroundPreset === 'custom' && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 p-2">
                <label htmlFor="custom-light-bg-color" className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Pick background
                </label>
                <input
                  id="custom-light-bg-color"
                  type="color"
                  value={customLightBgColor}
                  onChange={(event) => onChangeCustomLightBgColor(event.target.value)}
                  className="h-8 w-10 rounded border border-gray-300 dark:border-gray-500 bg-transparent p-0 cursor-pointer"
                  title="Choose custom light background color"
                />
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Dark Background</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Applies when dark mode is active.</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'default' as const, label: 'Slate', swatch: '#1e293b' },
                { key: 'black' as const, label: 'Black', swatch: '#000000' },
                { key: 'charcoal' as const, label: 'Charcoal', swatch: '#171717' },
                { key: 'ocean' as const, label: 'Ocean', swatch: '#0a1a1f' },
                { key: 'plum' as const, label: 'Plum', swatch: '#150a1e' },
                { key: 'custom' as const, label: 'Custom' },
              ]).map((option) => {
                const selected = darkSurfaceStyle === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => onChangeDarkSurfaceStyle(option.key)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                    }`}
                  >
                    {option.key === 'custom' ? (
                      <span
                        className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500"
                        style={{ backgroundColor: customDarkBgColor }}
                      />
                    ) : (
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: option.swatch }}
                      />
                    )}
                    {option.label}
                  </button>
                );
              })}
            </div>
            {darkSurfaceStyle === 'custom' && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 p-2">
                <label htmlFor="custom-dark-bg-color" className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Pick background
                </label>
                <input
                  id="custom-dark-bg-color"
                  type="color"
                  value={customDarkBgColor}
                  onChange={(event) => onChangeCustomDarkBgColor(event.target.value)}
                  className="h-8 w-10 rounded border border-gray-300 dark:border-gray-500 bg-transparent p-0 cursor-pointer"
                  title="Choose custom dark background color"
                />
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-gray-500 dark:text-gray-300" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Color Theme</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {themeOptions.map((themeOption) => {
                const selected = colorTheme === themeOption.key;

                return (
                  <button
                    key={themeOption.key}
                    onClick={() => onChangeColorTheme(themeOption.key)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                    }`}
                  >
                    {themeOption.key === 'custom' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)' }}
                          title="Custom palette"
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500"
                          style={{ backgroundColor: customAccentColor }}
                          title="Current custom color"
                        />
                      </span>
                    ) : (
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: themeOption.swatchHex }}
                      />
                    )}
                    {themeOption.label}
                  </button>
                );
              })}
            </div>
            {colorTheme === 'custom' && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 p-2">
                <label htmlFor="custom-theme-color" className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Pick accent
                </label>
                <input
                  id="custom-theme-color"
                  type="color"
                  value={customAccentColor}
                  onChange={(event) => onChangeCustomAccentColor(event.target.value)}
                  className="h-8 w-10 rounded border border-gray-300 dark:border-gray-500 bg-transparent p-0 cursor-pointer"
                  title="Choose custom theme color"
                />
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Emoji Defaults</h3>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3 space-y-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Composer quick emojis (space or comma separated)
                </span>
                <input
                  type="text"
                  value={composerQuickEmojisDraft}
                  onChange={(event) => {
                    setComposerQuickEmojisDraft(event.target.value);
                    setEmojiDefaultsError(null);
                    setEmojiDefaultsMessage(null);
                  }}
                  placeholder="😀 😂 ❤️ 👍"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Reaction quick emojis (space or comma separated)
                </span>
                <input
                  type="text"
                  value={reactionQuickEmojisDraft}
                  onChange={(event) => {
                    setReactionQuickEmojisDraft(event.target.value);
                    setEmojiDefaultsError(null);
                    setEmojiDefaultsMessage(null);
                  }}
                  placeholder="👍 ❤️ 😂 🔥 😮 😢"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                />
              </label>

              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Quick composer list shows in the Emoji menu. Quick reaction list shows when you click React on a message.
              </p>

              {emojiDefaultsError && (
                <p className="text-xs text-rose-600 dark:text-rose-300">{emojiDefaultsError}</p>
              )}

              {emojiDefaultsMessage && (
                <p className="text-xs text-emerald-600 dark:text-emerald-300">{emojiDefaultsMessage}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposerQuickEmojisDraft(composerQuickEmojis.join(' '));
                    setReactionQuickEmojisDraft(reactionQuickEmojis.join(' '));
                    setEmojiDefaultsError(null);
                    setEmojiDefaultsMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleSaveEmojiDefaults}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  Save emoji defaults
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Access Token</h3>
            <div className="flex items-center gap-2">
              <input
                type={tokenVisible ? 'text' : 'password'}
                readOnly
                value={accessToken ?? ''}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
              />
              <button
                onClick={() => setTokenVisible((visible) => !visible)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                title={tokenVisible ? 'Hide token' : 'Reveal token'}
              >
                {tokenVisible ? <EyeOff className="w-4 h-4 text-gray-700 dark:text-gray-200" /> : <Eye className="w-4 h-4 text-gray-700 dark:text-gray-200" />}
              </button>
              <button
                onClick={handleCopyToken}
                disabled={!accessToken}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium hover:bg-gray-900 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {copiedToken ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                {copiedToken ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => setConfirmDeleteToken(true)}
                disabled={!accessToken}
                className="p-2 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-50"
                title="Delete saved token"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {confirmDeleteToken && (
              <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3 space-y-2">
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Deleting your access token will log you out. You'll need to sign in again.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setConfirmDeleteToken(false);
                      onDeleteToken();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
                  >
                    Delete and log out
                  </button>
                  <button
                    onClick={() => setConfirmDeleteToken(false)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Profile</h3>

            {currentUser ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={profileAvatarUrlDraft.trim() || null}
                    alt={profileNameDraft || currentUser.name}
                    className="w-11 h-11 rounded-full object-cover"
                    fallback={
                      <div className="w-11 h-11 rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white font-semibold text-base">
                          {(profileNameDraft || currentUser.name).trim().charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {profileNameDraft.trim() || 'Unnamed user'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {profileEmailDraft.trim() || 'No email on file'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Name</span>
                    <input
                      type="text"
                      value={profileNameDraft}
                      onChange={(event) => {
                        setProfileNameDraft(event.target.value);
                        setProfileSaveMessage(null);
                        setProfileSaveError(null);
                      }}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Email</span>
                    <input
                      type="email"
                      value={profileEmailDraft}
                      onChange={(event) => {
                        setProfileEmailDraft(event.target.value);
                        setProfileSaveMessage(null);
                        setProfileSaveError(null);
                      }}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Avatar URL</span>
                  <input
                    type="url"
                    value={profileAvatarUrlDraft}
                    onChange={(event) => {
                      setProfileAvatarUrlDraft(event.target.value);
                      setProfileSaveMessage(null);
                      setProfileSaveError(null);
                    }}
                    placeholder="https://example.com/avatar.png"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                  />
                </label>

                {profileSaveError && (
                  <p className="text-xs text-rose-600 dark:text-rose-300">{profileSaveError}</p>
                )}

                {profileSaveMessage && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-300">{profileSaveMessage}</p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleResetProfileDraft}
                    disabled={!hasProfileChanges || isSavingProfile}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => {
                      void handleSaveProfile();
                    }}
                    disabled={!hasProfileChanges || isSavingProfile}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isSavingProfile ? 'Saving...' : 'Save profile'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Profile details are unavailable right now. Try reopening settings.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Notifications</h3>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 px-3 py-2.5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">In-app notifications</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Show toast alerts inside GroupUs when new messages arrive.
                  </p>
                </div>
                <button
                  onClick={() => onToggleInAppNotifications(!inAppNotificationsEnabled)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    inAppNotificationsEnabled
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {inAppNotificationsEnabled ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Message previews</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Include message content in notification bodies. Turn off for privacy.
                  </p>
                </div>
                <button
                  onClick={() => onToggleNotificationPreview(!notificationPreviewEnabled)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    notificationPreviewEnabled
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {notificationPreviewEnabled ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Recap summary mode</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Bundle simultaneous conversation alerts into a single summary notification.
                  </p>
                </div>
                <button
                  onClick={() => onToggleRecapSummaryMode(!recapSummaryModeEnabled)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    recapSummaryModeEnabled
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {recapSummaryModeEnabled ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Notification digest</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Group bursts of alerts and deliver them together after a short window.
                  </p>
                </div>
                <button
                  onClick={() => onToggleNotificationDigest(!notificationDigestEnabled)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    notificationDigestEnabled
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {notificationDigestEnabled ? 'On' : 'Off'}
                </button>
              </div>

              {notificationDigestEnabled && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Digest window</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Hold alerts for this many minutes before flushing grouped notifications.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 p-1">
                    {[1, 3, 5, 10].map((windowMinutesOption) => (
                      <button
                        key={windowMinutesOption}
                        type="button"
                        onClick={() => onChangeNotificationDigestWindowMinutes(windowMinutesOption)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold ${
                          notificationDigestWindowMinutes === windowMinutesOption
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {windowMinutesOption}m
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">System notifications</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Show operating system notifications for new messages.
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    {systemNotificationsStatusMessage}
                  </p>
                </div>
                <button
                  onClick={() => {
                    void onToggleSystemNotifications(!systemNotificationsEnabled);
                  }}
                  disabled={!systemNotificationsSupported}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    systemNotificationsEnabled
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {systemNotificationsEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">App Updates</h3>
              <button
                onClick={onCheckForUpdates}
                disabled={!canCheckForUpdates}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Check for updates"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-700 dark:text-gray-200 ${
                    isCheckingUpdates ? 'animate-spin' : ''
                  }`}
                />
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 px-3 py-2">
              <div className="flex items-start gap-2">
                <UpdateStateIcon className={`w-4 h-4 mt-0.5 ${updateStatePresentation.iconClassName}`} />
                <div className="min-w-0">
                  {updateStatus.state === 'error' && updateStatus.version && window.electron?.platform === 'darwin' ? (
                    <>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        v{updateStatus.version} available
                        <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                          - Auto-install is unavailable on this macOS build.
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-200">{updateStatePresentation.message}</p>
                  )}
                  {lastUpdateCheckAt && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Last checked: {lastUpdateCheckAt.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {canInstallUpdate && (
              <button
                onClick={onInstallUpdate}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Install update and restart
              </button>
            )}

            {isInstallingUpdate && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                The app will close automatically to complete installation.
              </p>
            )}

            {window.electron?.platform === 'darwin' && (
              <div className="rounded-lg border border-blue-200/60 dark:border-blue-700/40 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300">macOS note</p>
                <p className="mt-0.5 text-xs text-blue-700/90 dark:text-blue-400/80">
                  Apple requires a $99/year developer membership to code-sign apps. Since GroupUs is a free
                  project, the app isn't signed, which means macOS will ask you to manually allow it.
                  To update, download the latest release, replace
                  the app in your Applications folder, and
                  run: <code className="px-1 py-0.5 rounded bg-blue-100/80 dark:bg-blue-900/40 text-[11px] font-mono">xattr -dr com.apple.quarantine /Applications/GroupUs.app</code>
                </p>
              </div>
            )}

            <button
              onClick={onOpenLatestRelease}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ExternalLink className="w-4 h-4" />
              Get latest from GitHub
            </button>

            {isDownloadingUpdate && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Download is in progress. Install becomes available once complete.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Coffee className="w-4 h-4 text-gray-500 dark:text-gray-300" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Support Me!</h3>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <img
                  src={buyMeACoffeeQr}
                  alt="Buy Me a Coffee QR code"
                  className="w-36 h-36 rounded-lg border border-gray-200 dark:border-gray-600 bg-white object-cover"
                />
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Scan the QR code to support me, or open the link directly.
                  </p>
                  <a
                    href="https://buymeacoffee.com/kpulik"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#ffdd00] text-gray-900 text-sm font-semibold hover:brightness-95"
                  >
                    <Coffee className="w-4 h-4" />
                    Buy Me a Coffee
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium hover:bg-gray-900 dark:hover:bg-gray-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
