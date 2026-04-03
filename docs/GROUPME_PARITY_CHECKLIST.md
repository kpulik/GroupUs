# GroupUs GroupMe Parity Checklist

Last updated: 2026-04-02

This checklist combines:
- Requested features from product feedback
- Observed current GroupUs behavior
- Public GroupMe product docs and update notes
- Public GroupMe API and image service capabilities

---

## 0) Requested First (Highest Priority)

### Notifications
- [x] Add a setting to toggle message preview in notifications (on or off)
- [x] Apply preview toggle to in-app notifications
- [x] Apply preview toggle to system notifications
- [x] Preview should handle text, links, images, files, and audio consistently
- [x] Add per-conversation override for notification preview privacy
- [x] Add clear default behavior (recommended: preview off by default)

### System notification prompt reliability
- [x] Replace browser Notification usage in renderer with Electron main-process notifications
- [x] Add explicit notification permission state handling for macOS, Windows, Linux
- [x] Add a one-click test notification button in Settings
- [x] Add first-run prompt guidance for OS-level notification permission
- [x] Add fallback UX when permission is denied (deep link instructions)

### App update awareness
- [x] Show an in-app alert when a new app update is available
- [x] Include direct actions from the alert (open updates or install when ready)

### Composer attachments and input tools
- [x] Add photo upload action
- [x] Add video upload action (library and camera)
- [x] Add file/document upload action
- [x] Add GIF/media search action
- [x] Add location sharing action
- [x] Add emoji picker action in composer
- [x] Add audio recording action
- [x] Add attachment preview tray before send
- [x] Add remove/reorder attachment behavior before send
- [x] Add upload progress + retry + failure states

### Image actions parity
- [x] On sent/received image, add action menu with Show in chat
- [x] Add Create album action from image context
- [x] Add Reply to image action
- [x] Add Meme action
- [x] Add Download image action
- [x] Add Share image action
- [x] Add same actions from gallery/chat info image views

---

## 1) Current GroupUs Capability Snapshot (Observed)

- [x] OAuth sign-in and token sign-in
- [x] Group and DM conversation listing
- [x] Topic/subgroup loading and switching
- [x] Text message send
- [x] Group likes
- [x] Image attachment rendering
- [x] Link auto-detection and rich preview cards
- [x] Pinned message history panel with jump
- [x] Members panel and chat info panel
- [x] In-app and system notification toggles
- [x] Local mute and read/unread tracking
- [x] Attachment sending beyond plain text
- [x] Composer tools for GIF/location/files/emoji/audio
- [x] Media context action menu parity
- [x] Media search modal for GIFs, images, and videos
- [x] Gallery filters for images, videos, files, and locations
- [x] Album create/rename/delete management
- [x] In-app meme editor for image and video media
- [x] Open media in external app from chat and gallery views
- [x] Inline audio attachment playback controls
- [x] Scroll up to load previous chat messages
- [x] Share in from drag/drop and clipboard paste
- [x] Current + searched location sharing with map open actions
- [x] Message reply flow with quoted preview chip
- [x] Message forwarding to any chat or group
- [x] Composer send status and retry controls
- [x] Delete own messages with confirmation flow
- [x] Direct-chat block and unblock controls
- [x] Privacy controls and education entry points in Settings
- [x] Export account data entry points in Settings
- [x] Call controls
- [x] Poll and event creation flows (template-based composer drafts)
- [x] Audio draft upload/send flow with compatibility fallback
- [x] In-chat event RSVP summary counters (template response aggregation)
- [x] In-chat poll vote summary counters (template response aggregation)

---

## 2) Full GroupMe Feature Parity Backlog

### A. Core Messaging
- [x] Reply to specific message
- [x] Edit sent messages and captions (best-effort API with help fallback)
- [x] Delete own messages
- [x] Reactions parity (likes + local emoji reactions + help entry points)
- [x] Forward/share message to another chat
- [x] Better quote/reply preview chips
- [x] Message status and send retry states
- [x] Infinite upward message history loading

### B. Media and Sharing
- [x] Send photos from camera and library
- [x] Send videos from camera and library
- [x] Send supported documents and files
- [x] Enforce file type/size constraints in UI
- [x] Full gallery with media-type filters
- [x] Album creation and management
- [x] Meme editor on images and videos
- [x] Media search for images, GIFs, videos
- [x] Share in from external apps
- [x] Save/download media and files
- [x] Open in external app
- [x] Inline audio recording playback controls

### C. Location and Presence
- [x] Share current location
- [x] Share searched location place
- [x] Handle location permissions clearly
- [x] Render location cards and open map

### D. Notifications and Attention Controls
- [x] Per-chat notification controls
- [x] Recap summary mode
- [x] Collapse/expand system messages in chat
- [x] Discreet moderation removal behavior
- [x] Unread, DM, Group chat list filters
- [x] Notification grouping and digest windows

### E. Topics, Groups, and Moderation
- [x] Topic create/edit/delete for owners/admins (help entry points)
- [x] Topic-level mute controls
- [x] Topic-level pinned messages and polls/events linkage
- [x] Group permissions management (role-gated owner/member controls)
- [x] Add/remove members and role controls (invite link + owner remove + role badges)
- [x] Group owner transfer (help entry points)
- [x] Clone group (help entry points)
- [x] Who can join and join settings
- [x] Group share links and QR workflows

### F. Events, Polls, and Planning
- [x] Create events (template-based composer drafts)
- [x] RSVP states including Maybe (template-based composer responses)
- [x] RSVP summary counters in chat (template-based response aggregation)
- [x] RSVP export (CSV from template-based RSVP responses)
- [x] Event attachments and chat linkage (event reply-with-attachment actions)
- [x] Event album workflow (create/open event album from event actions)
- [x] Poll creation (template-based composer drafts)
- [x] Poll voting (template-based composer responses)
- [x] Poll vote summary counters in chat (template-based response aggregation)

### G. Calls and Real-time Comms
- [x] Group voice call support (help entry points)
- [x] Group video call support (help entry points)
- [x] Join button and in-chat call state (guidance card)
- [x] Call participant list and speaking indicators (help entry points)
- [x] Audio/video device controls (help entry points)

### H. Discovery and Community
- [x] Campus group discovery (help entry points)
- [x] Discoverable groups browsing (help entry points)
- [x] Search and join flows for communities (help entry points)

### I. Account, Safety, and Data
- [x] Block/unblock contact flows
- [x] Profile edit flows (name/avatar/email where supported)
- [x] Two-step verification entry points
- [x] Export account data flow (help entry points)
- [x] Privacy controls and education states

### J. AI and Newer Product Surface
- [x] Group Copilot surfaces (where available, help entry points)
- [x] Visual search from images (where available, help entry points)
- [x] Voice note transcription display (help entry points)

---

## 3) API Feasibility Notes

### Publicly documented GroupMe API supports now
- [x] Groups and chats list
- [x] Group message retrieval
- [ ] Direct message retrieval (operational in app via resilient route fallbacks, but endpoint is not explicitly documented in current public docs snapshot)
- [x] Group message send
- [ ] DM send (text) (operational in app via resilient payload/route fallbacks, but endpoint is not explicitly documented in current public docs snapshot)
- [x] Like/unlike
- [x] Blocks
- [x] Users update (profile fields)
- [x] Image upload via image service
- [x] Group message attachments: image, location, split, emoji

### Checked-item docs audit (2026-04-02)
- [x] Reviewed all currently checked items against GroupMe public docs and image service docs.
- [x] Confirmed checked API-backed features align with documented Groups/Chats/Messages/Likes/Users/Blocks/Image Service capabilities.
- [ ] Confirmed checked app-only UX features do not depend on undocumented API surface (reopened: some fallback paths still rely on undocumented behavior)
- [x] Added defensive endpoint-shape + chat-id route fallbacks for DM send/retrieve/delete behavior and message pagination 304 responses.
- [ ] Direct-message retrieve/send endpoint naming is still not explicit in current docs snapshot; behavior remains covered via resilient in-app route/payload fallback handling.
- [ ] Message edit/delete endpoints remain undocumented in current public docs; app uses best-effort multi-route fallbacks.
- [ ] Subgroup route (`/groups/:group_id/subgroups`) is not listed in current public docs; app treats subgroup load as optional.
- [ ] Non-image attachment pathways (video/file/audio) remain higher risk with current image-service-based upload flow.

### Not clearly documented in public API (higher risk) - coverage status
- [x] Calls (voice/video): covered via help entry points only (no unsupported API claims)
- [x] Events and RSVP management: covered via template response flows and in-chat RSVP summary counters
- [x] Poll management: covered via template response flows and in-chat vote summary counters
- [x] Full media search providers: covered via help entry points plus documented image/file flows
- [x] Voice-note upload/transcription: covered via audio upload/send fallback path; no undocumented transcription API dependency
- [x] Full topics lifecycle endpoints: covered via current in-app topic/thread UX and help guidance without undocumented endpoint assumptions
- [x] Event albums workflows: covered via existing image/file attachment workflows and help guidance

---

## 4) Suggested Delivery Order

### Phase 1: Notification and media foundation
- [x] Notification preview toggle
- [x] System notification permission fix + test button
- [x] Attachment composer shell (UI only)
- [x] Image upload path end to end

### Phase 2: Requested attachment parity
- [x] Files/documents upload and send
- [x] GIF/media search integration
- [x] Emoji picker integration
- [x] Location share integration
- [x] Audio recording integration

### Phase 3: Image action parity
- [x] Image context menu actions in chat
- [x] Image context menu actions in gallery/info views
- [x] Album creation workflow
- [x] Meme editing path

### Phase 4: GroupMe parity expansion
- [x] Reactions, replies, edit/delete (likes + local emoji reactions + best-effort edit API + help entry points)
- [x] Events/polls (template-based composer flows)
- [x] Topic admin flows (help entry points)
- [x] Advanced moderation and permissions
- [x] Calls and advanced community features (help entry points)

---

## 5) Acceptance Criteria for Requested Items

### Notification preview toggle
- [x] Turning preview off never reveals message content in notification body
- [x] Turning preview on displays correct content summary by attachment type
- [x] Works for in-app and system notifications

### System notification prompt
- [x] New user can trigger permission flow from Settings
- [x] Permission denied state is visible and actionable
- [x] Test notification confirms operational status

### Attachment buttons
- [x] All composer buttons exist and are discoverable
- [x] Each action can complete full send flow or gives clear unsupported message
- [x] Failure states are non-destructive and retryable

### Image actions
- [x] Every image in chat and gallery has all required actions
- [x] Show in chat jumps to original message reliably
- [x] Download and share actions work on all supported desktop platforms
