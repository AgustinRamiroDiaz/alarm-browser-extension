import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = "build/firefox";

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(`${outputDirectory}/dist`, { recursive: true });
await mkdir(`${outputDirectory}/icons`, { recursive: true });

await Promise.all([
  cp("manifest.firefox.json", `${outputDirectory}/manifest.json`),
  cp("popup.html", `${outputDirectory}/popup.html`),
  cp("popup.css", `${outputDirectory}/popup.css`),
  cp("dist/background.js", `${outputDirectory}/dist/background.js`),
  cp("dist/popup.js", `${outputDirectory}/dist/popup.js`),
  cp("dist/audio.js", `${outputDirectory}/dist/audio.js`),
  cp("icons/timer-128.png", `${outputDirectory}/icons/timer-128.png`)
]);

console.log(`Firefox extension packaged in ${outputDirectory}`);
