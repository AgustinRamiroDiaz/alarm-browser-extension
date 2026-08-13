type TimerSound = "warning" | "finish";

type PlaySoundMessage = {
  target: "timer-audio";
  type: "play-sound";
  sound: TimerSound;
};

type Tone = {
  frequency: number;
  startsAt: number;
  duration: number;
  volume: number;
};

const WARNING_TONES: Tone[] = [
  { frequency: 660, startsAt: 0, duration: 0.14, volume: 0.18 },
  { frequency: 880, startsAt: 0.18, duration: 0.18, volume: 0.16 }
];

const FINISH_TONES: Tone[] = [
  { frequency: 784, startsAt: 0, duration: 0.16, volume: 0.2 },
  { frequency: 988, startsAt: 0.2, duration: 0.16, volume: 0.2 },
  { frequency: 1175, startsAt: 0.4, duration: 0.28, volume: 0.18 }
];

let audioContext: AudioContext | null = null;

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isPlaySoundMessage(message)) return;

  void playSound(message.sound);
});

async function playSound(sound: TimerSound): Promise<void> {
  const context = getAudioContext();

  if (context.state === "suspended") {
    await context.resume();
  }

  const tones = sound === "warning" ? WARNING_TONES : FINISH_TONES;
  const startTime = context.currentTime + 0.03;

  for (const tone of tones) {
    playTone(context, tone, startTime);
  }
}

function playTone(context: AudioContext, tone: Tone, baseTime: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startsAt = baseTime + tone.startsAt;
  const endsAt = startsAt + tone.duration;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(tone.frequency, startsAt);

  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(tone.volume, startsAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(endsAt + 0.02);
}

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
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
