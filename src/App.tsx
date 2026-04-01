import { useEffect, useMemo, useState } from 'react';
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
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== 'groupme_access_token') {
        return;
      }

      if (!event.newValue) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setConversations([]);
        setSelectedConversationId(null);
        setSelectedSubgroupByGroup({});
        setConversationReadState({});
        setAccessToken(null);
        return;
      }

      setAccessToken(event.newValue);
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

      const loadedConversations = await groupMeService.getConversations();
      setConversations(loadedConversations);
      setSubgroupsLoadedByGroupSourceId({});

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
    } catch (error) {
      if (isUnauthorizedGroupMeError(error)) {
        groupMeService.clearAccessToken();
        setAccessToken(null);
        setIsAuthenticated(false);
        setCurrentUser(null);
        setConversations([]);
        setSelectedConversationId(null);
        setSelectedSubgroupByGroup({});
        setConversationReadState({});
        setSubgroupsLoadedByGroupSourceId({});
        return;
      }

      console.error('Failed to load user data:', error);
    }
  };

  const handleAuthenticate = (token: string) => {
    groupMeService.setAccessToken(token);
    setAccessToken(token);
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    groupMeService.clearAccessToken();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setConversations([]);
    setSelectedConversationId(null);
    setSelectedSubgroupByGroup({});
    setConversationReadState({});
    setSubgroupsLoadedByGroupSourceId({});
    setAccessToken(null);
    setUpdateStatus({ state: 'idle' });
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
    if (!updatesBridge?.check) {
      setUpdateStatus({
        state: 'error',
        message: 'Updater is not available in this environment.',
      });
      return;
    }

    setUpdateStatus({ state: 'checking', message: 'Checking for updates...' });

    try {
      await updatesBridge.check();
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
      setUpdateStatus({
        state: 'error',
        message: 'Updater is not available in this environment.',
      });
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
    return <AuthPage onAuthenticate={handleAuthenticate} />;
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
        onSignOut={() => {
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

      {showInlineSettingsFallback && (
        <SettingsMenu
          accessToken={accessToken}
          updateStatus={updateStatus}
          onClose={() => setShowInlineSettingsFallback(false)}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
          onOpenLatestRelease={handleOpenLatestRelease}
          onSignOut={() => {
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
