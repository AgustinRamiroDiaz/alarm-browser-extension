type Timer = {
  id: string;
  label: string;
  durationMinutes: number;
  warningMinutes: number;
  originalDurationMs?: number;
  originalWarningMs?: number;
  createdAt: number;
  warningAt: number;
  endsAt: number;
  completedAt?: number;
  pausedAt?: number;
  remainingMs?: number;
};

type TimerAlarmKind = "warning" | "finish";
type TestNotificationResponse =
  | {
      ok: true;
      notificationId: string;
      visibleToChrome: boolean;
    }
  | {
      ok: false;
      error: string;
    };

const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const DEFAULT_DURATION_MINUTES = 25;
const DEFAULT_WARNING_MINUTES = 5;
const MAX_DURATION_MINUTES = 1440;

const form = queryElement<HTMLFormElement>("#timerForm");
const labelInput = queryElement<HTMLInputElement>("#label");
const durationInput = queryElement<HTMLInputElement>("#duration");
const warningInput = queryElement<HTMLInputElement>("#warning");
const errorEl = queryElement<HTMLParagraphElement>("#formError");
const debugTimerForm = queryElement<HTMLFormElement>("#debugTimerForm");
const debugDurationInput = queryElement<HTMLInputElement>("#debugDuration");
const debugWarningInput = queryElement<HTMLInputElement>("#debugWarning");
const debugTimerErrorEl = queryElement<HTMLParagraphElement>("#debugTimerError");
const listEl = queryElement<HTMLUListElement>("#timerList");
const emptyEl = queryElement<HTMLParagraphElement>("#emptyState");
const notificationStatusEl = queryElement<HTMLParagraphElement>("#notificationStatus");
const testNotificationButton = queryElement<HTMLButtonElement>("#testNotification");

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

debugTimerForm.addEventListener("submit", (event) => {
  void handleDebugTimerSubmit(event);
});

durationInput.addEventListener("input", () => {
  capWarningByDuration();
});

warningInput.addEventListener("input", () => {
  capWarningByDuration();
});

debugDurationInput.addEventListener("input", () => {
  capDebugWarningByDuration();
});

debugWarningInput.addEventListener("input", () => {
  capDebugWarningByDuration();
});

listEl.addEventListener("click", (event) => {
  void handleTimerListClick(event);
});

testNotificationButton.addEventListener("click", () => {
  void testNotification();
});

async function initializePopup(): Promise<void> {
  capWarningByDuration();
  capDebugWarningByDuration();
  await renderNotificationStatus();
  timers = await getTimers();
  render();

  renderIntervalId = window.setInterval(render, 1000);
}

async function renderNotificationStatus(): Promise<void> {
  const level = await chrome.notifications.getPermissionLevel();
  const isGranted = level === "granted";

  notificationStatusEl.textContent = isGranted
    ? "Chrome notification access is granted."
    : "Chrome notification access is blocked. Sounds can still play.";
  notificationStatusEl.classList.toggle("blocked", !isGranted);
}

async function testNotification(): Promise<void> {
  notificationStatusEl.textContent = "Creating test notification...";
  notificationStatusEl.classList.remove("blocked");

  try {
    const response = await chrome.runtime.sendMessage({
      target: "timer-background",
      type: "test-notification"
    });
    if (!isTestNotificationResponse(response)) {
      throw new Error(`Unexpected test response: ${JSON.stringify(response)}`);
    }

    if (!response.ok) {
      throw new Error(response.error);
    }

    notificationStatusEl.textContent = response.visibleToChrome
      ? `Test notification accepted: ${response.notificationId}`
      : `Test notification created, but Chrome getAll() did not retain it: ${response.notificationId}`;
    notificationStatusEl.classList.toggle("blocked", !response.visibleToChrome);
  } catch (error) {
    notificationStatusEl.textContent = `Test notification failed: ${formatError(error)}`;
    notificationStatusEl.classList.add("blocked");
  }
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  errorEl.textContent = "";

  capWarningByDuration();

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
    errorEl.textContent = "Warning must be less than the timer duration.";
    return;
  }

  const label = labelInput.value.trim() || `${durationMinutes} minute timer`;
  await createTimer({
    label,
    durationMinutes,
    warningMinutes,
    durationMs: durationMinutes * 60 * 1000,
    warningMs: warningMinutes * 60 * 1000
  });

  form.reset();
  durationInput.value = String(DEFAULT_DURATION_MINUTES);
  warningInput.value = String(DEFAULT_WARNING_MINUTES);
  capWarningByDuration();
  labelInput.focus();
  render();
}

async function handleDebugTimerSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  debugTimerErrorEl.textContent = "";

  capDebugWarningByDuration();

  const durationSeconds = Number(debugDurationInput.value);
  const warningSeconds = Number(debugWarningInput.value);

  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    debugTimerErrorEl.textContent = "Duration must be at least 1 second.";
    return;
  }

  if (!Number.isFinite(warningSeconds) || warningSeconds < 0) {
    debugTimerErrorEl.textContent = "Warning must be 0 seconds or more.";
    return;
  }

  if (warningSeconds >= durationSeconds) {
    debugTimerErrorEl.textContent = "Warning must be less than the timer duration.";
    return;
  }

  await createTimer({
    label: `${durationSeconds} second test`,
    durationMinutes: durationSeconds / 60,
    warningMinutes: warningSeconds / 60,
    durationMs: durationSeconds * 1000,
    warningMs: warningSeconds * 1000
  });

  render();
}

async function createTimer({
  label,
  durationMinutes,
  warningMinutes,
  durationMs,
  warningMs
}: {
  label: string;
  durationMinutes: number;
  warningMinutes: number;
  durationMs: number;
  warningMs: number;
}): Promise<void> {
  const now = Date.now();
  const timer: Timer = {
    id: crypto.randomUUID(),
    label,
    durationMinutes,
    warningMinutes,
    originalDurationMs: durationMs,
    originalWarningMs: warningMs,
    createdAt: now,
    warningAt: now + durationMs - warningMs,
    endsAt: now + durationMs
  };

  timers = sortTimers([...timers, timer]);
  await setTimers(timers);
  await scheduleTimer(timer);
}

async function handleTimerListClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("button[data-id]");
  if (!button) return;

  const timerId = button.dataset.id;
  if (!timerId) return;

  const action = button.dataset.action;
  if (action === "reset") {
    await resetTimer(timerId);
    return;
  }

  if (action === "pause") {
    await pauseTimer(timerId);
    return;
  }

  if (action === "resume") {
    await resumeTimer(timerId);
    return;
  }

  if (action === "remove") {
    await removeTimer(timerId);
    return;
  }
}

async function resetTimer(timerId: string): Promise<void> {
  const timer = timers.find((item) => item.id === timerId);
  if (!timer) return;

  await clearTimerAlarms(timerId);

  const now = Date.now();
  const fullDurationMs = getTimerDurationMs(timer);
  const warningMs = getTimerWarningMs(timer);
  const resetTimer: Timer = {
    ...timer,
    createdAt: now,
    pausedAt: now,
    remainingMs: fullDurationMs,
    warningAt: now + Math.max(0, fullDurationMs - warningMs),
    endsAt: now + fullDurationMs,
    completedAt: undefined
  };

  timers = sortTimers(timers.map((item) => (item.id === timerId ? resetTimer : item)));
  await setTimers(timers);
  render();
}

async function pauseTimer(timerId: string): Promise<void> {
  const timer = timers.find((item) => item.id === timerId);
  if (!timer || isTimerCompleted(timer, Date.now()) || timer.pausedAt) return;

  const now = Date.now();
  const pausedTimer: Timer = {
    ...timer,
    pausedAt: now,
    remainingMs: Math.max(0, timer.endsAt - now)
  };

  await clearTimerAlarms(timerId);
  timers = sortTimers(timers.map((item) => (item.id === timerId ? pausedTimer : item)));
  await setTimers(timers);
  render();
}

async function resumeTimer(timerId: string): Promise<void> {
  const timer = timers.find((item) => item.id === timerId);
  if (!timer || !timer.pausedAt || timer.completedAt) return;

  const now = Date.now();
  const remainingMs = timer.remainingMs ?? getTimerDurationMs(timer);
  const warningMs = getTimerWarningMs(timer);
  const resumedTimer: Timer = {
    ...timer,
    pausedAt: undefined,
    remainingMs: undefined,
    warningAt: now + Math.max(0, remainingMs - warningMs),
    endsAt: now + remainingMs
  };

  timers = sortTimers(timers.map((item) => (item.id === timerId ? resumedTimer : item)));
  await setTimers(timers);
  await scheduleTimer(resumedTimer);
  render();
}

async function removeTimer(timerId: string): Promise<void> {
  timers = timers.filter((timer) => timer.id !== timerId);
  await setTimers(timers);
  await clearTimerAlarms(timerId);
  render();
}

async function clearTimerAlarms(timerId: string): Promise<void> {
  await chrome.alarms.clear(makeAlarmName(timerId, "warning"));
  await chrome.alarms.clear(makeAlarmName(timerId, "finish"));
}

async function scheduleTimer(timer: Timer): Promise<void> {
  if (timer.completedAt || timer.pausedAt) return;

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
  timers = sortTimers(timers);

  emptyEl.classList.toggle("hidden", timers.length > 0);
  listEl.textContent = "";

  const fragment = document.createDocumentFragment();
  for (const timer of timers) {
    const item = document.createElement("li");
    const isCompleted = isTimerCompleted(timer, now);
    const isPaused = isTimerPaused(timer);
    item.className = ["timer", isCompleted ? "completed" : "", isPaused ? "paused" : ""]
      .filter(Boolean)
      .join(" ");

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = timer.label;

    const meta = document.createElement("div");
    meta.className = "timer-meta";

    const warning = document.createElement("time");
    warning.dateTime = new Date(timer.warningAt).toISOString();
    warning.textContent = getWarningText(timer, now);

    const finish = document.createElement("time");
    finish.dateTime = new Date(timer.endsAt).toISOString();
    finish.textContent = getFinishText(timer, now);

    const progress = document.createElement("div");
    progress.className = "timer-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `${timer.label} progress`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");

    const progressValue = getProgressPercent(timer, now);
    progress.setAttribute("aria-valuenow", String(Math.round(progressValue)));

    const progressFill = document.createElement("div");
    progressFill.className = "timer-progress-fill";
    progressFill.style.width = `${progressValue}%`;
    progress.append(progressFill);

    const actions = document.createElement("div");
    actions.className = "timer-actions";

    actions.append(
      createTimerActionButton({
        timerId: timer.id,
        action: "remove",
        label: "Remove",
        icon: "×"
      }),
      createTimerActionButton({
        timerId: timer.id,
        action: "reset",
        label: "Reset",
        icon: "↻"
      })
    );

    if (!isCompleted) {
      actions.append(
        createTimerActionButton({
          timerId: timer.id,
          action: isPaused ? "resume" : "pause",
          label: isPaused ? "Resume" : "Pause",
          icon: isPaused ? "▶" : "⏸"
        })
      );
    }
    meta.append(warning, finish);
    content.append(title, meta, progress);
    item.append(content, actions);
    fragment.append(item);
  }

  listEl.append(fragment);
}

function createTimerActionButton({
  timerId,
  action,
  label,
  icon
}: {
  timerId: string;
  action: "pause" | "resume" | "reset" | "remove";
  label: string;
  icon: string;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.id = timerId;
  button.dataset.action = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = icon;

  return button;
}

function capWarningByDuration(): void {
  const durationMinutes = readNumberInput(durationInput);
  const maxWarningMinutes = getMaxWarningMinutes(durationMinutes);
  warningInput.max = String(maxWarningMinutes);

  const warningMinutes = readNumberInput(warningInput);
  if (warningMinutes > maxWarningMinutes) {
    warningInput.value = String(maxWarningMinutes);
  }
}

function capDebugWarningByDuration(): void {
  const durationSeconds = readNumberInput(debugDurationInput);
  const maxWarningSeconds = getMaxWarningSeconds(durationSeconds);
  debugWarningInput.max = String(maxWarningSeconds);

  const warningSeconds = readNumberInput(debugWarningInput);
  if (warningSeconds > maxWarningSeconds) {
    debugWarningInput.value = String(maxWarningSeconds);
  }
}

function getWarningText(timer: Timer, now: number): string {
  if (isTimerCompleted(timer, now)) {
    return timer.warningMinutes > 0 ? "Warning sent" : "No warning";
  }

  if (isTimerPaused(timer)) {
    return timer.warningMinutes > 0 ? "Warning paused" : "No warning";
  }

  if (timer.warningMinutes <= 0) {
    return "No warning";
  }

  if (timer.warningAt <= now) {
    return "Warning sent";
  }

  return `Warning in ${formatRemaining(timer.warningAt - now)}`;
}

function getFinishText(timer: Timer, now: number): string {
  if (isTimerCompleted(timer, now)) {
    const completedAt = timer.completedAt ?? timer.endsAt;
    return `Finished ${formatTime(completedAt)}`;
  }

  if (isTimerPaused(timer)) {
    return `Paused with ${formatRemaining(timer.remainingMs ?? timer.endsAt - now)} left`;
  }

  return `Finishes in ${formatRemaining(timer.endsAt - now)}`;
}

function getProgressPercent(timer: Timer, now: number): number {
  if (isTimerCompleted(timer, now)) {
    return 100;
  }

  const totalMs = getTimerDurationMs(timer);
  const remainingMs = isTimerPaused(timer)
    ? timer.remainingMs ?? totalMs
    : Math.max(0, timer.endsAt - now);
  const elapsedMs = totalMs - remainingMs;

  return clamp((elapsedMs / totalMs) * 100, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isTimerCompleted(timer: Timer, now: number): boolean {
  if (timer.pausedAt) return Boolean(timer.completedAt);

  return Boolean(timer.completedAt) || timer.endsAt <= now;
}

function isTimerPaused(timer: Timer): boolean {
  return Boolean(timer.pausedAt) && !timer.completedAt;
}

function sortTimers(nextTimers: Timer[]): Timer[] {
  const now = Date.now();

  return [...nextTimers].sort((a, b) => {
    const aCompleted = isTimerCompleted(a, now);
    const bCompleted = isTimerCompleted(b, now);

    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }

    return a.endsAt - b.endsAt;
  });
}

function getMaxWarningMinutes(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_DURATION_MINUTES - 1, Math.floor(durationMinutes) - 1));
}

function getMaxWarningSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return 0;
  }

  return Math.max(0, Math.floor(durationSeconds) - 1);
}

function getTimerDurationMs(timer: Timer): number {
  return Math.max(1, timer.originalDurationMs ?? timer.endsAt - timer.createdAt);
}

function getTimerWarningMs(timer: Timer): number {
  return Math.max(0, timer.originalWarningMs ?? timer.warningMinutes * 60 * 1000);
}

function readNumberInput(input: HTMLInputElement): number {
  return Number(input.value);
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

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
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

function isTestNotificationResponse(value: unknown): value is TestNotificationResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<TestNotificationResponse>;
  if (candidate.ok === false) {
    return typeof candidate.error === "string";
  }

  return (
    candidate.ok === true &&
    typeof candidate.notificationId === "string" &&
    typeof candidate.visibleToChrome === "boolean"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queryElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

export {};
