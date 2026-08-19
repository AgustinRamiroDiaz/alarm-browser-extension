# Timer Warnings

A minimal Chrome and Firefox extension for creating timers with a warning notification before they finish.

## Try it locally

1. Run `npm install`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select this project folder.
7. Open the extension popup and create a timer.

## Development

Use `npm run check` for type-checking and `npm run build` to compile `src/*.ts` into `dist/*.js` for Chrome.

To build Firefox’s package, run `npm run build:firefox`. Load the generated `build/firefox` directory temporarily from `about:debugging` → **This Firefox** → **Load Temporary Add-on**.

The extension uses browser alarms so timers keep working after the popup closes. Timers are stored in extension local storage and remain visible after completion until the user removes them.

Chrome plays warning and completion sounds in an offscreen document using Web Audio. Firefox plays the same tones from its background page because Firefox does not implement Chrome’s offscreen document API.

If notification images fail to load, Chrome rejects the notification request. The extension uses a local PNG icon for notifications because SVG icons can fail in `chrome.notifications`.
