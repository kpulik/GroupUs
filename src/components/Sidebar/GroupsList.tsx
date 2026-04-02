import { useMemo, useState } from 'react';
import { Bell, BellOff, Check, CheckCheck, ChevronDown, ChevronRight, Circle, Hash, Settings, Users } from 'lucide-react';
import type { Conversation, User } from '../../services/groupme';
import type { ConversationFilter } from '../../App';
import { Avatar } from '../Common/Avatar';

interface GroupsListProps {
  conversations: Conversation[];
  allConversations: Conversation[];
  activeFilter: ConversationFilter;
  currentUser: User | null;
  selectedConversationId: string | null;
  mutedConversationIds: Record<string, boolean>;
  unreadCountByConversationId: Record<string, number>;
  subgroupOptionsByGroupId: Record<string, Conversation[]>;
  selectedSubgroupByGroup: Record<string, string>;
  onSelectConversation: (conversationId: string) => void;
  onChangeFilter: (filter: ConversationFilter) => void;
  onSelectSubgroupForGroup: (groupConversationId: string, subgroupConversationId: string) => void;
  onToggleConversationMute: (conversationId: string) => void;
  onMarkAllConversationsRead: () => void;
  onSetConversationReadStatus: (conversationId: string, markAsRead: boolean) => void;
  onOpenSettingsWindow: () => void;
}

export function GroupsList({
  conversations,
  allConversations,
  activeFilter,
  currentUser,
  selectedConversationId,
  mutedConversationIds,
  unreadCountByConversationId,
  subgroupOptionsByGroupId,
  selectedSubgroupByGroup,
  onSelectConversation,
  onChangeFilter,
  onSelectSubgroupForGroup,
  onToggleConversationMute,
  onMarkAllConversationsRead,
  onSetConversationReadStatus,
  onOpenSettingsWindow,
}: GroupsListProps) {
  const [expandedSubchannelsByGroup, setExpandedSubchannelsByGroup] = useState<Record<string, boolean>>({});
  const rootConversations = useMemo(
    () => allConversations.filter((conversation) => conversation.type !== 'subgroup'),
    [allConversations],
  );

  const groupsWithSubchannels = useMemo(
    () =>
      rootConversations
        .filter((conversation) => conversation.type === 'group')
        .filter((conversation) => (subgroupOptionsByGroupId[conversation.id]?.length ?? 0) > 0)
        .map((conversation) => conversation.id),
    [rootConversations, subgroupOptionsByGroupId],
  );

  const allSubchannelsExpanded =
    groupsWithSubchannels.length > 0 &&
    groupsWithSubchannels.every((groupId) => Boolean(expandedSubchannelsByGroup[groupId]));

  const handleToggleAllSubchannels = () => {
    const shouldExpand = !allSubchannelsExpanded;
    setExpandedSubchannelsByGroup((previousState) => {
      const nextState = { ...previousState };

      for (const groupId of groupsWithSubchannels) {
        nextState[groupId] = shouldExpand;
      }

      return nextState;
    });
  };

  const counts = useMemo(
    () => ({
      all: rootConversations.length,
      groups: rootConversations.filter((conversation) => conversation.type === 'group').length,
      chats: rootConversations.filter((conversation) => conversation.type === 'chat').length,
    }),
    [rootConversations],
  );

  const hasUnreadConversations = useMemo(
    () => allConversations.some((conversation) => (unreadCountByConversationId[conversation.id] ?? 0) > 0),
    [allConversations, unreadCountByConversationId],
  );

  const filterTabs: Array<{ key: ConversationFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'groups', label: 'Groups', count: counts.groups },
    { key: 'chats', label: 'Chats', count: counts.chats },
  ];

  const getConversationDisplayName = (conversation: Conversation) => {
    const trimmedName = conversation.name?.trim();
    if (trimmedName) {
      return trimmedName;
    }

    if (conversation.type === 'subgroup') {
      return `Unnamed channel ${conversation.sourceId.slice(-4)}`;
    }

    if (conversation.type === 'group') {
      return `Unnamed group ${conversation.sourceId.slice(-4)}`;
    }

    return `Direct chat ${conversation.sourceId.slice(-4)}`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="pt-14 px-4 pb-4 border-b border-gray-200/50 dark:border-gray-700/60">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Messages</h1>
          <button
            onClick={onOpenSettingsWindow}
            className="p-2 hover:bg-gray-200/50 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Open settings"
          >
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
        {currentUser && (
          <div className="flex items-center space-x-3 p-3 bg-white/60 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl">
            <Avatar
              src={currentUser.avatar_url}
              alt={currentUser.name}
              className="w-10 h-10 rounded-full object-cover"
              fallback={
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white font-semibold text-lg">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              }
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentUser.email}</p>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChangeFilter(tab.key)}
              className={`px-2 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeFilter === tab.key
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/60 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <button
          onClick={onMarkAllConversationsRead}
          disabled={!hasUnreadConversations}
          className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/70 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Mark all conversations as read"
        >
          Mark all as read
        </button>

        {groupsWithSubchannels.length > 0 && (
          <button
            onClick={handleToggleAllSubchannels}
            className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/70 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            {allSubchannelsExpanded ? 'Collapse all subchannels' : 'Expand all subchannels'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-300 text-sm">No conversations in this view</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const isSelected = selectedConversationId === conversation.id;
              const isMuted = Boolean(mutedConversationIds[conversation.id]);
              const unreadCount = unreadCountByConversationId[conversation.id] ?? 0;
              const isConversationUnread = unreadCount > 0;
              const subgroupOptions =
                conversation.type === 'group' ? subgroupOptionsByGroupId[conversation.id] ?? [] : [];
              const selectedSubgroupConversationId =
                selectedSubgroupByGroup[conversation.id] ?? conversation.id;
              const isSubchannelSectionExpanded = Boolean(expandedSubchannelsByGroup[conversation.id]);

              return (
                <div key={conversation.id} className="rounded-xl">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectConversation(conversation.id)}
                      className={`flex-1 p-3 rounded-xl flex items-center space-x-3 transition-all duration-150 min-w-0 ${
                        isSelected
                          ? 'bg-blue-500 shadow-lg shadow-blue-500/30'
                          : 'hover:bg-white/60 dark:hover:bg-gray-800/70 hover:backdrop-blur-xl'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          src={conversation.image_url}
                          alt={conversation.name}
                          className="w-12 h-12 rounded-full object-cover"
                          fallback={
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                              <Users className="w-6 h-6 text-white" />
                            </div>
                          }
                        />
                        {isConversationUnread && (
                          <span
                            className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ${
                              isSelected
                                ? 'bg-white ring-blue-500'
                                : 'bg-red-500 ring-white dark:ring-gray-900'
                            }`}
                            title="Unread messages"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isSelected ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {getConversationDisplayName(conversation)}
                          </p>
                          {isMuted && (
                            <BellOff
                              className={`w-3.5 h-3.5 ${
                                isSelected ? 'text-blue-100' : 'text-gray-400'
                              }`}
                            />
                          )}
                          {unreadCount > 0 && (
                            <span
                              className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold ${
                                isSelected
                                  ? 'bg-white text-blue-600'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {unreadCount > 99
                                ? '99+'
                                : unreadCount}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-xs truncate ${
                            isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {conversation.type === 'chat'
                            ? 'Direct chat'
                            : `${conversation.members_count} members`}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => onSetConversationReadStatus(conversation.id, isConversationUnread)}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        isConversationUnread
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                          : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
                      }`}
                      title={isConversationUnread ? 'Mark as read' : 'Mark as unread'}
                    >
                      {isConversationUnread ? <CheckCheck className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => onToggleConversationMute(conversation.id)}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        isMuted
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600'
                          : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
                      }`}
                      title={isMuted ? 'Unmute conversation' : 'Mute conversation'}
                    >
                      {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                  </div>

                  {conversation.type === 'group' && (
                    <div className="mt-2 ml-14 mr-2">
                      {subgroupOptions.length > 0 && (
                        <>
                          <button
                            onClick={() =>
                              setExpandedSubchannelsByGroup((previousState) => ({
                                ...previousState,
                                [conversation.id]: !previousState[conversation.id],
                              }))
                            }
                            className="mb-1 w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                            title={isSubchannelSectionExpanded ? 'Collapse topics' : 'Expand topics'}
                          >
                            <span className="flex items-center gap-1">
                              {isSubchannelSectionExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                              <Hash className="w-3 h-3" />
                              Topics ({subgroupOptions.length + 1})
                            </span>
                          </button>

                          {isSubchannelSectionExpanded && (
                            <div className="space-y-1 p-1 rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40 max-h-56 overflow-y-auto">
                              {[conversation, ...subgroupOptions].map((channelConversation) => {
                                const isMainChat = channelConversation.id === conversation.id;
                                const isChannelSelected = selectedSubgroupConversationId === channelConversation.id;
                                const isChannelMuted = Boolean(mutedConversationIds[channelConversation.id]);
                                const unreadCount = unreadCountByConversationId[channelConversation.id] ?? 0;
                                const isChannelUnread = unreadCount > 0;
                                const channelName = isMainChat
                                  ? 'Main Chat'
                                  : getConversationDisplayName(channelConversation);

                                return (
                                  <div key={channelConversation.id} className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        onSelectConversation(conversation.id);
                                        onSelectSubgroupForGroup(conversation.id, channelConversation.id);
                                      }}
                                      className={`flex-1 min-w-0 px-2 py-2 rounded-lg text-left text-xs transition-colors flex items-center gap-2 ${
                                        isChannelSelected
                                          ? 'bg-blue-500 text-white'
                                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                                      }`}
                                    >
                                      <Hash
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          isChannelSelected ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'
                                        }`}
                                      />
                                      {isChannelUnread && (
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            isChannelSelected ? 'bg-white' : 'bg-red-500'
                                          }`}
                                          title="Unread messages"
                                        />
                                      )}
                                      <span className="truncate font-medium">{channelName}</span>
                                      {unreadCount > 0 && (
                                        <span
                                          className={`ml-auto inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                                            isChannelSelected
                                              ? 'bg-white text-blue-600'
                                              : 'bg-blue-600 text-white'
                                          }`}
                                        >
                                          {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                      )}
                                      {isChannelSelected && unreadCount === 0 && (
                                        <Check className="ml-auto w-3.5 h-3.5 text-blue-100" />
                                      )}
                                    </button>

                                    <button
                                      onClick={() =>
                                        onSetConversationReadStatus(
                                          channelConversation.id,
                                          isChannelUnread,
                                        )
                                      }
                                      className={`p-2 rounded-lg border transition-colors ${
                                        isChannelUnread
                                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                          : 'bg-white/80 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
                                      }`}
                                      title={isChannelUnread ? 'Mark topic as read' : 'Mark topic as unread'}
                                    >
                                      {isChannelUnread ? <CheckCheck className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                                    </button>

                                    <button
                                      onClick={() => onToggleConversationMute(channelConversation.id)}
                                      className={`p-2 rounded-lg border transition-colors ${
                                        isChannelMuted
                                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600'
                                          : 'bg-white/80 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
                                      }`}
                                      title={isChannelMuted ? 'Unmute topic' : 'Mute topic'}
                                    >
                                      {isChannelMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
