const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";

const form = document.querySelector("#timerForm");
const labelInput = document.querySelector("#label");
const durationInput = document.querySelector("#duration");
const warningInput = document.querySelector("#warning");
const errorEl = document.querySelector("#formError");
const listEl = document.querySelector("#timerList");
const emptyEl = document.querySelector("#emptyState");
const summaryEl = document.querySelector("#summary");

let timers = [];
let renderIntervalId = null;

document.addEventListener("DOMContentLoaded", async () => {
  timers = await getTimers();
  render();

  renderIntervalId = window.setInterval(render, 1000);
});

window.addEventListener("unload", () => {
  if (renderIntervalId) {
    window.clearInterval(renderIntervalId);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const durationMinutes = Number(durationInput.value);
  const warningMinutes = Number(warningInput.value);

  if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
    errorEl.textContent = "Duration must be at least 1 minute.";
    return;
  }

  if (!Number.isFinite(warningMinutes) || warningMinutes < 0) {
    errorEl.textContent = "Warning must be 0 minutes or more.";
    return;
  }

  if (warningMinutes >= durationMinutes) {
    errorEl.textContent = "Warning must happen before the timer ends.";
    return;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const label = labelInput.value.trim() || `${durationMinutes} minute timer`;
  const timer = {
    id,
    label,
    durationMinutes,
    warningMinutes,
    createdAt: now,
    warningAt: now + (durationMinutes - warningMinutes) * 60 * 1000,
    endsAt: now + durationMinutes * 60 * 1000
  };

  timers = [...timers, timer].sort((a, b) => a.endsAt - b.endsAt);
  await setTimers(timers);
  await scheduleTimer(timer);

  form.reset();
  durationInput.value = "25";
  warningInput.value = "5";
  labelInput.focus();
  render();
});

listEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;

  const timerId = button.dataset.id;
  timers = timers.filter((timer) => timer.id !== timerId);
  await setTimers(timers);
  await chrome.alarms.clear(makeAlarmName(timerId, "warning"));
  await chrome.alarms.clear(makeAlarmName(timerId, "finish"));
  render();
});

async function scheduleTimer(timer) {
  await chrome.alarms.create(makeAlarmName(timer.id, "finish"), {
    when: timer.endsAt
  });

  if (timer.warningMinutes > 0) {
    await chrome.alarms.create(makeAlarmName(timer.id, "warning"), {
      when: timer.warningAt
    });
  }
}

function render() {
  const now = Date.now();
  timers = timers.filter((timer) => timer.endsAt > now);

  summaryEl.textContent = timers.length
    ? `${timers.length} active timer${timers.length === 1 ? "" : "s"}`
    : "No active timers";

  emptyEl.classList.toggle("hidden", timers.length > 0);
  listEl.textContent = "";

  const fragment = document.createDocumentFragment();
  for (const timer of timers) {
    const item = document.createElement("li");
    item.className = "timer";

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = timer.label;

    const time = document.createElement("time");
    time.dateTime = new Date(timer.endsAt).toISOString();
    time.textContent = `${formatRemaining(timer.endsAt - now)} left`;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.id = timer.id;
    cancel.textContent = "Cancel";

    content.append(title, time);
    item.append(content, cancel);
    fragment.append(item);
  }

  listEl.append(fragment);
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return `${minutes}m ${pad(seconds)}s`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function makeAlarmName(timerId, kind) {
  return `${ALARM_PREFIX}${timerId}:${kind}`;
}

async function getTimers() {
  const result = await chrome.storage.local.get(TIMERS_KEY);
  return Array.isArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}

async function setTimers(nextTimers) {
  await chrome.storage.local.set({ [TIMERS_KEY]: nextTimers });
}
