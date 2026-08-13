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

const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const ICON_URL = "icon.svg";

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
    return;
  }

  await chrome.notifications.create(`finish:${timer.id}:${Date.now()}`, {
    type: "basic",
    iconUrl: ICON_URL,
    title: "Timer finished",
    message: timer.label
  });

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
