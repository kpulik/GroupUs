import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BellOff,
  Bold,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Code2,
  FileText,
  Image as ImageIcon,
  Info,
  Italic,
  Link2,
  MapPin,
  Mic,
  Pin,
  Quote,
  QrCode,
  Search,
  Send,
  Smile,
  Strikethrough,
  Underline,
  Users,
  Video,
  X,
} from 'lucide-react';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  Conversation,
  ConversationReadReceipt,
  Group,
  Member,
  Message,
  groupMeService,
  normalizeImageUrl,
} from '../../services/groupme';
import { Avatar } from '../Common/Avatar';

interface MessageViewProps {
  conversation: Conversation;
  activeConversation: Conversation;
  currentUserId: string;
  quickComposerEmojis: string[];
  quickReactionEmojis: string[];
  isConversationMuted: boolean;
  onToggleConversationMute: () => void;
  notificationPreviewMode: 'default' | 'on' | 'off';
  onSetNotificationPreviewMode: (nextMode: 'default' | 'on' | 'off') => void;
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

interface ComposerDraftAttachment {
  id: string;
  kind: 'photo' | 'video' | 'file';
  name: string;
  size: number;
  file: File;
}

type GalleryMediaType = 'image' | 'video' | 'file' | 'location';
type GalleryMediaFilter = 'all' | 'images' | 'videos' | 'files' | 'locations';
type MediaSearchKind = 'gifs' | 'images' | 'videos';
type CameraCaptureMode = 'photo' | 'video';
type CameraFacingMode = 'environment' | 'user';
type CameraQualityPreset = 'low' | 'medium' | 'high' | 'max';

interface CameraQualityProfile {
  id: CameraQualityPreset;
  label: string;
  photoWidth: number;
  photoHeight: number;
  photoJpegQuality: number;
  videoWidth: number;
  videoHeight: number;
  videoFrameRate: number;
}

interface MessageReactionChip {
  emoji: string;
  count: number;
  isActive: boolean;
  source: 'groupme-like' | 'groupme-emoji';
  reactors: MessageReactionActor[];
}

interface MessageReactionActor {
  userId: string;
  name: string;
  reactedAt: number | null;
}

interface ParsedMessageReactionEvent {
  userId: string;
  reactedAt: number | null;
}

interface OpenReactionDetailsState {
  messageId: string;
  emoji: string;
  reactors: MessageReactionActor[];
  isActive: boolean;
}

interface GalleryMediaEntry {
  id: string;
  messageId: string;
  type: GalleryMediaType;
  senderName: string;
  createdAt: number;
  imageUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  lat?: string;
  lng?: string;
  locationName?: string;
}

interface PendingAudioDraft {
  id: string;
  blob: Blob;
  objectUrl: string;
  durationMs: number;
}

interface MemeEditorState {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  senderName: string;
}

interface MediaSearchResult {
  id: string;
  mediaType: 'gif' | 'image' | 'video';
  title: string;
  mediaUrl: string;
  previewUrl: string;
  source: 'tenor' | 'wikimedia';
}

interface AlbumImageEntry {
  id: string;
  imageUrl: string;
  messageId: string;
  senderName: string;
  addedAt: number;
}

interface ImageAlbum {
  id: string;
  name: string;
  createdAt: number;
  images: AlbumImageEntry[];
}

type PhotoUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed';

interface PhotoDraftUploadState {
  status: PhotoUploadStatus;
  progress: number;
  uploadedUrl?: string;
  error?: string;
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
const URL_PATTERN = '(?:https?:\\/\\/|www\\.|(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,})[^\\s<]*';
const MAX_PREVIEWED_LINKS = 40;
const MESSAGE_MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'u'])),
};
const IMAGE_ALBUMS_STORAGE_KEY = 'groupus_image_albums_by_conversation';
const MARKDOWN_COMPOSER_ENABLED_STORAGE_KEY = 'groupus_markdown_composer_enabled';
const SYSTEM_MESSAGE_ATTACHMENT_HINTS = ['system', 'event', 'linebreak'];
const MAX_PHOTO_DRAFT_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_DRAFT_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_DRAFT_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_COMPOSER_DRAFT_ATTACHMENTS = 10;
const CAMERA_QUALITY_PROFILES: Record<CameraQualityPreset, CameraQualityProfile> = {
  low: {
    id: 'low',
    label: 'Low',
    photoWidth: 960,
    photoHeight: 540,
    photoJpegQuality: 0.82,
    videoWidth: 960,
    videoHeight: 540,
    videoFrameRate: 24,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    photoWidth: 1280,
    photoHeight: 720,
    photoJpegQuality: 0.9,
    videoWidth: 1280,
    videoHeight: 720,
    videoFrameRate: 30,
  },
  high: {
    id: 'high',
    label: 'High',
    photoWidth: 1920,
    photoHeight: 1080,
    photoJpegQuality: 0.95,
    videoWidth: 1920,
    videoHeight: 1080,
    videoFrameRate: 30,
  },
  max: {
    id: 'max',
    label: 'Max',
    photoWidth: 3840,
    photoHeight: 2160,
    photoJpegQuality: 0.98,
    videoWidth: 3840,
    videoHeight: 2160,
    videoFrameRate: 60,
  },
};
const CAMERA_QUALITY_ORDER: CameraQualityPreset[] = ['low', 'medium', 'high', 'max'];
const MEDIA_SEARCH_RESULTS_LIMIT = 24;
const TENOR_PUBLIC_API_KEY = 'LIVDSRZULELA';
const GROUPME_LIKE_EMOJI = '❤️';
const GROUPME_HEART_REACTION_ALIASES = new Set(['❤️', '❤', '♥', '♥️']);
const ALLOWED_FILE_DRAFT_EXTENSIONS = new Set([
  'csv',
  'doc',
  'docx',
  'json',
  'log',
  'md',
  'pdf',
  'ppt',
  'pptx',
  'rtf',
  'txt',
  'xls',
  'xlsx',
  'xml',
  'zip',
]);
const IMAGE_FILE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
const VIDEO_FILE_EXTENSIONS = new Set(['3gp', 'avi', 'm4v', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const ALLOWED_FILE_DRAFT_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'application/x-zip-compressed',
  'application/zip',
  'text/csv',
  'text/markdown',
  'text/plain',
]);
const ALLOWED_VIDEO_DRAFT_MIME_TYPES = new Set([
  'video/3gpp',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
]);
const MODERATION_REMOVAL_TEXT_PATTERNS = [
  /removed by (the )?moderator/i,
  /moderator removed/i,
  /message (was )?(removed|deleted)/i,
  /removed (a|this) message/i,
  /deleted for violating/i,
  /content .* removed/i,
  /violat(?:e|ed|ing|ion).*(policy|guideline|rule)/i,
];

interface LinkPreviewMetadata {
  title?: string;
  description?: string;
  imageUrl?: string | null;
  siteName?: string;
}

interface LinkPreviewState {
  status: 'loading' | 'ready' | 'error';
  metadata?: LinkPreviewMetadata;
}

interface MicrolinkResponse {
  status?: string;
  data?: {
    title?: string;
    description?: string;
    publisher?: string;
    image?:
      | string
      | {
          url?: string;
        }
      | null;
  };
}

interface NoEmbedResponse {
  title?: string;
  provider_name?: string;
  author_name?: string;
  thumbnail_url?: string;
  error?: string;
}

interface TenorSearchResponse {
  results?: Array<{
    id?: string;
    content_description?: string;
    media_formats?: Record<string, { url?: string }>;
  }>;
}

interface WikimediaSearchResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid?: number;
        title?: string;
        imageinfo?: Array<{
          url?: string;
          mime?: string;
        }>;
      }
    >;
  };
}

interface OpenStreetMapPlaceResponse {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
}

interface LocationSearchResult {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

function readMediaCapabilityMax(capabilityRange: unknown): number | null {
  if (!capabilityRange || typeof capabilityRange !== 'object') {
    return null;
  }

  const maxValue = (capabilityRange as { max?: unknown }).max;
  if (typeof maxValue !== 'number' || !Number.isFinite(maxValue) || maxValue <= 0) {
    return null;
  }

  return maxValue;
}

function readMediaCapabilityMin(capabilityRange: unknown): number | null {
  if (!capabilityRange || typeof capabilityRange !== 'object') {
    return null;
  }

  const minValue = (capabilityRange as { min?: unknown }).min;
  if (typeof minValue !== 'number' || !Number.isFinite(minValue) || minValue <= 0) {
    return null;
  }

  return minValue;
}

function clampToMediaCapabilityRange(
  targetValue: number,
  capabilityRange: unknown,
  preferMax: boolean,
): number | null {
  const capabilityMin = readMediaCapabilityMin(capabilityRange);
  const capabilityMax = readMediaCapabilityMax(capabilityRange);

  if (preferMax && capabilityMax) {
    return capabilityMax;
  }

  let clampedValue = targetValue;
  if (capabilityMin) {
    clampedValue = Math.max(clampedValue, capabilityMin);
  }

  if (capabilityMax) {
    clampedValue = Math.min(clampedValue, capabilityMax);
  }

  return Number.isFinite(clampedValue) && clampedValue > 0 ? clampedValue : null;
}

async function applyPreferredVideoTrackConstraints(
  track: MediaStreamTrack,
  qualityProfile: CameraQualityProfile,
  captureMode: CameraCaptureMode,
): Promise<void> {
  const desiredWidth = captureMode === 'video' ? qualityProfile.videoWidth : qualityProfile.photoWidth;
  const desiredHeight = captureMode === 'video' ? qualityProfile.videoHeight : qualityProfile.photoHeight;
  const desiredFrameRate = captureMode === 'video' ? qualityProfile.videoFrameRate : 30;
  const preferMaximumCapabilities = qualityProfile.id === 'max';

  let preferredWidth: number | null = desiredWidth;
  let preferredHeight: number | null = desiredHeight;
  let preferredFrameRate: number | null = desiredFrameRate;

  if (typeof track.getCapabilities === 'function') {
    const capabilities = track.getCapabilities() as {
      width?: unknown;
      height?: unknown;
      frameRate?: unknown;
    };

    preferredWidth = clampToMediaCapabilityRange(desiredWidth, capabilities.width, preferMaximumCapabilities);
    preferredHeight = clampToMediaCapabilityRange(desiredHeight, capabilities.height, preferMaximumCapabilities);
    preferredFrameRate = clampToMediaCapabilityRange(
      desiredFrameRate,
      capabilities.frameRate,
      preferMaximumCapabilities,
    );
  }

  const nextConstraints: MediaTrackConstraints = {};
  if (preferredWidth) {
    nextConstraints.width = { ideal: preferredWidth };
  }

  if (preferredHeight) {
    nextConstraints.height = { ideal: preferredHeight };
  }

  if (preferredFrameRate) {
    nextConstraints.frameRate = { ideal: preferredFrameRate };
  }

  if (Object.keys(nextConstraints).length === 0) {
    return;
  }

  try {
    await track.applyConstraints(nextConstraints);
  } catch (error) {
    console.warn('Could not apply preferred camera track constraints:', error);
  }
}

function normalizeReactionEmoji(rawReactionEmoji: string): string {
  const trimmedEmoji = rawReactionEmoji.trim();
  if (!trimmedEmoji) {
    return '';
  }

  return GROUPME_HEART_REACTION_ALIASES.has(trimmedEmoji) ? GROUPME_LIKE_EMOJI : trimmedEmoji;
}

function getReactionUpdateErrorMessage(error: unknown): string {
  const fallbackMessage = 'Unable to sync that reaction right now.';
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const rawMessage = error.message.trim();
  if (!rawMessage) {
    return fallbackMessage;
  }

  const normalizedMessage = rawMessage.toLowerCase();
  if (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('load failed')
  ) {
    return 'Could not reach GroupMe. Try that reaction again in a moment.';
  }

  if (
    normalizedMessage.includes('emoji reactions are unavailable') ||
    normalizedMessage.includes('unable to sync emoji reaction')
  ) {
    return fallbackMessage;
  }

  return rawMessage;
}

function normalizeReactionEmojiToken(rawReactionEmoji: unknown): string {
  if (typeof rawReactionEmoji !== 'string') {
    return '';
  }

  const trimmedEmoji = rawReactionEmoji.trim();
  if (!trimmedEmoji) {
    return '';
  }

  const namedAlias = trimmedEmoji.toLowerCase();
  if (namedAlias === 'heart' || namedAlias === 'like' || namedAlias === 'liked') {
    return GROUPME_LIKE_EMOJI;
  }

  return /\p{Extended_Pictographic}/u.test(trimmedEmoji)
    ? normalizeReactionEmoji(trimmedEmoji)
    : '';
}

function normalizeReactionTimestamp(rawTimestamp: unknown): number | null {
  if (typeof rawTimestamp !== 'number' && typeof rawTimestamp !== 'string') {
    return null;
  }

  const numericTimestamp = Number(rawTimestamp);
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return null;
  }

  return numericTimestamp > 1_000_000_000_000
    ? Math.floor(numericTimestamp / 1000)
    : Math.floor(numericTimestamp);
}

function normalizeReactionUserId(rawUserId: unknown): string | null {
  if (typeof rawUserId === 'string' || typeof rawUserId === 'number') {
    const normalizedUserId = String(rawUserId).trim();
    return normalizedUserId.length > 0 ? normalizedUserId : null;
  }

  return null;
}

function parseReactionEventsPayload(
  rawReactionPayload: unknown,
  fallbackTimestamp: number | null,
): ParsedMessageReactionEvent[] {
  const events: ParsedMessageReactionEvent[] = [];

  if (Array.isArray(rawReactionPayload)) {
    for (const reactionEntry of rawReactionPayload) {
      if (typeof reactionEntry === 'string' || typeof reactionEntry === 'number') {
        const userId = normalizeReactionUserId(reactionEntry);
        if (userId) {
          events.push({
            userId,
            reactedAt: fallbackTimestamp,
          });
        }
        continue;
      }

      if (!reactionEntry || typeof reactionEntry !== 'object') {
        continue;
      }

      const reactionRecord = reactionEntry as Record<string, unknown>;
      const nestedTimestamp =
        normalizeReactionTimestamp(
          reactionRecord.reacted_at ?? reactionRecord.created_at ?? reactionRecord.timestamp,
        ) ?? fallbackTimestamp;
      const nestedUserList =
        reactionRecord.users ??
        reactionRecord.user_ids ??
        reactionRecord.reactors ??
        reactionRecord.members ??
        reactionRecord.participants;
      if (nestedUserList !== undefined) {
        events.push(...parseReactionEventsPayload(nestedUserList, nestedTimestamp));
        continue;
      }

      const userId = normalizeReactionUserId(
        reactionRecord.user_id ?? reactionRecord.userId ?? reactionRecord.id,
      );
      if (userId) {
        events.push({
          userId,
          reactedAt: nestedTimestamp,
        });
      }
    }

    return events;
  }

  if (!rawReactionPayload || typeof rawReactionPayload !== 'object') {
    return events;
  }

  const reactionRecord = rawReactionPayload as Record<string, unknown>;
  const nestedTimestamp =
    normalizeReactionTimestamp(
      reactionRecord.reacted_at ?? reactionRecord.created_at ?? reactionRecord.timestamp,
    ) ?? fallbackTimestamp;
  const nestedUserList =
    reactionRecord.users ??
    reactionRecord.user_ids ??
    reactionRecord.reactors ??
    reactionRecord.members ??
    reactionRecord.participants;
  if (nestedUserList !== undefined) {
    events.push(...parseReactionEventsPayload(nestedUserList, nestedTimestamp));
    return events;
  }

  const userId = normalizeReactionUserId(
    reactionRecord.user_id ?? reactionRecord.userId ?? reactionRecord.id,
  );
  if (userId) {
    events.push({
      userId,
      reactedAt: nestedTimestamp,
    });
  }

  return events;
}

function parseRemoteEmojiReactionMap(message: Message): Record<string, ParsedMessageReactionEvent[]> {
  const rawMessage = message as unknown as Record<string, unknown>;
  const sourceCandidates = [
    rawMessage.reactions,
    rawMessage.emoji_reactions,
    rawMessage.emojiReactions,
  ];
  const eventsByEmoji = new Map<string, Map<string, ParsedMessageReactionEvent>>();

  const appendEvents = (emoji: string, nextEvents: ParsedMessageReactionEvent[]) => {
    if (!emoji || nextEvents.length === 0) {
      return;
    }

    const existingEventsByUser = eventsByEmoji.get(emoji) ?? new Map<string, ParsedMessageReactionEvent>();
    for (const nextEvent of nextEvents) {
      if (!nextEvent.userId) {
        continue;
      }

      const existingEvent = existingEventsByUser.get(nextEvent.userId);
      if (!existingEvent) {
        existingEventsByUser.set(nextEvent.userId, nextEvent);
        continue;
      }

      if (existingEvent.reactedAt === null && nextEvent.reactedAt !== null) {
        existingEventsByUser.set(nextEvent.userId, nextEvent);
      }
    }

    eventsByEmoji.set(emoji, existingEventsByUser);
  };

  for (const sourceCandidate of sourceCandidates) {
    if (!sourceCandidate) {
      continue;
    }

    if (Array.isArray(sourceCandidate)) {
      for (const sourceEntry of sourceCandidate) {
        if (!sourceEntry || typeof sourceEntry !== 'object') {
          continue;
        }

        const sourceRecord = sourceEntry as Record<string, unknown>;
        const emoji = normalizeReactionEmojiToken(
          sourceRecord.emoji ?? sourceRecord.reaction ?? sourceRecord.value ?? sourceRecord.code ?? sourceRecord.name,
        );
        if (!emoji) {
          continue;
        }

        const fallbackTimestamp = normalizeReactionTimestamp(
          sourceRecord.reacted_at ?? sourceRecord.created_at ?? sourceRecord.timestamp,
        );
        const events = parseReactionEventsPayload(
          sourceRecord.users ??
            sourceRecord.user_ids ??
            sourceRecord.reactors ??
            sourceRecord.members ??
            sourceRecord.participants ??
            sourceRecord,
          fallbackTimestamp,
        );
        appendEvents(emoji, events);
      }
      continue;
    }

    if (!sourceCandidate || typeof sourceCandidate !== 'object') {
      continue;
    }

    for (const [sourceKey, sourceValue] of Object.entries(sourceCandidate as Record<string, unknown>)) {
      const emojiFromKey = normalizeReactionEmojiToken(sourceKey);
      if (emojiFromKey) {
        appendEvents(emojiFromKey, parseReactionEventsPayload(sourceValue, null));
        continue;
      }

      if (!sourceValue || typeof sourceValue !== 'object') {
        continue;
      }

      const sourceRecord = sourceValue as Record<string, unknown>;
      const emojiFromValue = normalizeReactionEmojiToken(
        sourceRecord.emoji ?? sourceRecord.reaction ?? sourceRecord.value ?? sourceRecord.code ?? sourceRecord.name,
      );
      if (!emojiFromValue) {
        continue;
      }

      const fallbackTimestamp = normalizeReactionTimestamp(
        sourceRecord.reacted_at ?? sourceRecord.created_at ?? sourceRecord.timestamp,
      );
      const events = parseReactionEventsPayload(
        sourceRecord.users ??
          sourceRecord.user_ids ??
          sourceRecord.reactors ??
          sourceRecord.members ??
          sourceRecord.participants ??
          sourceRecord,
        fallbackTimestamp,
      );
      appendEvents(emojiFromValue, events);
    }
  }

  const result: Record<string, ParsedMessageReactionEvent[]> = {};
  for (const [emoji, emojiEventsByUser] of eventsByEmoji.entries()) {
    result[emoji] = Array.from(emojiEventsByUser.values());
  }

  return result;
}

function buildMessageReactionChips(
  favoritedByUserIds: string[],
  currentUserId: string,
  remoteEmojiReactions: Record<string, ParsedMessageReactionEvent[]>,
  includeGroupLikeChip: boolean,
  userDisplayNameById: Map<string, string>,
): MessageReactionChip[] {
  const chips: MessageReactionChip[] = [];

  if (includeGroupLikeChip && favoritedByUserIds.length > 0) {
    const heartReactors = Array.from(
      new Set(
        favoritedByUserIds
          .map((userId) => String(userId).trim())
          .filter((userId) => userId.length > 0),
      ),
    ).map((userId) => ({
      userId,
      name: userDisplayNameById.get(userId) ?? userId,
      reactedAt: null,
    }));

    chips.push({
      emoji: GROUPME_LIKE_EMOJI,
      count: heartReactors.length,
      isActive: favoritedByUserIds.includes(currentUserId),
      source: 'groupme-like',
      reactors: heartReactors,
    });
  }

  for (const [emojiKey, emojiEvents] of Object.entries(remoteEmojiReactions)) {
    const normalizedReaction = normalizeReactionEmoji(emojiKey);
    if (!normalizedReaction || emojiEvents.length === 0) {
      continue;
    }

    if (includeGroupLikeChip && normalizedReaction === GROUPME_LIKE_EMOJI) {
      continue;
    }

    const reactorsByUserId = new Map<string, MessageReactionActor>();
    for (const emojiEvent of emojiEvents) {
      const normalizedUserId = emojiEvent.userId.trim();
      if (!normalizedUserId) {
        continue;
      }

      const existingReactor = reactorsByUserId.get(normalizedUserId);
      const nextReactor: MessageReactionActor = {
        userId: normalizedUserId,
        name: userDisplayNameById.get(normalizedUserId) ?? normalizedUserId,
        reactedAt: emojiEvent.reactedAt,
      };

      if (!existingReactor) {
        reactorsByUserId.set(normalizedUserId, nextReactor);
        continue;
      }

      if (existingReactor.reactedAt === null && nextReactor.reactedAt !== null) {
        reactorsByUserId.set(normalizedUserId, nextReactor);
      }
    }

    const reactors = Array.from(reactorsByUserId.values());
    if (reactors.length === 0) {
      continue;
    }

    chips.push({
      emoji: normalizedReaction,
      count: reactors.length,
      isActive: reactors.some((reactor) => reactor.userId === currentUserId),
      source: 'groupme-emoji',
      reactors,
    });
  }

  return chips;
}

function getUrlMatcher(): RegExp {
  return new RegExp(URL_PATTERN, 'gi');
}

function trimTrailingUrlPunctuation(rawUrl: string): string {
  let candidate = rawUrl.trim();

  while (/[.,!?;:'"]$/.test(candidate)) {
    candidate = candidate.slice(0, -1);
  }

  while (candidate.endsWith(')')) {
    const openParenthesesCount = (candidate.match(/\(/g) ?? []).length;
    const closeParenthesesCount = (candidate.match(/\)/g) ?? []).length;

    if (closeParenthesesCount <= openParenthesesCount) {
      break;
    }

    candidate = candidate.slice(0, -1);
  }

  return candidate;
}

function normalizeMessageUrl(rawUrl: string): string | null {
  const trimmedUrl = trimTrailingUrlPunctuation(rawUrl);
  if (!trimmedUrl) {
    return null;
  }

  if (trimmedUrl.includes('@')) {
    return null;
  }

  const normalizedWithProtocol = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  if (!/^https?:\/\//i.test(normalizedWithProtocol)) {
    return null;
  }

  try {
    return new URL(normalizedWithProtocol).toString();
  } catch {
    return null;
  }
}

function getPreferredMediaUrl(
  mediaFormats: Record<string, { url?: string }> | undefined,
  preferredKeys: string[],
): string | null {
  if (!mediaFormats) {
    return null;
  }

  for (const key of preferredKeys) {
    const candidateUrl = mediaFormats[key]?.url;
    if (!candidateUrl) {
      continue;
    }

    const normalizedUrl = normalizeMessageUrl(candidateUrl);
    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  return null;
}

function normalizeWikimediaFileTitle(rawTitle: string | undefined): string {
  if (!rawTitle) {
    return 'Untitled';
  }

  return rawTitle.replace(/^File:/i, '').replace(/_/g, ' ');
}

async function searchTenorGifs(query: string): Promise<MediaSearchResult[]> {
  const params = new URLSearchParams({
    key: TENOR_PUBLIC_API_KEY,
    q: query,
    limit: String(MEDIA_SEARCH_RESULTS_LIMIT),
    media_filter: 'gif,tinygif,mediumgif,mp4',
    client_key: 'groupus-desktop',
  });
  const response = await fetch(`https://tenor.googleapis.com/v2/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Tenor request failed (${response.status})`);
  }

  const data = (await response.json()) as TenorSearchResponse;
  const results: MediaSearchResult[] = [];

  for (const result of data.results ?? []) {
    const mediaUrl = getPreferredMediaUrl(result.media_formats, ['gif', 'mediumgif', 'tinygif', 'mp4']);
    const previewUrl = getPreferredMediaUrl(result.media_formats, ['tinygif', 'gif', 'nanogif', 'mp4']);
    if (!mediaUrl || !previewUrl) {
      continue;
    }

    results.push({
      id: result.id ?? `${Date.now()}-${results.length}`,
      mediaType: 'gif',
      title: result.content_description?.trim() || 'GIF',
      mediaUrl,
      previewUrl,
      source: 'tenor',
    });
  }

  return results;
}

async function searchWikimediaMedia(
  query: string,
  kind: Extract<MediaSearchKind, 'images' | 'videos'>,
): Promise<MediaSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(MEDIA_SEARCH_RESULTS_LIMIT * 2),
    prop: 'imageinfo',
    iiprop: 'url|mime',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Wikimedia request failed (${response.status})`);
  }

  const data = (await response.json()) as WikimediaSearchResponse;
  const pages = Object.values(data.query?.pages ?? {});
  const results: MediaSearchResult[] = [];

  for (const page of pages) {
    const mediaUrlRaw = page.imageinfo?.[0]?.url;
    const mediaMime = page.imageinfo?.[0]?.mime?.toLowerCase() ?? '';
    const mediaUrl = mediaUrlRaw ? normalizeMessageUrl(mediaUrlRaw) : null;
    if (!mediaUrl) {
      continue;
    }

    if (kind === 'images' && !mediaMime.startsWith('image/')) {
      continue;
    }

    if (kind === 'videos' && !mediaMime.startsWith('video/')) {
      continue;
    }

    results.push({
      id: `${page.pageid ?? page.title ?? mediaUrl}-${results.length}`,
      mediaType: kind === 'videos' ? 'video' : 'image',
      title: normalizeWikimediaFileTitle(page.title),
      mediaUrl,
      previewUrl: mediaUrl,
      source: 'wikimedia',
    });

    if (results.length >= MEDIA_SEARCH_RESULTS_LIMIT) {
      break;
    }
  }

  return results;
}

async function searchLocationPlaces(query: string): Promise<LocationSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '8',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Location search request failed (${response.status})`);
  }

  const data = (await response.json()) as OpenStreetMapPlaceResponse[];
  const results: LocationSearchResult[] = [];

  for (const result of data) {
    if (!result.display_name || !result.lat || !result.lon) {
      continue;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    results.push({
      id: String(result.place_id ?? `${result.display_name}-${results.length}`),
      name: result.display_name,
      lat: latitude.toFixed(6),
      lng: longitude.toFixed(6),
    });
  }

  return results;
}

function extractUrlsFromText(text: string): string[] {
  const links = new Set<string>();
  const matcher = getUrlMatcher();

  for (const match of text.matchAll(matcher)) {
    const matchedText = match[0];
    if (!matchedText) {
      continue;
    }

    const normalizedUrl = normalizeMessageUrl(matchedText);
    if (normalizedUrl) {
      links.add(normalizedUrl);
    }
  }

  return Array.from(links);
}

function extractMessageLinks(message: Message): string[] {
  const links = new Set<string>(extractUrlsFromText(message.text ?? ''));

  for (const attachment of message.attachments) {
    const attachmentType = attachment.type.toLowerCase();
    const shouldIncludeAttachmentUrls =
      attachmentType !== 'image' &&
      (attachmentType.includes('link') || attachmentType.includes('url') || attachmentType.includes('article'));

    if (!shouldIncludeAttachmentUrls) {
      continue;
    }

    const attachmentUrls = [attachment.url, attachment.preview_url];
    for (const attachmentUrl of attachmentUrls) {
      if (!attachmentUrl) {
        continue;
      }

      const normalizedUrl = normalizeMessageUrl(attachmentUrl);
      if (normalizedUrl) {
        links.add(normalizedUrl);
      }
    }
  }

  return Array.from(links);
}

function getReadableUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const normalizedPath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    return `${parsedUrl.hostname}${normalizedPath}`;
  } catch {
    return url;
  }
}

function getDownloadFilenameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const rawName = pathname.split('/').filter(Boolean).pop();
    if (!rawName) {
      return 'groupus-image';
    }

    return decodeURIComponent(rawName);
  } catch {
    return 'groupus-image';
  }
}

function formatAudioDraftDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDurationFromSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getAudioDraftFilename(pendingAudioDraft: PendingAudioDraft): string {
  const normalizedMimeType = pendingAudioDraft.blob.type.toLowerCase();
  const extensionCandidate = normalizedMimeType.includes('/')
    ? normalizedMimeType.split('/')[1]?.split(';')[0]?.trim() ?? ''
    : '';
  const normalizedExtension = extensionCandidate.replace(/[^a-z0-9.+-]/gi, '');
  const safeExtension = normalizedExtension || 'webm';
  return `groupus-voice-note-${pendingAudioDraft.id}.${safeExtension}`;
}

function formatBytesAsMegabytes(valueInBytes: number): string {
  return `${Math.round(valueInBytes / (1024 * 1024))} MB`;
}

function getFileExtension(fileName: string): string {
  const extensionStartIndex = fileName.lastIndexOf('.');
  if (extensionStartIndex === -1) {
    return '';
  }

  return fileName.slice(extensionStartIndex + 1).toLowerCase();
}

function isSupportedFileDraft(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  // Exclude .blockmap files explicitly
  if (extension === 'blockmap') {
    return false;
  }
  if (normalizedType.startsWith('image/')) {
    return true;
  }
  if (normalizedType.startsWith('text/')) {
    return true;
  }
  if (ALLOWED_FILE_DRAFT_MIME_TYPES.has(normalizedType)) {
    return true;
  }
  return extension ? ALLOWED_FILE_DRAFT_EXTENSIONS.has(extension) : false;
}

function isSupportedVideoDraft(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  if (normalizedType.startsWith('video/')) {
    return true;
  }

  if (ALLOWED_VIDEO_DRAFT_MIME_TYPES.has(normalizedType)) {
    return true;
  }

  const extension = getFileExtension(file.name);
  return extension ? VIDEO_FILE_EXTENSIONS.has(extension) : false;
}

function isLikelyImageFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  if (normalizedType.startsWith('image/')) {
    return true;
  }

  const extension = getFileExtension(file.name);
  return extension ? IMAGE_FILE_EXTENSIONS.has(extension) : false;
}

function isLikelyVideoFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  if (normalizedType.startsWith('video/')) {
    return true;
  }

  const extension = getFileExtension(file.name);
  return extension ? VIDEO_FILE_EXTENSIONS.has(extension) : false;
}

function hasTransferFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) {
    return false;
  }

  return Array.from(transfer.types).includes('Files');
}

function extractFilesFromTransfer(transfer: DataTransfer | null): File[] {
  if (!transfer) {
    return [];
  }

  const filesFromItems: File[] = [];
  if (transfer.items && transfer.items.length > 0) {
    for (const item of Array.from(transfer.items)) {
      if (item.kind !== 'file') {
        continue;
      }

      const file = item.getAsFile();
      if (file) {
        filesFromItems.push(file);
      }
    }
  }

  if (filesFromItems.length > 0) {
    return filesFromItems;
  }

  return Array.from(transfer.files ?? []);
}

function buildDraftAttachmentHint(
  kind: 'photo' | 'video' | 'file',
  addedCount: number,
  maxSizeBytes: number,
  skippedUnsupportedTypeCount: number,
  skippedOversizedCount: number,
  skippedByLimitCount: number,
): string {
  const kindLabel = kind === 'photo' ? 'photo' : kind === 'video' ? 'video' : 'file';

  if (addedCount === 0) {
    const reasons: string[] = [];
    if (skippedUnsupportedTypeCount > 0) {
      reasons.push('unsupported type');
    }
    if (skippedOversizedCount > 0) {
      reasons.push(`over ${formatBytesAsMegabytes(maxSizeBytes)}`);
    }

    return reasons.length > 0
      ? `No ${kindLabel} drafts were added (${reasons.join(', ')}).`
      : `No ${kindLabel} drafts were added.`;
  }

  const hintParts = [`${addedCount} ${kindLabel} draft${addedCount === 1 ? '' : 's'} added`];
  if (skippedUnsupportedTypeCount > 0) {
    hintParts.push(`${skippedUnsupportedTypeCount} unsupported`);
  }
  if (skippedOversizedCount > 0) {
    hintParts.push(`${skippedOversizedCount} over ${formatBytesAsMegabytes(maxSizeBytes)}`);
  }
  if (skippedByLimitCount > 0) {
    hintParts.push(`${skippedByLimitCount} skipped (max ${MAX_COMPOSER_DRAFT_ATTACHMENTS})`);
  }

  return `${hintParts.join('. ')}.`;
}

function isEventTemplateMessage(messageText: string | null | undefined): boolean {
  if (!messageText) {
    return false;
  }

  const normalizedText = messageText.trimStart().toLowerCase();
  return normalizedText.startsWith('📅 event:') || normalizedText.startsWith('event:');
}

function isPollTemplateMessage(messageText: string | null | undefined): boolean {
  if (!messageText) {
    return false;
  }

  const normalizedText = messageText.trimStart().toLowerCase();
  return normalizedText.startsWith('📊 poll:') || normalizedText.startsWith('poll:');
}

function parseStoredBoolean(rawValue: string | null, fallbackValue: boolean): boolean {
  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  return fallbackValue;
}

function parseStoredImageAlbums(rawValue: string | null): Record<string, ImageAlbum[]> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const albumsByConversation: Record<string, ImageAlbum[]> = {};
    for (const [conversationId, conversationAlbums] of Object.entries(parsed)) {
      if (!Array.isArray(conversationAlbums)) {
        continue;
      }

      const normalizedAlbums: ImageAlbum[] = [];
      for (const album of conversationAlbums) {
        if (!album || typeof album !== 'object') {
          continue;
        }

        const albumRecord = album as Record<string, unknown>;
        const albumId = typeof albumRecord.id === 'string' ? albumRecord.id : '';
        const albumName = typeof albumRecord.name === 'string' ? albumRecord.name.trim() : '';
        const createdAt = typeof albumRecord.createdAt === 'number' ? albumRecord.createdAt : Date.now();
        const albumImagesRaw = Array.isArray(albumRecord.images) ? albumRecord.images : [];

        if (!albumId || !albumName) {
          continue;
        }

        const albumImages: AlbumImageEntry[] = [];
        for (const image of albumImagesRaw) {
          if (!image || typeof image !== 'object') {
            continue;
          }

          const imageRecord = image as Record<string, unknown>;
          const imageId = typeof imageRecord.id === 'string' ? imageRecord.id : '';
          const imageUrl = typeof imageRecord.imageUrl === 'string' ? imageRecord.imageUrl : '';
          const messageId = typeof imageRecord.messageId === 'string' ? imageRecord.messageId : '';
          const senderName = typeof imageRecord.senderName === 'string' ? imageRecord.senderName : 'Unknown';
          const addedAt = typeof imageRecord.addedAt === 'number' ? imageRecord.addedAt : Date.now();

          if (!imageId || !imageUrl || !messageId) {
            continue;
          }

          albumImages.push({
            id: imageId,
            imageUrl,
            messageId,
            senderName,
            addedAt,
          });
        }

        normalizedAlbums.push({
          id: albumId,
          name: albumName,
          createdAt,
          images: albumImages,
        });
      }

      albumsByConversation[conversationId] = normalizedAlbums.sort((left, right) => right.createdAt - left.createdAt);
    }

    return albumsByConversation;
  } catch (error) {
    console.warn('Failed to restore stored image albums:', error);
    return {};
  }
}

function getFallbackSiteName(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace(/^www\./i, '');
  } catch {
    return 'Link';
  }
}

function getFallbackTitle(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathnameSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const lastSegment = pathnameSegments[pathnameSegments.length - 1];
    if (!lastSegment) {
      return getFallbackSiteName(url);
    }

    const decodedSegment = decodeURIComponent(lastSegment).replace(/[-_]+/g, ' ').trim();
    return decodedSegment || getFallbackSiteName(url);
  } catch {
    return 'Shared link';
  }
}

function getFallbackDescription(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    return path ? `${parsedUrl.hostname}${path}` : undefined;
  } catch {
    return undefined;
  }
}

function getMicrolinkImageUrl(
  image:
    | string
    | {
        url?: string;
      }
    | null
    | undefined,
): string | null {
  if (!image) {
    return null;
  }

  if (typeof image === 'string') {
    return normalizeImageUrl(image);
  }

  return normalizeImageUrl(image.url);
}

function stylizePlainCharacter(
  character: string,
  style: 'bold' | 'italic' | 'code',
): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return character;
  }

  const isUppercaseLatin = codePoint >= 0x41 && codePoint <= 0x5a;
  const isLowercaseLatin = codePoint >= 0x61 && codePoint <= 0x7a;
  const isDigit = codePoint >= 0x30 && codePoint <= 0x39;

  if (style === 'bold') {
    if (isUppercaseLatin) {
      return String.fromCodePoint(0x1d400 + (codePoint - 0x41));
    }

    if (isLowercaseLatin) {
      return String.fromCodePoint(0x1d41a + (codePoint - 0x61));
    }

    if (isDigit) {
      return String.fromCodePoint(0x1d7ce + (codePoint - 0x30));
    }
  }

  if (style === 'italic') {
    if (isUppercaseLatin) {
      return String.fromCodePoint(0x1d434 + (codePoint - 0x41));
    }

    if (isLowercaseLatin) {
      if (codePoint === 0x68) {
        return '\u210e';
      }

      return String.fromCodePoint(0x1d44e + (codePoint - 0x61));
    }
  }

  if (style === 'code') {
    if (isUppercaseLatin) {
      return String.fromCodePoint(0x1d670 + (codePoint - 0x41));
    }

    if (isLowercaseLatin) {
      return String.fromCodePoint(0x1d68a + (codePoint - 0x61));
    }

    if (isDigit) {
      return String.fromCodePoint(0x1d7f6 + (codePoint - 0x30));
    }
  }

  return character;
}

function applyCombiningStyle(text: string, combiningMark: string): string {
  return Array.from(text)
    .map((character) => (/\s/.test(character) ? character : `${character}${combiningMark}`))
    .join('');
}

function applyPlainFormattingStyle(
  text: string,
  style: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code',
): string {
  if (!text) {
    return text;
  }

  if (style === 'underline') {
    return applyCombiningStyle(text, '\u0332');
  }

  if (style === 'strikethrough') {
    return applyCombiningStyle(text, '\u0336');
  }

  const mapStyle = style === 'code' ? 'code' : style;
  return Array.from(text)
    .map((character) => stylizePlainCharacter(character, mapStyle))
    .join('');
}

async function fetchLinkPreviewMetadata(url: string): Promise<LinkPreviewMetadata | null> {
  try {
    const microlinkResponse = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false&palette=false`,
    );

    if (microlinkResponse.ok) {
      const microlinkPayload = (await microlinkResponse.json()) as MicrolinkResponse;
      if (microlinkPayload.status === 'success' && microlinkPayload.data) {
        const metadata: LinkPreviewMetadata = {
          title: microlinkPayload.data.title,
          description: microlinkPayload.data.description,
          siteName: microlinkPayload.data.publisher,
          imageUrl: getMicrolinkImageUrl(microlinkPayload.data.image),
        };

        if (metadata.title || metadata.description || metadata.siteName || metadata.imageUrl) {
          return metadata;
        }
      }
    }
  } catch {
    // Best-effort metadata loading, fallback preview is still rendered.
  }

  try {
    const noEmbedResponse = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!noEmbedResponse.ok) {
      return null;
    }

    const noEmbedPayload = (await noEmbedResponse.json()) as NoEmbedResponse;
    if (noEmbedPayload.error) {
      return null;
    }

    const metadata: LinkPreviewMetadata = {
      title: noEmbedPayload.title,
      description: noEmbedPayload.author_name ? `By ${noEmbedPayload.author_name}` : undefined,
      siteName: noEmbedPayload.provider_name,
      imageUrl: normalizeImageUrl(noEmbedPayload.thumbnail_url),
    };

    if (metadata.title || metadata.description || metadata.siteName || metadata.imageUrl) {
      return metadata;
    }
  } catch {
    // Best-effort metadata loading, fallback preview is still rendered.
  }

  return null;
}

function renderMessageMarkdown(text: string, isCurrentUser: boolean) {
  const linkClassName = isCurrentUser
    ? 'underline text-blue-50 hover:text-white break-all'
    : 'underline text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 break-all';
  const codeClassName = isCurrentUser
    ? 'bg-blue-600/40 text-blue-50'
    : 'bg-gray-200/90 dark:bg-gray-700 text-gray-800 dark:text-gray-100';
  const blockquoteClassName = isCurrentUser
    ? 'border-blue-200/70 text-blue-100/90'
    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, MESSAGE_MARKDOWN_SANITIZE_SCHEMA]]}
      components={{
        p: ({ node: _node, ...props }) => <p className="my-0 break-words" {...props} />,
        a: ({ node: _node, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          />
        ),
        pre: ({ node: _node, ...props }) => (
          <pre
            className={`my-2 overflow-x-auto rounded-md px-2 py-1 text-xs ${codeClassName}`}
            {...props}
          />
        ),
        code: ({ node: _node, className, ...props }) => (
          <code className={`rounded px-1 py-0.5 font-mono text-[0.85em] ${codeClassName} ${className ?? ''}`} {...props} />
        ),
        ul: ({ node: _node, ...props }) => <ul className="my-1 ml-4 list-disc space-y-0.5" {...props} />,
        ol: ({ node: _node, ...props }) => <ol className="my-1 ml-4 list-decimal space-y-0.5" {...props} />,
        blockquote: ({ node: _node, ...props }) => (
          <blockquote className={`my-1 border-l-2 pl-2 italic ${blockquoteClassName}`} {...props} />
        ),
        img: () => null,
        u: ({ node: _node, ...props }) => <u {...props} />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function isPinNotificationMessage(message: Message): boolean {
  return /pinned a message/i.test(message.text);
}

function isSystemMessage(message: Message): boolean {
  const normalizedUserId = message.user_id.trim().toLowerCase();
  const normalizedSenderName = message.name.trim().toLowerCase();

  if (normalizedUserId === 'system' || normalizedUserId === '0') {
    return true;
  }

  if (normalizedSenderName === 'system' || normalizedSenderName === 'groupme') {
    return true;
  }

  if (isPinNotificationMessage(message)) {
    return true;
  }

  return message.attachments.some((attachment) => {
    const normalizedAttachmentType = attachment.type.toLowerCase();
    return SYSTEM_MESSAGE_ATTACHMENT_HINTS.some((hint) => normalizedAttachmentType.includes(hint));
  });
}

function isDiscreetModerationRemovalMessage(message: Message): boolean {
  if (!isSystemMessage(message)) {
    return false;
  }

  const normalizedText = message.text.trim();
  if (!normalizedText) {
    return false;
  }

  return MODERATION_REMOVAL_TEXT_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function getReplyPreviewForMessage(message: Message): string {
  const normalizedText = (message.text ?? '').replace(/\s+/g, ' ').trim();
  if (normalizedText) {
    return normalizedText.length > 96 ? `${normalizedText.slice(0, 93)}...` : normalizedText;
  }

  let imageCount = 0;
  let videoCount = 0;
  let fileCount = 0;
  let locationCount = 0;

  for (const attachment of message.attachments) {
    const attachmentType = attachment.type.toLowerCase();
    if (attachmentType === 'image') {
      imageCount += 1;
      continue;
    }

    if (attachmentType.includes('video')) {
      videoCount += 1;
      continue;
    }

    if (attachmentType.includes('location')) {
      locationCount += 1;
      continue;
    }

    fileCount += 1;
  }

  const parts: string[] = [];
  if (imageCount > 0) {
    parts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
  }
  if (videoCount > 0) {
    parts.push(`${videoCount} video${videoCount === 1 ? '' : 's'}`);
  }
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  }
  if (locationCount > 0) {
    parts.push(`${locationCount} location${locationCount === 1 ? '' : 's'}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Message';
}

const REPLY_PREFIX_PATTERN = /^↪ Replying to ([^:]+): (.+)/;
const REPLY_QUOTE_COLLAPSED_LENGTH = 120;

interface ParsedReply {
  senderName: string;
  previewText: string;
  remainingText: string;
}

function parseReplyPrefix(text: string): ParsedReply | null {
  const lines = text.split('\n');
  const firstLine = lines[0] ?? '';
  const match = REPLY_PREFIX_PATTERN.exec(firstLine);
  if (!match) {
    return null;
  }

  return {
    senderName: match[1].trim(),
    previewText: match[2].trim(),
    remainingText: lines.slice(1).join('\n').trim(),
  };
}

function findReplySourceMessage(
  messages: Message[],
  fullHistoryMessages: Message[] | null,
  senderName: string,
  previewText: string,
): Message | null {
  const normalizedPreview = previewText.replace(/\.{3}$/, '').toLowerCase();

  const search = (pool: Message[]): Message | null => {
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      const candidate = pool[i];
      if (candidate.name !== senderName) {
        continue;
      }

      const candidateText = (candidate.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (candidateText.startsWith(normalizedPreview)) {
        return candidate;
      }
    }

    return null;
  };

  return search(messages) ?? (fullHistoryMessages ? search(fullHistoryMessages) : null);
}

function ReplyQuoteBlock({
  senderName,
  previewText,
  fullText,
  hasExpandableContent,
  isCurrentUser,
  onClickScroll,
  remainingText,
}: {
  senderName: string;
  previewText: string;
  fullText: string | null;
  hasExpandableContent: boolean;
  isCurrentUser: boolean;
  onClickScroll?: () => void;
  remainingText: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const displayText = expanded
    ? fullText ?? previewText
    : previewText.length > REPLY_QUOTE_COLLAPSED_LENGTH
      ? `${previewText.slice(0, REPLY_QUOTE_COLLAPSED_LENGTH)}...`
      : previewText;

  const borderColor = isCurrentUser
    ? 'border-blue-300/50'
    : 'border-gray-300 dark:border-gray-600';
  const bgColor = isCurrentUser
    ? 'bg-blue-600/30'
    : 'bg-gray-100/80 dark:bg-gray-700/50';
  const nameColor = isCurrentUser
    ? 'text-blue-100 font-semibold'
    : 'text-gray-600 dark:text-gray-300 font-semibold';
  const textColor = isCurrentUser
    ? 'text-blue-50/90'
    : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="text-sm break-words">
      <div
        className={`mb-1.5 rounded-lg border-l-2 ${borderColor} ${bgColor} px-2.5 py-1.5 ${
          onClickScroll ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
        }`}
        onClick={onClickScroll}
        title={onClickScroll ? 'Click to scroll to original message' : undefined}
        role={onClickScroll ? 'button' : undefined}
        tabIndex={onClickScroll ? 0 : undefined}
        onKeyDown={onClickScroll ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClickScroll(); } : undefined}
      >
        <p className={`text-[11px] ${nameColor}`}>{senderName}</p>
        <p className={`text-[12px] mt-0.5 ${textColor} ${expanded ? 'whitespace-pre-wrap' : ''}`}>
          {displayText}
        </p>
        {hasExpandableContent && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className={`mt-1 flex items-center gap-0.5 text-[10px] ${
              isCurrentUser
                ? 'text-blue-200/80 hover:text-blue-100'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show more
              </>
            )}
          </button>
        )}
      </div>
      {remainingText && renderMessageMarkdown(remainingText, isCurrentUser)}
    </div>
  );
}

function getTemplateContextSnippet(message: Message): string {
  const firstLine = (message.text ?? '').split('\n').find((line) => line.trim().length > 0) ?? 'Template';
  const normalizedFirstLine = firstLine.trim();
  return normalizedFirstLine.length > 72
    ? `${normalizedFirstLine.slice(0, 69).trimEnd()}...`
    : normalizedFirstLine;
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

function normalizeConversationReadReceiptState(
  conversation: Conversation,
): ConversationReadReceipt | null {
  const readReceiptMessageId =
    typeof conversation.read_receipt_message_id === 'string'
      ? conversation.read_receipt_message_id.trim()
      : '';
  const readReceiptTimestampRaw = conversation.read_receipt_read_at;
  const readReceiptReadAt =
    typeof readReceiptTimestampRaw === 'number' &&
    Number.isFinite(readReceiptTimestampRaw) &&
    readReceiptTimestampRaw > 0
      ? readReceiptTimestampRaw > 1_000_000_000_000
        ? Math.floor(readReceiptTimestampRaw / 1000)
        : Math.floor(readReceiptTimestampRaw)
      : null;

  if (!readReceiptMessageId && !readReceiptReadAt) {
    return null;
  }

  return {
    messageId: readReceiptMessageId || null,
    readAt: readReceiptReadAt,
  };
}

function readReceiptIncludesMessage(
  message: Message,
  readReceipt: ConversationReadReceipt | null,
  messagesById: Map<string, Message>,
): boolean {
  if (!readReceipt) {
    return false;
  }

  if (readReceipt.messageId && readReceipt.messageId === message.id) {
    return true;
  }

  if (readReceipt.readAt && message.created_at <= readReceipt.readAt) {
    return true;
  }

  if (readReceipt.messageId) {
    const markerMessage = messagesById.get(readReceipt.messageId);
    if (markerMessage && markerMessage.created_at >= message.created_at) {
      return true;
    }
  }

  return false;
}

// ...existing code...
export function MessageView({
  conversation,
  activeConversation,
  currentUserId,
  quickComposerEmojis,
  quickReactionEmojis,
  isConversationMuted,
  onToggleConversationMute,
  notificationPreviewMode,
  onSetNotificationPreviewMode,
}: MessageViewProps) {
  const [groupDetails, setGroupDetails] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMarkdownComposerEnabled, setIsMarkdownComposerEnabled] = useState<boolean>(() => {
    return parseStoredBoolean(localStorage.getItem(MARKDOWN_COMPOSER_ENABLED_STORAGE_KEY), false);
  });
  const [composerDraftAttachments, setComposerDraftAttachments] = useState<ComposerDraftAttachment[]>([]);
  // Collapsible formatting & attachment toolbars
  const [showComposerToolbar, setShowComposerToolbar] = useState(true);
  const [photoDraftUploadStateById, setPhotoDraftUploadStateById] = useState<
    Record<string, PhotoDraftUploadState>
  >({});
  const [fileDraftUploadStateById, setFileDraftUploadStateById] = useState<
    Record<string, PhotoDraftUploadState>
  >({});
  const [pendingGifUrl, setPendingGifUrl] = useState<string | null>(null);
  const [showMediaSearchModal, setShowMediaSearchModal] = useState(false);
  const [mediaSearchKind, setMediaSearchKind] = useState<MediaSearchKind>('gifs');
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [manualMediaUrlInput, setManualMediaUrlInput] = useState('');
  const [mediaSearchResults, setMediaSearchResults] = useState<MediaSearchResult[]>([]);
  const [mediaSearchLoading, setMediaSearchLoading] = useState(false);
  const [mediaSearchError, setMediaSearchError] = useState<string | null>(null);
  const [showLocationSearchModal, setShowLocationSearchModal] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null);
  const [pendingLocationAttachment, setPendingLocationAttachment] = useState<{
    lat: string;
    lng: string;
    name: string;
  } | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [pendingAudioDraft, setPendingAudioDraft] = useState<PendingAudioDraft | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFullComposerEmojiPicker, setShowFullComposerEmojiPicker] = useState(false);
  const [showFullReactionEmojiPicker, setShowFullReactionEmojiPicker] = useState(false);
  const [reactionCustomEmojiInput, setReactionCustomEmojiInput] = useState('');
  const [showCameraCaptureModal, setShowCameraCaptureModal] = useState(false);
  const [cameraCaptureMode, setCameraCaptureMode] = useState<CameraCaptureMode>('photo');
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('environment');
  const [cameraQualityPreset, setCameraQualityPreset] = useState<CameraQualityPreset>('high');
  const [cameraCaptureError, setCameraCaptureError] = useState<string | null>(null);
  const [isCameraInitializing, setIsCameraInitializing] = useState(false);
  const [isCameraRecording, setIsCameraRecording] = useState(false);
  const [cameraRecordingSeconds, setCameraRecordingSeconds] = useState(0);
  const [openImageActionKey, setOpenImageActionKey] = useState<string | null>(null);
  const [memeEditorState, setMemeEditorState] = useState<MemeEditorState | null>(null);
  const [memeTopText, setMemeTopText] = useState('');
  const [memeBottomText, setMemeBottomText] = useState('');
  const [replyTargetMessage, setReplyTargetMessage] = useState<Message | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardTargetMessage, setForwardTargetMessage] = useState<Message | null>(null);
  const [forwardConversations, setForwardConversations] = useState<Conversation[]>([]);
  const [forwardConversationFilter, setForwardConversationFilter] = useState('');
  const [forwardConversationsLoading, setForwardConversationsLoading] = useState(false);
  const [forwardConversationsError, setForwardConversationsError] = useState<string | null>(null);
  const [forwardSendingConversationId, setForwardSendingConversationId] = useState<string | null>(null);
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [isComposerDropTarget, setIsComposerDropTarget] = useState(false);
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [collapseSystemMessages, setCollapseSystemMessages] = useState(true);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryMediaFilter, setGalleryMediaFilter] = useState<GalleryMediaFilter>('all');
  const [showAlbumsPanel, setShowAlbumsPanel] = useState(false);
  const [showShareQrModal, setShowShareQrModal] = useState(false);
  const [imageAlbumsByConversationId, setImageAlbumsByConversationId] = useState<
    Record<string, ImageAlbum[]>
  >(() => parseStoredImageAlbums(localStorage.getItem(IMAGE_ALBUMS_STORAGE_KEY)));
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'failed' | 'sent'>('idle');
  const [sendStatusError, setSendStatusError] = useState<string | null>(null);
  const [deletingMessageIds, setDeletingMessageIds] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
  const [isDirectContactBlocked, setIsDirectContactBlocked] = useState<boolean | null>(null);
  const [directBlockLoading, setDirectBlockLoading] = useState(false);
  const [directBlockError, setDirectBlockError] = useState<string | null>(null);
  const [loadingPinnedMessages, setLoadingPinnedMessages] = useState(false);
  const [hasLoadedPinnedMessages, setHasLoadedPinnedMessages] = useState(false);
  const [pinnedMessagesError, setPinnedMessagesError] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageEntry[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [linkPreviewCache, setLinkPreviewCache] = useState<Record<string, LinkPreviewState>>({});
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState<string | null>(null);
  const [openReactionDetails, setOpenReactionDetails] = useState<OpenReactionDetailsState | null>(null);
  const [chatReadReceipt, setChatReadReceipt] = useState<ConversationReadReceipt | null>(() => {
    return activeConversation.type === 'chat'
      ? normalizeConversationReadReceiptState(activeConversation)
      : null;
  });
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fullHistoryMessagesRef = useRef<Message[] | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const groupActionsButtonRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const reactionCustomEmojiInputRef = useRef<HTMLInputElement>(null);
  const cameraPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRecorderChunksRef = useRef<Blob[]>([]);
  const cameraRecorderShouldSaveRef = useRef(false);
  const cameraRecordingTimerRef = useRef<number | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRecordingStartedAtRef = useRef<number>(0);
  const composerDragDepthRef = useRef(0);
  const mediaSearchRequestIdRef = useRef(0);
  const locationSearchRequestIdRef = useRef(0);
  const activeConversationIdRef = useRef(activeConversation.id);
  const lastReadReceiptSyncMessageIdRef = useRef<string | null>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const isGroupConversation = activeConversation.type !== 'chat';
  const isTopicConversation = activeConversation.type === 'subgroup';
  const canLikeMessages = true;
  const isMirroredCameraPreview = cameraFacingMode === 'user';
  const selectedCameraQualityProfile = CAMERA_QUALITY_PROFILES[cameraQualityPreset];
  const messagingPolicy = useMemo(() => groupMeService.getMessagingPolicy(), []);
  const strictPublicDocModeEnabled = messagingPolicy.strictPublicDocMode;
  const strictAttachmentPolicyMessage = useMemo(() => {
    return `This build currently supports only ${messagingPolicy.allowedAttachmentTypes.join(', ')} attachments.`;
  }, [messagingPolicy.allowedAttachmentTypes]);
  const hasUploadingDraftAttachment = useMemo(() => {
    const hasUploadingPhoto = Object.values(photoDraftUploadStateById).some(
      (uploadState) => uploadState.status === 'uploading',
    );
    const hasUploadingFile = Object.values(fileDraftUploadStateById).some(
      (uploadState) => uploadState.status === 'uploading',
    );
    return hasUploadingPhoto || hasUploadingFile;
  }, [fileDraftUploadStateById, photoDraftUploadStateById]);

  const isGroupOwner = useMemo(() => {
    if (!groupDetails?.creator_user_id) {
      return false;
    }

    return String(groupDetails.creator_user_id) === String(currentUserId);
  }, [groupDetails?.creator_user_id, currentUserId]);

  const canManageMembers = isGroupConversation && isGroupOwner;

  const activeConversationAlbums = useMemo(() => {
    return imageAlbumsByConversationId[activeConversation.id] ?? [];
  }, [imageAlbumsByConversationId, activeConversation.id]);

  const filteredForwardConversations = useMemo(() => {
    const normalizedFilter = forwardConversationFilter.trim().toLowerCase();
    if (!normalizedFilter) {
      return forwardConversations;
    }

    return forwardConversations.filter((conversationOption) => {
      const nameMatches = conversationOption.name.toLowerCase().includes(normalizedFilter);
      const typeMatches = conversationOption.type.toLowerCase().includes(normalizedFilter);
      return nameMatches || typeMatches;
    });
  }, [forwardConversations, forwardConversationFilter]);

  const galleryMediaEntries = useMemo<GalleryMediaEntry[]>(() => {
    const entries: GalleryMediaEntry[] = [];
    const seenByKey = new Set<string>();

    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = messages[messageIndex];
      for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex += 1) {
        const attachment = message.attachments[attachmentIndex];
        const attachmentType = attachment.type.toLowerCase();

        if (attachmentType === 'image') {
          const imageUrl = normalizeImageUrl(attachment.url);
          if (!imageUrl) {
            continue;
          }

          const dedupeKey = `image:${imageUrl}`;
          if (seenByKey.has(dedupeKey)) {
            continue;
          }

          seenByKey.add(dedupeKey);
          entries.push({
            id: `${message.id}-${attachmentIndex}`,
            messageId: message.id,
            type: 'image',
            imageUrl,
            senderName: message.name,
            createdAt: message.created_at,
          });
          continue;
        }

        const isVideoAttachment = attachmentType.includes('video');
        if (isVideoAttachment) {
          const videoUrl = normalizeMessageUrl(attachment.url ?? '') ?? attachment.url;
          if (!videoUrl) {
            continue;
          }

          const dedupeKey = `video:${message.id}:${attachmentIndex}:${videoUrl}`;
          if (seenByKey.has(dedupeKey)) {
            continue;
          }

          seenByKey.add(dedupeKey);
          entries.push({
            id: `${message.id}-${attachmentIndex}`,
            messageId: message.id,
            type: 'video',
            videoUrl,
            senderName: message.name,
            createdAt: message.created_at,
          });
          continue;
        }

        const isFileAttachment =
          attachmentType.includes('file') ||
          attachmentType.includes('document') ||
          attachmentType.includes('pdf');
        if (isFileAttachment) {
          const fileUrl = normalizeMessageUrl(attachment.url ?? '') ?? attachment.url;
          if (!fileUrl) {
            continue;
          }

          const dedupeKey = `file:${message.id}:${attachmentIndex}:${fileUrl}`;
          if (seenByKey.has(dedupeKey)) {
            continue;
          }

          seenByKey.add(dedupeKey);
          entries.push({
            id: `${message.id}-${attachmentIndex}`,
            messageId: message.id,
            type: 'file',
            fileUrl,
            fileName: attachment.name?.trim() || getDownloadFilenameFromUrl(fileUrl),
            senderName: message.name,
            createdAt: message.created_at,
          });
          continue;
        }

        if (attachmentType === 'location' && attachment.lat && attachment.lng) {
          const locationKey = `location:${message.id}:${attachment.lat}:${attachment.lng}`;
          if (seenByKey.has(locationKey)) {
            continue;
          }

          seenByKey.add(locationKey);
          entries.push({
            id: `${message.id}-${attachmentIndex}`,
            messageId: message.id,
            type: 'location',
            senderName: message.name,
            createdAt: message.created_at,
            lat: attachment.lat,
            lng: attachment.lng,
            locationName: attachment.name?.trim() || 'Location',
          });
        }
      }
    }

    return entries;
  }, [messages]);

  const filteredGalleryMediaEntries = useMemo(() => {
    if (galleryMediaFilter === 'all') {
      return galleryMediaEntries;
    }

    if (galleryMediaFilter === 'images') {
      return galleryMediaEntries.filter((entry) => entry.type === 'image');
    }

    if (galleryMediaFilter === 'videos') {
      return galleryMediaEntries.filter((entry) => entry.type === 'video');
    }

    if (galleryMediaFilter === 'files') {
      return galleryMediaEntries.filter((entry) => entry.type === 'file');
    }

    return galleryMediaEntries.filter((entry) => entry.type === 'location');
  }, [galleryMediaEntries, galleryMediaFilter]);

  const galleryMediaCounts = useMemo(() => {
    return {
      all: galleryMediaEntries.length,
      images: galleryMediaEntries.filter((entry) => entry.type === 'image').length,
      videos: galleryMediaEntries.filter((entry) => entry.type === 'video').length,
      files: galleryMediaEntries.filter((entry) => entry.type === 'file').length,
      locations: galleryMediaEntries.filter((entry) => entry.type === 'location').length,
    };
  }, [galleryMediaEntries]);

  const groupMembers = useMemo<Member[]>(() => {
    return Array.isArray(groupDetails?.members) ? groupDetails.members : [];
  }, [groupDetails]);

  const userDisplayNameById = useMemo(() => {
    const namesById = new Map<string, string>();

    for (const member of groupMembers) {
      const normalizedUserId = String(member.user_id).trim();
      const normalizedName = member.nickname?.trim();
      if (normalizedUserId && normalizedName) {
        namesById.set(normalizedUserId, normalizedName);
      }
    }

    for (const message of messages) {
      const normalizedUserId = String(message.user_id).trim();
      const normalizedName = message.name?.trim();
      if (normalizedUserId && normalizedName && !namesById.has(normalizedUserId)) {
        namesById.set(normalizedUserId, normalizedName);
      }
    }

    return namesById;
  }, [groupMembers, messages]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = memberSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return groupMembers;
    }

    return groupMembers.filter((member) => member.nickname.toLowerCase().includes(normalizedSearch));
  }, [groupMembers, memberSearch]);

  const messageLinksById = useMemo(() => {
    const linksByMessageId = new Map<string, string[]>();

    for (const message of messages) {
      const links = extractMessageLinks(message);
      if (links.length > 0) {
        linksByMessageId.set(message.id, links);
      }
    }

    return linksByMessageId;
  }, [messages]);

  const previewUrls = useMemo(() => {
    const uniqueUrls = new Set<string>();

    for (const links of messageLinksById.values()) {
      for (const link of links) {
        if (uniqueUrls.size >= MAX_PREVIEWED_LINKS) {
          return Array.from(uniqueUrls);
        }

        uniqueUrls.add(link);
      }
    }

    return Array.from(uniqueUrls);
  }, [messageLinksById]);

  const messagesById = useMemo(() => {
    return new Map(messages.map((message) => [message.id, message]));
  }, [messages]);

  const activeChatReadReceipt = useMemo(() => {
    if (activeConversation.type !== 'chat') {
      return null;
    }

    return chatReadReceipt ?? normalizeConversationReadReceiptState(activeConversation);
  }, [
    activeConversation,
    chatReadReceipt,
  ]);

  const latestOutgoingChatMessageId = useMemo(() => {
    if (activeConversation.type !== 'chat') {
      return null;
    }

    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = messages[messageIndex];
      if (message.user_id === currentUserId) {
        return message.id;
      }
    }

    return null;
  }, [activeConversation.type, currentUserId, messages]);

  const systemMessageCount = useMemo(() => {
    return messages.reduce((count, message) => {
      return count + (isSystemMessage(message) ? 1 : 0);
    }, 0);
  }, [messages]);

  const hiddenSystemMessageCount = collapseSystemMessages ? systemMessageCount : 0;

  const visibleMessages = useMemo(() => {
    if (!collapseSystemMessages) {
      return messages;
    }

    return messages.filter((message) => !isSystemMessage(message));
  }, [messages, collapseSystemMessages]);

  const eventRsvpSummaryByTemplateMessageId = useMemo(() => {
    const templateSnippetByMessageId = new Map<string, string>();
    const summaryByMessageId: Record<string, { yes: number; maybe: number; no: number }> = {};

    for (const message of messages) {
      if (!isEventTemplateMessage(message.text)) {
        continue;
      }

      templateSnippetByMessageId.set(message.id, getTemplateContextSnippet(message).toLowerCase());
      summaryByMessageId[message.id] = { yes: 0, maybe: 0, no: 0 };
    }

    if (templateSnippetByMessageId.size === 0) {
      return summaryByMessageId;
    }

    const latestRsvpByTemplateAndSender = new Map<
      string,
      { templateMessageId: string; rsvpState: 'yes' | 'maybe' | 'no'; createdAt: number }
    >();

    for (const message of messages) {
      if (!message.text) {
        continue;
      }

      const lines = message.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        continue;
      }

      const firstLine = lines[0].toLowerCase();
      if (!firstLine.startsWith('re:')) {
        continue;
      }

      const rsvpLine = lines.find((line) => /^rsvp\s*:/i.test(line));
      if (!rsvpLine) {
        continue;
      }

      const rsvpMatch = rsvpLine.match(/^rsvp\s*:\s*(yes|maybe|no)\b/i);
      if (!rsvpMatch) {
        continue;
      }

      const normalizedRsvpState = rsvpMatch[1].toLowerCase() as 'yes' | 'maybe' | 'no';
      for (const [templateMessageId, templateSnippet] of templateSnippetByMessageId.entries()) {
        if (!firstLine.includes(templateSnippet)) {
          continue;
        }

        const senderKey = `${templateMessageId}::${message.user_id || message.name}`;
        const existingEntry = latestRsvpByTemplateAndSender.get(senderKey);
        if (existingEntry && existingEntry.createdAt >= message.created_at) {
          break;
        }

        latestRsvpByTemplateAndSender.set(senderKey, {
          templateMessageId,
          rsvpState: normalizedRsvpState,
          createdAt: message.created_at,
        });
        break;
      }
    }

    for (const latestRsvpEntry of latestRsvpByTemplateAndSender.values()) {
      const summary = summaryByMessageId[latestRsvpEntry.templateMessageId];
      if (!summary) {
        continue;
      }

      summary[latestRsvpEntry.rsvpState] += 1;
    }

    return summaryByMessageId;
  }, [messages]);

  const pollVoteSummaryByTemplateMessageId = useMemo(() => {
    const templateSnippetByMessageId = new Map<string, string>();
    const pollOptionsByMessageId = new Map<string, string[]>();
    const summaryByMessageId: Record<string, { totalVotes: number; voteCounts: Record<string, number> }> = {};

    for (const message of messages) {
      if (!isPollTemplateMessage(message.text)) {
        continue;
      }

      templateSnippetByMessageId.set(message.id, getTemplateContextSnippet(message).toLowerCase());
      const pollOptions = (message.text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter((line) => line.length > 0);
      pollOptionsByMessageId.set(message.id, pollOptions);
      summaryByMessageId[message.id] = { totalVotes: 0, voteCounts: {} };
    }

    if (templateSnippetByMessageId.size === 0) {
      return summaryByMessageId;
    }

    const latestVoteByTemplateAndSender = new Map<
      string,
      { templateMessageId: string; voteChoice: string; createdAt: number }
    >();

    for (const message of messages) {
      if (!message.text) {
        continue;
      }

      const lines = message.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        continue;
      }

      const firstLine = lines[0].toLowerCase();
      if (!firstLine.startsWith('re:')) {
        continue;
      }

      const voteLine = lines.find((line) => /^poll\s+vote\s*:/i.test(line));
      if (!voteLine) {
        continue;
      }

      const voteMatch = voteLine.match(/^poll\s+vote\s*:\s*([^()]+?)(?:\s*\(|$)/i);
      if (!voteMatch) {
        continue;
      }

      const rawVoteChoice = voteMatch[1].trim();
      if (!rawVoteChoice) {
        continue;
      }

      for (const [templateMessageId, templateSnippet] of templateSnippetByMessageId.entries()) {
        if (!firstLine.includes(templateSnippet)) {
          continue;
        }

        const pollOptions = pollOptionsByMessageId.get(templateMessageId) ?? [];
        let normalizedVoteChoice = rawVoteChoice;
        if (/^\d+$/.test(rawVoteChoice)) {
          const optionIndex = Number.parseInt(rawVoteChoice, 10) - 1;
          if (optionIndex >= 0 && optionIndex < pollOptions.length) {
            normalizedVoteChoice = pollOptions[optionIndex];
          }
        } else {
          const matchingOption = pollOptions.find(
            (pollOption) => pollOption.toLowerCase() === rawVoteChoice.toLowerCase(),
          );
          if (matchingOption) {
            normalizedVoteChoice = matchingOption;
          }
        }

        const senderKey = `${templateMessageId}::${message.user_id || message.name}`;
        const existingEntry = latestVoteByTemplateAndSender.get(senderKey);
        if (existingEntry && existingEntry.createdAt >= message.created_at) {
          break;
        }

        latestVoteByTemplateAndSender.set(senderKey, {
          templateMessageId,
          voteChoice: normalizedVoteChoice,
          createdAt: message.created_at,
        });
        break;
      }
    }

    for (const latestVoteEntry of latestVoteByTemplateAndSender.values()) {
      const summary = summaryByMessageId[latestVoteEntry.templateMessageId];
      if (!summary) {
        continue;
      }

      summary.totalVotes += 1;
      summary.voteCounts[latestVoteEntry.voteChoice] =
        (summary.voteCounts[latestVoteEntry.voteChoice] ?? 0) + 1;
    }

    return summaryByMessageId;
  }, [messages]);

  const appendTemplateToComposer = (templateText: string, successHint: string) => {
    const normalizedTemplate = templateText.trim();
    if (!normalizedTemplate) {
      return;
    }

    setNewMessage((currentMessage) => {
      const normalizedCurrentMessage = currentMessage.trimEnd();
      return normalizedCurrentMessage ? `${normalizedCurrentMessage}\n\n${normalizedTemplate}` : normalizedTemplate;
    });
    setComposerHint(successHint);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const openPollComposerTemplate = () => {
    const suggestedQuestion = `What should we decide for ${activeConversation.name}?`;
    const pollQuestionInput = window.prompt('Poll question:', suggestedQuestion);
    if (pollQuestionInput === null) {
      return;
    }

    const pollQuestion = pollQuestionInput.trim();
    if (!pollQuestion) {
      setComposerHint('Poll question is required.');
      return;
    }

    const optionsInput = window.prompt(
      'Options (comma-separated, at least 2):',
      'Option 1, Option 2, Option 3',
    );
    if (optionsInput === null) {
      return;
    }

    const rawOptions = optionsInput
      .split(',')
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    const uniqueOptions: string[] = [];
    for (const option of rawOptions) {
      const duplicate = uniqueOptions.some(
        (existingOption) => existingOption.toLowerCase() === option.toLowerCase(),
      );
      if (!duplicate) {
        uniqueOptions.push(option);
      }
    }

    if (uniqueOptions.length < 2) {
      setComposerHint('Add at least two distinct poll options.');
      return;
    }

    const boundedOptions = uniqueOptions.slice(0, 10);
    const pollTemplate = [
      `📊 Poll: ${pollQuestion}`,
      ...boundedOptions.map((option, index) => `${index + 1}. ${option}`),
      'Reply with your choice number.',
    ].join('\n');

    appendTemplateToComposer(pollTemplate, 'Poll draft added to composer. Review and send when ready.');
  };

  const openEventComposerTemplate = () => {
    const suggestedTitle = `${activeConversation.name} meetup`;
    const eventTitleInput = window.prompt('Event title:', suggestedTitle);
    if (eventTitleInput === null) {
      return;
    }

    const eventTitle = eventTitleInput.trim();
    if (!eventTitle) {
      setComposerHint('Event title is required.');
      return;
    }

    const dateTimeInput = window.prompt('When? (date/time)', 'Tomorrow at 6:00 PM') ?? '';
    const locationInput = window.prompt('Where?', 'Group chat / TBD') ?? '';
    const detailsInput = window.prompt('Details (optional):', '') ?? '';

    const eventLines = [`📅 Event: ${eventTitle}`];
    if (dateTimeInput.trim()) {
      eventLines.push(`When: ${dateTimeInput.trim()}`);
    }
    if (locationInput.trim()) {
      eventLines.push(`Where: ${locationInput.trim()}`);
    }
    if (detailsInput.trim()) {
      eventLines.push(`Details: ${detailsInput.trim()}`);
    }
    eventLines.push('Reply in thread if you can make it.');

    appendTemplateToComposer(
      eventLines.join('\n'),
      'Event draft added to composer. Review and send when ready.',
    );
  };

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
    {
      label: 'Albums',
      icon: FileText,
      onClick: () => {
        setShowAlbumsPanel(true);
      },
    },
    {
      label: 'Create poll',
      icon: BarChart3,
      onClick: () => {
        openPollComposerTemplate();
      },
    },
    {
      label: 'Create event',
      icon: Calendar,
      onClick: () => {
        openEventComposerTemplate();
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

      if (activeConversation.type === 'chat') {
        const latestMessage = latestMessages[latestMessages.length - 1] ?? null;
        const syncTargetMessageId = latestMessage?.id ?? '__conversation__';

        if (lastReadReceiptSyncMessageIdRef.current !== syncTargetMessageId) {
          lastReadReceiptSyncMessageIdRef.current = syncTargetMessageId;
          void groupMeService
            .syncConversationReadReceipt(activeConversation, latestMessage?.id)
            .then((syncedReadReceipt) => {
              if (!syncedReadReceipt) {
                return;
              }

              if (activeConversationIdRef.current !== activeConversation.id) {
                return;
              }

              setChatReadReceipt((currentReadReceipt) => {
                if (
                  currentReadReceipt?.messageId === syncedReadReceipt.messageId &&
                  currentReadReceipt?.readAt === syncedReadReceipt.readAt
                ) {
                  return currentReadReceipt;
                }

                return syncedReadReceipt;
              });
            })
            .catch((error) => {
              console.warn('Failed to sync chat read receipt:', error);
            });
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOlderMessages = useCallback(async () => {
    if (loading || loadingOlderMessages || !hasMoreOlderMessages || messages.length === 0) {
      return;
    }

    const oldestMessageId = messages[0]?.id;
    if (!oldestMessageId) {
      setHasMoreOlderMessages(false);
      return;
    }

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;

    try {
      setLoadingOlderMessages(true);
      const olderMessages = await groupMeService.getConversationMessages(activeConversation, oldestMessageId);

      if (olderMessages.length === 0) {
        setHasMoreOlderMessages(false);
        return;
      }

      const olderMessagesAscending = [...olderMessages].reverse().sort(sortMessagesAscending);
      setMessages((currentMessages) => mergeMessageSets(currentMessages, olderMessagesAscending));
      fullHistoryMessagesRef.current = fullHistoryMessagesRef.current
        ? mergeMessageSets(fullHistoryMessagesRef.current, olderMessagesAscending)
        : [...olderMessagesAscending];

      window.requestAnimationFrame(() => {
        const activeContainer = messagesContainerRef.current;
        if (!activeContainer) {
          return;
        }

        const nextScrollHeight = activeContainer.scrollHeight;
        activeContainer.scrollTop += nextScrollHeight - previousScrollHeight;
      });
    } catch (error) {
      console.error('Failed to load older messages:', error);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [activeConversation, hasMoreOlderMessages, loading, loadingOlderMessages, messages]);

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
    activeConversationIdRef.current = activeConversation.id;
  }, [activeConversation.id]);

  useEffect(() => {
    lastReadReceiptSyncMessageIdRef.current = null;
  }, [activeConversation.id]);

  useEffect(() => {
    if (activeConversation.type !== 'chat') {
      setChatReadReceipt(null);
      return;
    }

    const nextReadReceipt = normalizeConversationReadReceiptState(activeConversation);
    setChatReadReceipt((currentReadReceipt) => {
      if (
        currentReadReceipt?.messageId === nextReadReceipt?.messageId &&
        currentReadReceipt?.readAt === nextReadReceipt?.readAt
      ) {
        return currentReadReceipt;
      }

      return nextReadReceipt;
    });
  }, [
    activeConversation.id,
    activeConversation.type,
    activeConversation.read_receipt_message_id,
    activeConversation.read_receipt_read_at,
  ]);

  useEffect(() => {
    if (previewUrls.length === 0) {
      return;
    }

    const urlsToLoad = previewUrls.filter((url) => !linkPreviewCache[url]);
    if (urlsToLoad.length === 0) {
      return;
    }

    setLinkPreviewCache((currentCache) => {
      const nextCache = { ...currentCache };
      for (const url of urlsToLoad) {
        if (!nextCache[url]) {
          nextCache[url] = { status: 'loading' };
        }
      }
      return nextCache;
    });

    const conversationId = activeConversation.id;
    for (const url of urlsToLoad) {
      void fetchLinkPreviewMetadata(url)
        .then((metadata) => {
          if (activeConversationIdRef.current !== conversationId) {
            return;
          }

          setLinkPreviewCache((currentCache) => ({
            ...currentCache,
            [url]: {
              status: metadata ? 'ready' : 'error',
              metadata: metadata ?? undefined,
            },
          }));
        })
        .catch(() => {
          if (activeConversationIdRef.current !== conversationId) {
            return;
          }

          setLinkPreviewCache((currentCache) => ({
            ...currentCache,
            [url]: {
              status: 'error',
            },
          }));
        });
    }
  }, [previewUrls, linkPreviewCache, activeConversation.id]);

  useEffect(() => {
    localStorage.setItem(IMAGE_ALBUMS_STORAGE_KEY, JSON.stringify(imageAlbumsByConversationId));
  }, [imageAlbumsByConversationId]);

  useEffect(() => {
    localStorage.setItem(
      MARKDOWN_COMPOSER_ENABLED_STORAGE_KEY,
      String(isMarkdownComposerEnabled),
    );
  }, [isMarkdownComposerEnabled]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    let animationFrameId: number | null = null;
    const handleScroll = () => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        if (container.scrollTop <= 96) {
          void loadOlderMessages();
        }

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowScrollToBottom(distanceFromBottom > 400);
      });
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      container.removeEventListener('scroll', handleScroll);
    };
  }, [loadOlderMessages]);

  useEffect(() => {
    discardActiveAudioRecorder();
    clearPendingAudioDraft();

    setMessages([]);
    setPinnedMessages([]);
    setPinnedMessagesError(null);
    setHasLoadedPinnedMessages(false);
    setLoadingPinnedMessages(false);
    setLoadingOlderMessages(false);
    setHasMoreOlderMessages(true);
    setHighlightedMessageId(null);
    setLinkPreviewCache({});
    setShowInfoCard(false);
    setShowPinnedPanel(false);
    setCollapseSystemMessages(true);
    setShowGallery(false);
    setGalleryMediaFilter('all');
    setShowAlbumsPanel(false);
    setShowShareQrModal(false);
    setMemberSearch('');
    setShowGroupMenu(false);
    setOpenImageActionKey(null);
    setOpenReactionPickerMessageId(null);
    setMemeEditorState(null);
    setMemeTopText('');
    setMemeBottomText('');
    setReplyTargetMessage(null);
    setShowForwardModal(false);
    setForwardTargetMessage(null);
    setForwardConversations([]);
    setForwardConversationFilter('');
    setForwardConversationsLoading(false);
    setForwardConversationsError(null);
    setForwardSendingConversationId(null);
    setSendStatus('idle');
    setSendStatusError(null);
    setDeletingMessageIds([]);
    setEditingMessageId(null);
    setRemovingMembershipId(null);
    setIsDirectContactBlocked(null);
    setDirectBlockLoading(false);
    setDirectBlockError(null);
    setComposerDraftAttachments([]);
    setPhotoDraftUploadStateById({});
    setFileDraftUploadStateById({});
    setPendingGifUrl(null);
    setShowMediaSearchModal(false);
    setMediaSearchKind('gifs');
    setMediaSearchQuery('');
    setManualMediaUrlInput('');
    setMediaSearchResults([]);
    setMediaSearchLoading(false);
    setMediaSearchError(null);
    mediaSearchRequestIdRef.current += 1;
    setShowLocationSearchModal(false);
    setLocationSearchQuery('');
    setLocationSearchResults([]);
    setLocationSearchLoading(false);
    setLocationSearchError(null);
    locationSearchRequestIdRef.current += 1;
    setPendingLocationAttachment(null);
    setIsRecordingAudio(false);
    setPendingAudioDraft(null);
    setShowEmojiPicker(false);
    setShowFullComposerEmojiPicker(false);
    setShowFullReactionEmojiPicker(false);
    setReactionCustomEmojiInput('');
    setOpenReactionDetails(null);
    cameraRecorderShouldSaveRef.current = false;
    stopCameraCaptureStream();
    setShowCameraCaptureModal(false);
    setCameraCaptureMode('photo');
    setCameraFacingMode('environment');
    setCameraCaptureError(null);
    setIsCameraInitializing(false);
    setIsCameraRecording(false);
    setCameraRecordingSeconds(0);
    setComposerHint(null);
    setIsComposerDropTarget(false);
    composerDragDepthRef.current = 0;
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
    if (activeConversation.type !== 'chat') {
      setIsDirectContactBlocked(null);
      setDirectBlockLoading(false);
      setDirectBlockError(null);
      return;
    }

    let cancelled = false;
    setDirectBlockLoading(true);
    setDirectBlockError(null);

    void groupMeService
      .isUserBlocked(currentUserId, activeConversation.sourceId)
      .then((isBlocked) => {
        if (!cancelled) {
          setIsDirectContactBlocked(isBlocked);
        }
      })
      .catch((error) => {
        console.error('Unable to load block status:', error);
        if (!cancelled) {
          setIsDirectContactBlocked(null);
          setDirectBlockError('Could not load block status.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDirectBlockLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversation.type, activeConversation.sourceId, currentUserId]);

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
    if (!openImageActionKey) {
      return;
    }

    const handleOutsideImageActionsMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      if (
        target.closest('[data-image-actions-menu]') ||
        target.closest('[data-image-actions-trigger]')
      ) {
        return;
      }

      setOpenImageActionKey(null);
    };

    window.addEventListener('mousedown', handleOutsideImageActionsMenu);
    return () => {
      window.removeEventListener('mousedown', handleOutsideImageActionsMenu);
    };
  }, [openImageActionKey]);

  useEffect(() => {
    if (!openReactionPickerMessageId) {
      return;
    }

    const handleOutsideReactionPicker = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      if (
        target.closest('[data-reaction-picker-menu]') ||
        target.closest('[data-reaction-picker-trigger]')
      ) {
        return;
      }

      setOpenReactionPickerMessageId(null);
    };

    window.addEventListener('mousedown', handleOutsideReactionPicker);
    return () => {
      window.removeEventListener('mousedown', handleOutsideReactionPicker);
    };
  }, [openReactionPickerMessageId]);

  useEffect(() => {
    if (!showEmojiPicker) {
      setShowFullComposerEmojiPicker(false);
    }
  }, [showEmojiPicker]);

  useEffect(() => {
    setShowFullReactionEmojiPicker(false);
    setReactionCustomEmojiInput('');
  }, [openReactionPickerMessageId]);

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

  useEffect(() => {
    if (!composerHint) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setComposerHint(null);
    }, 2800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [composerHint]);

  useEffect(() => {
    if (sendStatus !== 'sent') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSendStatus((currentStatus) => (currentStatus === 'sent' ? 'idle' : currentStatus));
      setSendStatusError(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [sendStatus]);

  useEffect(() => {
    if (!showForwardModal || !forwardTargetMessage) {
      return;
    }

    let cancelled = false;
    setForwardConversationsLoading(true);
    setForwardConversationsError(null);

    void groupMeService
      .getConversations()
      .then((conversationOptions) => {
        if (cancelled) {
          return;
        }

        setForwardConversations(
          conversationOptions.filter((conversationOption) => conversationOption.id !== activeConversation.id),
        );
      })
      .catch((error) => {
        console.error('Failed to load forward targets:', error);
        if (!cancelled) {
          setForwardConversations([]);
          setForwardConversationsError('Unable to load conversations right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setForwardConversationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showForwardModal, forwardTargetMessage, activeConversation.id]);

  useEffect(() => {
    return () => {
      discardActiveAudioRecorder();
      clearPendingAudioDraft();
    };
  }, []);

  const addDraftAttachments = (files: FileList | null, kind: 'photo' | 'video' | 'file') => {
    if (!files || files.length === 0) {
      return;
    }

    if (strictPublicDocModeEnabled && kind !== 'photo') {
      setComposerHint(
        `${strictAttachmentPolicyMessage} ${kind === 'video' ? 'Video' : 'File'} attachments are disabled in GroupUs.`,
      );
      return;
    }

    const availableAttachmentSlots = Math.max(
      0,
      MAX_COMPOSER_DRAFT_ATTACHMENTS - composerDraftAttachments.length,
    );
    if (availableAttachmentSlots === 0) {
      setComposerHint(`You can attach up to ${MAX_COMPOSER_DRAFT_ATTACHMENTS} items per message.`);
      return;
    }

    const incomingFiles = Array.from(files);
    const maxSizeBytes =
      kind === 'photo'
        ? MAX_PHOTO_DRAFT_SIZE_BYTES
        : kind === 'video'
          ? MAX_VIDEO_DRAFT_SIZE_BYTES
          : MAX_FILE_DRAFT_SIZE_BYTES;
    let skippedUnsupportedTypeCount = 0;
    let skippedOversizedCount = 0;

    const validFiles: File[] = [];
    for (const file of incomingFiles) {
      const isSupportedType =
        kind === 'photo'
          ? isLikelyImageFile(file)
          : kind === 'video'
            ? isSupportedVideoDraft(file)
            : isSupportedFileDraft(file);
      if (!isSupportedType) {
        skippedUnsupportedTypeCount += 1;
        continue;
      }

      if (file.size > maxSizeBytes) {
        skippedOversizedCount += 1;
        continue;
      }

      validFiles.push(file);
    }

    const normalizedFiles = validFiles.slice(0, availableAttachmentSlots);
    const skippedByLimitCount = Math.max(0, validFiles.length - normalizedFiles.length);

    if (normalizedFiles.length === 0) {
      setComposerHint(
        buildDraftAttachmentHint(
          kind,
          0,
          maxSizeBytes,
          skippedUnsupportedTypeCount,
          skippedOversizedCount,
          skippedByLimitCount,
        ),
      );
      return;
    }

    const now = Date.now();
    const nextDrafts = normalizedFiles.map((file, index) => ({
      id: `${kind}-${now}-${index}-${Math.random().toString(16).slice(2)}`,
      kind,
      name: file.name,
      size: file.size,
      file,
    }));

    setComposerDraftAttachments((currentDrafts) => [...currentDrafts, ...nextDrafts]);
    if (kind === 'photo') {
      setPhotoDraftUploadStateById((currentUploadState) => {
        const nextUploadState = { ...currentUploadState };
        for (const draftAttachment of nextDrafts) {
          nextUploadState[draftAttachment.id] = {
            status: 'idle',
            progress: 0,
          };
        }

        return nextUploadState;
      });
      setComposerHint(
        buildDraftAttachmentHint(
          kind,
          nextDrafts.length,
          maxSizeBytes,
          skippedUnsupportedTypeCount,
          skippedOversizedCount,
          skippedByLimitCount,
        ),
      );
      return;
    }

    setFileDraftUploadStateById((currentUploadState) => {
      const nextUploadState = { ...currentUploadState };
      for (const draftAttachment of nextDrafts) {
        nextUploadState[draftAttachment.id] = {
          status: 'idle',
          progress: 0,
        };
      }

      return nextUploadState;
    });

    setComposerHint(
      buildDraftAttachmentHint(
        kind,
        nextDrafts.length,
        maxSizeBytes,
        skippedUnsupportedTypeCount,
        skippedOversizedCount,
        skippedByLimitCount,
      ),
    );
  };

  const addExternalDraftAttachments = (incomingFiles: File[], source: 'drop' | 'paste' | 'camera') => {
    if (incomingFiles.length === 0) {
      return;
    }

    const availableAttachmentSlots = Math.max(
      0,
      MAX_COMPOSER_DRAFT_ATTACHMENTS - composerDraftAttachments.length,
    );
    if (availableAttachmentSlots === 0) {
      setComposerHint(`You can attach up to ${MAX_COMPOSER_DRAFT_ATTACHMENTS} items per message.`);
      return;
    }

    let skippedUnsupportedTypeCount = 0;
    let skippedOversizedCount = 0;
    const validEntries: Array<{ file: File; kind: 'photo' | 'video' | 'file' }> = [];

    for (const file of incomingFiles) {
      const kind: 'photo' | 'video' | 'file' = isLikelyImageFile(file)
        ? 'photo'
        : isLikelyVideoFile(file)
          ? 'video'
          : 'file';

      if (strictPublicDocModeEnabled && kind !== 'photo') {
        skippedUnsupportedTypeCount += 1;
        continue;
      }

      const maxSizeBytes =
        kind === 'photo'
          ? MAX_PHOTO_DRAFT_SIZE_BYTES
          : kind === 'video'
            ? MAX_VIDEO_DRAFT_SIZE_BYTES
            : MAX_FILE_DRAFT_SIZE_BYTES;
      const isSupportedType =
        kind === 'photo'
          ? isLikelyImageFile(file)
          : kind === 'video'
            ? isSupportedVideoDraft(file)
            : isSupportedFileDraft(file);
      if (!isSupportedType) {
        skippedUnsupportedTypeCount += 1;
        continue;
      }

      if (file.size > maxSizeBytes) {
        skippedOversizedCount += 1;
        continue;
      }

      validEntries.push({ file, kind });
    }

    const acceptedEntries = validEntries.slice(0, availableAttachmentSlots);
    const skippedByLimitCount = Math.max(0, validEntries.length - acceptedEntries.length);
    const sourceLabel = source === 'drop' ? 'drag and drop' : 'clipboard';

    if (acceptedEntries.length === 0) {
      const reasonParts: string[] = [];
      if (skippedUnsupportedTypeCount > 0) {
        reasonParts.push(
          strictPublicDocModeEnabled
            ? `${skippedUnsupportedTypeCount} blocked by current attachment limits`
            : `${skippedUnsupportedTypeCount} unsupported`,
        );
      }
      if (skippedOversizedCount > 0) {
        reasonParts.push(`${skippedOversizedCount} over size limit`);
      }

      setComposerHint(
        reasonParts.length > 0
          ? `No attachments added from ${sourceLabel} (${reasonParts.join(', ')}).`
          : `No attachments added from ${sourceLabel}.`,
      );
      return;
    }

    const now = Date.now();
    const nextDrafts: ComposerDraftAttachment[] = acceptedEntries.map((entry, index) => ({
      id: `${entry.kind}-${now}-${index}-${Math.random().toString(16).slice(2)}`,
      kind: entry.kind,
      name:
        entry.file.name.trim() ||
        (entry.kind === 'photo'
          ? `pasted-photo-${index + 1}.png`
          : entry.kind === 'video'
            ? `pasted-video-${index + 1}.mp4`
            : `shared-file-${index + 1}`),
      size: entry.file.size,
      file: entry.file,
    }));

    const nextPhotoDrafts = nextDrafts.filter((draft) => draft.kind === 'photo');
    const nextVideoDrafts = nextDrafts.filter((draft) => draft.kind === 'video');
    const nextFileDrafts = nextDrafts.filter((draft) => draft.kind === 'file');
    const nextNonPhotoDrafts = nextDrafts.filter((draft) => draft.kind !== 'photo');

    setComposerDraftAttachments((currentDrafts) => [...currentDrafts, ...nextDrafts]);
    if (nextPhotoDrafts.length > 0) {
      setPhotoDraftUploadStateById((currentUploadState) => {
        const nextUploadState = { ...currentUploadState };
        for (const draftAttachment of nextPhotoDrafts) {
          nextUploadState[draftAttachment.id] = {
            status: 'idle',
            progress: 0,
          };
        }

        return nextUploadState;
      });
    }

    if (nextNonPhotoDrafts.length > 0) {
      setFileDraftUploadStateById((currentUploadState) => {
        const nextUploadState = { ...currentUploadState };
        for (const draftAttachment of nextNonPhotoDrafts) {
          nextUploadState[draftAttachment.id] = {
            status: 'idle',
            progress: 0,
          };
        }

        return nextUploadState;
      });
    }

    const hintParts = [`Added ${nextDrafts.length} attachment${nextDrafts.length === 1 ? '' : 's'} from ${sourceLabel}.`];
    if (nextPhotoDrafts.length > 0) {
      hintParts.push(`${nextPhotoDrafts.length} photo draft${nextPhotoDrafts.length === 1 ? '' : 's'}.`);
    }
    if (nextVideoDrafts.length > 0) {
      hintParts.push(`${nextVideoDrafts.length} video draft${nextVideoDrafts.length === 1 ? '' : 's'}.`);
    }
    if (nextFileDrafts.length > 0) {
      hintParts.push(`${nextFileDrafts.length} file draft${nextFileDrafts.length === 1 ? '' : 's'}.`);
    }
    if (skippedUnsupportedTypeCount > 0) {
      hintParts.push(`${skippedUnsupportedTypeCount} unsupported.`);
    }
    if (skippedOversizedCount > 0) {
      hintParts.push(`${skippedOversizedCount} over size limit.`);
    }
    if (skippedByLimitCount > 0) {
      hintParts.push(`${skippedByLimitCount} skipped (max ${MAX_COMPOSER_DRAFT_ATTACHMENTS}).`);
    }

    setComposerHint(hintParts.join(' '));
    composerInputRef.current?.focus();
  };

  const handleComposerDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    composerDragDepthRef.current += 1;
    setIsComposerDropTarget(true);
  };

  const handleComposerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isComposerDropTarget) {
      setIsComposerDropTarget(true);
    }
  };

  const handleComposerDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (composerDragDepthRef.current === 0) {
      return;
    }

    composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
    if (composerDragDepthRef.current === 0) {
      setIsComposerDropTarget(false);
    }
  };

  const handleComposerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    composerDragDepthRef.current = 0;
    setIsComposerDropTarget(false);

    if (!hasTransferFiles(event.dataTransfer)) {
      return;
    }

    const droppedFiles = extractFilesFromTransfer(event.dataTransfer);
    addExternalDraftAttachments(droppedFiles, 'drop');
  };

  const handleComposerPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = extractFilesFromTransfer(event.clipboardData);
    if (pastedFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addExternalDraftAttachments(pastedFiles, 'paste');
  };

  const removeDraftAttachment = (draftId: string) => {
    setComposerDraftAttachments((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
    setPhotoDraftUploadStateById((currentUploadState) => {
      if (!currentUploadState[draftId]) {
        return currentUploadState;
      }

      const nextUploadState = { ...currentUploadState };
      delete nextUploadState[draftId];
      return nextUploadState;
    });
    setFileDraftUploadStateById((currentUploadState) => {
      if (!currentUploadState[draftId]) {
        return currentUploadState;
      }

      const nextUploadState = { ...currentUploadState };
      delete nextUploadState[draftId];
      return nextUploadState;
    });
  };

  const reorderDraftAttachment = (draftId: string, direction: 'left' | 'right') => {
    setComposerDraftAttachments((currentDrafts) => {
      const draftIndex = currentDrafts.findIndex((draft) => draft.id === draftId);
      if (draftIndex === -1) {
        return currentDrafts;
      }

      const targetIndex = direction === 'left' ? draftIndex - 1 : draftIndex + 1;
      if (targetIndex < 0 || targetIndex >= currentDrafts.length) {
        return currentDrafts;
      }

      const nextDrafts = [...currentDrafts];
      const [draftToMove] = nextDrafts.splice(draftIndex, 1);
      nextDrafts.splice(targetIndex, 0, draftToMove);
      return nextDrafts;
    });
  };

  const stopCameraRecordingTimer = useCallback(() => {
    if (cameraRecordingTimerRef.current !== null) {
      window.clearInterval(cameraRecordingTimerRef.current);
      cameraRecordingTimerRef.current = null;
    }

    setCameraRecordingSeconds(0);
  }, []);

  const stopCameraCaptureStream = useCallback(() => {
    const activeRecorder = cameraRecorderRef.current;
    if (activeRecorder) {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      activeRecorder.onerror = null;
      if (activeRecorder.state !== 'inactive') {
        try {
          activeRecorder.stop();
        } catch {
          // No-op; this cleanup is best effort.
        }
      }
    }

    cameraRecorderRef.current = null;
    cameraRecorderChunksRef.current = [];
    setIsCameraRecording(false);
    stopCameraRecordingTimer();

    const activeStream = cameraStreamRef.current;
    if (activeStream) {
      for (const track of activeStream.getTracks()) {
        track.stop();
      }
    }

    cameraStreamRef.current = null;
    const previewElement = cameraPreviewVideoRef.current;
    if (previewElement) {
      previewElement.pause();
      previewElement.srcObject = null;
    }
  }, [stopCameraRecordingTimer]);

  const closeCameraCaptureModal = useCallback(() => {
    cameraRecorderShouldSaveRef.current = false;
    stopCameraCaptureStream();
    setShowCameraCaptureModal(false);
    setCameraCaptureError(null);
    setIsCameraInitializing(false);
  }, [stopCameraCaptureStream]);

  useEffect(() => {
    if (!showCameraCaptureModal) {
      return;
    }

    let cancelled = false;
    const startCameraPreview = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraCaptureError('Camera capture is not supported in this environment.');
        return;
      }

      setIsCameraInitializing(true);
      setCameraCaptureError(null);

      try {
        const preferredWidth =
          cameraCaptureMode === 'video'
            ? selectedCameraQualityProfile.videoWidth
            : selectedCameraQualityProfile.photoWidth;
        const preferredHeight =
          cameraCaptureMode === 'video'
            ? selectedCameraQualityProfile.videoHeight
            : selectedCameraQualityProfile.photoHeight;
        const preferredFrameRate =
          cameraCaptureMode === 'video' ? selectedCameraQualityProfile.videoFrameRate : 30;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: preferredWidth },
            height: { ideal: preferredHeight },
            frameRate: { ideal: preferredFrameRate },
          },
          audio: cameraCaptureMode === 'video',
        });

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await applyPreferredVideoTrackConstraints(videoTrack, selectedCameraQualityProfile, cameraCaptureMode);
        }

        cameraStreamRef.current = stream;
        const previewElement = cameraPreviewVideoRef.current;
        if (previewElement) {
          previewElement.srcObject = stream;
          await previewElement.play().catch(() => undefined);
        }
      } catch (error) {
        console.error('Failed to access camera stream:', error);
        const permissionDenied =
          error instanceof DOMException &&
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
        setCameraCaptureError(
          permissionDenied
            ? 'Camera access was denied. Enable camera permission and try again.'
            : 'Unable to access your camera right now.',
        );
      } finally {
        if (!cancelled) {
          setIsCameraInitializing(false);
        }
      }
    };

    void startCameraPreview();

    return () => {
      cancelled = true;
      cameraRecorderShouldSaveRef.current = false;
      stopCameraCaptureStream();
    };
  }, [
    cameraCaptureMode,
    cameraFacingMode,
    selectedCameraQualityProfile,
    showCameraCaptureModal,
    stopCameraCaptureStream,
  ]);

  const openPhotoPicker = () => {
    photoInputRef.current?.click();
  }

  // Toggle for formatting & attachment toolbars
  const handleToggleComposerToolbar = () => {
    setShowComposerToolbar((prev) => !prev);
  } 

  const openPhotoCameraPicker = () => {
    setCameraCaptureMode('photo');
    setCameraFacingMode('user');
    setCameraCaptureError(null);
    setShowCameraCaptureModal(true);
    setComposerHint('Allow camera access when prompted, then capture a photo.');
  };

  const openVideoPicker = () => {
    if (strictPublicDocModeEnabled) {
      setComposerHint(`${strictAttachmentPolicyMessage} Video attachments are disabled in GroupUs.`);
      return;
    }

    videoInputRef.current?.click();
  };

  const openVideoCameraPicker = () => {
    if (strictPublicDocModeEnabled) {
      setComposerHint(`${strictAttachmentPolicyMessage} Video attachments are disabled in GroupUs.`);
      return;
    }

    setCameraCaptureMode('video');
    setCameraFacingMode('user');
    setCameraCaptureError(null);
    setShowCameraCaptureModal(true);
    setComposerHint('Allow camera access when prompted, then record your video.');
  };

  const openFilePicker = () => {
    if (strictPublicDocModeEnabled) {
      setComposerHint(`${strictAttachmentPolicyMessage} File attachments are disabled in GroupUs.`);
      return;
    }

    fileInputRef.current?.click();
  };

  const capturePhotoFromCamera = async () => {
    const previewElement = cameraPreviewVideoRef.current;
    if (!previewElement || !cameraStreamRef.current) {
      setCameraCaptureError('Camera preview is not ready yet.');
      return;
    }

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = previewElement.videoWidth || 1280;
    captureCanvas.height = previewElement.videoHeight || 720;

    const canvasContext = captureCanvas.getContext('2d');
    if (!canvasContext) {
      setCameraCaptureError('Unable to process camera image.');
      return;
    }

    canvasContext.drawImage(previewElement, 0, 0, captureCanvas.width, captureCanvas.height);
    const capturedPhotoBlob = await new Promise<Blob | null>((resolve) => {
      captureCanvas.toBlob(resolve, 'image/jpeg', selectedCameraQualityProfile.photoJpegQuality);
    });

    if (!capturedPhotoBlob) {
      setCameraCaptureError('Photo capture failed. Please try again.');
      return;
    }

    const capturedPhotoFile = new File([capturedPhotoBlob], `camera-photo-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    addExternalDraftAttachments([capturedPhotoFile], 'camera');
    setComposerHint('Photo captured from camera.');
    closeCameraCaptureModal();
  };

  const startCameraVideoRecording = () => {
    if (typeof MediaRecorder === 'undefined') {
      setCameraCaptureError('Video recording is not supported in this environment.');
      return;
    }

    const activeStream = cameraStreamRef.current;
    if (!activeStream) {
      setCameraCaptureError('Camera preview is not ready yet.');
      return;
    }

    try {
      const preferredMimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = preferredMimeType
        ? new MediaRecorder(activeStream, { mimeType: preferredMimeType })
        : new MediaRecorder(activeStream);

      cameraRecorderChunksRef.current = [];
      cameraRecorderShouldSaveRef.current = true;
      cameraRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          cameraRecorderChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setCameraCaptureError('Recording failed. Please try again.');
        cameraRecorderShouldSaveRef.current = false;
        setIsCameraRecording(false);
        stopCameraRecordingTimer();
      };

      recorder.onstop = () => {
        const shouldSaveRecording = cameraRecorderShouldSaveRef.current;
        const recordingChunks = cameraRecorderChunksRef.current;

        cameraRecorderChunksRef.current = [];
        cameraRecorderRef.current = null;
        setIsCameraRecording(false);
        stopCameraRecordingTimer();

        if (!shouldSaveRecording || recordingChunks.length === 0) {
          return;
        }

        const recorderMimeType = recorder.mimeType || 'video/webm';
        const fileExtension = recorderMimeType.includes('mp4') ? 'mp4' : 'webm';
        const capturedVideoBlob = new Blob(recordingChunks, {
          type: recorderMimeType,
        });
        const capturedVideoFile = new File([capturedVideoBlob], `camera-video-${Date.now()}.${fileExtension}`, {
          type: recorderMimeType,
        });

        addExternalDraftAttachments([capturedVideoFile], 'camera');
        setComposerHint('Video captured from camera.');
        closeCameraCaptureModal();
      };

      recorder.start();
      setIsCameraRecording(true);
      setCameraRecordingSeconds(0);
      if (cameraRecordingTimerRef.current !== null) {
        window.clearInterval(cameraRecordingTimerRef.current);
      }
      cameraRecordingTimerRef.current = window.setInterval(() => {
        setCameraRecordingSeconds((currentSeconds) => currentSeconds + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start camera recording:', error);
      setCameraCaptureError('Unable to start recording right now.');
      cameraRecorderShouldSaveRef.current = false;
      stopCameraCaptureStream();
    }
  };

  const stopCameraVideoRecording = () => {
    const activeRecorder = cameraRecorderRef.current;
    if (!activeRecorder || activeRecorder.state !== 'recording') {
      return;
    }

    cameraRecorderShouldSaveRef.current = true;
    activeRecorder.stop();
  };

  const toggleCameraVideoRecording = () => {
    if (isCameraRecording) {
      stopCameraVideoRecording();
      return;
    }

    startCameraVideoRecording();
  };

  const toggleCameraFacingMode = () => {
    if (isCameraRecording) {
      setComposerHint('Stop recording before flipping the camera.');
      return;
    }

    setCameraCaptureError(null);
    setCameraFacingMode((currentMode) => (currentMode === 'environment' ? 'user' : 'environment'));
  };

  const clearPendingAudioDraft = () => {
    setPendingAudioDraft((currentDraft) => {
      if (currentDraft?.objectUrl) {
        URL.revokeObjectURL(currentDraft.objectUrl);
      }

      return null;
    });
  };

  const discardActiveAudioRecorder = () => {
    const activeRecorder = audioRecorderRef.current;
    if (activeRecorder) {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      activeRecorder.onerror = null;
      if (activeRecorder.state !== 'inactive') {
        try {
          activeRecorder.stop();
        } catch {
          // No-op; this cleanup is best effort.
        }
      }
    }

    const activeStream = audioStreamRef.current;
    if (activeStream) {
      for (const track of activeStream.getTracks()) {
        track.stop();
      }
    }

    audioRecorderRef.current = null;
    audioStreamRef.current = null;
    audioChunksRef.current = [];
    audioRecordingStartedAtRef.current = 0;
    setIsRecordingAudio(false);
  };

  const startAudioRecording = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setComposerHint('Audio recording is not supported in this environment.');
      return;
    }

    try {
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(microphoneStream);

      audioStreamRef.current = microphoneStream;
      audioRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      audioRecordingStartedAtRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setComposerHint('Audio recording failed. Please try again.');
        discardActiveAudioRecorder();
      };

      mediaRecorder.onstop = () => {
        const activeStream = audioStreamRef.current;
        if (activeStream) {
          for (const track of activeStream.getTracks()) {
            track.stop();
          }
        }

        audioRecorderRef.current = null;
        audioStreamRef.current = null;
        setIsRecordingAudio(false);

        const recordingChunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const recordingDurationMs = Math.max(500, Date.now() - audioRecordingStartedAtRef.current);
        audioRecordingStartedAtRef.current = 0;

        if (recordingChunks.length === 0) {
          setComposerHint('No audio was captured. Try recording again.');
          return;
        }

        const audioBlob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const audioObjectUrl = URL.createObjectURL(audioBlob);


        setPendingAudioDraft((currentDraft) => {
          if (currentDraft?.objectUrl) {
            URL.revokeObjectURL(currentDraft.objectUrl);
          }
          return {
            id: `audio-${Date.now()}`,
            blob: audioBlob,
            objectUrl: audioObjectUrl,
            durationMs: recordingDurationMs,
          };
        });

        setComposerHint('Audio draft captured. It will be sent with your next message.');
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setComposerHint('Recording audio... click Audio again to stop.');
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      setComposerHint('Microphone access is required to record audio.');
      discardActiveAudioRecorder();
    }
  };

  const stopAudioRecording = () => {
    const activeRecorder = audioRecorderRef.current;
    if (!activeRecorder) {
      return;
    }

    if (activeRecorder.state === 'recording') {
      activeRecorder.stop();
    }
  };

  const toggleAudioRecording = () => {
    if (strictPublicDocModeEnabled) {
      setComposerHint(`${strictAttachmentPolicyMessage} Audio uploads are disabled in GroupUs.`);
      return;
    }

    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    void startAudioRecording();
  };

  const requestCurrentLocationAttachment = async () => {
    const tryApproximateLocation = async (): Promise<boolean> => {
      if (!window.electron?.locations?.lookupCurrent) {
        return false;
      }

      try {
        const approximateLocation = await window.electron.locations.lookupCurrent();
        if (!approximateLocation) {
          return false;
        }

        setPendingLocationAttachment({
          lat: approximateLocation.lat,
          lng: approximateLocation.lng,
          name: approximateLocation.name,
        });
        setComposerHint('Approximate location added from network lookup. Use Place for a precise location.');
        return true;
      } catch (error) {
        console.warn('Approximate location lookup failed:', error);
        return false;
      }
    };

    if (!navigator.geolocation) {
      const usedApproximateLocation = await tryApproximateLocation();
      if (!usedApproximateLocation) {
        setComposerHint('Location is not available on this device. Use Place to search manually.');
      }
      return;
    }

    const locationBridge = window.electron?.locations;
    if (locationBridge?.getPrecisePermissionState) {
      try {
        const precisePermissionState = await locationBridge.getPrecisePermissionState();
        if (precisePermissionState === 'denied' && locationBridge.clearPrecisePermissionState) {
          await locationBridge.clearPrecisePermissionState();
        }
      } catch (error) {
        console.warn('Unable to sync precise location permission state:', error);
      }
    }

    setComposerHint('Requesting your precise location. GroupUs will ask for permission if needed.');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        setPendingLocationAttachment({
          lat,
          lng,
          name: 'Current location',
        });
        setComposerHint('Location added.');
      },
      (error) => {
        void (async () => {
          if (error.code === error.PERMISSION_DENIED) {
            const usedApproximateLocation = await tryApproximateLocation();
            if (usedApproximateLocation) {
              setComposerHint(
                'Precise location access was denied. Added an approximate network location instead. Enable precise location in your OS settings for exact coordinates.',
              );
              return;
            }

            setComposerHint('Location access was denied. Enable location services and allow GroupUs, or use Place instead.');
            return;
          }

          const errorReason =
            error.code === error.POSITION_UNAVAILABLE
              ? 'your device could not determine a precise position'
              : error.code === error.TIMEOUT
                ? 'the request timed out'
                : error.message?.trim() || 'an unknown error occurred';

          const usedApproximateLocation = await tryApproximateLocation();
          if (usedApproximateLocation) {
            setComposerHint(
              `Could not access precise location (${errorReason}). Added an approximate network location instead.`,
            );
            return;
          }

          setComposerHint(
            `Could not get your precise location (${errorReason}). Use Place to search for a location manually.`,
          );
        })();
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  const runLocationSearch = useCallback(async (rawQuery: string) => {
    const normalizedQuery = rawQuery.trim();
    if (!normalizedQuery) {
      setLocationSearchError('Enter a place name or address.');
      setLocationSearchResults([]);
      return;
    }

    const requestId = locationSearchRequestIdRef.current + 1;
    locationSearchRequestIdRef.current = requestId;
    setLocationSearchLoading(true);
    setLocationSearchError(null);

    try {
      const nextResults = window.electron?.locations?.search
        ? await window.electron.locations.search({ query: normalizedQuery })
        : await searchLocationPlaces(normalizedQuery);
      if (locationSearchRequestIdRef.current !== requestId) {
        return;
      }

      setLocationSearchResults(nextResults);
      if (nextResults.length === 0) {
        setLocationSearchError('No places found. Try another search.');
      }
    } catch (error) {
      if (locationSearchRequestIdRef.current !== requestId) {
        return;
      }

      console.error('Location search failed:', error);
      setLocationSearchResults([]);
      setLocationSearchError('Location search is unavailable right now.');
    } finally {
      if (locationSearchRequestIdRef.current === requestId) {
        setLocationSearchLoading(false);
      }
    }
  }, []);

  const openLocationSearch = () => {
    setShowLocationSearchModal(true);
    setLocationSearchError(null);

    if (!locationSearchQuery.trim()) {
      return;
    }

    void runLocationSearch(locationSearchQuery);
  };

  const handleLocationSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runLocationSearch(locationSearchQuery);
  };

  const useLocationSearchResult = (result: LocationSearchResult) => {
    setPendingLocationAttachment({
      lat: result.lat,
      lng: result.lng,
      name: result.name,
    });
    setShowLocationSearchModal(false);
    setComposerHint('Location added from place search.');
  };

  const appendEmojiToMessage = (emoji: string) => {
    setNewMessage((currentMessage) => `${currentMessage}${emoji}`);
    setShowEmojiPicker(false);
    setShowFullComposerEmojiPicker(false);
  };

  const handleComposerEmojiClick = (emojiData: EmojiClickData) => {
    appendEmojiToMessage(emojiData.emoji);
  };

  const clearFailedSendStatus = useCallback(() => {
    if (sendStatus !== 'failed') {
      return;
    }

    setSendStatus('idle');
    setSendStatusError(null);
  }, [sendStatus]);

  const applyComposerInlineMarkdown = useCallback(
    (prefix: string, suffix: string, fallbackText: string) => {
      const composerNode = composerInputRef.current;
      const selectionStart = composerNode?.selectionStart ?? newMessage.length;
      const selectionEnd = composerNode?.selectionEnd ?? newMessage.length;
      const hasSelection = selectionEnd > selectionStart;
      const selectedText = newMessage.slice(selectionStart, selectionEnd);
      const wrappedText = hasSelection ? selectedText : fallbackText;
      const plainStyleByToken: Record<string, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'> = {
        '**:**': 'bold',
        '*:*': 'italic',
        '<u>:</u>': 'underline',
        '~~:~~': 'strikethrough',
        '`:`': 'code',
      };
      const plainStyle = plainStyleByToken[`${prefix}:${suffix}`];
      const formattedText =
        !isMarkdownComposerEnabled && plainStyle
          ? applyPlainFormattingStyle(wrappedText, plainStyle)
          : `${prefix}${wrappedText}${suffix}`;
      const nextMessage =
        `${newMessage.slice(0, selectionStart)}${formattedText}${newMessage.slice(selectionEnd)}`;

      setNewMessage(nextMessage);
      clearFailedSendStatus();

      window.requestAnimationFrame(() => {
        const activeComposerNode = composerInputRef.current;
        if (!activeComposerNode) {
          return;
        }

        activeComposerNode.focus();
        if (hasSelection) {
          const cursorPosition = selectionStart + formattedText.length;
          activeComposerNode.setSelectionRange(cursorPosition, cursorPosition);
          return;
        }

        const contentStart = selectionStart;
        const contentEnd = contentStart + formattedText.length;
        activeComposerNode.setSelectionRange(contentStart, contentEnd);
      });
    },
    [clearFailedSendStatus, isMarkdownComposerEnabled, newMessage],
  );

  const applyComposerLinkMarkdown = useCallback(() => {
    const composerNode = composerInputRef.current;
    const selectionStart = composerNode?.selectionStart ?? newMessage.length;
    const selectionEnd = composerNode?.selectionEnd ?? newMessage.length;
    const hasSelection = selectionEnd > selectionStart;
    const selectedText = newMessage.slice(selectionStart, selectionEnd);
    const linkLabel = hasSelection ? selectedText : 'link text';
    const linkUrl = 'https://example.com';
    const markdownLink = `[${linkLabel}](${linkUrl})`;
    const nextMessage =
      `${newMessage.slice(0, selectionStart)}${markdownLink}${newMessage.slice(selectionEnd)}`;

    setNewMessage(nextMessage);
    clearFailedSendStatus();

    window.requestAnimationFrame(() => {
      const activeComposerNode = composerInputRef.current;
      if (!activeComposerNode) {
        return;
      }

      const urlStart = selectionStart + linkLabel.length + 3;
      const urlEnd = urlStart + linkUrl.length;
      activeComposerNode.focus();
      activeComposerNode.setSelectionRange(urlStart, urlEnd);
    });
  }, [clearFailedSendStatus, newMessage]);

  const applyComposerQuoteMarkdown = useCallback(() => {
    const composerNode = composerInputRef.current;
    const selectionStart = composerNode?.selectionStart ?? newMessage.length;
    const selectionEnd = composerNode?.selectionEnd ?? newMessage.length;
    const hasSelection = selectionEnd > selectionStart;
    const selectedText = hasSelection ? newMessage.slice(selectionStart, selectionEnd) : 'quoted text';
    const quotedText = selectedText
      .split('\n')
      .map((lineText) => `> ${lineText}`)
      .join('\n');
    const nextMessage =
      `${newMessage.slice(0, selectionStart)}${quotedText}${newMessage.slice(selectionEnd)}`;

    setNewMessage(nextMessage);
    clearFailedSendStatus();

    window.requestAnimationFrame(() => {
      const activeComposerNode = composerInputRef.current;
      if (!activeComposerNode) {
        return;
      }

      const contentStart = selectionStart;
      const contentEnd = contentStart + quotedText.length;
      activeComposerNode.focus();
      activeComposerNode.setSelectionRange(contentStart, contentEnd);
    });
  }, [clearFailedSendStatus, newMessage]);

  const useCustomMessageReaction = (message: Message) => {
    const normalizedReaction = reactionCustomEmojiInput.trim();
    if (!normalizedReaction) {
      setComposerHint('Pick an emoji reaction first.');
      return;
    }

    void toggleMessageReaction(message, normalizedReaction);
    setReactionCustomEmojiInput('');
    setShowFullReactionEmojiPicker(false);
    setOpenReactionPickerMessageId(null);
  };

  const queueManualMediaLink = () => {
    const normalizedMediaUrl = normalizeMessageUrl(manualMediaUrlInput);
    if (!normalizedMediaUrl) {
      setComposerHint('Please enter a valid media URL with http:// or https://.');
      return;
    }

    setPendingGifUrl(normalizedMediaUrl);
    setManualMediaUrlInput('');
    setShowMediaSearchModal(false);
    setComposerHint('Media link added. It will be included in your next message.');
  };

  const runMediaSearch = useCallback(
    async (rawQuery: string, kind: MediaSearchKind) => {
      const normalizedQuery = rawQuery.trim();
      if (!normalizedQuery) {
        setMediaSearchError('Enter a search term.');
        setMediaSearchResults([]);
        return;
      }

      const requestId = mediaSearchRequestIdRef.current + 1;
      mediaSearchRequestIdRef.current = requestId;
      setMediaSearchLoading(true);
      setMediaSearchError(null);

      try {
        const nextResults = window.electron?.media?.search
          ? await window.electron.media.search({ query: normalizedQuery, kind })
          : kind === 'gifs'
            ? await searchTenorGifs(normalizedQuery)
            : await searchWikimediaMedia(normalizedQuery, kind);

        if (mediaSearchRequestIdRef.current !== requestId) {
          return;
        }

        setMediaSearchResults(nextResults);
        if (nextResults.length === 0) {
          setMediaSearchError('No results found. Try a different query.');
        }
      } catch (error) {
        if (mediaSearchRequestIdRef.current !== requestId) {
          return;
        }

        console.error('Media search failed:', error);
        setMediaSearchResults([]);
        setMediaSearchError('Media search is unavailable right now. You can still paste a URL.');
      } finally {
        if (mediaSearchRequestIdRef.current === requestId) {
          setMediaSearchLoading(false);
        }
      }
    },
    [],
  );

  const openMediaSearch = () => {
    setShowMediaSearchModal(true);
    setMediaSearchError(null);

    if (!mediaSearchQuery.trim()) {
      return;
    }

    void runMediaSearch(mediaSearchQuery, mediaSearchKind);
  };

  const handleMediaSearchKindChange = (nextKind: MediaSearchKind) => {
    setMediaSearchKind(nextKind);
    setMediaSearchError(null);

    if (!mediaSearchQuery.trim()) {
      setMediaSearchResults([]);
      return;
    }

    void runMediaSearch(mediaSearchQuery, nextKind);
  };

  const handleMediaSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runMediaSearch(mediaSearchQuery, mediaSearchKind);
  };

  const useMediaSearchResult = (result: MediaSearchResult) => {
    const mediaLabel = result.mediaType === 'gif' ? 'GIF' : result.mediaType === 'video' ? 'Video' : 'Image';

    if (result.mediaType === 'gif') {
      setPendingGifUrl(result.mediaUrl);
      setComposerHint(`${mediaLabel} added. It will be included in your next message.`);
    } else {
      setNewMessage((currentMessage) => {
        if (!currentMessage.trim()) {
          return result.mediaUrl;
        }

        return `${currentMessage}\n${result.mediaUrl}`;
      });
      setComposerHint(`${mediaLabel} link added to your message.`);
    }

    setShowMediaSearchModal(false);
  };

  const queueGifLinkAttachment = () => {
    openMediaSearch();
  };

  const beginReplyToMessage = (targetMessage: Message) => {
    setReplyTargetMessage(targetMessage);
    composerInputRef.current?.focus();
    setComposerHint(`Replying to ${targetMessage.name}.`);
  };

  const beginReplyToMessageById = (messageId: string, senderName: string) => {
    const targetMessage =
      messages.find((message) => message.id === messageId) ??
      fullHistoryMessagesRef.current?.find((message) => message.id === messageId) ??
      null;

    if (!targetMessage) {
      const replyPrefix = `Replying to ${senderName}: `;
      setNewMessage((currentMessage) => {
        if (currentMessage.trim()) {
          return currentMessage;
        }

        return replyPrefix;
      });
      setComposerHint(`Reply drafted for ${senderName}.`);
      composerInputRef.current?.focus();
      return;
    }

    beginReplyToMessage(targetMessage);
  };

  const openForwardMessageModal = (targetMessage: Message) => {
    setForwardTargetMessage(targetMessage);
    setForwardConversationFilter('');
    setForwardConversationsError(null);
    setShowForwardModal(true);
  };

  const closeForwardMessageModal = () => {
    setShowForwardModal(false);
    setForwardTargetMessage(null);
    setForwardConversationFilter('');
    setForwardConversationsError(null);
    setForwardSendingConversationId(null);
  };

  const forwardMessageToConversation = async (targetConversation: Conversation) => {
    if (!forwardTargetMessage) {
      return;
    }

    setForwardSendingConversationId(targetConversation.id);
    setForwardConversationsError(null);

    const forwardHeader = `Forwarded from ${activeConversation.name} | ${forwardTargetMessage.name}`;
    const forwardBody = forwardTargetMessage.text.trim();
    const outgoingText = forwardBody ? `${forwardHeader}\n${forwardBody}` : forwardHeader;
    const outgoingAttachments = forwardTargetMessage.attachments.map((attachment) => ({
      type: attachment.type,
      url: attachment.url,
      preview_url: attachment.preview_url,
      lat: attachment.lat,
      lng: attachment.lng,
      name: attachment.name,
    }));

    try {
      await groupMeService.sendConversationMessage(targetConversation, outgoingText, outgoingAttachments);
      setComposerHint(`Message forwarded to ${targetConversation.name}.`);
      closeForwardMessageModal();
    } catch (error) {
      console.error('Failed to forward message:', error);
      setForwardConversationsError(
        error instanceof Error ? error.message : 'Failed to forward message. Try again.',
      );
    } finally {
      setForwardSendingConversationId(null);
    }
  };

  const toggleDirectContactBlock = async () => {
    if (activeConversation.type !== 'chat' || directBlockLoading) {
      return;
    }

    const contactName = activeConversation.name || 'this contact';
    const nextBlocked = !(isDirectContactBlocked === true);
    const confirmation = window.confirm(
      nextBlocked
        ? `Block ${contactName}? They will no longer be able to DM you.`
        : `Unblock ${contactName}? DMs with this contact will be enabled again.`,
    );
    if (!confirmation) {
      return;
    }

    setDirectBlockLoading(true);
    setDirectBlockError(null);

    try {
      if (nextBlocked) {
        await groupMeService.blockUser(currentUserId, activeConversation.sourceId);
      } else {
        await groupMeService.unblockUser(currentUserId, activeConversation.sourceId);
      }

      setIsDirectContactBlocked(nextBlocked);
      setComposerHint(nextBlocked ? `${contactName} was blocked.` : `${contactName} was unblocked.`);
    } catch (error) {
      console.error('Unable to update block status:', error);
      setDirectBlockError('Unable to update block status right now.');
      setComposerHint('Unable to update block status right now.');
    } finally {
      setDirectBlockLoading(false);
    }
  };

  const downloadMedia = async (mediaUrl: string, fallbackFilename: string) => {
    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error('Download request failed.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = objectUrl;
      downloadAnchor.download = fallbackFilename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(objectUrl);
      setComposerHint('Media download started.');
    } catch (error) {
      console.error('Failed to download media:', error);
      setComposerHint('Unable to download media right now.');
    }
  };

  const downloadImage = async (imageUrl: string) => {
    await downloadMedia(imageUrl, getDownloadFilenameFromUrl(imageUrl));
  };

  const shareMediaUrl = async (mediaUrl: string) => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setComposerHint('Clipboard sharing is not available in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(mediaUrl);
      setComposerHint('Media link copied to clipboard.');
    } catch (error) {
      console.error('Failed to copy media link:', error);
      setComposerHint('Unable to copy media link.');
    }
  };

  const openMediaExternally = (mediaUrl: string, mediaLabel: string) => {
    window.open(mediaUrl, '_blank', 'noopener,noreferrer');
    setComposerHint(`${mediaLabel} opened in your default app/browser.`);
  };

  const copyGroupShareLink = async (shareUrl: string) => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setComposerHint('Clipboard sharing is not available in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setComposerHint('Group share link copied to clipboard.');
    } catch (error) {
      console.error('Failed to copy group share link:', error);
      setComposerHint('Unable to copy group share link.');
    }
  };

  const openGroupShareLink = (shareUrl: string) => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    setComposerHint('Group share link opened in your browser.');
  };

  const openMediaForMeme = (mediaUrl: string, mediaType: 'image' | 'video', senderName: string) => {
    setMemeEditorState({
      mediaUrl,
      mediaType,
      senderName,
    });
    setMemeTopText('');
    setMemeBottomText('');
  };

  const closeMemeEditor = () => {
    setMemeEditorState(null);
    setMemeTopText('');
    setMemeBottomText('');
  };

  const addMemeCaptionToComposer = () => {
    if (!memeEditorState) {
      return;
    }

    const top = memeTopText.trim();
    const bottom = memeBottomText.trim();
    const captionParts: string[] = [];
    if (top) {
      captionParts.push(`TOP: ${top}`);
    }
    if (bottom) {
      captionParts.push(`BOTTOM: ${bottom}`);
    }

    const composedMemeText = captionParts.length > 0 ? captionParts.join(' | ') : 'Meme';
    const outgoingMemeText = `${composedMemeText}\n${memeEditorState.mediaUrl}`;
    setNewMessage((currentMessage) => {
      if (!currentMessage.trim()) {
        return outgoingMemeText;
      }

      return `${currentMessage}\n${outgoingMemeText}`;
    });
    setComposerHint('Meme caption added to composer.');
    closeMemeEditor();
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const downloadMemeImage = async () => {
    if (!memeEditorState || memeEditorState.mediaType !== 'image') {
      return;
    }

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to load image for meme export.'));
        img.src = memeEditorState.mediaUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Meme canvas is unavailable.');
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const fontSize = Math.max(28, Math.round(canvas.width * 0.08));
      context.font = `700 ${fontSize}px Impact, Arial Black, sans-serif`;
      context.textAlign = 'center';
      context.lineWidth = Math.max(3, Math.round(fontSize * 0.08));
      context.strokeStyle = 'black';
      context.fillStyle = 'white';

      const drawMemeLine = (text: string, yPosition: number) => {
        if (!text.trim()) {
          return;
        }

        const normalizedText = text.trim().toUpperCase();
        context.strokeText(normalizedText, canvas.width / 2, yPosition);
        context.fillText(normalizedText, canvas.width / 2, yPosition);
      };

      drawMemeLine(memeTopText, fontSize + 12);
      drawMemeLine(memeBottomText, canvas.height - 18);

      const dataUrl = canvas.toDataURL('image/png');
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = dataUrl;
      downloadAnchor.download = `groupus-meme-${Date.now()}.png`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setComposerHint('Meme image downloaded.');
    } catch (error) {
      console.error('Failed to export meme image:', error);
      setComposerHint('Could not export meme image. Try opening externally.');
    }
  };

  const formatAlbumTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const addImageToAlbum = (imageUrl: string, messageId: string, senderName: string) => {
    const suggestedAlbumName = activeConversationAlbums[0]?.name ?? `${activeConversation.name} album`;
    const requestedAlbumName = window.prompt('Album name (new or existing):', suggestedAlbumName);

    if (requestedAlbumName === null) {
      return;
    }

    const normalizedAlbumName = requestedAlbumName.trim();
    if (!normalizedAlbumName) {
      setComposerHint('Album name is required.');
      return;
    }

    const conversationId = activeConversation.id;
    const currentAlbums = imageAlbumsByConversationId[conversationId] ?? [];
    const existingAlbumIndex = currentAlbums.findIndex(
      (album) => album.name.toLowerCase() === normalizedAlbumName.toLowerCase(),
    );
    const nextImage: AlbumImageEntry = {
      id: `album-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      imageUrl,
      messageId,
      senderName,
      addedAt: Date.now(),
    };

    let nextAlbums = [...currentAlbums];
    if (existingAlbumIndex === -1) {
      nextAlbums.unshift({
        id: `album-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: normalizedAlbumName,
        createdAt: Date.now(),
        images: [nextImage],
      });
      setComposerHint(`Created album "${normalizedAlbumName}" and added image.`);
    } else {
      const existingAlbum = nextAlbums[existingAlbumIndex];
      const duplicateImage = existingAlbum.images.some(
        (albumImage) => albumImage.imageUrl === imageUrl && albumImage.messageId === messageId,
      );

      if (duplicateImage) {
        setComposerHint(`Image already exists in "${existingAlbum.name}".`);
        setShowAlbumsPanel(true);
        return;
      }

      nextAlbums[existingAlbumIndex] = {
        ...existingAlbum,
        images: [nextImage, ...existingAlbum.images],
      };
      setComposerHint(`Added image to "${existingAlbum.name}".`);
    }

    setImageAlbumsByConversationId((currentAlbumsByConversationId) => ({
      ...currentAlbumsByConversationId,
      [conversationId]: nextAlbums,
    }));
    setShowAlbumsPanel(true);
  };

  const removeAlbum = (albumId: string) => {
    const conversationId = activeConversation.id;
    setImageAlbumsByConversationId((currentAlbumsByConversationId) => {
      const conversationAlbums = currentAlbumsByConversationId[conversationId] ?? [];
      const nextConversationAlbums = conversationAlbums.filter((album) => album.id !== albumId);

      return {
        ...currentAlbumsByConversationId,
        [conversationId]: nextConversationAlbums,
      };
    });
    setComposerHint('Album removed.');
  };

  const renameAlbum = (albumId: string) => {
    const targetAlbum = activeConversationAlbums.find((album) => album.id === albumId);
    if (!targetAlbum) {
      return;
    }

    const requestedAlbumName = window.prompt('Rename album:', targetAlbum.name);
    if (requestedAlbumName === null) {
      return;
    }

    const normalizedAlbumName = requestedAlbumName.trim();
    if (!normalizedAlbumName) {
      setComposerHint('Album name is required.');
      return;
    }

    const duplicateNameExists = activeConversationAlbums.some(
      (album) => album.id !== albumId && album.name.toLowerCase() === normalizedAlbumName.toLowerCase(),
    );
    if (duplicateNameExists) {
      setComposerHint(`An album named "${normalizedAlbumName}" already exists.`);
      return;
    }

    const conversationId = activeConversation.id;
    setImageAlbumsByConversationId((currentAlbumsByConversationId) => {
      const conversationAlbums = currentAlbumsByConversationId[conversationId] ?? [];

      return {
        ...currentAlbumsByConversationId,
        [conversationId]: conversationAlbums.map((album) =>
          album.id === albumId
            ? {
                ...album,
                name: normalizedAlbumName,
              }
            : album,
        ),
      };
    });
    setComposerHint(`Album renamed to "${normalizedAlbumName}".`);
  };

  const removeImageFromAlbum = (albumId: string, albumImageId: string) => {
    const conversationId = activeConversation.id;
    setImageAlbumsByConversationId((currentAlbumsByConversationId) => {
      const conversationAlbums = currentAlbumsByConversationId[conversationId] ?? [];
      const nextConversationAlbums = conversationAlbums.flatMap((album) => {
        if (album.id !== albumId) {
          return [album];
        }

        const nextAlbumImages = album.images.filter((albumImage) => albumImage.id !== albumImageId);
        if (nextAlbumImages.length === 0) {
          return [];
        }

        return [
          {
            ...album,
            images: nextAlbumImages,
          },
        ];
      });

      return {
        ...currentAlbumsByConversationId,
        [conversationId]: nextConversationAlbums,
      };
    });
    setComposerHint('Removed image from album.');
  };

  const getDraftUploadState = (draftAttachment: ComposerDraftAttachment) => {
    return draftAttachment.kind === 'photo'
      ? photoDraftUploadStateById[draftAttachment.id]
      : fileDraftUploadStateById[draftAttachment.id];
  };

  const updateDraftUploadState = (
    draftAttachment: ComposerDraftAttachment,
    updater: (currentUploadState: Record<string, PhotoDraftUploadState>) => Record<string, PhotoDraftUploadState>,
  ) => {
    if (draftAttachment.kind === 'photo') {
      setPhotoDraftUploadStateById(updater);
      return;
    }

    setFileDraftUploadStateById(updater);
  };

  const uploadDraftAttachment = async (draftAttachment: ComposerDraftAttachment) => {
    updateDraftUploadState(draftAttachment, (currentUploadState) => ({
      ...currentUploadState,
      [draftAttachment.id]: {
        status: 'uploading',
        progress: 0,
      },
    }));

    try {
      const uploadedAttachmentUrl = await groupMeService.uploadAttachment(draftAttachment.file, {
        onProgress: (progressPercent) => {
          updateDraftUploadState(draftAttachment, (currentUploadState) => {
            const existingUploadState = currentUploadState[draftAttachment.id];
            if (!existingUploadState) {
              return currentUploadState;
            }

            return {
              ...currentUploadState,
              [draftAttachment.id]: {
                ...existingUploadState,
                status: 'uploading',
                progress: progressPercent,
                error: undefined,
              },
            };
          });
        },
      });

      updateDraftUploadState(draftAttachment, (currentUploadState) => ({
        ...currentUploadState,
        [draftAttachment.id]: {
          status: 'uploaded',
          progress: 100,
          uploadedUrl: uploadedAttachmentUrl,
        },
      }));

      if (draftAttachment.kind === 'photo') {
        return {
          type: 'image',
          url: uploadedAttachmentUrl,
        };
      }

      if (draftAttachment.kind === 'video') {
        return {
          type: 'video',
          url: uploadedAttachmentUrl,
        };
      }

      return {
        type: 'file',
        url: uploadedAttachmentUrl,
        name: draftAttachment.name,
      };
    } catch (error) {
      const uploadKindLabel =
        draftAttachment.kind === 'photo' ? 'Photo' : draftAttachment.kind === 'video' ? 'Video' : 'File';
      const errorMessage = error instanceof Error ? error.message : `${uploadKindLabel} upload failed.`;

      updateDraftUploadState(draftAttachment, (currentUploadState) => ({
        ...currentUploadState,
        [draftAttachment.id]: {
          status: 'failed',
          progress: 0,
          error: errorMessage,
        },
      }));

      throw new Error(`${uploadKindLabel} upload failed for ${draftAttachment.name}. Retry and send again.`);
    }
  };

  const retryDraftUpload = async (draftAttachment: ComposerDraftAttachment) => {
    try {
      await uploadDraftAttachment(draftAttachment);
      setComposerHint(`${draftAttachment.name} uploaded. Ready to send.`);
    } catch (error) {
      setComposerHint(
        error instanceof Error
          ? error.message
          : `Failed to upload ${draftAttachment.name}. Retry and send again.`,
      );
    }
  };

  const sendComposerMessage = async () => {
    if (sending) {
      return;
    }

    if (isRecordingAudio) {
      setComposerHint('Stop audio recording before sending a message.');
      return;
    }

    if (hasUploadingDraftAttachment) {
      setComposerHint('Please wait for current attachment uploads to finish.');
      return;
    }

    const messageText = newMessage.trim();
    const hasDraftAttachments = composerDraftAttachments.length > 0;
    const audioDraftToSend = pendingAudioDraft;
    const hasAudioDraft = audioDraftToSend !== null;
    const hasGifLink = pendingGifUrl !== null;
    const hasLocationAttachment = pendingLocationAttachment !== null;
    if (!messageText && !hasDraftAttachments && !hasAudioDraft && !hasGifLink && !hasLocationAttachment) {
      return;
    }

    const gifLinkToSend = pendingGifUrl;
    const locationAttachmentToSend = pendingLocationAttachment;
    const replyTargetToSend = replyTargetMessage;
    let outgoingText = messageText;

    setSending(true);
    setSendStatus('sending');
    setSendStatusError(null);

    try {
      const outgoingAttachments: Array<{
        type: string;
        url?: string;
        lat?: string;
        lng?: string;
        name?: string;
        reply_id?: string;
        base_reply_id?: string;
      }> = [];

      if (replyTargetToSend) {
        outgoingAttachments.push({
          type: 'reply',
          reply_id: replyTargetToSend.id,
          base_reply_id: replyTargetToSend.id,
        });
      }

      if (hasDraftAttachments) {
        for (const draftAttachment of composerDraftAttachments) {
          const existingUploadState = getDraftUploadState(draftAttachment);
          if (existingUploadState?.status === 'uploaded' && existingUploadState.uploadedUrl) {
            outgoingAttachments.push(
              draftAttachment.kind === 'photo'
                ? {
                    type: 'image',
                    url: existingUploadState.uploadedUrl,
                  }
                : draftAttachment.kind === 'video'
                  ? {
                      type: 'video',
                      url: existingUploadState.uploadedUrl,
                    }
                  : {
                      type: 'file',
                      url: existingUploadState.uploadedUrl,
                      name: draftAttachment.name,
                    },
            );
            continue;
          }

          const uploadedAttachment = await uploadDraftAttachment(draftAttachment);
          outgoingAttachments.push(uploadedAttachment);
        }
      }

      if (audioDraftToSend) {
        const audioDraftFile = new File(
          [audioDraftToSend.blob],
          getAudioDraftFilename(audioDraftToSend),
          {
            type: audioDraftToSend.blob.type || 'audio/webm',
          },
        );

        const uploadedAudioUrl = await groupMeService.uploadAttachment(audioDraftFile);
        outgoingAttachments.push({
          type: 'audio',
          url: uploadedAudioUrl,
          name: audioDraftFile.name,
        });
      }

      if (locationAttachmentToSend) {
        outgoingAttachments.push({
          type: 'location',
          lat: locationAttachmentToSend.lat,
          lng: locationAttachmentToSend.lng,
          name: locationAttachmentToSend.name,
        });
      }

      if (gifLinkToSend) {
        try {
          const gifResponse = await fetch(gifLinkToSend);
          const gifBlob = await gifResponse.blob();
          const gifFile = new File(
            [gifBlob],
            'animated.gif',
            { type: gifBlob.type || 'image/gif' },
          );
          const uploadedGifUrl = await groupMeService.uploadAttachment(gifFile);
          outgoingAttachments.push({ type: 'image', url: uploadedGifUrl });
        } catch {
          // Fallback: if upload fails, send as text link
          if (outgoingText) {
            outgoingText = `${outgoingText}\n${gifLinkToSend}`;
          } else {
            outgoingText = gifLinkToSend;
          }
        }
      }

      let sentAudioAsFallbackFile = false;
      try {
        await groupMeService.sendConversationMessage(activeConversation, outgoingText, outgoingAttachments);
      } catch (sendError) {
        const canFallbackAudioType = outgoingAttachments.some(
          (attachment) => attachment.type === 'audio',
        );
        if (!canFallbackAudioType) {
          throw sendError;
        }

        const fallbackAttachments = outgoingAttachments.map((attachment) =>
          attachment.type === 'audio'
            ? {
                ...attachment,
                type: 'file',
              }
            : attachment,
        );

        await groupMeService.sendConversationMessage(activeConversation, outgoingText, fallbackAttachments);
        sentAudioAsFallbackFile = true;
      }

      setNewMessage('');
      setComposerDraftAttachments([]);
      setPhotoDraftUploadStateById({});
      setFileDraftUploadStateById({});
      setPendingGifUrl(null);
      setPendingLocationAttachment(null);
      clearPendingAudioDraft();
      setShowEmojiPicker(false);
      setOpenImageActionKey(null);
      setReplyTargetMessage(null);
      setComposerHint(
        sentAudioAsFallbackFile
          ? 'Message sent. Audio note was attached as a file for compatibility.'
          : null,
      );
      setSendStatus('sent');
      setSendStatusError(null);
      await loadMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send message. Please try again.';

      setSendStatus('failed');
      setSendStatusError(errorMessage);
      setComposerHint(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    void sendComposerMessage();
  };

  const toggleMessageReaction = async (message: Message, reactionEmoji: string) => {
    const normalizedReaction = normalizeReactionEmoji(reactionEmoji);
    if (!normalizedReaction) {
      return;
    }

    const messageConversationId =
      typeof message.conversation_id === 'string' ? message.conversation_id.trim() : '';
    const messageGroupId =
      typeof message.group_id === 'string' ? message.group_id.trim() : '';

    // For DMs, construct synthetic conversation ID (userId+otherUserId) as a fallback
    // when the message doesn't carry its own conversation_id.
    const syntheticDmConversationId =
      activeConversation.type === 'chat' && !messageConversationId
        ? `${currentUserId}+${activeConversation.sourceId}`
        : '';

    const reactionConversationId =
      messageConversationId || messageGroupId || syntheticDmConversationId || undefined;

    if (canLikeMessages && normalizedReaction === GROUPME_LIKE_EMOJI) {
      const isLiked = message.favorited_by.includes(currentUserId);
      const didUpdate = await handleLikeMessage(message.id, isLiked, reactionConversationId);
      if (didUpdate) {
        setComposerHint(isLiked ? `Removed ${GROUPME_LIKE_EMOJI} reaction.` : `Added ${GROUPME_LIKE_EMOJI} reaction.`);
      }
      return;
    }

    if (!groupMeService.supportsRemoteEmojiReactions()) {
      setComposerHint('GroupMe\'s public API currently syncs only ❤️ reactions across devices.');
      return;
    }

    const remoteEmojiReactions = parseRemoteEmojiReactionMap(message);
    const existingReactionEvents = remoteEmojiReactions[normalizedReaction] ?? [];
    const hasReaction = existingReactionEvents.some((reactionEvent) => reactionEvent.userId === currentUserId);

    try {
      if (hasReaction) {
        await groupMeService.removeEmojiReaction(
          activeConversation,
          message.id,
          normalizedReaction,
          reactionConversationId,
        );
      } else {
        await groupMeService.addEmojiReaction(
          activeConversation,
          message.id,
          normalizedReaction,
          reactionConversationId,
        );
      }

      setComposerHint(hasReaction ? `Removed ${normalizedReaction} reaction.` : `Added ${normalizedReaction} reaction.`);
      await loadMessages();
    } catch (error) {
      console.error('Failed to update emoji reaction:', error);
      setComposerHint(getReactionUpdateErrorMessage(error));
    }
  };

  const handleEditMessage = async (message: Message) => {
    if (message.user_id !== currentUserId) {
      setComposerHint('You can only edit your own messages.');
      return;
    }

    const currentText = message.text?.trim() ?? '';
    const nextTextInput = window.prompt('Edit message text:', currentText);
    if (nextTextInput === null) {
      return;
    }

    const nextText = nextTextInput.trim();
    if (!nextText) {
      setComposerHint('Edited message text cannot be empty.');
      return;
    }

    if (nextText === currentText) {
      setComposerHint('No message changes to save.');
      return;
    }

    setEditingMessageId(message.id);
    try {
      await groupMeService.editConversationMessage(activeConversation, message.id, nextText);
      setComposerHint('Message edited.');
      await loadMessages();
    } catch (error) {
      console.error('Failed to edit message:', error);
      setComposerHint(
        error instanceof Error
          ? error.message
          : 'Unable to edit this message directly.',
      );
    } finally {
      setEditingMessageId((currentEditingMessageId) =>
        currentEditingMessageId === message.id ? null : currentEditingMessageId,
      );
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    if (message.user_id !== currentUserId) {
      setComposerHint('You can only delete your own messages.');
      return;
    }

    const confirmed = window.confirm('Delete this message? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeletingMessageIds((currentIds) => (
      currentIds.includes(message.id) ? currentIds : [...currentIds, message.id]
    ));

    try {
      await groupMeService.deleteConversationMessage(activeConversation, message.id);
      setComposerHint('Message deleted.');
      await loadMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
      setComposerHint(
        error instanceof Error ? error.message : 'Unable to delete this message right now.',
      );
    } finally {
      setDeletingMessageIds((currentIds) => currentIds.filter((id) => id !== message.id));
    }
  };

  const handleLikeMessage = async (
    messageId: string,
    isLiked: boolean,
    conversationIdOverride?: string,
  ): Promise<boolean> => {
    try {
      if (isLiked) {
        await groupMeService.unlikeMessage(activeConversation, messageId, conversationIdOverride);
      } else {
        await groupMeService.likeMessage(activeConversation, messageId, conversationIdOverride);
      }
      await loadMessages();
      return true;
    } catch (error) {
      console.error('Failed to like/unlike message:', error);
      setComposerHint(getReactionUpdateErrorMessage(error));
      return false;
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!canManageMembers) {
      setComposerHint('Only the group owner can remove members.');
      return;
    }

    if (!member.id) {
      setComposerHint('This member cannot be removed because membership id is unavailable.');
      return;
    }

    if (member.user_id === groupDetails?.creator_user_id) {
      setComposerHint('Group owner cannot be removed.');
      return;
    }

    const confirmed = window.confirm(`Remove ${member.nickname} from this group?`);
    if (!confirmed) {
      return;
    }

    setRemovingMembershipId(member.id);
    try {
      await groupMeService.removeGroupMember(activeConversation.sourceId, member.id);
      setComposerHint(`${member.nickname} was removed from this group.`);

      const refreshedGroup = await groupMeService.getGroupById(activeConversation.sourceId);
      setGroupDetails(refreshedGroup);
      await loadMessages();
    } catch (error) {
      console.error('Failed to remove member:', error);
      setComposerHint('Unable to remove this member right now.');
    } finally {
      setRemovingMembershipId(null);
    }
  };

  const queueTemplateResponseForMessage = (
    message: Message,
    responseBody: string,
    successHint: string,
  ) => {
    const contextSnippet = getTemplateContextSnippet(message);
    const responseTemplate = `Re: ${message.name} - ${contextSnippet}\n${responseBody}`;
    appendTemplateToComposer(responseTemplate, successHint);
  };

  const queueEventRsvpResponse = (message: Message, rsvpState: 'Yes' | 'Maybe' | 'No') => {
    queueTemplateResponseForMessage(
      message,
      `RSVP: ${rsvpState}`,
      `RSVP (${rsvpState}) added to composer. Review and send when ready.`,
    );
  };

  const openPollVoteResponsePrompt = (message: Message) => {
    const voteChoiceInput = window.prompt('Poll vote (option number or label):', '1');
    if (voteChoiceInput === null) {
      return;
    }

    const voteChoice = voteChoiceInput.trim();
    if (!voteChoice) {
      setComposerHint('Poll vote choice is required.');
      return;
    }

    const voteNoteInput = window.prompt('Optional vote note:', '') ?? '';
    const voteResponseBody = voteNoteInput.trim()
      ? `Poll vote: ${voteChoice} (${voteNoteInput.trim()})`
      : `Poll vote: ${voteChoice}`;

    queueTemplateResponseForMessage(
      message,
      voteResponseBody,
      'Poll vote response added to composer. Review and send when ready.',
    );
  };

  const exportEventRsvpCsv = (eventMessage: Message) => {
    const eventSnippet = getTemplateContextSnippet(eventMessage).toLowerCase();
    const latestResponseBySenderId = new Map<
      string,
      { senderName: string; rsvpState: string; messageId: string; createdAt: number }
    >();

    for (const message of messages) {
      if (!message.text) {
        continue;
      }

      const lines = message.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        continue;
      }

      const firstLine = lines[0].toLowerCase();
      if (!firstLine.startsWith('re:') || !firstLine.includes(eventSnippet)) {
        continue;
      }

      const rsvpLine = lines.find((line) => /^rsvp\s*:/i.test(line));
      if (!rsvpLine) {
        continue;
      }

      const rsvpMatch = rsvpLine.match(/^rsvp\s*:\s*(yes|maybe|no)\b/i);
      if (!rsvpMatch) {
        continue;
      }

      const rsvpState = rsvpMatch[1].toLowerCase();
      const normalizedRsvpState =
        rsvpState === 'yes' ? 'Yes' : rsvpState === 'no' ? 'No' : 'Maybe';
      const dedupeKey = message.user_id || message.name;
      const existing = latestResponseBySenderId.get(dedupeKey);

      if (existing && existing.createdAt >= message.created_at) {
        continue;
      }

      latestResponseBySenderId.set(dedupeKey, {
        senderName: message.name,
        rsvpState: normalizedRsvpState,
        messageId: message.id,
        createdAt: message.created_at,
      });
    }

    const rsvpRows = Array.from(latestResponseBySenderId.values()).sort(
      (left, right) => right.createdAt - left.createdAt,
    );

    if (rsvpRows.length === 0) {
      setComposerHint('No RSVP responses found yet for this event.');
      return;
    }

    const csvLines = ['name,rsvp,message_id,created_at_unix'];
    for (const rsvpRow of rsvpRows) {
      const escapedName = rsvpRow.senderName.replace(/"/g, '""');
      csvLines.push(
        `"${escapedName}",${rsvpRow.rsvpState},${rsvpRow.messageId},${rsvpRow.createdAt}`,
      );
    }

    const csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = downloadUrl;
    downloadAnchor.download = `groupus-rsvp-export-${eventMessage.id}.csv`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(downloadUrl);

    setComposerHint(`RSVP export downloaded (${rsvpRows.length} responses).`);
  };

  const getEventTitleFromTemplateMessage = (eventMessage: Message) => {
    const firstLine = (eventMessage.text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!firstLine) {
      return `${activeConversation.name} event`;
    }

    const matchedTitle = firstLine.match(/^(?:📅\s*)?event:\s*(.+)$/i);
    if (!matchedTitle) {
      return `${activeConversation.name} event`;
    }

    const normalizedTitle = matchedTitle[1].trim();
    return normalizedTitle || `${activeConversation.name} event`;
  };

  const startEventAttachmentReply = (eventMessage: Message) => {
    beginReplyToMessage(eventMessage);
    setComposerHint('Event reply started. Add photos/videos/files/location and send.');
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const startEventAlbumWorkflow = (eventMessage: Message) => {
    const eventTitle = getEventTitleFromTemplateMessage(eventMessage);
    const requestedAlbumName = `${eventTitle} album`;
    const conversationId = activeConversation.id;
    const eventImageEntries = eventMessage.attachments
      .map((attachment) => {
        if (attachment.type.toLowerCase() !== 'image') {
          return null;
        }

        const imageUrl = normalizeImageUrl(attachment.url);
        if (!imageUrl) {
          return null;
        }

        return {
          id: `album-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          imageUrl,
          messageId: eventMessage.id,
          senderName: eventMessage.name,
          addedAt: Date.now(),
        } as AlbumImageEntry;
      })
      .filter((entry): entry is AlbumImageEntry => Boolean(entry));

    let usedExistingAlbum = false;

    setImageAlbumsByConversationId((currentAlbumsByConversationId) => {
      const currentAlbums = currentAlbumsByConversationId[conversationId] ?? [];
      const existingAlbumIndex = currentAlbums.findIndex(
        (album) => album.name.toLowerCase() === requestedAlbumName.toLowerCase(),
      );

      if (existingAlbumIndex === -1) {
        return {
          ...currentAlbumsByConversationId,
          [conversationId]: [
            {
              id: `album-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: requestedAlbumName,
              createdAt: Date.now(),
              images: eventImageEntries,
            },
            ...currentAlbums,
          ],
        };
      }

      usedExistingAlbum = true;
      const existingAlbum = currentAlbums[existingAlbumIndex];
      const mergedImages = [...existingAlbum.images];

      for (const eventImageEntry of eventImageEntries) {
        const duplicateExists = mergedImages.some(
          (existingImage) =>
            existingImage.imageUrl === eventImageEntry.imageUrl &&
            existingImage.messageId === eventImageEntry.messageId,
        );
        if (!duplicateExists) {
          mergedImages.unshift(eventImageEntry);
        }
      }

      const nextAlbums = [...currentAlbums];
      nextAlbums[existingAlbumIndex] = {
        ...existingAlbum,
        images: mergedImages,
      };

      return {
        ...currentAlbumsByConversationId,
        [conversationId]: nextAlbums,
      };
    });

    setShowAlbumsPanel(true);
    if (eventImageEntries.length > 0) {
      setComposerHint(
        `${usedExistingAlbum ? 'Updated' : 'Created'} event album with ${eventImageEntries.length} image${eventImageEntries.length === 1 ? '' : 's'}.`,
      );
      return;
    }

    setComposerHint(
      `${usedExistingAlbum ? 'Opened' : 'Created'} event album. Add photos from message image actions to build it out.`,
    );
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

    const jumpTargetMessage =
      messages.find((message) => message.id === messageId) ??
      fullHistoryMessagesRef.current?.find((message) => message.id === messageId) ??
      null;

    if (jumpTargetMessage && collapseSystemMessages && isSystemMessage(jumpTargetMessage)) {
      setCollapseSystemMessages(false);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
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

  const selectedReactionDetailsMessage = openReactionDetails
    ? messages.find((message) => message.id === openReactionDetails.messageId) ?? null
    : null;
  const selectedReactionDetailReactors = openReactionDetails
    ? [...openReactionDetails.reactors].sort((leftReactor, rightReactor) => {
        if (leftReactor.reactedAt === null && rightReactor.reactedAt !== null) {
          return 1;
        }

        if (leftReactor.reactedAt !== null && rightReactor.reactedAt === null) {
          return -1;
        }

        if (leftReactor.reactedAt !== null && rightReactor.reactedAt !== null) {
          return rightReactor.reactedAt - leftReactor.reactedAt;
        }

        return leftReactor.name.localeCompare(rightReactor.name);
      })
    : [];

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

        {isTopicConversation && (
          <div className="mt-3 rounded-xl border border-blue-200/80 dark:border-blue-700/60 bg-blue-50/70 dark:bg-blue-950/25 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mr-1">Topic tools</p>
              <button
                type="button"
                onClick={onToggleConversationMute}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-blue-200 dark:border-blue-700 bg-white/90 dark:bg-gray-900/70 text-blue-800 dark:text-blue-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/45"
                title={isConversationMuted ? 'Unmute this topic' : 'Mute this topic'}
              >
                {isConversationMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {isConversationMuted ? 'Unmute topic' : 'Mute topic'}
              </button>
              <button
                type="button"
                onClick={() => setShowPinnedPanel(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-blue-200 dark:border-blue-700 bg-white/90 dark:bg-gray-900/70 text-blue-800 dark:text-blue-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/45"
                title="Open pinned messages for this topic"
              >
                <Pin className="w-3.5 h-3.5" />
                Topic pins
              </button>
              <button
                type="button"
                onClick={openPollComposerTemplate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-blue-200 dark:border-blue-700 bg-white/90 dark:bg-gray-900/70 text-blue-800 dark:text-blue-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/45"
                title="Create a poll for this topic"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Topic poll
              </button>
              <button
                type="button"
                onClick={openEventComposerTemplate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-blue-200 dark:border-blue-700 bg-white/90 dark:bg-gray-900/70 text-blue-800 dark:text-blue-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/45"
                title="Create an event for this topic"
              >
                <Calendar className="w-3.5 h-3.5" />
                Topic event
              </button>
            </div>
            <p className="mt-2 text-[11px] text-blue-800/85 dark:text-blue-200/85">
              Topic tools are scoped to this channel so pinned history, polls, and events stay linked to the active topic.
            </p>
          </div>
        )}

        {showInfoCard && (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/80 p-3 text-sm text-gray-700 dark:text-gray-200">
            <p><span className="font-semibold">Conversation:</span> {activeConversation.name}</p>
            <p><span className="font-semibold">Type:</span> {activeConversation.type === 'chat' ? 'Direct chat' : activeConversation.type}</p>
            <p><span className="font-semibold">Members:</span> {groupMembers.length || activeConversation.members_count}</p>
            <p><span className="font-semibold">Last updated:</span> {formatHeaderTime(activeConversation.updated_at)}</p>
            {groupDetails?.description && <p><span className="font-semibold">Description:</span> {groupDetails.description}</p>}
            {groupDetails?.share_url && (
              <div className="space-y-1.5">
                <p className="truncate">
                  <span className="font-semibold">Share URL:</span> {groupDetails.share_url}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void copyGroupShareLink(groupDetails.share_url as string);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Link2 className="w-3 h-3" />
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => openGroupShareLink(groupDetails.share_url as string)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Link2 className="w-3 h-3" />
                    Open link
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShareQrModal(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <QrCode className="w-3 h-3" />
                    Show QR
                  </button>
                </div>
              </div>
            )}
            {isGroupConversation && groupDetails && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Group Governance</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Your role: {isGroupOwner ? 'Owner' : 'Member'}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Who can join: {groupDetails.share_url ? 'Anyone with the share link' : 'Invite only'}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Visibility: {groupDetails.type ? `${groupDetails.type}` : 'Unknown'}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Owner-only member controls are available in the Members panel.
                </p>
                {!isGroupOwner && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Topic create/edit/delete controls are available to group owner/admin roles.
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Notification preview for this conversation
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Override the global preview privacy setting just for this chat.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetNotificationPreviewMode('default')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                    notificationPreviewMode === 'default'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Use global
                </button>
                <button
                  type="button"
                  onClick={() => onSetNotificationPreviewMode('on')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                    notificationPreviewMode === 'on'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Always show
                </button>
                <button
                  type="button"
                  onClick={() => onSetNotificationPreviewMode('off')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                    notificationPreviewMode === 'off'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Always hide
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Conversation notifications
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {isConversationMuted
                  ? 'Notifications are muted for this conversation.'
                  : 'Notifications are enabled for this conversation.'}
              </p>
              <button
                type="button"
                onClick={onToggleConversationMute}
                className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border ${
                  isConversationMuted
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {isConversationMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {isConversationMuted ? 'Unmute conversation' : 'Mute conversation'}
              </button>
            </div>

            {activeConversation.type === 'chat' && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Direct message safety
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {directBlockLoading
                    ? 'Checking block status...'
                    : isDirectContactBlocked === true
                      ? 'This contact is blocked from sending DMs.'
                      : 'This contact can send direct messages.'}
                </p>
                {directBlockError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-300 mt-1">{directBlockError}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void toggleDirectContactBlock();
                  }}
                  disabled={directBlockLoading || isDirectContactBlocked === null}
                  className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDirectContactBlocked
                      ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200 border-rose-300 dark:border-rose-700 hover:bg-rose-200 dark:hover:bg-rose-900/60'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {directBlockLoading
                    ? 'Updating...'
                    : isDirectContactBlocked
                      ? 'Unblock contact'
                      : 'Block contact'}
                </button>
              </div>
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

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-300">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-300">No messages yet</p>
          </div>
        ) : (
          <>
            {loadingOlderMessages && (
              <div className="text-center text-xs text-gray-500 dark:text-gray-400">Loading older messages...</div>
            )}

            {!loadingOlderMessages && !hasMoreOlderMessages && (
              <div className="text-center text-xs text-gray-400 dark:text-gray-500">Start of conversation</div>
            )}

            {systemMessageCount > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-200 flex items-center justify-between gap-2">
                <span>
                  {collapseSystemMessages
                    ? `${hiddenSystemMessageCount} system notice${hiddenSystemMessageCount === 1 ? '' : 's'} hidden`
                    : `Showing ${systemMessageCount} system notice${systemMessageCount === 1 ? '' : 's'}`}
                </span>
                <button
                  type="button"
                  onClick={() => setCollapseSystemMessages((currentValue) => !currentValue)}
                  className="px-2 py-1 rounded-md border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  {collapseSystemMessages ? 'Show notices' : 'Hide notices'}
                </button>
              </div>
            )}

            {visibleMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-300">Only system notices are in this chat right now.</p>
              </div>
            ) : (
              visibleMessages.map((message) => {
            const isDiscreetModerationRemoval = isDiscreetModerationRemovalMessage(message);

            if (isDiscreetModerationRemoval) {
              return (
                <div
                  key={message.id}
                  ref={(node) => {
                    messageRefs.current[message.id] = node;
                  }}
                  className={`flex justify-center ${
                    highlightedMessageId === message.id
                      ? 'bg-blue-50 dark:bg-blue-950/35 rounded-xl px-2 py-1'
                      : ''
                  }`}
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-gray-300/80 dark:border-gray-700 bg-gray-100/85 dark:bg-gray-800/85 px-3 py-1.5">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Message removed by moderation
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                </div>
              );
            }

            const isCurrentUser = message.user_id === currentUserId;
            const isDeletingMessage = deletingMessageIds.includes(message.id);
            const isEditingMessage = editingMessageId === message.id;
            const remoteEmojiReactions = parseRemoteEmojiReactionMap(message);
            const messageReactionChips = buildMessageReactionChips(
              message.favorited_by,
              currentUserId,
              remoteEmojiReactions,
              canLikeMessages,
              userDisplayNameById,
            );
            const messageLinks = messageLinksById.get(message.id) ?? [];
            const isEventTemplate = isEventTemplateMessage(message.text);
            const isPollTemplate = isPollTemplateMessage(message.text);
            const eventRsvpSummary = eventRsvpSummaryByTemplateMessageId[message.id];
            const pollVoteSummary = pollVoteSummaryByTemplateMessageId[message.id];
            const quickResponseButtonClass = isCurrentUser
              ? 'px-2 py-1 rounded-md text-[11px] border bg-blue-600/45 border-blue-300/45 text-blue-50 hover:bg-blue-600/55'
              : 'px-2 py-1 rounded-md text-[11px] border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800';
            const shouldShowOutgoingReadReceipt =
              activeConversation.type === 'chat' &&
              isCurrentUser &&
              latestOutgoingChatMessageId === message.id;
            const outgoingReadReceiptCovered =
              shouldShowOutgoingReadReceipt &&
              readReceiptIncludesMessage(message, activeChatReadReceipt, messagesById);
            const outgoingReadReceiptLabel = shouldShowOutgoingReadReceipt
              ? outgoingReadReceiptCovered
                ? activeChatReadReceipt?.readAt
                  ? `Read ${formatTime(activeChatReadReceipt.readAt)}`
                  : 'Read'
                : 'Sent'
              : null;

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
                    {(() => {
                      const replyAttachment = message.attachments.find(
                        (a) => a.type === 'reply' && a.reply_id,
                      );

                      if (replyAttachment) {
                        const replySourceId = replyAttachment.reply_id!;
                        const sourceMessage =
                          messages.find((m) => m.id === replySourceId) ??
                          fullHistoryMessagesRef.current?.find((m) => m.id === replySourceId) ??
                          null;
                        const previewText = sourceMessage
                          ? getReplyPreviewForMessage(sourceMessage)
                          : 'Original message';
                        const fullSourceText = sourceMessage
                          ? (sourceMessage.text ?? '').replace(/\s+/g, ' ').trim()
                          : null;
                        const hasExpandableContent = fullSourceText
                          ? fullSourceText.length > REPLY_QUOTE_COLLAPSED_LENGTH
                          : false;

                        return (
                          <>
                            <ReplyQuoteBlock
                              senderName={sourceMessage?.name ?? 'Unknown'}
                              previewText={previewText}
                              fullText={fullSourceText}
                              hasExpandableContent={hasExpandableContent}
                              isCurrentUser={isCurrentUser}
                              onClickScroll={() => handleJumpToMessage(replySourceId)}
                              remainingText=""
                            />
                            {message.text ? (
                              <div className="text-sm break-words">
                                {renderMessageMarkdown(message.text, isCurrentUser)}
                              </div>
                            ) : null}
                          </>
                        );
                      }

                      if (!message.text) {
                        return null;
                      }

                      const parsedReply = parseReplyPrefix(message.text);
                      if (!parsedReply) {
                        return (
                          <div className="text-sm break-words">
                            {renderMessageMarkdown(message.text, isCurrentUser)}
                          </div>
                        );
                      }

                      const sourceMessage = findReplySourceMessage(
                        messages,
                        fullHistoryMessagesRef.current,
                        parsedReply.senderName,
                        parsedReply.previewText,
                      );
                      const isLongPreview = parsedReply.previewText.length > REPLY_QUOTE_COLLAPSED_LENGTH;
                      const fullSourceText = sourceMessage
                        ? (sourceMessage.text ?? '').replace(/\s+/g, ' ').trim()
                        : null;
                      const hasExpandableContent = fullSourceText
                        ? fullSourceText.length > REPLY_QUOTE_COLLAPSED_LENGTH
                        : isLongPreview;

                      return (
                        <ReplyQuoteBlock
                          senderName={parsedReply.senderName}
                          previewText={parsedReply.previewText}
                          fullText={fullSourceText}
                          hasExpandableContent={hasExpandableContent}
                          isCurrentUser={isCurrentUser}
                          onClickScroll={sourceMessage ? () => handleJumpToMessage(sourceMessage.id) : undefined}
                          remainingText={parsedReply.remainingText}
                        />
                      );
                    })()}
                    {(isEventTemplate || isPollTemplate) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {isEventTemplate && (
                          <>
                            <button
                              type="button"
                              onClick={() => queueEventRsvpResponse(message, 'Yes')}
                              className={quickResponseButtonClass}
                              title="Respond with RSVP Yes"
                            >
                              RSVP Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => queueEventRsvpResponse(message, 'Maybe')}
                              className={quickResponseButtonClass}
                              title="Respond with RSVP Maybe"
                            >
                              RSVP Maybe
                            </button>
                            <button
                              type="button"
                              onClick={() => queueEventRsvpResponse(message, 'No')}
                              className={quickResponseButtonClass}
                              title="Respond with RSVP No"
                            >
                              RSVP No
                            </button>
                            <button
                              type="button"
                              onClick={() => exportEventRsvpCsv(message)}
                              className={quickResponseButtonClass}
                              title="Export RSVP responses"
                            >
                              Export RSVP
                            </button>
                            <button
                              type="button"
                              onClick={() => startEventAttachmentReply(message)}
                              className={quickResponseButtonClass}
                              title="Reply with event attachments"
                            >
                              Attach update
                            </button>
                            <button
                              type="button"
                              onClick={() => startEventAlbumWorkflow(message)}
                              className={quickResponseButtonClass}
                              title="Create or open event album"
                            >
                              Event album
                            </button>
                          </>
                        )}
                        {isPollTemplate && (
                          <button
                            type="button"
                            onClick={() => openPollVoteResponsePrompt(message)}
                            className={quickResponseButtonClass}
                            title="Create poll vote response"
                          >
                            Vote
                          </button>
                        )}
                      </div>
                    )}
                    {isEventTemplate && eventRsvpSummary && (
                      <p
                        className={`mt-1 text-[11px] ${
                          isCurrentUser ? 'text-blue-100/90' : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        RSVP: Yes {eventRsvpSummary.yes} • Maybe {eventRsvpSummary.maybe} • No {eventRsvpSummary.no}
                      </p>
                    )}
                    {isPollTemplate && pollVoteSummary && pollVoteSummary.totalVotes > 0 && (
                      <p
                        className={`mt-1 text-[11px] ${
                          isCurrentUser ? 'text-blue-100/90' : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        Votes ({pollVoteSummary.totalVotes}): {
                          Object.entries(pollVoteSummary.voteCounts)
                            .sort((leftEntry, rightEntry) => rightEntry[1] - leftEntry[1])
                            .slice(0, 3)
                            .map(([voteChoice, voteCount]) => `${voteChoice} ${voteCount}`)
                            .join(' • ')
                        }
                      </p>
                    )}
                    {messageLinks.map((messageLink) => {
                      const previewState = linkPreviewCache[messageLink];
                      const previewTitle = previewState?.metadata?.title ?? getFallbackTitle(messageLink);
                      const previewDescription =
                        previewState?.metadata?.description ?? getFallbackDescription(messageLink);
                      const previewSiteName =
                        previewState?.metadata?.siteName ?? getFallbackSiteName(messageLink);
                      const previewImageUrl = normalizeImageUrl(previewState?.metadata?.imageUrl);

                      return (
                        <a
                          key={`${message.id}-${messageLink}`}
                          href={messageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`mt-2 block rounded-xl border overflow-hidden transition-colors ${
                            isCurrentUser
                              ? 'bg-blue-400/35 border-blue-300/70 hover:bg-blue-400/50'
                              : 'bg-white/75 dark:bg-gray-900/70 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-900'
                          }`}
                        >
                          {previewImageUrl && (
                            <img
                              src={previewImageUrl}
                              alt={previewTitle}
                              className="w-full max-h-40 object-cover border-b border-black/10 dark:border-white/10"
                            />
                          )}
                          <div className="px-3 py-2">
                            <p
                              className={`text-[10px] uppercase tracking-wide font-semibold ${
                                isCurrentUser ? 'text-blue-100/90' : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {previewSiteName}
                            </p>
                            <p
                              className={`text-sm font-semibold leading-snug ${
                                isCurrentUser ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {previewTitle}
                            </p>
                            {previewDescription && (
                              <p
                                className={`mt-1 text-xs leading-snug ${
                                  isCurrentUser ? 'text-blue-50/90' : 'text-gray-600 dark:text-gray-300'
                                }`}
                              >
                                {previewDescription}
                              </p>
                            )}
                            {previewState?.status === 'loading' && (
                              <p
                                className={`mt-1 text-[11px] ${
                                  isCurrentUser ? 'text-blue-100/80' : 'text-gray-500 dark:text-gray-400'
                                }`}
                              >
                                Loading preview...
                              </p>
                            )}
                            <p
                              className={`mt-1 text-[11px] truncate ${
                                isCurrentUser ? 'text-blue-100' : 'text-blue-600 dark:text-blue-300'
                              }`}
                            >
                              {getReadableUrl(messageLink)}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                    {message.attachments.map((attachment, idx) => {
                      const attachmentType = attachment.type.toLowerCase();
                      const imageUrl = attachmentType === 'image' ? normalizeImageUrl(attachment.url) : null;
                      const isVideoAttachment = attachmentType.includes('video');
                      const videoAttachmentUrl = isVideoAttachment
                        ? normalizeMessageUrl(attachment.url ?? '') ?? attachment.url ?? null
                        : null;
                      const isAudioAttachment =
                        attachmentType.includes('audio') || attachmentType.includes('voice');
                      const audioAttachmentUrl = isAudioAttachment
                        ? normalizeMessageUrl(attachment.url ?? '') ?? attachment.url ?? null
                        : null;
                      const isFileAttachment =
                        attachmentType.includes('file') ||
                        attachmentType.includes('document') ||
                        attachmentType.includes('pdf');
                      const fileAttachmentUrl = isFileAttachment
                        ? normalizeMessageUrl(attachment.url ?? '') ?? attachment.url ?? null
                        : null;
                      const fileAttachmentName = attachment.name?.trim() ||
                        (fileAttachmentUrl ? getDownloadFilenameFromUrl(fileAttachmentUrl) : 'File attachment');
                      const mediaActionKey = `${message.id}-${idx}`;
                      const mediaUrlForActions = imageUrl ?? videoAttachmentUrl;
                      const mediaTypeForActions: 'image' | 'video' | null = imageUrl
                        ? 'image'
                        : videoAttachmentUrl
                          ? 'video'
                          : null;

                      return (
                        <div key={idx} className="mt-2">
                          {mediaTypeForActions && mediaUrlForActions && (
                            <div className="space-y-1.5">
                              {mediaTypeForActions === 'image' ? (
                                <img
                                  src={mediaUrlForActions}
                                  alt="Attachment"
                                  className="max-w-full rounded-lg"
                                />
                              ) : (
                                <video
                                  controls
                                  preload="metadata"
                                  src={mediaUrlForActions}
                                  className="max-w-full rounded-lg"
                                />
                              )}
                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  data-image-actions-trigger
                                  onClick={() => {
                                    setOpenImageActionKey((currentKey) =>
                                      currentKey === mediaActionKey ? null : mediaActionKey,
                                    );
                                  }}
                                  className={`px-2 py-1 rounded-md text-[11px] border ${
                                    isCurrentUser
                                      ? 'bg-blue-600/40 border-blue-300/40 text-blue-50 hover:bg-blue-600/50'
                                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                  }`}
                                  title="Media actions"
                                >
                                  {mediaTypeForActions === 'video' ? 'Video actions' : 'Image actions'}
                                </button>
                                {openImageActionKey === mediaActionKey && (
                                  <div
                                    data-image-actions-menu
                                    className="absolute left-0 mt-1 z-20 min-w-36 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-1"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleJumpToMessage(message.id);
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Show in chat
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        beginReplyToMessage(message);
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Reply
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openForwardMessageModal(message);
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Forward
                                    </button>
                                    {isCurrentUser && (
                                      <button
                                        type="button"
                                        disabled={isDeletingMessage}
                                        onClick={() => {
                                          void handleDeleteMessage(message);
                                          setOpenImageActionKey(null);
                                        }}
                                        className="w-full text-left px-2 py-1 rounded text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isDeletingMessage ? 'Deleting...' : 'Delete'}
                                      </button>
                                    )}
                                    {mediaTypeForActions === 'image' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          addImageToAlbum(mediaUrlForActions, message.id, message.name);
                                          setOpenImageActionKey(null);
                                        }}
                                        className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                      >
                                        Create album
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openMediaForMeme(mediaUrlForActions, mediaTypeForActions, message.name);
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Meme
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openMediaExternally(
                                          mediaUrlForActions,
                                          mediaTypeForActions === 'video' ? 'Video' : 'Image',
                                        );
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Open external
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (mediaTypeForActions === 'image') {
                                          void downloadImage(mediaUrlForActions);
                                        } else {
                                          void downloadMedia(
                                            mediaUrlForActions,
                                            getDownloadFilenameFromUrl(mediaUrlForActions),
                                          );
                                        }
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Download
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void shareMediaUrl(mediaUrlForActions);
                                        setOpenImageActionKey(null);
                                      }}
                                      className="w-full text-left px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Share
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {isAudioAttachment && audioAttachmentUrl && (
                            <div
                              className={`rounded-lg px-3 py-2 border space-y-2 max-w-full ${
                                isCurrentUser
                                  ? 'bg-blue-600/40 border-blue-300/40 text-blue-50'
                                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
                              }`}
                            >
                              <audio controls preload="metadata" src={audioAttachmentUrl} className="w-full h-8" />
                              <div className="flex items-center gap-2 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => openMediaExternally(audioAttachmentUrl, 'Audio')}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Open external
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void downloadMedia(
                                      audioAttachmentUrl,
                                      getDownloadFilenameFromUrl(audioAttachmentUrl),
                                    );
                                  }}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void shareMediaUrl(audioAttachmentUrl);
                                  }}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Share
                                </button>
                              </div>
                            </div>
                          )}
                          {isFileAttachment && fileAttachmentUrl && (
                            <div
                              className={`rounded-lg px-3 py-2 border space-y-2 max-w-full ${
                                isCurrentUser
                                  ? 'bg-blue-600/40 border-blue-300/40 text-blue-50'
                                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
                              }`}
                            >
                              <a
                                href={fileAttachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 border text-sm max-w-full ${
                                  isCurrentUser
                                    ? 'bg-blue-600/40 border-blue-300/40 text-blue-50 hover:bg-blue-600/50'
                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <FileText className="w-4 h-4 shrink-0" />
                                <span className="truncate" title={fileAttachmentName}>{fileAttachmentName}</span>
                              </a>
                              <div className="flex items-center gap-2 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => openMediaExternally(fileAttachmentUrl, 'File')}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Open external
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void downloadMedia(fileAttachmentUrl, fileAttachmentName);
                                  }}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void shareMediaUrl(fileAttachmentUrl);
                                  }}
                                  className="px-2 py-1 rounded-md border border-current/30 hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  Share
                                </button>
                              </div>
                            </div>
                          )}
                          {attachment.type === 'location' && attachment.lat && attachment.lng && (
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${attachment.lat}&mlon=${attachment.lng}#map=15/${attachment.lat}/${attachment.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 border text-sm ${
                                isCurrentUser
                                  ? 'bg-blue-600/40 border-blue-300/40 text-blue-50 hover:bg-blue-600/50'
                                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              <MapPin className="w-4 h-4" />
                              <span>
                                {attachment.name || 'Location'}: {attachment.lat}, {attachment.lng}
                              </span>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {messageReactionChips.length > 0 && (
                    <div
                      className={`mt-1 flex flex-wrap items-center gap-1 ${
                        isCurrentUser ? 'justify-end' : ''
                      }`}
                    >
                      {messageReactionChips.map((reactionChip) => (
                        <button
                          key={`${message.id}-${reactionChip.source}-${reactionChip.emoji}`}
                          type="button"
                          onClick={() => {
                            setOpenReactionDetails({
                              messageId: message.id,
                              emoji: reactionChip.emoji,
                              reactors: reactionChip.reactors,
                              isActive: reactionChip.isActive,
                            });
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                            reactionChip.isActive
                              ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/35 text-blue-700 dark:text-blue-200'
                              : 'border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                          title={`View ${reactionChip.emoji} reactions`}
                        >
                          <span>{reactionChip.emoji}</span>
                          {reactionChip.count > 1 && <span>{reactionChip.count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className={`flex items-center space-x-2 mt-1 text-xs text-gray-500 ${
                      isCurrentUser ? 'justify-end' : ''
                    }`}
                  >
                    <span>{formatTime(message.created_at)}</span>
                    {outgoingReadReceiptLabel && (
                      <span
                        className={
                          outgoingReadReceiptLabel.startsWith('Read')
                            ? 'text-emerald-600 dark:text-emerald-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }
                      >
                        {outgoingReadReceiptLabel}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => beginReplyToMessage(message)}
                      className="hover:text-blue-600 dark:hover:text-blue-300"
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => openForwardMessageModal(message)}
                      className="hover:text-blue-600 dark:hover:text-blue-300"
                    >
                      Forward
                    </button>
                    {isCurrentUser && (
                      <button
                        type="button"
                        disabled={isEditingMessage || isDeletingMessage}
                        onClick={() => {
                          void handleEditMessage(message);
                        }}
                        className="hover:text-blue-600 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isEditingMessage ? 'Editing...' : 'Edit'}
                      </button>
                    )}
                    {isCurrentUser && (
                      <button
                        type="button"
                        disabled={isDeletingMessage || isEditingMessage}
                        onClick={() => {
                          void handleDeleteMessage(message);
                        }}
                        className="hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeletingMessage ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                    <div className="relative inline-block">
                      <button
                        type="button"
                        data-reaction-picker-trigger
                        onClick={() => {
                          setOpenReactionPickerMessageId((currentMessageId) =>
                            currentMessageId === message.id ? null : message.id,
                          );
                        }}
                        className="hover:text-blue-600 dark:hover:text-blue-300"
                      >
                        React
                      </button>
                      {openReactionPickerMessageId === message.id && (
                        <div
                          data-reaction-picker-menu
                          className="absolute left-0 bottom-full mb-1 z-20 min-w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-1.5"
                        >
                          <div className="flex flex-wrap gap-1">
                            {quickReactionEmojis.map((reactionEmoji) => (
                              <button
                                key={`${message.id}-picker-${reactionEmoji}`}
                                type="button"
                                onClick={() => {
                                  void toggleMessageReaction(message, reactionEmoji);
                                  setOpenReactionPickerMessageId(null);
                                }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                                title={`Add ${reactionEmoji} reaction`}
                              >
                                {reactionEmoji}
                              </button>
                            ))}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowFullReactionEmojiPicker((currentValue) => !currentValue)}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              {showFullReactionEmojiPicker ? 'Hide full picker' : 'More emojis'}
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <input
                              ref={reactionCustomEmojiInputRef}
                              type="text"
                              value={reactionCustomEmojiInput}
                              onChange={(event) => setReactionCustomEmojiInput(event.target.value)}
                              placeholder="🙂"
                              className="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-800 dark:text-gray-100"
                            />
                            <button
                              type="button"
                              onClick={() => useCustomMessageReaction(message)}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Add
                            </button>
                          </div>
                          {showFullReactionEmojiPicker && (
                            <div className="mt-1.5 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                              <EmojiPicker
                                onEmojiClick={(emojiData) => {
                                  void toggleMessageReaction(message, emojiData.emoji);
                                  setShowFullReactionEmojiPicker(false);
                                  setOpenReactionPickerMessageId(null);
                                }}
                                lazyLoadEmojis
                                searchPlaceHolder="Search emojis"
                                theme={Theme.AUTO}
                                height={320}
                                width={320}
                                previewConfig={{ showPreview: false }}
                                skinTonesDisabled
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
              })
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollToBottom && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-800/80 dark:bg-gray-200/80 text-white dark:text-gray-900 shadow-lg backdrop-blur-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-all cursor-pointer"
            title="Jump to latest"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Jump to latest
          </button>
        </div>
      )}

      <div
        className={`p-4 backdrop-blur-3xl border-t transition-colors ${
          isComposerDropTarget
            ? 'bg-blue-50/80 dark:bg-blue-950/35 border-blue-300/70 dark:border-blue-700/60'
            : 'bg-white/40 dark:bg-gray-900/70 border-gray-200/50 dark:border-gray-700/60'
        }`}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <div className="space-y-2">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              addDraftAttachments(event.target.files, 'photo');
              event.currentTarget.value = '';
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              addDraftAttachments(event.target.files, 'video');
              event.currentTarget.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.doc,.docx,.json,.log,.md,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx,.xml,.zip"
            multiple
            className="hidden"
            onChange={(event) => {
              addDraftAttachments(event.target.files, 'file');
              event.currentTarget.value = '';
            }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={openPhotoPicker}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Add photo from library"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Photo
            </button>
            <button
              type="button"
              onClick={openPhotoCameraPicker}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Take photo"
            >
              <Camera className="w-3.5 h-3.5" />
              Camera
            </button>
            {!strictPublicDocModeEnabled && (
              <button
                type="button"
                onClick={openFilePicker}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
                title="Add file"
              >
                <FileText className="w-3.5 h-3.5" />
                File
              </button>
            )}
            {!strictPublicDocModeEnabled && (
              <button
                type="button"
                onClick={openVideoPicker}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
                title="Add video from library"
              >
                <Video className="w-3.5 h-3.5" />
                Video
              </button>
            )}
            {!strictPublicDocModeEnabled && (
              <button
                type="button"
                onClick={openVideoCameraPicker}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
                title="Record video"
              >
                <Video className="w-3.5 h-3.5" />
                Record
              </button>
            )}
            <button
              type="button"
              onClick={queueGifLinkAttachment}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Search media"
            >
              <Search className="w-3.5 h-3.5" />
              Media
            </button>
            <button
              type="button"
              onClick={requestCurrentLocationAttachment}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Share location"
            >
              <MapPin className="w-3.5 h-3.5" />
              Location
            </button>
            <button
              type="button"
              onClick={openLocationSearch}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Search a place"
            >
              <MapPin className="w-3.5 h-3.5" />
              Place
            </button>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((currentValue) => !currentValue)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700"
              title="Open emoji picker"
            >
              <Smile className="w-3.5 h-3.5" />
              Emoji
            </button>
            {!strictPublicDocModeEnabled && (
              <button
                type="button"
                onClick={toggleAudioRecording}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                  isRecordingAudio
                    ? 'border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/45 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white/85 dark:bg-gray-800/85 hover:bg-white dark:hover:bg-gray-700'
                }`}
                title={isRecordingAudio ? 'Stop recording audio' : 'Record audio'}
              >
                <Mic className="w-3.5 h-3.5" />
                {isRecordingAudio ? 'Stop' : 'Audio'}
              </button>
            )}
          </div>

          {isComposerDropTarget && (
            <div className="rounded-lg border border-dashed border-blue-400/80 dark:border-blue-600/80 bg-blue-100/70 dark:bg-blue-900/40 px-2.5 py-2 text-[11px] text-blue-700 dark:text-blue-200">
              Drop photos or files here to attach them to this message.
            </div>
          )}

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {strictPublicDocModeEnabled
              ? `Photos up to ${formatBytesAsMegabytes(
                  MAX_PHOTO_DRAFT_SIZE_BYTES,
                )} are supported in this build, plus location/split/emoji attachments.`
              : `Photos: image files up to ${formatBytesAsMegabytes(
                  MAX_PHOTO_DRAFT_SIZE_BYTES,
                )}. Videos: video files up to ${formatBytesAsMegabytes(
                  MAX_VIDEO_DRAFT_SIZE_BYTES,
                )}. Files: common document types up to ${formatBytesAsMegabytes(
                  MAX_FILE_DRAFT_SIZE_BYTES,
                )}. Max ${MAX_COMPOSER_DRAFT_ATTACHMENTS} attachments. Drag and drop files here, or paste images/files from your clipboard. Use Location for current position or Place to search any destination.`}
          </p>

          {showEmojiPicker && (
            <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/85 p-2">
              <div className="flex flex-wrap items-center gap-1">
                {quickComposerEmojis.map((emojiOption) => (
                  <button
                    key={emojiOption}
                    type="button"
                    onClick={() => appendEmojiToMessage(emojiOption)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    title={`Add ${emojiOption}`}
                  >
                    {emojiOption}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowFullComposerEmojiPicker((currentValue) => !currentValue)}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {showFullComposerEmojiPicker ? 'Hide full picker' : 'Full picker'}
                </button>
              </div>
              {showFullComposerEmojiPicker && (
                <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                  <EmojiPicker
                    onEmojiClick={handleComposerEmojiClick}
                    lazyLoadEmojis
                    searchPlaceHolder="Search emojis"
                    theme={Theme.AUTO}
                    height={340}
                    width="100%"
                    previewConfig={{ showPreview: false }}
                    skinTonesDisabled
                  />
                </div>
              )}
            </div>
          )}

          {composerDraftAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {composerDraftAttachments.map((draftAttachment, draftIndex) => {
                const sizeLabel = draftAttachment.size > 0
                  ? `${Math.max(1, Math.round(draftAttachment.size / 1024))} KB`
                  : 'Pending';
                const uploadState =
                  draftAttachment.kind === 'photo'
                    ? photoDraftUploadStateById[draftAttachment.id]
                    : fileDraftUploadStateById[draftAttachment.id];
                const isUploading = uploadState?.status === 'uploading';
                const isFailed = uploadState?.status === 'failed';
                const isUploaded = uploadState?.status === 'uploaded';
                const uploadLabel = isUploading
                  ? `${Math.max(0, Math.min(100, uploadState?.progress ?? 0))}%`
                  : isFailed
                    ? 'Failed'
                    : isUploaded
                      ? 'Uploaded'
                      : sizeLabel;
                const canMoveLeft = draftIndex > 0;
                const canMoveRight = draftIndex < composerDraftAttachments.length - 1;
                const controlsDisabled = sending || isUploading;

                return (
                  <div
                    key={draftAttachment.id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 border text-[11px] ${
                      isFailed
                        ? 'bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200'
                        : isUploading
                          ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-200'
                          : isUploaded
                            ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200'
                            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200'
                    }`}
                    title={isFailed ? uploadState?.error ?? 'Upload failed' : undefined}
                  >
                    <span className="font-medium">{draftAttachment.name}</span>
                    <span className="opacity-80">({uploadLabel})</span>
                    {isFailed && (
                      <button
                        type="button"
                        disabled={sending || hasUploadingDraftAttachment}
                        onClick={() => {
                          void retryDraftUpload(draftAttachment);
                        }}
                        className="rounded-full px-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Retry upload"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canMoveLeft || controlsDisabled}
                      onClick={() => reorderDraftAttachment(draftAttachment.id, 'left')}
                      className="rounded-full px-1 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Move attachment left"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveRight || controlsDisabled}
                      onClick={() => reorderDraftAttachment(draftAttachment.id, 'right')}
                      className="rounded-full px-1 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Move attachment right"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => removeDraftAttachment(draftAttachment.id)}
                      className="rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Remove draft attachment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {pendingGifUrl && (
            <div className="flex flex-wrap gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-200">
                <Search className="w-3 h-3" />
                <span className="font-medium">Media link</span>
                <span className="opacity-80 truncate max-w-[220px]">{getReadableUrl(pendingGifUrl)}</span>
                <button
                  type="button"
                  onClick={() => setPendingGifUrl(null)}
                  className="rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/60"
                  title="Remove media link"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {pendingLocationAttachment && (
            <div className="flex flex-wrap gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-700 dark:text-emerald-200">
                <MapPin className="w-3 h-3" />
                <span className="font-medium">{pendingLocationAttachment.name}</span>
                <span className="opacity-80">({pendingLocationAttachment.lat}, {pendingLocationAttachment.lng})</span>
                <button
                  type="button"
                  onClick={() => setPendingLocationAttachment(null)}
                  className="rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                  title="Remove location attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {pendingAudioDraft && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                  Audio draft ({formatAudioDraftDuration(pendingAudioDraft.durationMs)})
                </span>
                <button
                  type="button"
                  onClick={clearPendingAudioDraft}
                  className="rounded-full p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                  title="Remove audio draft"
                >
                  <X className="w-3 h-3 text-rose-700 dark:text-rose-200" />
                </button>
              </div>
              <audio
                controls
                preload="metadata"
                src={pendingAudioDraft.objectUrl}
                className="w-full h-8"
              />
              <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-200/90">
                Audio will upload and send with your next message.
              </p>
            </div>
          )}

          {replyTargetMessage && (
            <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-200">
                    Replying to {replyTargetMessage.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-sky-700/90 dark:text-sky-200/90 truncate">
                    {getReplyPreviewForMessage(replyTargetMessage)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTargetMessage(null)}
                  className="rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/60"
                  title="Cancel reply"
                >
                  <X className="w-3 h-3 text-sky-700 dark:text-sky-200" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Formatting</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                isMarkdownComposerEnabled
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/35 text-blue-700 dark:text-blue-200'
                  : 'border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300'
              }`}
            >
              {isMarkdownComposerEnabled ? 'Markdown mode' : 'Plain mode'}
            </span>
            <button
              type="button"
              onClick={() => applyComposerInlineMarkdown('**', '**', 'bold text')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              title="Bold"
            >
              <Bold className="w-3 h-3" />
              Bold
            </button>
            <button
              type="button"
              onClick={() => applyComposerInlineMarkdown('*', '*', 'italic text')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              title="Italic"
            >
              <Italic className="w-3 h-3" />
              Italic
            </button>
            <button
              type="button"
              onClick={() => applyComposerInlineMarkdown('<u>', '</u>', 'underlined text')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              title="Underline"
            >
              <Underline className="w-3 h-3" />
              Underline
            </button>
            <button
              type="button"
              onClick={() => applyComposerInlineMarkdown('~~', '~~', 'strikethrough text')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              title="Strikethrough"
            >
              <Strikethrough className="w-3 h-3" />
              Strike
            </button>
            <button
              type="button"
              onClick={() => applyComposerInlineMarkdown('`', '`', 'inline code')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              title="Inline code"
            >
              <Code2 className="w-3 h-3" />
              Code
            </button>
            {isMarkdownComposerEnabled && (
              <>
                <button
                  type="button"
                  onClick={applyComposerLinkMarkdown}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
                  title="Insert link"
                >
                  <Link2 className="w-3 h-3" />
                  Link
                </button>
                <button
                  type="button"
                  onClick={applyComposerQuoteMarkdown}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
                  title="Quote"
                >
                  <Quote className="w-3 h-3" />
                  Quote
                </button>
              </>
            )}
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {isMarkdownComposerEnabled
                ? 'Uses markdown syntax (may render raw in clients without markdown support).'
                : 'Uses plain styled characters for better cross-client readability.'}
            </span>
          </div>

          {composerHint && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{composerHint}</p>
          )}

          {sendStatus !== 'idle' && (
            <div
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 border text-[11px] ${
                sendStatus === 'sending'
                  ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-200'
                  : sendStatus === 'failed'
                    ? 'bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200'
              }`}
            >
              <span>
                {sendStatus === 'sending'
                  ? 'Sending message...'
                  : sendStatus === 'failed'
                    ? sendStatusError ?? 'Message failed to send.'
                    : 'Message sent.'}
              </span>
              {sendStatus === 'failed' && (
                <button
                  type="button"
                  onClick={() => {
                    void sendComposerMessage();
                  }}
                  disabled={sending}
                  className="rounded-full px-1.5 border border-current/40 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Retry send
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
            <div className="relative flex-1">
              <textarea
                ref={composerInputRef}
                value={newMessage}
                onChange={(event) => {
                  const value = event.target.value;
                  setNewMessage(value);
                  if (sendStatus === 'failed') {
                    setSendStatus('idle');
                    setSendStatusError(null);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendComposerMessage();
                  }
                }}
                onPaste={handleComposerPaste}
                rows={2}
                placeholder="Type a message... (Shift+Enter for a new line)"
                disabled={sending}
                className="w-full px-4 py-3 min-h-[52px] max-h-36 resize-y bg-white/80 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsMarkdownComposerEnabled((currentValue) => !currentValue)}
              disabled={sending}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isMarkdownComposerEnabled
                  ? 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600'
                  : 'border-gray-300 dark:border-gray-600 bg-white/85 dark:bg-gray-800/85 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
              }`}
              title={
                isMarkdownComposerEnabled
                  ? 'Disable markdown composer mode'
                  : 'Enable markdown composer mode'
              }
            >
              <FileText className="w-3.5 h-3.5" />
              {isMarkdownComposerEnabled ? 'MD On' : 'MD Off'}
            </button>
            <button
              type="submit"
              disabled={
                (!newMessage.trim() &&
                  composerDraftAttachments.length === 0 &&
                  !pendingGifUrl &&
                  !pendingLocationAttachment) ||
                sending ||
                hasUploadingDraftAttachment ||
                isRecordingAudio ||
                pendingAudioDraft !== null
              }
              className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
      </div>

      {showCameraCaptureModal && (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(760px,94vw)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {cameraCaptureMode === 'photo' ? 'Take Photo' : 'Record Video'}
              </h3>
              <button
                type="button"
                onClick={closeCameraCaptureModal}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close camera"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                <video
                  ref={cameraPreviewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-[min(56vh,420px)] object-contain"
                  style={{ transform: isMirroredCameraPreview ? 'scaleX(-1)' : 'scaleX(1)' }}
                />
              </div>

              {isCameraInitializing && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Starting camera preview...</p>
              )}

              {cameraCaptureError && (
                <p className="text-sm text-rose-600 dark:text-rose-300">{cameraCaptureError}</p>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50 px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Mode
                  </span>
                  <button
                    type="button"
                    disabled={isCameraRecording}
                    onClick={() => setCameraCaptureMode('photo')}
                    className={`px-2 py-1 rounded-md text-xs font-semibold border disabled:opacity-50 ${
                      cameraCaptureMode === 'photo'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Photo
                  </button>
                  <button
                    type="button"
                    disabled={strictPublicDocModeEnabled || isCameraRecording}
                    onClick={() => setCameraCaptureMode('video')}
                    className={`px-2 py-1 rounded-md text-xs font-semibold border disabled:opacity-50 ${
                      cameraCaptureMode === 'video'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Video
                  </button>
                  {strictPublicDocModeEnabled && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      Video capture is unavailable in strict attachment mode.
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Quality
                  </span>
                  {CAMERA_QUALITY_ORDER.map((qualityPreset) => {
                    const qualityProfile = CAMERA_QUALITY_PROFILES[qualityPreset];
                    return (
                      <button
                        key={qualityPreset}
                        type="button"
                        disabled={isCameraRecording}
                        onClick={() => setCameraQualityPreset(qualityPreset)}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border disabled:opacity-50 ${
                          cameraQualityPreset === qualityPreset
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {qualityProfile.label}
                      </button>
                    );
                  })}
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {cameraCaptureMode === 'video'
                      ? `${selectedCameraQualityProfile.videoWidth}x${selectedCameraQualityProfile.videoHeight} @ ${selectedCameraQualityProfile.videoFrameRate}fps`
                      : `${selectedCameraQualityProfile.photoWidth}x${selectedCameraQualityProfile.photoHeight}`}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeCameraCaptureModal}
                  className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isCameraInitializing || isCameraRecording}
                  onClick={toggleCameraFacingMode}
                  className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Flip camera
                </button>

                {cameraCaptureMode === 'photo' ? (
                  <button
                    type="button"
                    disabled={isCameraInitializing || Boolean(cameraCaptureError)}
                    onClick={() => {
                      void capturePhotoFromCamera();
                    }}
                    className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    Capture photo
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {isCameraRecording
                        ? `Recording ${formatDurationFromSeconds(cameraRecordingSeconds)}`
                        : 'Tap to start recording'}
                    </span>
                    <button
                      type="button"
                      disabled={isCameraInitializing || Boolean(cameraCaptureError)}
                      onClick={toggleCameraVideoRecording}
                      className={`px-3 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 ${
                        isCameraRecording ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {isCameraRecording ? 'Stop and save' : 'Start recording'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {openReactionDetails && (
        <div className="absolute inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(460px,94vw)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {openReactionDetails.emoji} reactions
              </h3>
              <button
                type="button"
                onClick={() => setOpenReactionDetails(null)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close reaction details"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              {selectedReactionDetailReactors.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No reactors found for this emoji.
                </p>
              ) : (
                <div className="max-h-[42vh] overflow-y-auto space-y-2">
                  {selectedReactionDetailReactors.map((reactionActor) => (
                    <div
                      key={`${openReactionDetails.messageId}-${openReactionDetails.emoji}-${reactionActor.userId}`}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {reactionActor.userId === currentUserId ? 'You' : reactionActor.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenReactionDetails(null)}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!selectedReactionDetailsMessage}
                  onClick={() => {
                    if (!selectedReactionDetailsMessage) {
                      return;
                    }

                    void toggleMessageReaction(selectedReactionDetailsMessage, openReactionDetails.emoji);
                    setOpenReactionDetails(null);
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {openReactionDetails.isActive ? 'Remove my reaction' : 'Add my reaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMembersPanel && isGroupConversation && (
        <aside className="w-72 border-l border-gray-200/70 dark:border-gray-700/60 bg-white/65 dark:bg-gray-900/75 backdrop-blur-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200/70 dark:border-gray-700/60">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Members</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{groupMembers.length || activeConversation.members_count} participants</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {groupDetails?.share_url && (
                <button
                  type="button"
                  onClick={() => {
                    void copyGroupShareLink(groupDetails.share_url as string);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Invite members by share link"
                >
                  <Link2 className="w-3 h-3" />
                  Invite by link
                </button>
              )}
              {canManageMembers ? (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                  Owner controls enabled
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  Member view
                </span>
              )}
            </div>
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
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                      member.user_id === groupDetails?.creator_user_id
                        ? 'bg-amber-50 dark:bg-amber-900/35 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {member.user_id === groupDetails?.creator_user_id ? 'Owner' : 'Member'}
                  </span>
                  {canManageMembers &&
                    member.user_id !== groupDetails?.creator_user_id &&
                    member.id && (
                      <button
                        type="button"
                        disabled={removingMembershipId === member.id}
                        onClick={() => {
                          void handleRemoveMember(member);
                        }}
                        className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove member"
                      >
                        {removingMembershipId === member.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {showMediaSearchModal && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(980px,94vw)] h-[min(760px,90vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Media Search</h3>
              <button
                onClick={() => setShowMediaSearchModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close media search"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <form
              onSubmit={handleMediaSearchSubmit}
              className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={mediaSearchQuery}
                onChange={(event) => setMediaSearchQuery(event.target.value)}
                placeholder="Search GIFs, images, and videos"
                className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={mediaSearchLoading}
                className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {mediaSearchLoading ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Paste media URL</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={manualMediaUrlInput}
                  onChange={(event) => setManualMediaUrlInput(event.target.value)}
                  placeholder="https://media.giphy.com/..."
                  className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={queueManualMediaLink}
                  className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  Add URL
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Paste a direct media link and select Add URL to queue it for your next message.
              </p>
            </div>

            <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => handleMediaSearchKindChange('gifs')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  mediaSearchKind === 'gifs'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                GIFs
              </button>
              <button
                type="button"
                onClick={() => handleMediaSearchKindChange('images')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  mediaSearchKind === 'images'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Images
              </button>
              <button
                type="button"
                onClick={() => handleMediaSearchKindChange('videos')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  mediaSearchKind === 'videos'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Videos
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {mediaSearchLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Searching media...</p>
              ) : mediaSearchResults.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {mediaSearchError ?? 'Search for GIFs, images, or videos and choose one to add.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {mediaSearchResults.map((result) => (
                    <div
                      key={result.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-2"
                    >
                      {result.mediaType === 'video' ? (
                        <video
                          muted
                          controls
                          preload="metadata"
                          src={result.previewUrl}
                          className="w-full h-36 object-cover rounded-lg"
                        />
                      ) : (
                        <img
                          src={result.previewUrl}
                          alt={result.title}
                          className="w-full h-36 object-cover rounded-lg"
                        />
                      )}
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {result.source}
                      </p>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200 line-clamp-2 min-h-[2rem]">
                        {result.title}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => useMediaSearchResult(result)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          onClick={() => openMediaExternally(result.mediaUrl, 'Media result')}
                          className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLocationSearchModal && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(760px,94vw)] h-[min(620px,88vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Search Places</h3>
              <button
                onClick={() => setShowLocationSearchModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close place search"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <form
              onSubmit={handleLocationSearchSubmit}
              className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={locationSearchQuery}
                onChange={(event) => setLocationSearchQuery(event.target.value)}
                placeholder="Search place or address"
                className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={locationSearchLoading}
                className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {locationSearchLoading ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto p-4">
              {locationSearchLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Searching places...</p>
              ) : locationSearchResults.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {locationSearchError ?? 'Search for any place and add it to your message.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {locationSearchResults.map((result) => {
                    const mapUrl = `https://www.openstreetmap.org/?mlat=${result.lat}&mlon=${result.lng}#map=15/${result.lat}/${result.lng}`;
                    return (
                      <div
                        key={result.id}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-3"
                      >
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{result.name}</p>
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{result.lat}, {result.lng}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => useLocationSearchResult(result)}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700"
                          >
                            Use location
                          </button>
                          <button
                            type="button"
                            onClick={() => openMediaExternally(mapUrl, 'Location result')}
                            className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            Open map
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForwardModal && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(760px,94vw)] h-[min(640px,90vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Forward Message</h3>
              <button
                onClick={closeForwardMessageModal}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close forward modal"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {forwardTargetMessage && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                  From {forwardTargetMessage.name} in {activeConversation.name}
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-words">
                  {getReplyPreviewForMessage(forwardTargetMessage)}
                </p>
              </div>
            )}

            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={forwardConversationFilter}
                onChange={(event) => setForwardConversationFilter(event.target.value)}
                placeholder="Search chats and groups"
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {forwardConversationsLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</p>
              ) : forwardConversationsError ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{forwardConversationsError}</p>
              ) : filteredForwardConversations.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No conversations match your search.</p>
              ) : (
                <div className="space-y-2">
                  {filteredForwardConversations.map((conversationOption) => {
                    const isSending = forwardSendingConversationId === conversationOption.id;

                    return (
                      <button
                        key={conversationOption.id}
                        type="button"
                        disabled={forwardSendingConversationId !== null}
                        onClick={() => {
                          void forwardMessageToConversation(conversationOption);
                        }}
                        className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/70 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-55 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                            {conversationOption.name}
                          </p>
                          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {conversationOption.type}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {isSending
                            ? 'Forwarding...'
                            : conversationOption.last_message_text?.trim() || 'No recent preview'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareQrModal && groupDetails?.share_url && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(420px,92vw)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Group Join QR</h3>
              <button
                type="button"
                onClick={() => setShowShareQrModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close QR modal"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Scan to open the GroupMe share link for this conversation.
            </p>
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(groupDetails.share_url)}`}
                alt="Group share QR"
                className="w-64 h-64 object-contain"
              />
            </div>
            <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 truncate">{groupDetails.share_url}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void copyGroupShareLink(groupDetails.share_url as string);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Link2 className="w-3 h-3" />
                Copy link
              </button>
              <button
                type="button"
                onClick={() => openGroupShareLink(groupDetails.share_url as string)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Link2 className="w-3 h-3" />
                Open link
              </button>
            </div>
          </div>
        </div>
      )}

      {showAlbumsPanel && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(980px,94vw)] h-[min(760px,90vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Albums</h3>
              <button
                onClick={() => setShowAlbumsPanel(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close albums"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeConversationAlbums.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No albums yet. Use Create album from any image action menu to start one.
                </p>
              ) : (
                <div className="space-y-4">
                  {activeConversationAlbums.map((album) => (
                    <section
                      key={album.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{album.name}</h4>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {album.images.length} image{album.images.length === 1 ? '' : 's'} • Created {formatAlbumTimestamp(album.createdAt)}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => renameAlbum(album.id)}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAlbum(album.id)}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {album.images.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">This album is empty.</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {album.images.map((albumImage) => (
                            <div key={albumImage.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-gray-50/70 dark:bg-gray-800/45">
                              <img
                                src={albumImage.imageUrl}
                                alt={album.name}
                                className="w-full h-28 object-cover rounded-md"
                              />
                              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                Added by {albumImage.senderName}
                              </p>
                              <div className="mt-1 grid grid-cols-2 gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleJumpToMessage(albumImage.messageId);
                                    setShowAlbumsPanel(false);
                                  }}
                                  className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                                >
                                  Show
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeImageFromAlbum(album.id, albumImage.id)}
                                  className="px-2 py-1 rounded-md text-[11px] text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/35 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {memeEditorState && (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(980px,94vw)] h-[min(760px,90vh)] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Meme Editor ({memeEditorState.mediaType === 'video' ? 'Video' : 'Image'})
              </h3>
              <button
                onClick={closeMemeEditor}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close meme editor"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="flex-1 grid md:grid-cols-[1.4fr_1fr] gap-0 overflow-hidden">
              <div className="p-4 bg-gray-50 dark:bg-gray-950/50 flex items-center justify-center overflow-auto">
                <div className="relative w-full max-w-[680px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                  {memeEditorState.mediaType === 'video' ? (
                    <video
                      controls
                      preload="metadata"
                      src={memeEditorState.mediaUrl}
                      className="w-full max-h-[68vh] object-contain"
                    />
                  ) : (
                    <img
                      src={memeEditorState.mediaUrl}
                      alt="Meme preview"
                      className="w-full max-h-[68vh] object-contain"
                    />
                  )}
                  {memeTopText.trim() && (
                    <p className="pointer-events-none absolute top-2 left-2 right-2 text-center text-white font-black uppercase tracking-wide drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] text-xl md:text-3xl break-words">
                      {memeTopText}
                    </p>
                  )}
                  {memeBottomText.trim() && (
                    <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-white font-black uppercase tracking-wide drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] text-xl md:text-3xl break-words">
                      {memeBottomText}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Based on {memeEditorState.senderName}'s {memeEditorState.mediaType}.
                </p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Top text</span>
                  <input
                    type="text"
                    value={memeTopText}
                    onChange={(event) => setMemeTopText(event.target.value)}
                    placeholder="WHEN PROD IS DOWN"
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Bottom text</span>
                  <input
                    type="text"
                    value={memeBottomText}
                    onChange={(event) => setMemeBottomText(event.target.value)}
                    placeholder="BUT ALERTS ARE GREEN"
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={addMemeCaptionToComposer}
                    className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Add to composer
                  </button>
                  <button
                    type="button"
                    onClick={() => openMediaExternally(memeEditorState.mediaUrl, 'Meme source')}
                    className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Open source
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void shareMediaUrl(memeEditorState.mediaUrl);
                    }}
                    className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Share source
                  </button>
                  {memeEditorState.mediaType === 'image' ? (
                    <button
                      type="button"
                      onClick={() => {
                        void downloadMemeImage();
                      }}
                      className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Export meme image
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={addMemeCaptionToComposer}
                      className="px-3 py-2 rounded-md text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Insert caption text
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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

            <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setGalleryMediaFilter('all')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  galleryMediaFilter === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                All ({galleryMediaCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setGalleryMediaFilter('images')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  galleryMediaFilter === 'images'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Images ({galleryMediaCounts.images})
              </button>
              <button
                type="button"
                onClick={() => setGalleryMediaFilter('videos')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  galleryMediaFilter === 'videos'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Videos ({galleryMediaCounts.videos})
              </button>
              <button
                type="button"
                onClick={() => setGalleryMediaFilter('files')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  galleryMediaFilter === 'files'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Files ({galleryMediaCounts.files})
              </button>
              <button
                type="button"
                onClick={() => setGalleryMediaFilter('locations')}
                className={`px-2 py-1 rounded-md text-xs font-medium border ${
                  galleryMediaFilter === 'locations'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Locations ({galleryMediaCounts.locations})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {galleryMediaEntries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No media found in recent messages.</p>
              ) : filteredGalleryMediaEntries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No media found for this filter.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredGalleryMediaEntries.map((mediaEntry) => {
                    if (mediaEntry.type === 'image') {
                      const imageUrl = mediaEntry.imageUrl;
                      if (!imageUrl) {
                        return null;
                      }

                      return (
                        <div
                          key={mediaEntry.id}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-2"
                        >
                          <img
                            src={imageUrl}
                            alt="Gallery"
                            className="w-full h-36 object-cover rounded-lg"
                          />
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void handleJumpToMessage(mediaEntry.messageId);
                                setShowGallery(false);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Show in chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                beginReplyToMessageById(mediaEntry.messageId, mediaEntry.senderName);
                                setShowGallery(false);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Reply
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                addImageToAlbum(
                                  imageUrl,
                                  mediaEntry.messageId,
                                  mediaEntry.senderName,
                                );
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Create album
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaForMeme(imageUrl, 'image', mediaEntry.senderName);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Meme
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void downloadImage(imageUrl);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaExternally(imageUrl, 'Image');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void shareMediaUrl(imageUrl);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Share
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (mediaEntry.type === 'video') {
                      const videoUrl = mediaEntry.videoUrl;
                      if (!videoUrl) {
                        return null;
                      }

                      return (
                        <div
                          key={mediaEntry.id}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-2"
                        >
                          <video
                            controls
                            preload="metadata"
                            src={videoUrl}
                            className="w-full h-36 object-cover rounded-lg"
                          />
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void handleJumpToMessage(mediaEntry.messageId);
                                setShowGallery(false);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Show in chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaForMeme(videoUrl, 'video', mediaEntry.senderName);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Meme
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void downloadMedia(
                                  videoUrl,
                                  getDownloadFilenameFromUrl(videoUrl),
                                );
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaExternally(videoUrl, 'Video');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (mediaEntry.type === 'file') {
                      const fileUrl = mediaEntry.fileUrl;
                      if (!fileUrl) {
                        return null;
                      }

                      return (
                        <div
                          key={mediaEntry.id}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-3"
                        >
                          <div className="h-36 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col items-center justify-center text-center px-3">
                            <FileText className="w-7 h-7 text-gray-500 dark:text-gray-300" />
                            <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-200 break-words">
                              {mediaEntry.fileName || 'File'}
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void handleJumpToMessage(mediaEntry.messageId);
                                setShowGallery(false);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Show in chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void downloadMedia(
                                  fileUrl,
                                  mediaEntry.fileName || getDownloadFilenameFromUrl(fileUrl),
                                );
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaExternally(fileUrl, 'File');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void shareMediaUrl(fileUrl);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Share
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (mediaEntry.type === 'location' && mediaEntry.lat && mediaEntry.lng) {
                      const mapUrl = `https://www.openstreetmap.org/?mlat=${mediaEntry.lat}&mlon=${mediaEntry.lng}#map=15/${mediaEntry.lat}/${mediaEntry.lng}`;
                      return (
                        <div
                          key={mediaEntry.id}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 p-3"
                        >
                          <div className="h-36 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col items-center justify-center text-center px-3">
                            <MapPin className="w-7 h-7 text-gray-500 dark:text-gray-300" />
                            <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                              {mediaEntry.locationName || 'Location'}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 break-all">
                              {mediaEntry.lat}, {mediaEntry.lng}
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void handleJumpToMessage(mediaEntry.messageId);
                                setShowGallery(false);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Show in chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openMediaExternally(mapUrl, 'Location');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              Open map
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
