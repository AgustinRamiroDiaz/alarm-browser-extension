# Timer Warnings

A minimal Chrome Manifest V3 extension for creating timers with a warning notification before they finish.

## Try it locally

1. Run `npm install`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select this project folder.
7. Open the extension popup and create a timer.

## Development

Use `npm run check` for type-checking and `npm run build` to compile `src/*.ts` into `dist/*.js`.

The extension uses Chrome alarms so timers keep working after the popup closes. Active timers are stored in `chrome.storage.local`.

Warning and completion sounds are played by an offscreen document using Web Audio. Chrome notifications do not support custom sound files directly, so the background service worker creates `offscreen.html` when it needs audio playback.

If notification images fail to load, Chrome rejects the notification request. The extension uses a local PNG icon for notifications because SVG icons can fail in `chrome.notifications`.
