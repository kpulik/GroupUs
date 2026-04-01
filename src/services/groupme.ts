const GROUPME_API_BASE = 'https://api.groupme.com/v3';

export class GroupMeApiError extends Error {
  status: number;
  endpoint: string;

  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.name = 'GroupMeApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface User {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string;
}

export interface Group {
  id: string;
  name?: string;
  description?: string;
  image_url: string | null;
  avatar_url?: string | null;
  creator_user_id?: string;
  created_at?: number;
  updated_at: number;
  messages_count?: number;
  messages?: {
    count?: number;
  };
  members?: Member[] | null;
  member_count?: number;
  parent_id?: string;
  parent_group_id?: string;
  is_subgroup?: boolean;
  share_url?: string;
}

export interface Member {
  user_id: string;
  nickname: string;
  image_url: string | null;
  muted: boolean;
}

export interface Message {
  id: string;
  source_guid: string;
  created_at: number;
  user_id: string;
  group_id?: string;
  name: string;
  avatar_url: string | null;
  text: string;
  favorited_by: string[];
  attachments: Attachment[];
}

export type ConversationType = 'group' | 'subgroup' | 'chat';

export interface ChatUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface Chat {
  id?: string;
  updated_at: number;
  other_user: ChatUser;
}

export interface Conversation {
  id: string;
  sourceId: string;
  parentSourceId?: string | null;
  type: ConversationType;
  name: string;
  image_url: string | null;
  updated_at: number;
  message_count: number | null;
  members_count: number;
}

interface RawChatMessage {
  id: string;
  source_guid: string;
  created_at: number;
  sender_id: string;
  recipient_id: string;
  sender_type?: string;
  text: string;
  avatar_url: string | null;
  name: string;
  attachments?: Attachment[];
}

export function normalizeImageUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) {
    return null;
  }

  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice(7)}`;
  }

  return trimmed;
}

export interface Attachment {
  type: string;
  url?: string;
  preview_url?: string;
  lat?: string;
  lng?: string;
  name?: string;
}

function getGroupMessageCount(group: Group): number {
  if (typeof group.messages_count === 'number') {
    return group.messages_count;
  }

  if (group.messages && typeof group.messages.count === 'number') {
    return group.messages.count;
  }

  return 0;
}

function getGroupMembersCount(group: Group): number {
  if (Array.isArray(group.members)) {
    return group.members.length;
  }

  if (typeof group.member_count === 'number') {
    return group.member_count;
  }

  return 0;
}

function getGroupDisplayName(group: Group, isSubgroup: boolean): string {
  const candidateNames: unknown[] = [
    group.name,
    (group as unknown as Record<string, unknown>).display_name,
    (group as unknown as Record<string, unknown>).title,
    (group as unknown as Record<string, unknown>).topic,
    (group as unknown as Record<string, unknown>).description,
  ];

  for (const candidateName of candidateNames) {
    if (typeof candidateName !== 'string') {
      continue;
    }

    const trimmedName = candidateName.trim();
    if (trimmedName) {
      return trimmedName;
    }
  }

  const fallbackSuffix = group.id ? ` ${String(group.id).slice(-4)}` : '';
  return isSubgroup ? `Unnamed channel${fallbackSuffix}` : `Unnamed group${fallbackSuffix}`;
}

export function mapGroupToConversation(group: Group, parentSourceIdOverride?: string | null): Conversation {
  const parentSourceId = parentSourceIdOverride ?? group.parent_id ?? group.parent_group_id ?? null;
  const isSubgroup = Boolean(parentSourceId || group.is_subgroup);

  return {
    id: `group:${group.id}`,
    sourceId: group.id,
    parentSourceId,
    type: isSubgroup ? 'subgroup' : 'group',
    name: getGroupDisplayName(group, isSubgroup),
    image_url: group.image_url ?? group.avatar_url ?? null,
    updated_at: group.updated_at,
    message_count: getGroupMessageCount(group),
    members_count: getGroupMembersCount(group),
  };
}

export class GroupMeService {
  private accessToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('groupme_access_token');
  }

  setAccessToken(token: string) {
    this.accessToken = token;
    localStorage.setItem('groupme_access_token', token);
  }

  clearAccessToken() {
    this.accessToken = null;
    localStorage.removeItem('groupme_access_token');
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const url = new URL(`${GROUPME_API_BASE}${endpoint}`);
    url.searchParams.set('token', this.accessToken);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText || 'Request failed';

      try {
        const payload = (await response.json()) as { meta?: { errors?: string[] } };
        const apiMessage = payload?.meta?.errors?.[0];
        if (apiMessage) {
          errorMessage = apiMessage;
        }
      } catch {
        // Ignore body parsing failures and keep status text fallback.
      }

      throw new GroupMeApiError(
        response.status,
        endpoint,
        `GroupMe API error (${response.status}): ${errorMessage}`,
      );
    }

    const data = await response.json();
    return data.response as T;
  }

  async getMyUser(): Promise<User> {
    return this.request<User>('/users/me');
  }

  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>('/groups');
  }

  async getGroupById(groupId: string): Promise<Group> {
    return this.request<Group>(`/groups/${groupId}`);
  }

  async getChats(): Promise<Chat[]> {
    const response = await this.request<Chat[] | { chats: Chat[] }>('/chats');
    return Array.isArray(response) ? response : response.chats ?? [];
  }

  async getSubgroups(groupId: string): Promise<Group[]> {
    const response = await this.request<Group[] | { subgroups?: Group[]; groups?: Group[] }>(
      `/groups/${groupId}/subgroups`,
    );

    if (Array.isArray(response)) {
      return response;
    }

    return response.subgroups ?? response.groups ?? [];
  }

  async getConversations(): Promise<Conversation[]> {
    const groupsPromise = this.getGroups();
    const chatsPromise = this.getChats().catch((error) => {
      console.warn('Failed to load chats, continuing with groups only:', error);
      return [] as Chat[];
    });
    const [groups, chats] = await Promise.all([groupsPromise, chatsPromise]);

    const mappedGroups: Conversation[] = groups.map((group) => mapGroupToConversation(group));

    const mappedChats: Conversation[] = chats
      .filter((chat) => chat.other_user?.id)
      .map((chat) => ({
        id: `chat:${chat.other_user.id}`,
        sourceId: chat.other_user.id,
        parentSourceId: null,
        type: 'chat',
        name: chat.other_user.name?.trim() || `Direct chat ${String(chat.other_user.id).slice(-4)}`,
        image_url: chat.other_user.avatar_url,
        updated_at: chat.updated_at,
        message_count: null,
        members_count: 2,
      }));

    return [...mappedGroups, ...mappedChats].sort((a, b) => b.updated_at - a.updated_at);
  }

  async getMessages(groupId: string, beforeId?: string): Promise<Message[]> {
    const endpoint = beforeId
      ? `/groups/${groupId}/messages?before_id=${beforeId}`
      : `/groups/${groupId}/messages`;
    const data = await this.request<{ messages: Message[] }>(endpoint);
    return data.messages;
  }

  async getChatMessages(otherUserId: string, beforeId?: string): Promise<Message[]> {
    const params = new URLSearchParams({ other_user_id: otherUserId });
    if (beforeId) {
      params.set('before_id', beforeId);
    }

    const data = await this.request<
      RawChatMessage[] | { messages?: RawChatMessage[]; direct_messages?: RawChatMessage[] }
    >(`/direct_messages?${params.toString()}`);

    const rawMessages = Array.isArray(data)
      ? data
      : data.direct_messages ?? data.messages ?? [];

    return rawMessages.map((message) => ({
      id: message.id,
      source_guid: message.source_guid,
      created_at: message.created_at,
      user_id: message.sender_id,
      name: message.name,
      avatar_url: message.avatar_url,
      text: message.text,
      favorited_by: [],
      attachments: message.attachments ?? [],
    }));
  }

  async getConversationMessages(conversation: Conversation, beforeId?: string): Promise<Message[]> {
    if (conversation.type === 'chat') {
      return this.getChatMessages(conversation.sourceId, beforeId);
    }
    return this.getMessages(conversation.sourceId, beforeId);
  }

  async sendMessage(groupId: string, text: string): Promise<Message> {
    return this.request<Message>(`/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          source_guid: `${Date.now()}-${Math.random()}`,
          text,
        },
      }),
    });
  }

  async sendDirectMessage(otherUserId: string, text: string): Promise<void> {
    await this.request(`/direct_messages`, {
      method: 'POST',
      body: JSON.stringify({
        direct_message: {
          source_guid: `${Date.now()}-${Math.random()}`,
          recipient_id: otherUserId,
          text,
        },
      }),
    });
  }

  async sendConversationMessage(conversation: Conversation, text: string): Promise<void> {
    if (conversation.type === 'chat') {
      await this.sendDirectMessage(conversation.sourceId, text);
      return;
    }

    await this.sendMessage(conversation.sourceId, text);
  }

  async likeMessage(conversation: Conversation, messageId: string): Promise<void> {
    if (conversation.type === 'chat') {
      return;
    }

    await this.request(`/messages/${conversation.sourceId}/${messageId}/like`, {
      method: 'POST',
    });
  }

  async unlikeMessage(conversation: Conversation, messageId: string): Promise<void> {
    if (conversation.type === 'chat') {
      return;
    }

    await this.request(`/messages/${conversation.sourceId}/${messageId}/unlike`, {
      method: 'POST',
    });
  }
}

export const groupMeService = new GroupMeService();
