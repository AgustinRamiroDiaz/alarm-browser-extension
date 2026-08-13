const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const ICON_URL = "icon.svg";

chrome.runtime.onInstalled.addListener(() => {
  restoreScheduledAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  restoreScheduledAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
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

  if (parsed.kind === "finish") {
    await chrome.notifications.create(`finish:${timer.id}:${Date.now()}`, {
      type: "basic",
      iconUrl: ICON_URL,
      title: "Timer finished",
      message: timer.label
    });

    await setTimers(timers.filter((item) => item.id !== timer.id));
    await chrome.alarms.clear(makeAlarmName(timer.id, "warning"));
  }
});

async function restoreScheduledAlarms() {
  const timers = await getTimers();
  const now = Date.now();
  const activeTimers = [];

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

async function scheduleTimerAlarms(timer) {
  await chrome.alarms.create(makeAlarmName(timer.id, "finish"), {
    when: timer.endsAt
  });

  if (timer.warningAt > Date.now() && timer.warningAt < timer.endsAt) {
    await chrome.alarms.create(makeAlarmName(timer.id, "warning"), {
      when: timer.warningAt
    });
  }
}

function makeAlarmName(timerId, kind) {
  return `${ALARM_PREFIX}${timerId}:${kind}`;
}

function parseAlarmName(name) {
  if (!name.startsWith(ALARM_PREFIX)) return null;

  const [, timerId, kind] = name.match(/^timer:([^:]+):(warning|finish)$/) || [];
  if (!timerId || !kind) return null;
  return { timerId, kind };
}

async function getTimers() {
  const result = await chrome.storage.local.get(TIMERS_KEY);
  return Array.isArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}

async function setTimers(timers) {
  await chrome.storage.local.set({ [TIMERS_KEY]: timers });
}
