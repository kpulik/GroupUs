# GroupUs Desktop Client

<p align="center">
  <img src="build/icons/groupus-logo.svg" alt="GroupUs logo" width="180" />
</p>

GroupUs is an unofficial desktop client for GroupMe.

## Supported Platforms

- macOS
- Windows
- Linux

## Features

- **OAuth sign-in** -- click "Log in with GroupMe" and authorize in your browser.
- Conversation filters for All, Groups, and Chats.
- Group topics/subchannels with expand/collapse controls.
- Per-conversation and per-topic mute controls.
- Per-conversation and per-topic mark read/unread controls.
- Global "Mark all as read" action.
- Color themes (Ocean, Forest, Rose, Amber, Custom accent).
- Appearance modes (Light, Dark, System).
- Dark surface styles (Dark Blue, Pure Black/OLED).
- Access token management (reveal, copy, delete).
- In-app update checks and install flow.

## Getting Started

### Recommended: OAuth Sign-In

1. Open GroupUs and click **Log in with GroupMe**.
2. Complete sign-in in your browser.
3. GroupUs receives the token and logs you in automatically.

### Alternative: Manual Token Sign-In

If OAuth does not work, you can sign in with an access token:

1. Go to [https://dev.groupme.com/](https://dev.groupme.com/) and log in.
2. Click **Access Token** in the top right corner.
3. Copy the token and paste it into GroupUs.

<video src="src/assets/support/groupus-screen-recording.mov" controls muted loop autoplay playsinline width="720">
  Your browser does not support embedded video playback.
</video>

## Install from GitHub Releases

### macOS

1. Download the `.dmg` asset and open it.
2. Drag `GroupUs.app` into `Applications`.
3. If macOS warns that the app cannot be opened:
   - Open **System Settings** > **Privacy & Security**.
   - Under the blocked app message, click **Open Anyway**.
   - Confirm by clicking **Open**.
4. If needed, remove quarantine flags in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/GroupUs.app
```

### Windows

1. Download the `.exe` installer from the release.
2. Run the installer.
3. If SmartScreen shows "Windows protected your PC":
   - Click **More info**.
   - Click **Run anyway**.

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

If GroupUs is useful to you, consider supporting development:

<a href="https://buymeacoffee.com/kpulik">
  <img src="bmc_qr.png" alt="Buy Me a Coffee QR code" width="320" />
</a>

[Buy Me a Coffee](https://buymeacoffee.com/kpulik)

## Notes

- GroupUs is not affiliated with GroupMe.
