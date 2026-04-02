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
import type { AppearancePreference, ColorTheme, DarkSurfaceStyle } from '../../App';
import buyMeACoffeeQr from '../../assets/support/buy-me-a-coffee-qr.png';

interface SettingsMenuProps {
  accessToken: string | null;
  updateStatus: UpdateStatusPayload;
  inAppNotificationsEnabled: boolean;
  systemNotificationsEnabled: boolean;
  systemNotificationsSupported: boolean;
  systemNotificationPermission: NotificationPermission;
  appearancePreference: AppearancePreference;
  colorTheme: ColorTheme;
  darkSurfaceStyle: DarkSurfaceStyle;
  customAccentColor: string;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onOpenLatestRelease: () => void;
  onToggleInAppNotifications: (enabled: boolean) => void;
  onToggleSystemNotifications: (enabled: boolean) => void;
  onSignOut: () => void;
  onDeleteToken: () => void;
  onChangeAppearance: (nextPreference: AppearancePreference) => void;
  onChangeColorTheme: (nextTheme: ColorTheme) => void;
  onChangeDarkSurfaceStyle: (nextStyle: DarkSurfaceStyle) => void;
  onChangeCustomAccentColor: (nextColor: string) => void;
  standalone?: boolean;
}

export function SettingsMenu({
  accessToken,
  updateStatus,
  inAppNotificationsEnabled,
  systemNotificationsEnabled,
  systemNotificationsSupported,
  systemNotificationPermission,
  appearancePreference,
  colorTheme,
  darkSurfaceStyle,
  customAccentColor,
  onClose,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenLatestRelease,
  onToggleInAppNotifications,
  onToggleSystemNotifications,
  onSignOut,
  onDeleteToken,
  onChangeAppearance,
  onChangeColorTheme,
  onChangeDarkSurfaceStyle,
  onChangeCustomAccentColor,
  standalone = false,
}: SettingsMenuProps) {
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [confirmDeleteToken, setConfirmDeleteToken] = useState(false);
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState<Date | null>(null);

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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Dark Surface</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Applies when dark mode is active.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChangeDarkSurfaceStyle('default')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  darkSurfaceStyle === 'default'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                Dark Blue
              </button>
              <button
                onClick={() => onChangeDarkSurfaceStyle('black')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  darkSurfaceStyle === 'black'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                Pure Black (OLED)
              </button>
            </div>
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
                  <p className="text-sm text-gray-700 dark:text-gray-200">{updateStatePresentation.message}</p>
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
