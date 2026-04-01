# GroupUs Desktop Client

<p align="center">
  <img src="build/icons/groupus-logo.svg" alt="GroupUs logo" width="180" />
</p>

GroupUs is an unofficial desktop client for GroupMe, built with Electron + React + Vite.

## Supported Platforms

- macOS
- Windows
- Linux

## Core Features

- Conversation filters for All, Groups, and Chats.
- Group topics/subchannels with expand/collapse controls.
- Per-conversation and per-topic mute controls.
- Per-conversation and per-topic mark read/unread controls.
- Global "Mark all as read" action.
- Color themes (Ocean, Forest, Rose, Amber, Custom accent).
- Appearance modes (Light, Dark, System).
- Dark surface style options:
  - Dark Blue
  - Pure Black (OLED)
- Access token controls:
  - Reveal/hide
  - Copy to clipboard
- In-app update checks and install flow for packaged builds.

## First-Time Sign In

1. Open [https://dev.groupme.com/](https://dev.groupme.com/).
2. Sign in with your GroupMe account.
3. Click Access Token.
4. Copy your token.
5. Paste it into GroupUs.

## Development

1. Install dependencies:

```bash
npm install
```

2. Start web dev server:

```bash
npm run dev
```

3. Start Electron + Vite dev flow:

```bash
npm run electron:dev
```

## Build

Build web + Electron bundles:

```bash
npm run build
```

Build desktop installers/artifacts with Electron Builder:

```bash
npm run electron:build
```

By default this targets:

- macOS: `dmg`, `zip`
- Windows: `nsis` (`.exe` installer)
- Linux: `AppImage`, `deb`

## Security Notes

- `.env` and `.env.*` are gitignored by default.
- `node_modules`, build output, and release artifacts are gitignored.
- Access token is stored locally in app storage for sign-in.
- Read/unread state is local to GroupUs UI state.

## Release Workflow

Recommended release process:

1. Ensure working tree is clean and build passes.
2. Bump version in `package.json`.
3. Create a git tag (for example `v1.0.0`).
4. Push commit + tag.
5. GitHub Actions builds and publishes macOS, Windows, and Linux assets to the tagged release.

## Platform Signing and Trust

This project is configured to sign all release platforms in CI:

- macOS: Apple code signing + notarization
- Windows: Authenticode code signing
- Linux: GPG detached signatures for release artifacts (`.AppImage`, `.deb`)

Required GitHub Actions secrets:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`
- `LINUX_GPG_PRIVATE_KEY`
- `LINUX_GPG_PASSPHRASE`

Alternative Apple credentials are supported:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

If users still see macOS quarantine prompts on older builds, this temporary workaround can help when they trust the source:

```bash
xattr -dr com.apple.quarantine /Applications/GroupUs.app
```

## Support

If GroupUs is useful to you, you can support me here:

- Buy Me a Coffee: [https://buymeacoffee.com/kpulik](https://buymeacoffee.com/kpulik)

<a href="https://buymeacoffee.com/kpulik">
  <img src="bmc_qr.png" alt="Buy Me a Coffee QR code" width="320" />
</a>

## Notes

- GroupUs is not affiliated with GroupMe.
