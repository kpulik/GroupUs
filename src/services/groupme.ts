const GROUPME_API_BASE = 'https://api.groupme.com/v3';
const GROUPME_IMAGE_API_BASE = 'https://image.groupme.com';
const STRICT_PUBLIC_DOC_MODE = true;
const REMOTE_EMOJI_REACTIONS_SUPPORTED = false;
const REACTION_DEBUG =
  typeof localStorage !== 'undefined' && localStorage.getItem('groupme_reaction_debug') === '1';
const DOCUMENTED_ATTACHMENT_TYPES = new Set(['image', 'location', 'split', 'emoji', 'reply']);
const IMAGE_UPLOAD_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);

type GroupMeCapabilityId =
  | 'strictPublicDocSend'
  | 'imageUpload'
  | 'groupMessageRead'
  | 'groupMessageSend'
  | 'subgroupsRead'
  | 'chatMessageRead'
  | 'directMessageSend'
  | 'groupMessageEdit'
  | 'directMessageDelete';

export type GroupMeFeatureStatus = 'documented' | 'fallback' | 'unsupported';

export interface GroupMeCapabilityEntry {
  id: string;
  label: string;
  status: GroupMeFeatureStatus;
  detail: string;
  lastCheckedAt: number | null;
  lastResponseStatus?: number;
}

export interface GroupMeDiagnosticsReport {
  generatedAt: number;
  features: GroupMeCapabilityEntry[];
}

export interface MessagingPolicy {
  strictPublicDocMode: boolean;
  allowedAttachmentTypes: string[];
}

const GROUPME_CAPABILITY_ORDER: GroupMeCapabilityId[] = [
  'strictPublicDocSend',
  'imageUpload',
  'groupMessageRead',
  'groupMessageSend',
  'subgroupsRead',
  'chatMessageRead',
  'directMessageSend',
  'groupMessageEdit',
  'directMessageDelete',
];

const GROUPME_CAPABILITY_DEFAULTS: Record<
  GroupMeCapabilityId,
  {
    label: string;
    status: GroupMeFeatureStatus;
    detail: string;
  }
> = {
  strictPublicDocSend: {
    label: 'Strict public-doc send mode',
    status: 'documented',
    detail: 'Only image/location/split/emoji attachments are accepted for outgoing messages.',
  },
  imageUpload: {
    label: 'Image upload endpoint',
    status: 'documented',
    detail: 'Uploads use GroupMe image service picture endpoints.',
  },
  groupMessageRead: {
    label: 'Group message retrieval',
    status: 'documented',
    detail: 'Uses documented group message APIs.',
  },
  groupMessageSend: {
    label: 'Group message send',
    status: 'documented',
    detail: 'Uses documented group message send APIs.',
  },
  subgroupsRead: {
    label: 'Subgroup/topic retrieval',
    status: 'fallback',
    detail: 'Uses subgroup APIs that are not clearly documented in current public docs.',
  },
  chatMessageRead: {
    label: 'Direct chat retrieval',
    status: 'fallback',
    detail: 'Uses direct message/chat routes that are not clearly documented in current public docs.',
  },
  directMessageSend: {
    label: 'Direct message send',
    status: 'fallback',
    detail: 'Uses direct message/chat routes that are not clearly documented in current public docs.',
  },
  groupMessageEdit: {
    label: 'Group message edit',
    status: 'fallback',
    detail: 'Edit routes are attempted with compatibility fallbacks and may be unavailable.',
  },
  directMessageDelete: {
    label: 'Direct message delete',
    status: 'fallback',
    detail: 'Delete routes are attempted with compatibility fallbacks and may be unavailable.',
  },
};

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

interface RawUser {
  id: string | number;
  name?: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
  email?: string | null;
}

export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface Group {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  image_url: string | null;
  avatar_url?: string | null;
  creator_user_id?: string;
  created_at?: number;
  updated_at: number;
  messages_count?: number;
  messages?: {
    count?: number;
    preview?: {
      nickname?: string;
      text?: string;
      attachments?: Attachment[];
    };
  };
  members?: Member[] | null;
  member_count?: number;
  parent_id?: string;
  parent_group_id?: string;
  is_subgroup?: boolean;
  share_url?: string;
}

export interface Member {
  id?: string;
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
  conversation_id?: string;
  name: string;
  avatar_url: string | null;
  text: string;
  favorited_by: string[];
  attachments: Attachment[];
  reactions?: unknown;
  emoji_reactions?: unknown;
}

export interface ConversationReadReceipt {
  messageId: string | null;
  readAt: number | null;
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
  messages_count?: number;
  last_read_message_id?: string;
  last_read_at?: number;
  last_message?: {
    conversation_id?: string;
    text?: string;
    name?: string;
    attachments?: Attachment[];
  };
  other_user: ChatUser;
}

export interface Conversation {
  id: string;
  sourceId: string;
  conversationId?: string | null;
  parentSourceId?: string | null;
  type: ConversationType;
  name: string;
  image_url: string | null;
  updated_at: number;
  message_count: number | null;
  members_count: number;
  last_message_text: string | null;
  last_message_sender_name: string | null;
  last_message_attachments: Attachment[];
  read_receipt_message_id?: string | null;
  read_receipt_read_at?: number | null;
}

interface RawChatMessage {
  id: string;
  conversation_id?: string;
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

function normalizeOptionalIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeUnixTimestamp(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue > 1_000_000_000_000
    ? Math.floor(numericValue / 1000)
    : Math.floor(numericValue);
}

function normalizeReadReceiptFromRecord(
  record: Record<string, unknown>,
): ConversationReadReceipt | null {
  const nestedReadReceiptCandidate = record.read_receipt;
  const nestedReadReceiptRecord =
    nestedReadReceiptCandidate && typeof nestedReadReceiptCandidate === 'object'
      ? (nestedReadReceiptCandidate as Record<string, unknown>)
      : null;

  const messageId =
    normalizeOptionalIdentifier(
      nestedReadReceiptRecord?.message_id ?? nestedReadReceiptRecord?.messageId,
    ) ??
    normalizeOptionalIdentifier(record.other_user_last_read_message_id) ??
    normalizeOptionalIdentifier(record.recipient_last_read_message_id) ??
    normalizeOptionalIdentifier(record.read_receipt_message_id) ??
    normalizeOptionalIdentifier(record.last_read_message_id);

  const readAt =
    normalizeUnixTimestamp(
      nestedReadReceiptRecord?.read_at ?? nestedReadReceiptRecord?.readAt,
    ) ??
    normalizeUnixTimestamp(record.other_user_last_read_at) ??
    normalizeUnixTimestamp(record.recipient_last_read_at) ??
    normalizeUnixTimestamp(record.read_receipt_read_at) ??
    normalizeUnixTimestamp(record.last_read_at);

  if (!messageId && !readAt) {
    return null;
  }

  return {
    messageId,
    readAt,
  };
}

function normalizeUser(rawUser: RawUser): User {
  const rawName = typeof rawUser.name === 'string' ? rawUser.name.trim() : '';
  const rawEmail = typeof rawUser.email === 'string' ? rawUser.email.trim() : '';
  const avatarCandidate =
    typeof rawUser.avatar_url === 'string' && rawUser.avatar_url.trim()
      ? rawUser.avatar_url
      : rawUser.image_url;

  return {
    id: String(rawUser.id),
    name: rawName || 'GroupMe User',
    avatar_url: normalizeImageUrl(avatarCandidate),
    email: rawEmail,
  };
}

export interface Attachment {
  type: string;
  url?: string;
  preview_url?: string;
  lat?: string;
  lng?: string;
  name?: string;
  reply_id?: string;
  base_reply_id?: string;
}

export interface UploadOptions {
  onProgress?: (progressPercent: number) => void;
}

function getAttachmentFileExtension(fileName: string): string {
  const extensionStartIndex = fileName.lastIndexOf('.');
  if (extensionStartIndex < 0) {
    return '';
  }

  return fileName.slice(extensionStartIndex + 1).toLowerCase();
}

function isLikelyImageUploadFile(file: File): boolean {
  const normalizedMimeType = (file.type || '').toLowerCase();
  if (normalizedMimeType.startsWith('image/')) {
    return true;
  }

  const extension = getAttachmentFileExtension(file.name);
  return extension ? IMAGE_UPLOAD_EXTENSIONS.has(extension) : false;
}

function normalizeAttachmentType(attachmentType: string): string {
  return attachmentType.trim().toLowerCase();
}

function createInitialCapabilityState(): Record<GroupMeCapabilityId, GroupMeCapabilityEntry> {
  const initialState = {} as Record<GroupMeCapabilityId, GroupMeCapabilityEntry>;

  for (const capabilityId of GROUPME_CAPABILITY_ORDER) {
    const defaults = GROUPME_CAPABILITY_DEFAULTS[capabilityId];
    initialState[capabilityId] = {
      id: capabilityId,
      label: defaults.label,
      status: defaults.status,
      detail: defaults.detail,
      lastCheckedAt: null,
    };
  }

  return initialState;
}

function getGroupMessageCount(group: Group): number | null {
  if (typeof group.messages_count === 'number') {
    return group.messages_count;
  }

  if (group.messages && typeof group.messages.count === 'number') {
    return group.messages.count;
  }

  return null;
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
  const preview = group.messages?.preview;

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
    last_message_text: typeof preview?.text === 'string' ? preview.text : null,
    last_message_sender_name: typeof preview?.nickname === 'string' ? preview.nickname : null,
    last_message_attachments: Array.isArray(preview?.attachments) ? preview.attachments : [],
  };
}

export class GroupMeService {
  private accessToken: string | null = null;
  private capabilityState: Record<GroupMeCapabilityId, GroupMeCapabilityEntry> =
    createInitialCapabilityState();
  private diagnosticsLastRunAt: number | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('groupme_access_token');
  }

  setAccessToken(token: string) {
    this.accessToken = token;
    localStorage.setItem('groupme_access_token', token);
    this.resetCapabilityState();
  }

  clearAccessToken() {
    this.accessToken = null;
    localStorage.removeItem('groupme_access_token');
    this.resetCapabilityState();
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getMessagingPolicy(): MessagingPolicy {
    return {
      strictPublicDocMode: STRICT_PUBLIC_DOC_MODE,
      allowedAttachmentTypes: Array.from(DOCUMENTED_ATTACHMENT_TYPES),
    };
  }

  getCapabilitySnapshot(): GroupMeCapabilityEntry[] {
    return GROUPME_CAPABILITY_ORDER.map((capabilityId) => ({
      ...this.capabilityState[capabilityId],
    }));
  }

  getRuntimeDiagnosticsSnapshot(): GroupMeDiagnosticsReport {
    return {
      generatedAt: this.diagnosticsLastRunAt ?? 0,
      features: this.getCapabilitySnapshot(),
    };
  }

  async runRuntimeDiagnostics(): Promise<GroupMeDiagnosticsReport> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const startedAt = Date.now();
    this.setCapabilityStatus(
      'strictPublicDocSend',
      'documented',
      'Strict public-doc mode is active: only image/location/split/emoji attachments can be sent.',
    );

    let groups: Group[] = [];
    try {
      groups = await this.getGroups();
      this.setCapabilityStatus(
        'groupMessageRead',
        'documented',
        `Group list probe succeeded (${groups.length} groups visible).`,
        200,
      );
    } catch (error) {
      const statusCode = this.getStatusCodeFromError(error);
      this.setCapabilityStatus(
        'groupMessageRead',
        'unsupported',
        `Group list probe failed${statusCode ? ` (status ${statusCode})` : ''}.`,
        statusCode,
      );
    }

    if (groups.length > 0) {
      const groupId = encodeURIComponent(groups[0].id);
      const subgroupProbe = await this.probeEndpoint(`/groups/${groupId}/subgroups`);
      if (subgroupProbe.ok || [304, 400, 422].includes(subgroupProbe.status)) {
        this.setCapabilityStatus(
          'subgroupsRead',
          'fallback',
          `Subgroup endpoint responded (${subgroupProbe.status}).`,
          subgroupProbe.status,
        );
      } else {
        this.setCapabilityStatus(
          'subgroupsRead',
          'unsupported',
          `Subgroup endpoint probe failed (status ${subgroupProbe.status}).`,
          subgroupProbe.status,
        );
      }
    } else {
      this.setCapabilityStatus(
        'subgroupsRead',
        this.capabilityState.subgroupsRead.status,
        'No groups available for subgroup probe. Status kept from previous runtime behavior.',
      );
    }

    let chats: Chat[] = [];
    try {
      chats = await this.getChats();
    } catch (error) {
      const statusCode = this.getStatusCodeFromError(error);
      this.setCapabilityStatus(
        'chatMessageRead',
        'unsupported',
        `Chat list probe failed${statusCode ? ` (status ${statusCode})` : ''}.`,
        statusCode,
      );
    }

    const directChatProbeTarget = chats.find((chat) => chat.other_user?.id);
    if (directChatProbeTarget?.other_user?.id) {
      const encodedOtherUserId = encodeURIComponent(String(directChatProbeTarget.other_user.id));
      const directProbe = await this.probeEndpoint(
        `/direct_messages?other_user_id=${encodedOtherUserId}&limit=1`,
      );

      if (directProbe.ok || [304, 400, 422].includes(directProbe.status)) {
        this.setCapabilityStatus(
          'chatMessageRead',
          'fallback',
          `Direct chat history probe responded (${directProbe.status}) via /direct_messages.`,
          directProbe.status,
        );
      } else if ([404, 405].includes(directProbe.status) && directChatProbeTarget.id) {
        const encodedChatId = encodeURIComponent(String(directChatProbeTarget.id));
        const fallbackProbe = await this.probeEndpoint(`/chats/${encodedChatId}/messages?limit=1`);
        if (fallbackProbe.ok || [304, 400, 422].includes(fallbackProbe.status)) {
          this.setCapabilityStatus(
            'chatMessageRead',
            'fallback',
            `Direct chat history probe responded (${fallbackProbe.status}) via /chats/:id/messages.`,
            fallbackProbe.status,
          );
        } else {
          this.setCapabilityStatus(
            'chatMessageRead',
            'unsupported',
            `Direct chat history probes failed (primary ${directProbe.status}, fallback ${fallbackProbe.status}).`,
            fallbackProbe.status,
          );
        }
      } else {
        this.setCapabilityStatus(
          'chatMessageRead',
          'unsupported',
          `Direct chat history probe failed (status ${directProbe.status}).`,
          directProbe.status,
        );
      }
    } else {
      this.setCapabilityStatus(
        'chatMessageRead',
        this.capabilityState.chatMessageRead.status,
        'No direct chats available for live chat-history probe. Status kept from previous runtime behavior.',
      );
    }

    const directSendProbe = await this.probeEndpoint('/direct_messages', {
      method: 'POST',
      body: JSON.stringify({
        direct_message: {
          source_guid: `diagnostic-${Date.now()}`,
          recipient_id: '',
          text: '',
        },
      }),
    });

    if (directSendProbe.ok || [400, 422].includes(directSendProbe.status)) {
      this.setCapabilityStatus(
        'directMessageSend',
        'fallback',
        `Direct message send probe responded (${directSendProbe.status}).`,
        directSendProbe.status,
      );
    } else {
      this.setCapabilityStatus(
        'directMessageSend',
        'unsupported',
        `Direct message send probe failed (status ${directSendProbe.status}).`,
        directSendProbe.status,
      );
    }

    if (this.capabilityState.groupMessageSend.status !== 'unsupported') {
      this.setCapabilityStatus(
        'groupMessageSend',
        'documented',
        'Live send probe skipped to avoid posting test messages. Status uses documented route configuration.',
      );
    }

    const editProbe = await this.probeEndpoint('/messages/diagnostic-group/diagnostic-message/update', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          text: 'diagnostic',
        },
      }),
    });

    if (editProbe.ok || [400, 422].includes(editProbe.status)) {
      this.setCapabilityStatus(
        'groupMessageEdit',
        'fallback',
        `Message edit probe responded (${editProbe.status}).`,
        editProbe.status,
      );
    } else {
      this.setCapabilityStatus(
        'groupMessageEdit',
        'unsupported',
        `Message edit probe failed (status ${editProbe.status}).`,
        editProbe.status,
      );
    }

    const deleteProbe = await this.probeEndpoint('/direct_messages/diagnostic-message', {
      method: 'DELETE',
    });

    if (deleteProbe.ok || [400, 422].includes(deleteProbe.status)) {
      this.setCapabilityStatus(
        'directMessageDelete',
        'fallback',
        `Direct delete probe responded (${deleteProbe.status}).`,
        deleteProbe.status,
      );
    } else {
      this.setCapabilityStatus(
        'directMessageDelete',
        'unsupported',
        `Direct delete probe failed (status ${deleteProbe.status}).`,
        deleteProbe.status,
      );
    }

    this.diagnosticsLastRunAt = startedAt;
    return this.getRuntimeDiagnosticsSnapshot();
  }

  private resetCapabilityState() {
    this.capabilityState = createInitialCapabilityState();
    this.diagnosticsLastRunAt = null;
  }

  private setCapabilityStatus(
    capabilityId: GroupMeCapabilityId,
    status: GroupMeFeatureStatus,
    detail: string,
    lastResponseStatus?: number,
  ) {
    const currentCapabilityState = this.capabilityState[capabilityId];
    this.capabilityState[capabilityId] = {
      ...currentCapabilityState,
      status,
      detail,
      lastCheckedAt: Date.now(),
      lastResponseStatus,
    };
  }

  private getStatusCodeFromError(error: unknown): number | undefined {
    if (error instanceof GroupMeApiError) {
      return error.status;
    }

    return undefined;
  }

  private ensureDocumentedAttachmentTypes(attachments: Attachment[]) {
    if (!STRICT_PUBLIC_DOC_MODE || attachments.length === 0) {
      return;
    }

    const unsupportedAttachmentTypes = Array.from(
      new Set(
        attachments
          .map((attachment) => normalizeAttachmentType(attachment.type ?? ''))
          .filter((attachmentType) => attachmentType.length > 0)
          .filter((attachmentType) => !DOCUMENTED_ATTACHMENT_TYPES.has(attachmentType)),
      ),
    );

    if (unsupportedAttachmentTypes.length === 0) {
      this.setCapabilityStatus(
        'strictPublicDocSend',
        'documented',
        'Outgoing payload passed strict public-doc attachment checks.',
      );
      return;
    }

    this.setCapabilityStatus(
      'strictPublicDocSend',
      'documented',
      `Blocked unsupported attachment types: ${unsupportedAttachmentTypes.join(', ')}.`,
    );

    throw new Error(
      `Strict public-doc mode only supports image, location, split, and emoji attachments. Remove unsupported attachments: ${unsupportedAttachmentTypes.join(', ')}.`,
    );
  }

  private async probeEndpoint(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<{ ok: boolean; status: number }> {
    const url = new URL(`${GROUPME_API_BASE}${endpoint}`);
    url.searchParams.set('token', this.accessToken as string);

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    return {
      ok: response.ok,
      status: response.status,
    };
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
        'X-Access-Token': this.accessToken,
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

    if (response.status === 204) {
      return undefined as T;
    }

    const rawBody = await response.text();
    if (!rawBody.trim()) {
      return undefined as T;
    }

    const data = JSON.parse(rawBody) as { response?: T };
    if (typeof data === 'object' && data !== null && 'response' in data) {
      return data.response as T;
    }

    return data as T;
  }

  private extractApiErrorMessageFromRawBody(rawBody: string, fallbackMessage: string): string {
    if (!rawBody.trim()) {
      return fallbackMessage;
    }

    try {
      const payload = JSON.parse(rawBody) as {
        meta?: {
          errors?: string[];
        };
        error?: string;
        message?: string;
      };

      const apiMessage = payload?.meta?.errors?.[0] ?? payload?.error ?? payload?.message;
      if (typeof apiMessage === 'string' && apiMessage.trim()) {
        return apiMessage.trim();
      }
    } catch {
      // If the response is plain text, surface a short trimmed message.
    }

    const trimmedBody = rawBody.trim();
    if (!trimmedBody) {
      return fallbackMessage;
    }

    return trimmedBody.length > 240
      ? `${trimmedBody.slice(0, 237).trimEnd()}...`
      : trimmedBody;
  }

  private async postReactionWithLikeIcon(
    endpoint: string,
    likeIconPayload: unknown,
  ): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const url = new URL(`${GROUPME_API_BASE}${endpoint}`);
    url.searchParams.set('token', this.accessToken);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': this.accessToken,
      },
      body: JSON.stringify({
        like_icon: likeIconPayload,
      }),
    });

    if (response.ok) {
      return;
    }

    const rawErrorBody = await response.text();
    const errorMessage = this.extractApiErrorMessageFromRawBody(
      rawErrorBody,
      response.statusText || 'Request failed',
    );

    throw new GroupMeApiError(
      response.status,
      endpoint,
      `GroupMe API error (${response.status}): ${errorMessage}`,
    );
  }

  async uploadImage(file: File, options: UploadOptions = {}): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    if (!(file instanceof File)) {
      throw new Error('Invalid attachment file');
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      return new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', `${GROUPME_IMAGE_API_BASE}/pictures`);
        request.setRequestHeader('X-Access-Token', this.accessToken as string);
        request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        if (request.upload && options.onProgress) {
          request.upload.onprogress = (event) => {
            if (!event.lengthComputable || event.total <= 0) {
              return;
            }

            const progressPercent = Math.max(
              0,
              Math.min(100, Math.round((event.loaded / event.total) * 100)),
            );
            options.onProgress?.(progressPercent);
          };
        }

        request.onerror = () => {
          reject(new Error('Attachment upload request failed.'));
        };

        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            this.setCapabilityStatus(
              'imageUpload',
              'unsupported',
              `Image upload failed with status ${request.status}.`,
              request.status,
            );
            reject(new Error(`Failed to upload attachment (${request.status})`));
            return;
          }

          try {
            const data = JSON.parse(request.responseText) as {
              payload?: {
                url?: string;
                picture_url?: string;
              };
            };

            const uploadedUrl = data.payload?.picture_url ?? data.payload?.url;
            if (!uploadedUrl) {
              this.setCapabilityStatus(
                'imageUpload',
                'unsupported',
                'Image upload endpoint did not return a URL.',
                request.status,
              );
              reject(new Error('Attachment upload did not return a URL'));
              return;
            }

            this.setCapabilityStatus(
              'imageUpload',
              'documented',
              'Image upload succeeded through GroupMe image service.',
              request.status,
            );
            options.onProgress?.(100);
            resolve(uploadedUrl);
          } catch {
            this.setCapabilityStatus(
              'imageUpload',
              'unsupported',
              'Image upload endpoint returned an invalid response payload.',
              request.status,
            );
            reject(new Error('Attachment upload returned an invalid response.'));
          }
        };

        request.send(file);
      });
    }

    const response = await fetch(`${GROUPME_IMAGE_API_BASE}/pictures`, {
      method: 'POST',
      headers: {
        'X-Access-Token': this.accessToken,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      this.setCapabilityStatus(
        'imageUpload',
        'unsupported',
        `Image upload failed with status ${response.status}.`,
        response.status,
      );
      throw new Error(`Failed to upload attachment (${response.status})`);
    }

    const data = (await response.json()) as {
      payload?: {
        url?: string;
        picture_url?: string;
      };
    };

    const uploadedUrl = data.payload?.picture_url ?? data.payload?.url;
    if (!uploadedUrl) {
      this.setCapabilityStatus(
        'imageUpload',
        'unsupported',
        'Image upload endpoint did not return a URL.',
        response.status,
      );
      throw new Error('Attachment upload did not return a URL');
    }

    this.setCapabilityStatus(
      'imageUpload',
      'documented',
      'Image upload succeeded through GroupMe image service.',
      response.status,
    );
    options.onProgress?.(100);
    return uploadedUrl;
  }

  async uploadAttachment(file: File, options: UploadOptions = {}): Promise<string> {
    if (STRICT_PUBLIC_DOC_MODE && !isLikelyImageUploadFile(file)) {
      this.setCapabilityStatus(
        'strictPublicDocSend',
        'documented',
        `Blocked unsupported upload file type: ${file.type || file.name || 'unknown'}.`,
      );
      throw new Error(
        'Strict public-doc mode only supports image uploads. Use photos or send links for other media types.',
      );
    }

    return this.uploadImage(file, options);
  }

  async getMyUser(): Promise<User> {
    const user = await this.request<RawUser>('/users/me');
    return normalizeUser(user);
  }

  async updateMyUser(updates: UpdateUserProfileInput): Promise<User> {
    const payload: Record<string, string> = {};

    if (typeof updates.name === 'string') {
      const nextName = updates.name.trim();
      if (!nextName) {
        throw new Error('Name is required.');
      }

      payload.name = nextName;
    }

    if (typeof updates.email === 'string') {
      const nextEmail = updates.email.trim();
      if (!nextEmail) {
        throw new Error('Email is required.');
      }

      payload.email = nextEmail;
    }

    if (typeof updates.avatar_url === 'string') {
      const nextAvatarUrl = updates.avatar_url.trim();
      if (!nextAvatarUrl) {
        throw new Error('Avatar URL is required.');
      }

      payload.avatar_url = nextAvatarUrl;
    }

    if (Object.keys(payload).length === 0) {
      throw new Error('No profile changes to save.');
    }

    const updatedUser = await this.request<RawUser>('/users/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return normalizeUser(updatedUser);
  }

  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>('/groups');
  }

  async getGroupById(groupId: string): Promise<Group> {
    return this.request<Group>(`/groups/${groupId}`);
  }

  async removeGroupMember(groupId: string, membershipId: string): Promise<void> {
    await this.request(`/groups/${groupId}/members/${membershipId}/remove`, {
      method: 'POST',
    });
  }

  async getChats(): Promise<Chat[]> {
    const response = await this.request<Chat[] | { chats: Chat[] }>('/chats');
    return Array.isArray(response) ? response : response.chats ?? [];
  }

  async getSubgroups(groupId: string): Promise<Group[]> {
    let response: Group[] | { subgroups?: Group[]; groups?: Group[] };
    try {
      response = await this.request<Group[] | { subgroups?: Group[]; groups?: Group[] }>(
        `/groups/${groupId}/subgroups`,
      );
      this.setCapabilityStatus(
        'subgroupsRead',
        'fallback',
        'Subgroup endpoint responded successfully.',
        200,
      );
    } catch (error) {
      const statusCode = this.getStatusCodeFromError(error);
      this.setCapabilityStatus(
        'subgroupsRead',
        'unsupported',
        `Subgroup endpoint failed${statusCode ? ` (status ${statusCode})` : ''}.`,
        statusCode,
      );
      throw error;
    }

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
      .map((chat) => {
        const rawChatRecord = chat as unknown as Record<string, unknown>;
        const readReceipt = normalizeReadReceiptFromRecord(rawChatRecord);

        return {
          id: `chat:${chat.other_user.id}`,
          sourceId: chat.other_user.id,
          conversationId:
            typeof chat.last_message?.conversation_id === 'string'
              ? chat.last_message.conversation_id
              : null,
          parentSourceId: null,
          type: 'chat',
          name: chat.other_user.name?.trim() || `Direct chat ${String(chat.other_user.id).slice(-4)}`,
          image_url: chat.other_user.avatar_url,
          updated_at: chat.updated_at,
          message_count: null,
          members_count: 2,
          last_message_text: typeof chat.last_message?.text === 'string' ? chat.last_message.text : null,
          last_message_sender_name:
            typeof chat.last_message?.name === 'string' ? chat.last_message.name : null,
          last_message_attachments: Array.isArray(chat.last_message?.attachments)
            ? chat.last_message.attachments
            : [],
          read_receipt_message_id: readReceipt?.messageId ?? null,
          read_receipt_read_at: readReceipt?.readAt ?? null,
        };
      });

    return [...mappedGroups, ...mappedChats].sort((a, b) => b.updated_at - a.updated_at);
  }

  async isUserBlocked(userId: string, otherUserId: string): Promise<boolean> {
    const response = await this.request<{ between?: boolean }>(
      `/blocks/between?user=${encodeURIComponent(userId)}&otherUser=${encodeURIComponent(otherUserId)}`,
    );

    return response?.between === true;
  }

  async blockUser(userId: string, otherUserId: string): Promise<void> {
    await this.request(
      `/blocks?user=${encodeURIComponent(userId)}&otherUser=${encodeURIComponent(otherUserId)}`,
      {
        method: 'POST',
      },
    );
  }

  async unblockUser(userId: string, otherUserId: string): Promise<void> {
    const encodedUserId = encodeURIComponent(userId);
    const encodedOtherUserId = encodeURIComponent(otherUserId);

    try {
      await this.request(`/blocks?user=${encodedUserId}&otherUser=${encodedOtherUserId}`, {
        method: 'DELETE',
      });
      return;
    } catch (error) {
      if (!(error instanceof GroupMeApiError)) {
        throw error;
      }

      // Older GroupMe deployments use POST /blocks/delete instead of DELETE /blocks.
      if (error.status !== 404 && error.status !== 405) {
        throw error;
      }
    }

    await this.request(`/blocks/delete?user=${encodedUserId}&otherUser=${encodedOtherUserId}`, {
      method: 'POST',
    });
  }

  async getMessages(groupId: string, beforeId?: string): Promise<Message[]> {
    const endpoint = beforeId
      ? `/groups/${groupId}/messages?before_id=${beforeId}`
      : `/groups/${groupId}/messages`;

    try {
      const data = await this.request<{ messages: Message[] }>(endpoint);
      this.setCapabilityStatus(
        'groupMessageRead',
        'documented',
        'Group message retrieval succeeded.',
        200,
      );
      return data.messages ?? [];
    } catch (error) {
      if (error instanceof GroupMeApiError && error.status === 304) {
        this.setCapabilityStatus(
          'groupMessageRead',
          'documented',
          'Group message retrieval returned 304 (no new messages).',
          304,
        );
        return [];
      }

      const statusCode = this.getStatusCodeFromError(error);
      this.setCapabilityStatus(
        'groupMessageRead',
        'unsupported',
        `Group message retrieval failed${statusCode ? ` (status ${statusCode})` : ''}.`,
        statusCode,
      );

      throw error;
    }
  }

  async getChatMessages(otherUserId: string, beforeId?: string): Promise<Message[]> {
    const params = new URLSearchParams({ other_user_id: otherUserId });
    if (beforeId) {
      params.set('before_id', beforeId);
    }

    let data: RawChatMessage[] | { messages?: RawChatMessage[]; direct_messages?: RawChatMessage[] };
    let primaryStatusCode: number | undefined;
    try {
      data = await this.request<
        RawChatMessage[] | { messages?: RawChatMessage[]; direct_messages?: RawChatMessage[] }
      >(`/direct_messages?${params.toString()}`);
      this.setCapabilityStatus(
        'chatMessageRead',
        'fallback',
        'Direct chat retrieval succeeded via /direct_messages.',
        200,
      );
    } catch (error) {
      if (error instanceof GroupMeApiError && error.status === 304) {
        this.setCapabilityStatus(
          'chatMessageRead',
          'fallback',
          'Direct chat retrieval returned 304 (no new messages).',
          304,
        );
        return [];
      }

      if (!(error instanceof GroupMeApiError)) {
        this.setCapabilityStatus(
          'chatMessageRead',
          'unsupported',
          'Direct chat retrieval failed before receiving a route response.',
        );
        throw error;
      }

      primaryStatusCode = error.status;

      if (![400, 404, 405, 422].includes(error.status)) {
        this.setCapabilityStatus(
          'chatMessageRead',
          'unsupported',
          `Direct chat retrieval failed with status ${error.status}.`,
          error.status,
        );
        throw error;
      }

      const chats = await this.getChats();
      const matchingChat = chats.find(
        (chat) => String(chat.other_user.id) === String(otherUserId) && Boolean(chat.id),
      );
      if (!matchingChat?.id) {
        this.setCapabilityStatus(
          'chatMessageRead',
          'unsupported',
          `Direct chat fallback route could not be resolved (primary status ${error.status}).`,
          error.status,
        );
        throw new Error(
          'Direct chat history is unavailable through current GroupMe routes. Try again later.',
        );
      }

      const encodedChatId = encodeURIComponent(String(matchingChat.id));
      const fallbackEndpoint = beforeId
        ? `/chats/${encodedChatId}/messages?before_id=${encodeURIComponent(beforeId)}`
        : `/chats/${encodedChatId}/messages`;

      try {
        data = await this.request<
          RawChatMessage[] | { messages?: RawChatMessage[]; direct_messages?: RawChatMessage[] }
        >(fallbackEndpoint);
        this.setCapabilityStatus(
          'chatMessageRead',
          'fallback',
          'Direct chat retrieval succeeded via fallback /chats/:id/messages route.',
          200,
        );
      } catch (fallbackError) {
        if (fallbackError instanceof GroupMeApiError && fallbackError.status === 304) {
          this.setCapabilityStatus(
            'chatMessageRead',
            'fallback',
            'Direct chat fallback retrieval returned 304 (no new messages).',
            304,
          );
          return [];
        }

        const fallbackStatusCode = this.getStatusCodeFromError(fallbackError);
        this.setCapabilityStatus(
          'chatMessageRead',
          'unsupported',
          `Direct chat routes failed (primary ${primaryStatusCode ?? 'n/a'}, fallback ${fallbackStatusCode ?? 'n/a'}).`,
          fallbackStatusCode ?? primaryStatusCode,
        );
        throw new Error(
          'Direct chat history is unavailable through current GroupMe routes. Try again later.',
        );
      }
    }

    const rawMessages = Array.isArray(data)
      ? data
      : data.direct_messages ?? data.messages ?? [];

    return rawMessages.map((message) => {
      const rawMessageRecord = message as unknown as Record<string, unknown>;
      const rawFavorites = rawMessageRecord.favorited_by;

      return {
        ...rawMessageRecord,
        id: message.id,
        conversation_id:
          typeof message.conversation_id === 'string' ? message.conversation_id : undefined,
        source_guid: message.source_guid,
        created_at: message.created_at,
        user_id: message.sender_id,
        name: message.name,
        avatar_url: message.avatar_url,
        text: message.text,
        favorited_by: Array.isArray(rawFavorites)
          ? rawFavorites
              .map((favoriteUserId) => String(favoriteUserId).trim())
              .filter((favoriteUserId) => favoriteUserId.length > 0)
          : [],
        attachments: message.attachments ?? [],
      } as Message;
    });
  }

  async getConversationMessages(conversation: Conversation, beforeId?: string): Promise<Message[]> {
    if (conversation.type === 'chat') {
      return this.getChatMessages(conversation.sourceId, beforeId);
    }
    return this.getMessages(conversation.sourceId, beforeId);
  }

  async sendMessage(groupId: string, text: string, attachments: Attachment[] = []): Promise<Message> {
    this.ensureDocumentedAttachmentTypes(attachments);

    const trimmedText = text.trim();
    const payloadMessage: {
      source_guid: string;
      text?: string;
      attachments?: Attachment[];
    } = {
      source_guid: `${Date.now()}-${Math.random()}`,
    };

    if (trimmedText) {
      payloadMessage.text = trimmedText;
    }

    if (attachments.length > 0) {
      payloadMessage.attachments = attachments;
    }

    if (!payloadMessage.text && !payloadMessage.attachments) {
      throw new Error('Message must include text or at least one attachment');
    }

    try {
      const message = await this.request<Message>(`/groups/${groupId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: payloadMessage,
        }),
      });
      this.setCapabilityStatus(
        'groupMessageSend',
        'documented',
        'Group message send succeeded via documented endpoint.',
        200,
      );
      return message;
    } catch (error) {
      const statusCode = this.getStatusCodeFromError(error);
      this.setCapabilityStatus(
        'groupMessageSend',
        'unsupported',
        `Group message send failed${statusCode ? ` (status ${statusCode})` : ''}.`,
        statusCode,
      );
      throw error;
    }
  }

  async sendDirectMessage(otherUserId: string, text: string, attachments: Attachment[] = []): Promise<void> {
    this.ensureDocumentedAttachmentTypes(attachments);

    const trimmedText = text.trim();
    const payloadMessage: {
      source_guid: string;
      recipient_id: string;
      text?: string;
      attachments?: Attachment[];
    } = {
      source_guid: `${Date.now()}-${Math.random()}`,
      recipient_id: otherUserId,
    };

    if (trimmedText) {
      payloadMessage.text = trimmedText;
    }

    if (attachments.length > 0) {
      payloadMessage.attachments = attachments;
    }

    if (!payloadMessage.text && !payloadMessage.attachments) {
      throw new Error('Message must include text or at least one attachment');
    }

    let primaryStatusCode: number | undefined;
    try {
      await this.request(`/direct_messages`, {
        method: 'POST',
        body: JSON.stringify({
          direct_message: payloadMessage,
        }),
      });
      this.setCapabilityStatus(
        'directMessageSend',
        'fallback',
        'Direct message send succeeded via /direct_messages (direct_message payload).',
        200,
      );
      return;
    } catch (primaryError) {
      if (!(primaryError instanceof GroupMeApiError)) {
        this.setCapabilityStatus(
          'directMessageSend',
          'unsupported',
          'Direct message send failed before receiving a route response.',
        );
        throw primaryError;
      }

      primaryStatusCode = primaryError.status;

      if (![400, 404, 422].includes(primaryError.status)) {
        this.setCapabilityStatus(
          'directMessageSend',
          'unsupported',
          `Direct message send failed with status ${primaryError.status}.`,
          primaryError.status,
        );
        throw primaryError;
      }
    }

    let secondaryStatusCode: number | undefined;
    try {
      await this.request(`/direct_messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: payloadMessage,
        }),
      });
      this.setCapabilityStatus(
        'directMessageSend',
        'fallback',
        'Direct message send succeeded via /direct_messages (message payload fallback).',
        200,
      );
      return;
    } catch (secondaryError) {
      if (!(secondaryError instanceof GroupMeApiError)) {
        this.setCapabilityStatus(
          'directMessageSend',
          'unsupported',
          'Direct message send fallback failed before receiving a route response.',
        );
        throw secondaryError;
      }

      secondaryStatusCode = secondaryError.status;

      if (![400, 404, 405, 422].includes(secondaryError.status)) {
        this.setCapabilityStatus(
          'directMessageSend',
          'unsupported',
          `Direct message send fallback failed with status ${secondaryError.status}.`,
          secondaryError.status,
        );
        throw secondaryError;
      }
    }

    const chats = await this.getChats();
    const matchingChat = chats.find(
      (chat) => String(chat.other_user.id) === String(otherUserId) && Boolean(chat.id),
    );
    if (!matchingChat?.id) {
      this.setCapabilityStatus(
        'directMessageSend',
        'unsupported',
        `Direct message send routes failed and no chat fallback route could be resolved (primary ${primaryStatusCode ?? 'n/a'}, secondary ${secondaryStatusCode ?? 'n/a'}).`,
        secondaryStatusCode ?? primaryStatusCode,
      );
      throw new Error(
        'Direct message send is unavailable through current GroupMe routes. Try again later.',
      );
    }

    const encodedChatId = encodeURIComponent(String(matchingChat.id));
    try {
      await this.request(`/chats/${encodedChatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: {
            source_guid: payloadMessage.source_guid,
            text: payloadMessage.text,
            attachments: payloadMessage.attachments,
          },
        }),
      });
      this.setCapabilityStatus(
        'directMessageSend',
        'fallback',
        'Direct message send succeeded via fallback /chats/:id/messages route.',
        200,
      );
    } catch (fallbackError) {
      const fallbackStatusCode = this.getStatusCodeFromError(fallbackError);
      this.setCapabilityStatus(
        'directMessageSend',
        'unsupported',
        `Direct message routes failed (primary ${primaryStatusCode ?? 'n/a'}, secondary ${secondaryStatusCode ?? 'n/a'}, fallback ${fallbackStatusCode ?? 'n/a'}).`,
        fallbackStatusCode ?? secondaryStatusCode ?? primaryStatusCode,
      );
      throw new Error(
        'Direct message send is unavailable through current GroupMe routes. Try again later.',
      );
    }
  }

  async sendConversationMessage(
    conversation: Conversation,
    text: string,
    attachments: Attachment[] = [],
  ): Promise<void> {
    if (conversation.type === 'chat') {
      await this.sendDirectMessage(conversation.sourceId, text, attachments);
      return;
    }

    await this.sendMessage(conversation.sourceId, text, attachments);
  }

  async deleteMessage(groupId: string, messageId: string): Promise<void> {
    try {
      await this.request(`/messages/${groupId}/${messageId}`, {
        method: 'DELETE',
      });
      return;
    } catch (error) {
      if (!(error instanceof GroupMeApiError)) {
        throw error;
      }

      if (![404, 405].includes(error.status)) {
        throw error;
      }
    }

    await this.request(`/groups/${groupId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async deleteDirectMessage(messageId: string): Promise<void> {
    const deleteRouteAttempts: Array<{ endpoint: string; method: 'DELETE' | 'POST' }> = [
      {
        endpoint: `/direct_messages/${messageId}`,
        method: 'DELETE',
      },
      {
        endpoint: `/messages/${messageId}`,
        method: 'DELETE',
      },
      {
        endpoint: `/direct_messages/${messageId}/delete`,
        method: 'POST',
      },
    ];

    let lastRouteError: unknown = null;
    for (const deleteRouteAttempt of deleteRouteAttempts) {
      try {
        await this.request(deleteRouteAttempt.endpoint, {
          method: deleteRouteAttempt.method,
        });
        this.setCapabilityStatus(
          'directMessageDelete',
          'fallback',
          `Direct delete succeeded via ${deleteRouteAttempt.method} ${deleteRouteAttempt.endpoint}.`,
          200,
        );
        return;
      } catch (error) {
        lastRouteError = error;
        if (!(error instanceof GroupMeApiError)) {
          this.setCapabilityStatus(
            'directMessageDelete',
            'unsupported',
            'Direct delete failed before receiving a route response.',
          );
          throw error;
        }

        if (![404, 405].includes(error.status)) {
          throw error;
        }
      }
    }

    if (lastRouteError instanceof GroupMeApiError) {
      this.setCapabilityStatus(
        'directMessageDelete',
        'unsupported',
        `Direct delete routes are unavailable (last status ${lastRouteError.status}).`,
        lastRouteError.status,
      );
      throw new Error(
        `Direct message deletion is unavailable through current GroupMe routes (last status ${lastRouteError.status}).`,
      );
    }

    this.setCapabilityStatus(
      'directMessageDelete',
      'unsupported',
      'Direct delete routes are unavailable.',
    );
    throw new Error(
      'Direct message deletion is unavailable through current GroupMe routes.',
    );
  }

  async deleteConversationMessage(conversation: Conversation, messageId: string): Promise<void> {
    if (conversation.type === 'chat') {
      await this.deleteDirectMessage(messageId);
      return;
    }

    await this.deleteMessage(conversation.sourceId, messageId);
  }

  async editConversationMessage(conversation: Conversation, messageId: string, text: string): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Edited message text cannot be empty.');
    }

    if (conversation.type === 'chat') {
      this.setCapabilityStatus(
        'groupMessageEdit',
        'unsupported',
        'Direct message editing is unsupported by current documented routes.',
      );
      throw new Error('Direct-message editing is not supported by current GroupMe API docs.');
    }

    const endpointAttempts: Array<{
      endpoint: string;
      method: 'POST' | 'PUT';
      body: string;
    }> = [
      {
        endpoint: `/messages/${conversation.sourceId}/${messageId}/update`,
        method: 'POST',
        body: JSON.stringify({
          message: {
            text: trimmedText,
          },
        }),
      },
      {
        endpoint: `/messages/${conversation.sourceId}/${messageId}/update`,
        method: 'POST',
        body: JSON.stringify({
          text: trimmedText,
        }),
      },
      {
        endpoint: `/groups/${conversation.sourceId}/messages/${messageId}/update`,
        method: 'POST',
        body: JSON.stringify({
          message: {
            text: trimmedText,
          },
        }),
      },
      {
        endpoint: `/messages/${conversation.sourceId}/${messageId}`,
        method: 'PUT',
        body: JSON.stringify({
          message: {
            text: trimmedText,
          },
        }),
      },
    ];

    let lastAttemptError: unknown = null;
    for (const endpointAttempt of endpointAttempts) {
      try {
        await this.request(endpointAttempt.endpoint, {
          method: endpointAttempt.method,
          body: endpointAttempt.body,
        });
        this.setCapabilityStatus(
          'groupMessageEdit',
          'fallback',
          `Message edit succeeded via ${endpointAttempt.method} ${endpointAttempt.endpoint}.`,
          200,
        );
        return;
      } catch (error) {
        lastAttemptError = error;
        if (!(error instanceof GroupMeApiError)) {
          this.setCapabilityStatus(
            'groupMessageEdit',
            'unsupported',
            'Message edit failed before receiving a route response.',
          );
          throw error;
        }

        if (![400, 404, 405, 422, 501].includes(error.status)) {
          throw error;
        }
      }
    }

    if (lastAttemptError instanceof GroupMeApiError) {
      this.setCapabilityStatus(
        'groupMessageEdit',
        'unsupported',
        `Message edit routes are unavailable (last status ${lastAttemptError.status}).`,
        lastAttemptError.status,
      );
      throw new Error(
        `Message editing is unavailable through current GroupMe routes (last status ${lastAttemptError.status}).`,
      );
    }

    this.setCapabilityStatus(
      'groupMessageEdit',
      'unsupported',
      'Message edit routes are unavailable.',
    );
    throw new Error(
      'Message editing is unavailable through current GroupMe routes.',
    );
  }

  private parseConversationReadReceiptResponse(payload: unknown): ConversationReadReceipt | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const readReceiptCandidate = payloadRecord.read_receipt;
    const normalizedPayloadRecord =
      readReceiptCandidate && typeof readReceiptCandidate === 'object'
        ? (readReceiptCandidate as Record<string, unknown>)
        : payloadRecord;

    const messageId = normalizeOptionalIdentifier(
      normalizedPayloadRecord.message_id ?? normalizedPayloadRecord.messageId,
    );
    const readAt = normalizeUnixTimestamp(
      normalizedPayloadRecord.read_at ?? normalizedPayloadRecord.readAt,
    );

    if (!messageId && !readAt) {
      return null;
    }

    return {
      messageId,
      readAt,
    };
  }

  async syncConversationReadReceipt(
    conversation: Conversation,
    messageId?: string,
  ): Promise<ConversationReadReceipt | null> {
    const conversationIdCandidates = Array.from(
      new Set(
        [
          conversation.type === 'chat' ? conversation.conversationId : null,
          conversation.sourceId,
        ]
          .map((conversationIdCandidate) =>
            typeof conversationIdCandidate === 'string' ? conversationIdCandidate.trim() : '',
          )
          .filter((conversationIdCandidate) => conversationIdCandidate.length > 0),
      ),
    );

    if (conversationIdCandidates.length === 0) {
      return null;
    }

    const normalizedMessageId = typeof messageId === 'string' ? messageId.trim() : '';
    let lastRouteError: GroupMeApiError | null = null;

    for (const conversationIdCandidate of conversationIdCandidates) {
      const encodedConversationId = encodeURIComponent(conversationIdCandidate);
      const endpointAttempts: string[] = [];

      if (normalizedMessageId.length > 0) {
        endpointAttempts.push(
          `/conversations/${encodedConversationId}/${encodeURIComponent(normalizedMessageId)}/read_receipt`,
        );
      }

      endpointAttempts.push(`/conversations/${encodedConversationId}/read_receipt`);

      for (const endpointAttempt of endpointAttempts) {
        try {
          const response = await this.request<unknown>(endpointAttempt, {
            method: 'POST',
          });

          return this.parseConversationReadReceiptResponse(response);
        } catch (error) {
          if (!(error instanceof GroupMeApiError)) {
            throw error;
          }

          lastRouteError = error;
          if (![400, 404, 405, 422].includes(error.status)) {
            throw error;
          }
        }
      }
    }

    if (lastRouteError) {
      return null;
    }

    return null;
  }

  async likeMessage(
    conversation: Conversation,
    messageId: string,
    conversationIdOverride?: string,
  ): Promise<void> {
    await this.setMessageLikeState(conversation, messageId, 'like', conversationIdOverride);
  }

  async unlikeMessage(
    conversation: Conversation,
    messageId: string,
    conversationIdOverride?: string,
  ): Promise<void> {
    await this.setMessageLikeState(conversation, messageId, 'unlike', conversationIdOverride);
  }

  supportsRemoteEmojiReactions(): boolean {
    return REMOTE_EMOJI_REACTIONS_SUPPORTED;
  }

  private resolveReactionConversationId(
    conversation: Conversation,
    conversationIdOverride?: string,
  ): string {
    if (typeof conversationIdOverride === 'string') {
      const trimmedOverride = conversationIdOverride.trim();
      if (trimmedOverride) {
        return trimmedOverride;
      }
    }

    if (conversation.type === 'chat') {
      const chatConversationId =
        typeof conversation.conversationId === 'string' ? conversation.conversationId.trim() : '';
      if (chatConversationId) {
        return chatConversationId;
      }
    }

    return conversation.sourceId;
  }

  private getReactionConversationIdCandidates(
    conversation: Conversation,
    conversationIdOverride?: string,
  ): string[] {
    const rawCandidates = [
      conversationIdOverride,
      conversation.type === 'chat' ? conversation.conversationId : null,
      this.resolveReactionConversationId(conversation, conversationIdOverride),
      conversation.sourceId,
    ];

    return Array.from(
      new Set(
        rawCandidates
          .map((conversationIdCandidate) =>
            typeof conversationIdCandidate === 'string' ? conversationIdCandidate.trim() : '',
          )
          .filter((conversationIdCandidate) => conversationIdCandidate.length > 0),
      ),
    );
  }

  private async setMessageLikeState(
    conversation: Conversation,
    messageId: string,
    action: 'like' | 'unlike',
    conversationIdOverride?: string,
  ): Promise<void> {
    const reactionConversationIdCandidates = this.getReactionConversationIdCandidates(
      conversation,
      conversationIdOverride,
    );

    if (REACTION_DEBUG) {
      console.info('[reaction-debug] setMessageLikeState', {
        action,
        messageId,
        conversationType: conversation.type,
        sourceId: conversation.sourceId,
        conversationId: conversation.conversationId ?? null,
        override: conversationIdOverride ?? null,
        candidates: reactionConversationIdCandidates,
      });
    }

    if (reactionConversationIdCandidates.length === 0) {
      throw new Error('Unable to resolve a conversation ID for this reaction.');
    }

    const encodedMessageId = encodeURIComponent(messageId);
    const retryableStatuses = new Set([400, 403, 404, 405, 422, 500]);
    const attemptedEndpoints: { endpoint: string; status: number }[] = [];
    let lastError: unknown = null;

    for (const reactionConversationIdCandidate of reactionConversationIdCandidates) {
      // Preserve literal '+' in DM conversation IDs (e.g. "userId1+userId2").
      // encodeURIComponent converts '+' to '%2B' which GroupMe's API does not route correctly.
      const encodedConversationId = encodeURIComponent(reactionConversationIdCandidate).replace(
        /%2B/gi,
        '+',
      );
      const endpoint = `/messages/${encodedConversationId}/${encodedMessageId}/${action}`;

      try {
        await this.request(endpoint, {
          method: 'POST',
        });
        if (REACTION_DEBUG) {
          console.info('[reaction-debug] success', { endpoint });
        }
        return;
      } catch (error) {
        lastError = error;
        if (!(error instanceof GroupMeApiError)) {
          throw error;
        }

        attemptedEndpoints.push({ endpoint, status: error.status });
        if (REACTION_DEBUG) {
          console.warn('[reaction-debug] attempt failed', { endpoint, status: error.status });
        }

        if (!retryableStatuses.has(error.status)) {
          throw error;
        }
      }
    }

    if (lastError instanceof GroupMeApiError) {
      const uniqueStatuses = Array.from(
        new Set(attemptedEndpoints.map((attempt) => attempt.status)),
      );
      const statusesLabel =
        uniqueStatuses.length > 0 ? uniqueStatuses.join(', ') : String(lastError.status);
      const candidatesLabel = reactionConversationIdCandidates.join(', ');
      throw new Error(
        `Unable to sync reaction (statuses: ${statusesLabel}, candidates: ${candidatesLabel}).`,
      );
    }

    throw new Error('Unable to sync reaction right now.');
  }

  private async setUnicodeMessageReaction(
    conversation: Conversation,
    messageId: string,
    emoji: string,
    action: 'like' | 'unlike',
    conversationIdOverride?: string,
  ): Promise<void> {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      throw new Error('Reaction emoji is required.');
    }

    const reactionConversationIdCandidates = this.getReactionConversationIdCandidates(
      conversation,
      conversationIdOverride,
    );

    if (reactionConversationIdCandidates.length === 0) {
      throw new Error('Unable to resolve a reaction conversation ID.');
    }

    const likeIconPayloadCandidates: unknown[] = [
      {
        type: 'unicode',
        code: normalizedEmoji,
      },
      normalizedEmoji,
    ];

    const attemptedStatuses: number[] = [];
    const retryableStatuses = new Set([400, 403, 404, 405, 422, 500]);
    let lastError: unknown = null;

    const encodedMessageId = encodeURIComponent(messageId);
    for (const reactionConversationIdCandidate of reactionConversationIdCandidates) {
      const encodedConversationId = encodeURIComponent(reactionConversationIdCandidate).replace(
        /%2B/gi,
        '+',
      );
      const endpoint = `/messages/${encodedConversationId}/${encodedMessageId}/${action}`;

      for (const likeIconPayloadCandidate of likeIconPayloadCandidates) {
        try {
          await this.postReactionWithLikeIcon(endpoint, likeIconPayloadCandidate);
          return;
        } catch (error) {
          lastError = error;

          if (!(error instanceof GroupMeApiError)) {
            const normalizedErrorMessage =
              error instanceof Error ? error.message.trim().toLowerCase() : '';
            if (
              normalizedErrorMessage.includes('failed to fetch') ||
              normalizedErrorMessage.includes('networkerror') ||
              normalizedErrorMessage.includes('network request failed') ||
              normalizedErrorMessage.includes('load failed')
            ) {
              throw new Error('Could not reach GroupMe while updating this reaction.');
            }

            throw error;
          }

          attemptedStatuses.push(error.status);
          if (!retryableStatuses.has(error.status)) {
            throw new Error(
              `Emoji reaction failed (${error.status}): ${error.message}`,
            );
          }
        }
      }
    }

    if (lastError instanceof GroupMeApiError) {
      const uniqueAttemptedStatuses = Array.from(new Set(attemptedStatuses));
      const attemptedStatusesSummary = uniqueAttemptedStatuses.length > 0
        ? uniqueAttemptedStatuses.join(', ')
        : String(lastError.status);
      throw new Error(
        `Unable to sync emoji reaction right now (statuses: ${attemptedStatusesSummary}).`,
      );
    }

    throw new Error('Unable to sync emoji reaction right now.');
  }

  async addEmojiReaction(
    conversation: Conversation,
    messageId: string,
    emoji: string,
    conversationIdOverride?: string,
  ): Promise<void> {
    await this.setUnicodeMessageReaction(
      conversation,
      messageId,
      emoji,
      'like',
      conversationIdOverride,
    );
  }

  async removeEmojiReaction(
    conversation: Conversation,
    messageId: string,
    emoji: string,
    conversationIdOverride?: string,
  ): Promise<void> {
    await this.setUnicodeMessageReaction(
      conversation,
      messageId,
      emoji,
      'unlike',
      conversationIdOverride,
    );
  }
}

export const groupMeService = new GroupMeService();
