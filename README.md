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
