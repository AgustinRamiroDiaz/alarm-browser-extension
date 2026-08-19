export type TimerSound = "warning" | "finish";

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

export async function playSound(sound: TimerSound): Promise<void> {
  const AudioContextConstructor = globalThis.AudioContext;
  if (!AudioContextConstructor) return;

  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const tones = sound === "warning" ? WARNING_TONES : FINISH_TONES;
  const startTime = audioContext.currentTime + 0.03;

  for (const tone of tones) {
    playTone(audioContext, tone, startTime);
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
