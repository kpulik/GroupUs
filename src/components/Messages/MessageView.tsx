import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Heart,
  Image as ImageIcon,
  Info,
  Pin,
  Send,
  Users,
  X,
} from 'lucide-react';
import { Conversation, Group, Member, Message, groupMeService, normalizeImageUrl } from '../../services/groupme';
import { Avatar } from '../Common/Avatar';

interface MessageViewProps {
  conversation: Conversation;
  activeConversation: Conversation;
  currentUserId: string;
}

interface PinnedMessageEntry {
  entryId: string;
  pinnedAt: number;
  pinnedBy: string;
  targetMessage: Message | null;
  jumpTargetId: string | null;
}

interface RawPinnedEvent {
  eventMessage: Message;
  referenceIds: string[];
}

const PIN_REFERENCE_KEYS = new Set([
  'pinned_message_id',
  'message_id',
  'target_message_id',
  'target_id',
  'subject_id',
  'reply_id',
  'id',
  'source_guid',
  'target_source_guid',
  'message_source_guid',
]);

const PIN_PATH_HINTS = ['pin', 'pinned', 'message', 'target', 'subject', 'reply', 'guid'];

function isPinNotificationMessage(message: Message): boolean {
  return /pinned a message/i.test(message.text);
}

function sortMessagesAscending(firstMessage: Message, secondMessage: Message): number {
  if (firstMessage.created_at !== secondMessage.created_at) {
    return firstMessage.created_at - secondMessage.created_at;
  }

  return firstMessage.id.localeCompare(secondMessage.id);
}

function sortMessagesDescending(firstMessage: Message, secondMessage: Message): number {
  return sortMessagesAscending(secondMessage, firstMessage);
}

function mergeMessageSets(existingMessages: Message[], incomingMessages: Message[]): Message[] {
  const messagesById = new Map<string, Message>();

  for (const message of existingMessages) {
    messagesById.set(message.id, message);
  }

  for (const message of incomingMessages) {
    const currentMessage = messagesById.get(message.id);
    if (!currentMessage) {
      messagesById.set(message.id, message);
      continue;
    }

    messagesById.set(message.id, {
      ...currentMessage,
      ...message,
      attachments: message.attachments ?? currentMessage.attachments,
      favorited_by: message.favorited_by ?? currentMessage.favorited_by,
    });
  }

  return Array.from(messagesById.values()).sort(sortMessagesAscending);
}

function extractPinnedMessageReferences(message: Message): string[] {
  const references = new Set<string>();

  for (const attachment of message.attachments) {
    const attachmentType = attachment.type.toLowerCase();
    if (!attachmentType.includes('pin') && attachmentType !== 'event') {
      continue;
    }

    const queue: Array<{ value: unknown; path: string[] }> = [{ value: attachment, path: [] }];

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        continue;
      }

      const { value, path } = next;

      if (Array.isArray(value)) {
        for (const child of value) {
          queue.push({ value: child, path });
        }
        continue;
      }

      if (!value || typeof value !== 'object') {
        continue;
      }

      for (const [rawKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.toLowerCase();
        const nextPath = [...path, key];

        if (typeof childValue === 'string' || typeof childValue === 'number') {
          const candidate = String(childValue).trim();

          if (!candidate) {
            continue;
          }

          const looksLikeReferenceKey = PIN_REFERENCE_KEYS.has(key);
          const pathHasPinHints = nextPath.some((segment) =>
            PIN_PATH_HINTS.some((hint) => segment.includes(hint)),
          );
          const keyLooksLikeId = key.includes('id') || key.includes('guid');
          const shouldUseCandidate =
            (looksLikeReferenceKey && key !== 'id') ||
            (looksLikeReferenceKey && pathHasPinHints) ||
            (pathHasPinHints && keyLooksLikeId);

          if (
            shouldUseCandidate &&
            candidate !== message.id &&
            candidate !== message.source_guid
          ) {
            references.add(candidate);
          }
        }

        if (childValue && typeof childValue === 'object') {
          queue.push({ value: childValue, path: nextPath });
        }
      }
    }
  }

  return Array.from(references);
}

function resolvePinnedTargetMessage(
  pinEvent: RawPinnedEvent,
  allMessagesById: Map<string, Message>,
  allMessagesBySourceGuid: Map<string, Message>,
): Message | null {
  for (const referenceId of pinEvent.referenceIds) {
    const byId = allMessagesById.get(referenceId);
    if (byId && byId.id !== pinEvent.eventMessage.id) {
      return byId;
    }

    const bySourceGuid = allMessagesBySourceGuid.get(referenceId);
    if (bySourceGuid && bySourceGuid.id !== pinEvent.eventMessage.id) {
      return bySourceGuid;
    }
  }

  if (!isPinNotificationMessage(pinEvent.eventMessage)) {
    return pinEvent.eventMessage;
  }

  return null;
}

export function MessageView({
  conversation,
  activeConversation,
  currentUserId,
}: MessageViewProps) {
  const [groupDetails, setGroupDetails] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingPinnedMessages, setLoadingPinnedMessages] = useState(false);
  const [hasLoadedPinnedMessages, setHasLoadedPinnedMessages] = useState(false);
  const [pinnedMessagesError, setPinnedMessagesError] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageEntry[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fullHistoryMessagesRef = useRef<Message[] | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const groupActionsButtonRef = useRef<HTMLButtonElement>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const isGroupConversation = activeConversation.type !== 'chat';
  const canLikeMessages = activeConversation.type !== 'chat';
  const supportsCalls = false;

  const galleryImages = useMemo(() => {
    const images = new Set<string>();

    for (const message of messages) {
      for (const attachment of message.attachments) {
        if (attachment.type !== 'image') {
          continue;
        }

        const imageUrl = normalizeImageUrl(attachment.url);
        if (imageUrl) {
          images.add(imageUrl);
        }
      }
    }

    return Array.from(images);
  }, [messages]);

  const groupMembers = useMemo<Member[]>(() => {
    return Array.isArray(groupDetails?.members) ? groupDetails.members : [];
  }, [groupDetails]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = memberSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return groupMembers;
    }

    return groupMembers.filter((member) => member.nickname.toLowerCase().includes(normalizedSearch));
  }, [groupMembers, memberSearch]);

  const groupMenuItems: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
  }> = [
    {
      label: 'Gallery',
      icon: ImageIcon,
      onClick: () => {
        setShowGallery(true);
      },
    },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const fetchedMessages = await groupMeService.getConversationMessages(activeConversation);
      const latestMessages = fetchedMessages.reverse().sort(sortMessagesAscending);

      if (fullHistoryMessagesRef.current) {
        fullHistoryMessagesRef.current = mergeMessageSets(fullHistoryMessagesRef.current, latestMessages);
      }

      setMessages((currentMessages) => mergeMessageSets(currentMessages, latestMessages));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPinnedMessages = useCallback(async () => {
    if (activeConversation.type === 'chat') {
      setPinnedMessages([]);
      setPinnedMessagesError(null);
      setHasLoadedPinnedMessages(true);
      fullHistoryMessagesRef.current = [...messages].sort(sortMessagesAscending);
      return;
    }

    try {
      setLoadingPinnedMessages(true);
      setPinnedMessagesError(null);

      const allMessagesById = new Map<string, Message>();
      const allMessagesBySourceGuid = new Map<string, Message>();
      const rawPinnedEvents: RawPinnedEvent[] = [];
      const seenPinnedEventIds = new Set<string>();

      const consumePage = (pageMessages: Message[]) => {
        for (const message of pageMessages) {
          allMessagesById.set(message.id, message);
          if (message.source_guid) {
            allMessagesBySourceGuid.set(message.source_guid, message);
          }

          const hasPinAttachment = message.attachments.some((attachment) =>
            attachment.type.toLowerCase().includes('pin'),
          );
          const isPinEvent = hasPinAttachment || isPinNotificationMessage(message);

          if (!isPinEvent || seenPinnedEventIds.has(message.id)) {
            continue;
          }

          seenPinnedEventIds.add(message.id);
          rawPinnedEvents.push({
            eventMessage: message,
            referenceIds: extractPinnedMessageReferences(message),
          });
        }
      };

      const firstPageDescending =
        messages.length > 0
          ? [...messages].sort(sortMessagesDescending)
          : await groupMeService.getConversationMessages(activeConversation);

      consumePage(firstPageDescending);

      let beforeId = firstPageDescending[firstPageDescending.length - 1]?.id;
      const seenBeforeIds = new Set<string>();
      let pageGuard = 0;

      while (beforeId && !seenBeforeIds.has(beforeId) && pageGuard < 500) {
        seenBeforeIds.add(beforeId);

        const olderMessages = await groupMeService.getConversationMessages(activeConversation, beforeId);
        pageGuard += 1;

        if (olderMessages.length === 0) {
          break;
        }

        consumePage(olderMessages);

        const nextBeforeId = olderMessages[olderMessages.length - 1]?.id;
        if (!nextBeforeId || nextBeforeId === beforeId) {
          break;
        }

        beforeId = nextBeforeId;
      }

      fullHistoryMessagesRef.current = Array.from(allMessagesById.values()).sort(sortMessagesAscending);

      const entries: PinnedMessageEntry[] = [];
      const seenTargets = new Set<string>();

      for (const rawPinnedEvent of rawPinnedEvents) {
        const targetMessage = resolvePinnedTargetMessage(
          rawPinnedEvent,
          allMessagesById,
          allMessagesBySourceGuid,
        );
        const jumpTargetId = targetMessage?.id ?? null;
        const dedupeKey = jumpTargetId ?? rawPinnedEvent.referenceIds[0] ?? rawPinnedEvent.eventMessage.id;

        if (seenTargets.has(dedupeKey)) {
          continue;
        }

        seenTargets.add(dedupeKey);
        entries.push({
          entryId: `${rawPinnedEvent.eventMessage.id}-${dedupeKey}`,
          pinnedAt: rawPinnedEvent.eventMessage.created_at,
          pinnedBy: rawPinnedEvent.eventMessage.name,
          targetMessage,
          jumpTargetId,
        });
      }

      setPinnedMessages(entries.sort((a, b) => b.pinnedAt - a.pinnedAt));
      setHasLoadedPinnedMessages(true);
    } catch (error) {
      console.error('Failed to load pinned messages:', error);
      setPinnedMessages([]);
      setPinnedMessagesError('Unable to load pinned messages right now.');
    } finally {
      setLoadingPinnedMessages(false);
    }
  }, [activeConversation, messages]);

  const ensureMessageLoadedForJump = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (messages.some((message) => message.id === messageId)) {
        return true;
      }

      const fullHistoryMessages = fullHistoryMessagesRef.current;
      if (fullHistoryMessages && fullHistoryMessages.some((message) => message.id === messageId)) {
        setMessages((currentMessages) => mergeMessageSets(currentMessages, fullHistoryMessages));
        return true;
      }

      let accumulatedMessages = [...messages].sort(sortMessagesAscending);
      let beforeId = accumulatedMessages[0]?.id;
      const seenBeforeIds = new Set<string>();

      while (beforeId && !seenBeforeIds.has(beforeId)) {
        seenBeforeIds.add(beforeId);

        const olderMessages = await groupMeService.getConversationMessages(activeConversation, beforeId);
        if (olderMessages.length === 0) {
          break;
        }

        const olderMessagesAscending = [...olderMessages].reverse().sort(sortMessagesAscending);
        accumulatedMessages = mergeMessageSets(accumulatedMessages, olderMessagesAscending);
        fullHistoryMessagesRef.current = fullHistoryMessagesRef.current
          ? mergeMessageSets(fullHistoryMessagesRef.current, olderMessagesAscending)
          : [...accumulatedMessages];
        setMessages((currentMessages) => mergeMessageSets(currentMessages, olderMessagesAscending));

        if (accumulatedMessages.some((message) => message.id === messageId)) {
          return true;
        }

        const nextBeforeId = olderMessages[olderMessages.length - 1]?.id;
        if (!nextBeforeId || nextBeforeId === beforeId) {
          break;
        }

        beforeId = nextBeforeId;
      }

      return accumulatedMessages.some((message) => message.id === messageId);
    },
    [activeConversation, messages],
  );

  useEffect(() => {
    setMessages([]);
    setPinnedMessages([]);
    setPinnedMessagesError(null);
    setHasLoadedPinnedMessages(false);
    setLoadingPinnedMessages(false);
    setHighlightedMessageId(null);
    setShowInfoCard(false);
    setShowPinnedPanel(false);
    setShowGallery(false);
    setMemberSearch('');
    setShowGroupMenu(false);
    fullHistoryMessagesRef.current = null;

    if (activeConversation.type === 'chat') {
      setGroupDetails(null);
      setShowMembersPanel(false);
    }

    void loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [activeConversation.id]);

  useEffect(() => {
    if (!isGroupConversation) {
      return;
    }

    let cancelled = false;
    groupMeService
      .getGroupById(activeConversation.sourceId)
      .then((group) => {
        if (cancelled) {
          return;
        }

        setGroupDetails(group);
      })
      .catch((error) => {
        console.warn('Unable to load conversation info:', error);
        if (!cancelled) {
          setGroupDetails(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversation.sourceId, isGroupConversation]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showGroupMenu) {
        return;
      }

      const target = event.target as Node;
      if (
        groupMenuRef.current?.contains(target) ||
        groupActionsButtonRef.current?.contains(target)
      ) {
        return;
      }

      setShowGroupMenu(false);
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGroupMenu]);

  useEffect(() => {
    if (!showPinnedPanel || hasLoadedPinnedMessages || loadingPinnedMessages) {
      return;
    }

    void loadPinnedMessages();
  }, [showPinnedPanel, hasLoadedPinnedMessages, loadingPinnedMessages, loadPinnedMessages]);

  useEffect(() => {
    if (!lastMessageId) {
      return;
    }

    scrollToBottom();
  }, [lastMessageId]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId((currentValue) => (currentValue === highlightedMessageId ? null : currentValue));
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedMessageId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      await groupMeService.sendConversationMessage(activeConversation, messageText);
      await loadMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleLikeMessage = async (messageId: string, isLiked: boolean) => {
    try {
      if (isLiked) {
        await groupMeService.unlikeMessage(activeConversation, messageId);
      } else {
        await groupMeService.likeMessage(activeConversation, messageId);
      }
      await loadMessages();
    } catch (error) {
      console.error('Failed to like/unlike message:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatHeaderTime = (timestamp: number | undefined) => {
    if (!timestamp) {
      return 'Unknown';
    }

    return new Date(timestamp * 1000).toLocaleString();
  };

  const getPinnedMessagePreview = (pinnedEntry: PinnedMessageEntry) => {
    if (!pinnedEntry.targetMessage) {
      return 'Pinned message could not be loaded.';
    }

    const textPreview = pinnedEntry.targetMessage.text?.trim();
    if (textPreview) {
      return textPreview;
    }

    const imageAttachment = pinnedEntry.targetMessage.attachments.find(
      (attachment) => attachment.type === 'image',
    );
    if (imageAttachment) {
      return 'Image attachment';
    }

    if (pinnedEntry.targetMessage.attachments.length > 0) {
      return `${pinnedEntry.targetMessage.attachments.length} attachment${
        pinnedEntry.targetMessage.attachments.length === 1 ? '' : 's'
      }`;
    }

    return 'Pinned message entry';
  };

  const getPinnedMessagePreviewImage = (pinnedEntry: PinnedMessageEntry) => {
    if (!pinnedEntry.targetMessage) {
      return null;
    }

    const imageAttachment = pinnedEntry.targetMessage.attachments.find(
      (attachment) => attachment.type === 'image',
    );
    return normalizeImageUrl(imageAttachment?.preview_url ?? imageAttachment?.url);
  };

  const handleJumpToMessage = async (messageId: string | null) => {
    if (!messageId) {
      return;
    }

    const isLoaded = await ensureMessageLoadedForJump(messageId);
    if (!isLoaded) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (messageRefs.current[messageId]) {
        break;
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    const messageNode = messageRefs.current[messageId];
    if (!messageNode) {
      return;
    }

    messageNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    setShowPinnedPanel(false);
  };

  return (
    <div className="relative flex h-full bg-white/20 dark:bg-gray-900/40 backdrop-blur-3xl">
      <div className="flex-1 min-w-0 flex flex-col">
      <div className="pt-14 px-6 pb-4 bg-white/40 dark:bg-gray-900/70 backdrop-blur-3xl border-b border-gray-200/50 dark:border-gray-700/60">
        <div className="flex items-center space-x-3">
          <Avatar
            src={activeConversation.image_url}
            alt={activeConversation.name}
            className="w-12 h-12 rounded-full object-cover"
            fallback={
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            }
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{conversation.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
              {activeConversation.type === 'chat'
                ? 'Direct chat'
                : `${activeConversation.members_count} members${activeConversation.type === 'subgroup' ? ' • Subgroup' : ''}`}
            </p>
            {activeConversation.id !== conversation.id && (
              <p className="text-xs font-medium text-blue-600 mt-0.5">
                Viewing channel: {activeConversation.name}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfoCard((currentValue) => !currentValue)}
              className={`p-2 rounded-lg border transition-colors ${
                showInfoCard
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white/85 dark:bg-gray-800/85 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
              }`}
              title="Chat info"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowPinnedPanel((currentValue) => !currentValue)}
              className={`p-2 rounded-lg border transition-colors ${
                showPinnedPanel
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white/85 dark:bg-gray-800/85 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
              }`}
              title="Pinned messages"
            >
              <Pin className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowMembersPanel((currentValue) => !currentValue)}
              disabled={!isGroupConversation}
              className={`p-2 rounded-lg border transition-colors ${
                showMembersPanel
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white/85 dark:bg-gray-800/85 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isGroupConversation ? 'Toggle members list' : 'Members list is only available for groups'}
            >
              <Users className="w-4 h-4" />
            </button>

            {supportsCalls && (
              <button
                className="p-2 rounded-lg border bg-white/85 dark:bg-gray-800/85 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700"
                title="Start call"
              >
                <Users className="w-4 h-4" />
              </button>
            )}

            {isGroupConversation && groupMenuItems.length > 0 && (
              <div className="relative">
                <button
                  ref={groupActionsButtonRef}
                  onClick={() => setShowGroupMenu((currentValue) => !currentValue)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700"
                  title="Group actions"
                >
                  <span className="text-xs font-medium">Actions</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showGroupMenu && (
                  <div
                    ref={groupMenuRef}
                    className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-2 z-30"
                  >
                    {groupMenuItems.map((menuItem) => {
                      const Icon = menuItem.icon;

                      return (
                        <button
                          key={menuItem.label}
                          onClick={() => {
                            menuItem.onClick();
                            setShowGroupMenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                          title={menuItem.label}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{menuItem.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showInfoCard && (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/80 p-3 text-sm text-gray-700 dark:text-gray-200">
            <p><span className="font-semibold">Conversation:</span> {activeConversation.name}</p>
            <p><span className="font-semibold">Type:</span> {activeConversation.type === 'chat' ? 'Direct chat' : activeConversation.type}</p>
            <p><span className="font-semibold">Members:</span> {groupMembers.length || activeConversation.members_count}</p>
            <p><span className="font-semibold">Last updated:</span> {formatHeaderTime(activeConversation.updated_at)}</p>
            {groupDetails?.description && <p><span className="font-semibold">Description:</span> {groupDetails.description}</p>}
            {groupDetails?.share_url && (
              <p className="truncate">
                <span className="font-semibold">Share URL:</span> {groupDetails.share_url}
              </p>
            )}
          </div>
        )}

        {showPinnedPanel && (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/80 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Pinned Messages</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">Full history</span>
            </div>

            {loadingPinnedMessages ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading all pinned messages...</p>
            ) : pinnedMessagesError ? (
              <p className="text-sm text-red-500 dark:text-red-300">{pinnedMessagesError}</p>
            ) : pinnedMessages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No pinned messages found in this conversation.
              </p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {pinnedMessages.map((pinnedMessage) => {
                  const previewImage = getPinnedMessagePreviewImage(pinnedMessage);

                  return (
                    <div key={pinnedMessage.entryId} className="rounded-lg bg-gray-50 dark:bg-gray-800/80 p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                            {pinnedMessage.targetMessage?.name ?? 'Pinned message'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatTime(pinnedMessage.pinnedAt)}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            Pinned by {pinnedMessage.pinnedBy}
                          </p>
                        </div>
                        {pinnedMessage.jumpTargetId && (
                          <button
                            onClick={() => {
                              void handleJumpToMessage(pinnedMessage.jumpTargetId);
                            }}
                            className="shrink-0 px-2 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Jump
                          </button>
                        )}
                      </div>

                      {previewImage && (
                        <img
                          src={previewImage}
                          alt="Pinned preview"
                          className="mt-2 w-full max-h-28 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                        />
                      )}

                      <p className="text-gray-600 dark:text-gray-300 mt-2 text-xs leading-relaxed">
                        {getPinnedMessagePreview(pinnedMessage)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-300">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-300">No messages yet</p>
          </div>
        ) : (
          messages.map((message) => {
            const isCurrentUser = message.user_id === currentUserId;
            const isLiked = message.favorited_by.includes(currentUserId);

            return (
              <div
                key={message.id}
                ref={(node) => {
                  messageRefs.current[message.id] = node;
                }}
                className={`flex items-start space-x-3 ${isCurrentUser ? 'flex-row-reverse space-x-reverse' : ''} ${
                  highlightedMessageId === message.id
                    ? 'bg-blue-50 dark:bg-blue-950/35 rounded-xl px-2 py-1'
                    : ''
                }`}
              >
                <Avatar
                  src={message.avatar_url}
                  alt={message.name}
                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                  fallback={
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-semibold">
                        {message.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  }
                />
                <div className={`flex-1 ${isCurrentUser ? 'flex flex-col items-end' : ''}`}>
                  <div
                    className={`inline-block max-w-md px-4 py-2 rounded-2xl ${
                      isCurrentUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/80 dark:bg-gray-800/90 backdrop-blur-xl text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {!isCurrentUser && (
                      <p className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">{message.name}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                    {message.attachments.map((attachment, idx) => (
                      <div key={idx} className="mt-2">
                        {attachment.type === 'image' && (
                          <img
                            src={normalizeImageUrl(attachment.url) ?? undefined}
                            alt="Attachment"
                            className="max-w-full rounded-lg"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
                    <span>{formatTime(message.created_at)}</span>
                    {canLikeMessages && message.favorited_by.length > 0 && (
                      <button
                        onClick={() => handleLikeMessage(message.id, isLiked)}
                        className={`flex items-center space-x-1 ${isLiked ? 'text-red-500' : ''}`}
                      >
                        <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                        <span>{message.favorited_by.length}</span>
                      </button>
                    )}
                    {canLikeMessages && !isLiked && message.favorited_by.length === 0 && (
                      <button
                        onClick={() => handleLikeMessage(message.id, false)}
                        className="opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <Heart className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white/40 dark:bg-gray-900/70 backdrop-blur-3xl border-t border-gray-200/50 dark:border-gray-700/60">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-3 bg-white/80 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
      </div>

      {showMembersPanel && isGroupConversation && (
        <aside className="w-72 border-l border-gray-200/70 dark:border-gray-700/60 bg-white/65 dark:bg-gray-900/75 backdrop-blur-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200/70 dark:border-gray-700/60">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Members</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{groupMembers.length || activeConversation.members_count} participants</p>
            <input
              type="text"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Find a member"
              className="mt-2 w-full px-3 py-2 text-sm bg-white/85 dark:bg-gray-800/85 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {filteredMembers.length === 0 ? (
              <p className="px-2 text-sm text-gray-500 dark:text-gray-400">No members match that search.</p>
            ) : (
              filteredMembers.map((member) => (
                <div key={member.user_id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/80">
                  <Avatar
                    src={member.image_url}
                    alt={member.nickname}
                    className="w-8 h-8 rounded-full object-cover"
                    fallback={
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">
                          {member.nickname.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{member.nickname}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.user_id}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {showGallery && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(960px,92vw)] h-[min(760px,90vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gallery</h3>
              <button
                onClick={() => setShowGallery(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close gallery"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {galleryImages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No images found in recent messages.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {galleryImages.map((imageUrl) => (
                    <img
                      key={imageUrl}
                      src={imageUrl}
                      alt="Gallery"
                      className="w-full h-40 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
