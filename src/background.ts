type Timer = {
  id: string;
  label: string;
  durationMinutes: number;
  warningMinutes: number;
  createdAt: number;
  warningAt: number;
  endsAt: number;
};

type TimerAlarmKind = "warning" | "finish";
type TimerSound = "warning" | "finish";

const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const ICON_URL = "icon.svg";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let creatingOffscreenDocument: Promise<void> | null = null;

chrome.runtime.onInstalled.addListener(() => {
  void restoreScheduledAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreScheduledAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm);
});

async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  const parsed = parseAlarmName(alarm.name);
  if (!parsed) return;

  const timers = await getTimers();
  const timer = timers.find((item) => item.id === parsed.timerId);
  if (!timer) return;

  if (parsed.kind === "warning") {
    if (Date.now() >= timer.endsAt) return;

    const minutesLeft = Math.max(1, Math.round((timer.endsAt - Date.now()) / 60000));
    await chrome.notifications.create(`warning:${timer.id}:${Date.now()}`, {
      type: "basic",
      iconUrl: ICON_URL,
      title: "Timer warning",
      message: `${timer.label} ends in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`
    });
    await playTimerSound("warning");
    return;
  }

  await chrome.notifications.create(`finish:${timer.id}:${Date.now()}`, {
    type: "basic",
    iconUrl: ICON_URL,
    title: "Timer finished",
    message: timer.label
  });
  await playTimerSound("finish");

  await setTimers(timers.filter((item) => item.id !== timer.id));
  await chrome.alarms.clear(makeAlarmName(timer.id, "warning"));
}

async function restoreScheduledAlarms(): Promise<void> {
  const timers = await getTimers();
  const now = Date.now();
  const activeTimers: Timer[] = [];

  for (const timer of timers) {
    if (timer.endsAt <= now) {
      await chrome.notifications.create(`missed:${timer.id}:${now}`, {
        type: "basic",
        iconUrl: ICON_URL,
        title: "Timer finished",
        message: timer.label
      });
      await playTimerSound("finish");
      continue;
    }

    activeTimers.push(timer);
    await scheduleTimerAlarms(timer);
  }

  if (activeTimers.length !== timers.length) {
    await setTimers(activeTimers);
  }
}

async function scheduleTimerAlarms(timer: Timer): Promise<void> {
  await chrome.alarms.create(makeAlarmName(timer.id, "finish"), {
    when: timer.endsAt
  });

  if (timer.warningAt > Date.now() && timer.warningAt < timer.endsAt) {
    await chrome.alarms.create(makeAlarmName(timer.id, "warning"), {
      when: timer.warningAt
    });
  }
}

async function playTimerSound(sound: TimerSound): Promise<void> {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    target: "timer-audio",
    type: "play-sound",
    sound
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) return;

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play warning and completion sounds for timer notifications."
    });
  }

  await creatingOffscreenDocument;
  creatingOffscreenDocument = null;
}

function makeAlarmName(timerId: string, kind: TimerAlarmKind): string {
  return `${ALARM_PREFIX}${timerId}:${kind}`;
}

function parseAlarmName(name: string): { timerId: string; kind: TimerAlarmKind } | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;

  const match = /^timer:([^:]+):(warning|finish)$/.exec(name);
  if (!match) return null;

  return { timerId: match[1], kind: match[2] as TimerAlarmKind };
}

async function getTimers(): Promise<Timer[]> {
  const result = await chrome.storage.local.get(TIMERS_KEY);
  return isTimerArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}

async function setTimers(timers: Timer[]): Promise<void> {
  await chrome.storage.local.set({ [TIMERS_KEY]: timers });
}

function isTimerArray(value: unknown): value is Timer[] {
  return Array.isArray(value);
}

export {};
