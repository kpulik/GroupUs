# GroupUs Desktop Client

<p align="center">
  <img src="build/icons/groupus-logo.svg" alt="GroupUs logo" width="180" />
</p>

GroupUs is an unofficial desktop client for GroupMe.

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

## Install from GitHub Releases

This app is distributed directly from GitHub Releases.

### macOS

1. Download the `.dmg` asset and open it.
2. Drag `GroupUs.app` into `Applications`.
3. If macOS warns that the app cannot be opened:

- Open `System Settings` -> `Privacy & Security`.
- Under the blocked app message, click `Open Anyway`.
- Confirm by clicking `Open`.

4. If needed, remove quarantine flags in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/GroupUs.app
```

### Windows

1. Download the `.exe` installer from the release.
2. Run the installer.
3. If SmartScreen shows `Windows protected your PC`:

- Click `More info`.
- Click `Run anyway`.

### Linux

Use either the AppImage or deb package.

AppImage:

```bash
chmod +x GroupUs-*.AppImage
./GroupUs-*.AppImage
```

Debian/Ubuntu (`.deb`):

```bash
sudo dpkg -i GroupUs-*.deb
sudo apt-get install -f
```

## Support

If GroupUs is useful to you, you can support me here:

- Buy Me a Coffee: [https://buymeacoffee.com/kpulik](https://buymeacoffee.com/kpulik)

<a href="https://buymeacoffee.com/kpulik">
  <img src="bmc_qr.png" alt="Buy Me a Coffee QR code" width="320" />
</a>

## Notes

- GroupUs is not affiliated with GroupMe.
