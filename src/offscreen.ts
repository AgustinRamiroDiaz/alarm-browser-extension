import { playSound as playAudio, type TimerSound } from "./audio.js";

type PlaySoundMessage = {
  target: "timer-audio";
  type: "play-sound";
  sound: TimerSound;
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isPlaySoundMessage(message)) return;

  void playSound(message.sound);
});

async function playSound(sound: TimerSound): Promise<void> {
  await playAudio(sound);
}

function isPlaySoundMessage(value: unknown): value is PlaySoundMessage {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PlaySoundMessage>;
  return (
    candidate.target === "timer-audio" &&
    candidate.type === "play-sound" &&
    (candidate.sound === "warning" || candidate.sound === "finish")
  );
}

export {};
