import { playSound as playAudio } from "./audio.js";
chrome.runtime.onMessage.addListener((message) => {
    if (!isPlaySoundMessage(message))
        return;
    void playSound(message.sound);
});
async function playSound(sound) {
    await playAudio(sound);
}
function isPlaySoundMessage(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return (candidate.target === "timer-audio" &&
        candidate.type === "play-sound" &&
        (candidate.sound === "warning" || candidate.sound === "finish"));
}
