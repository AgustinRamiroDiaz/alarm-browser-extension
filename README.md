# Timer Warnings

A minimal Chrome Manifest V3 extension for creating timers with a warning notification before they finish.

## Try it locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open the extension popup and create a timer.

The extension uses Chrome alarms so timers keep working after the popup closes. Active timers are stored in `chrome.storage.local`.
