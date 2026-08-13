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

const form = queryElement<HTMLFormElement>("#timerForm");
const labelInput = queryElement<HTMLInputElement>("#label");
const durationInput = queryElement<HTMLInputElement>("#duration");
const warningInput = queryElement<HTMLInputElement>("#warning");
const errorEl = queryElement<HTMLParagraphElement>("#formError");
const listEl = queryElement<HTMLUListElement>("#timerList");
const emptyEl = queryElement<HTMLParagraphElement>("#emptyState");
const summaryEl = queryElement<HTMLParagraphElement>("#summary");

let timers: Timer[] = [];
let renderIntervalId: number | null = null;

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup();
});

window.addEventListener("unload", () => {
  if (renderIntervalId) {
    window.clearInterval(renderIntervalId);
  }
});

form.addEventListener("submit", (event) => {
  void handleSubmit(event);
});

listEl.addEventListener("click", (event) => {
  void handleTimerListClick(event);
});

async function initializePopup(): Promise<void> {
  timers = await getTimers();
  render();

  renderIntervalId = window.setInterval(render, 1000);
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
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
  const timer: Timer = {
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
}

async function handleTimerListClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("button[data-id]");
  if (!button) return;

  const timerId = button.dataset.id;
  if (!timerId) return;

  timers = timers.filter((timer) => timer.id !== timerId);
  await setTimers(timers);
  await chrome.alarms.clear(makeAlarmName(timerId, "warning"));
  await chrome.alarms.clear(makeAlarmName(timerId, "finish"));
  render();
}

async function scheduleTimer(timer: Timer): Promise<void> {
  await chrome.alarms.create(makeAlarmName(timer.id, "finish"), {
    when: timer.endsAt
  });

  if (timer.warningMinutes > 0) {
    await chrome.alarms.create(makeAlarmName(timer.id, "warning"), {
      when: timer.warningAt
    });
  }
}

function render(): void {
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

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return `${minutes}m ${pad(seconds)}s`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function makeAlarmName(timerId: string, kind: TimerAlarmKind): string {
  return `${ALARM_PREFIX}${timerId}:${kind}`;
}

async function getTimers(): Promise<Timer[]> {
  const result = await chrome.storage.local.get(TIMERS_KEY);
  return isTimerArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}

async function setTimers(nextTimers: Timer[]): Promise<void> {
  await chrome.storage.local.set({ [TIMERS_KEY]: nextTimers });
}

function isTimerArray(value: unknown): value is Timer[] {
  return Array.isArray(value);
}

function queryElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

export {};
