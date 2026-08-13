const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const DEFAULT_DURATION_MINUTES = 25;
const DEFAULT_WARNING_MINUTES = 5;
const MAX_DURATION_MINUTES = 1440;
const form = queryElement("#timerForm");
const labelInput = queryElement("#label");
const durationInput = queryElement("#duration");
const warningInput = queryElement("#warning");
const errorEl = queryElement("#formError");
const listEl = queryElement("#timerList");
const emptyEl = queryElement("#emptyState");
const notificationStatusEl = queryElement("#notificationStatus");
const testNotificationButton = queryElement("#testNotification");
let timers = [];
let renderIntervalId = null;
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
durationInput.addEventListener("input", () => {
    capWarningByDuration();
});
warningInput.addEventListener("input", () => {
    capWarningByDuration();
});
listEl.addEventListener("click", (event) => {
    void handleTimerListClick(event);
});
testNotificationButton.addEventListener("click", () => {
    void testNotification();
});
async function initializePopup() {
    capWarningByDuration();
    await renderNotificationStatus();
    timers = await getTimers();
    render();
    renderIntervalId = window.setInterval(render, 1000);
}
async function renderNotificationStatus() {
    const level = await chrome.notifications.getPermissionLevel();
    const isGranted = level === "granted";
    notificationStatusEl.textContent = isGranted
        ? "Chrome notification access is granted."
        : "Chrome notification access is blocked. Sounds can still play.";
    notificationStatusEl.classList.toggle("blocked", !isGranted);
}
async function testNotification() {
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
    }
    catch (error) {
        notificationStatusEl.textContent = `Test notification failed: ${formatError(error)}`;
        notificationStatusEl.classList.add("blocked");
    }
}
async function handleSubmit(event) {
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
    timers = sortTimers([...timers, timer]);
    await setTimers(timers);
    await scheduleTimer(timer);
    form.reset();
    durationInput.value = String(DEFAULT_DURATION_MINUTES);
    warningInput.value = String(DEFAULT_WARNING_MINUTES);
    capWarningByDuration();
    labelInput.focus();
    render();
}
async function handleTimerListClick(event) {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const button = target.closest("button[data-id]");
    if (!button)
        return;
    const timerId = button.dataset.id;
    if (!timerId)
        return;
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
async function resetTimer(timerId) {
    const timer = timers.find((item) => item.id === timerId);
    if (!timer)
        return;
    await clearTimerAlarms(timerId);
    const now = Date.now();
    const fullDurationMs = timer.durationMinutes * 60 * 1000;
    const resetTimer = {
        ...timer,
        createdAt: now,
        pausedAt: now,
        remainingMs: fullDurationMs,
        warningAt: now + (timer.durationMinutes - timer.warningMinutes) * 60 * 1000,
        endsAt: now + timer.durationMinutes * 60 * 1000,
        completedAt: undefined
    };
    timers = sortTimers(timers.map((item) => (item.id === timerId ? resetTimer : item)));
    await setTimers(timers);
    render();
}
async function pauseTimer(timerId) {
    const timer = timers.find((item) => item.id === timerId);
    if (!timer || isTimerCompleted(timer, Date.now()) || timer.pausedAt)
        return;
    const now = Date.now();
    const pausedTimer = {
        ...timer,
        pausedAt: now,
        remainingMs: Math.max(0, timer.endsAt - now)
    };
    await clearTimerAlarms(timerId);
    timers = sortTimers(timers.map((item) => (item.id === timerId ? pausedTimer : item)));
    await setTimers(timers);
    render();
}
async function resumeTimer(timerId) {
    const timer = timers.find((item) => item.id === timerId);
    if (!timer || !timer.pausedAt || timer.completedAt)
        return;
    const now = Date.now();
    const remainingMs = timer.remainingMs ?? timer.durationMinutes * 60 * 1000;
    const resumedTimer = {
        ...timer,
        pausedAt: undefined,
        remainingMs: undefined,
        warningAt: now + Math.max(0, remainingMs - timer.warningMinutes * 60 * 1000),
        endsAt: now + remainingMs
    };
    timers = sortTimers(timers.map((item) => (item.id === timerId ? resumedTimer : item)));
    await setTimers(timers);
    await scheduleTimer(resumedTimer);
    render();
}
async function removeTimer(timerId) {
    timers = timers.filter((timer) => timer.id !== timerId);
    await setTimers(timers);
    await clearTimerAlarms(timerId);
    render();
}
async function clearTimerAlarms(timerId) {
    await chrome.alarms.clear(makeAlarmName(timerId, "warning"));
    await chrome.alarms.clear(makeAlarmName(timerId, "finish"));
}
async function scheduleTimer(timer) {
    if (timer.completedAt || timer.pausedAt)
        return;
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
        const actions = document.createElement("div");
        actions.className = "timer-actions";
        if (!isCompleted) {
            const togglePause = document.createElement("button");
            togglePause.type = "button";
            togglePause.dataset.id = timer.id;
            togglePause.dataset.action = isPaused ? "resume" : "pause";
            togglePause.textContent = isPaused ? "Resume" : "Pause";
            actions.append(togglePause);
        }
        const reset = document.createElement("button");
        reset.type = "button";
        reset.dataset.id = timer.id;
        reset.dataset.action = "reset";
        reset.textContent = "Reset";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.id = timer.id;
        remove.dataset.action = "remove";
        remove.textContent = "Remove";
        actions.append(reset, remove);
        meta.append(warning, finish);
        content.append(title, meta);
        item.append(content, actions);
        fragment.append(item);
    }
    listEl.append(fragment);
}
function capWarningByDuration() {
    const durationMinutes = readNumberInput(durationInput);
    const maxWarningMinutes = getMaxWarningMinutes(durationMinutes);
    warningInput.max = String(maxWarningMinutes);
    const warningMinutes = readNumberInput(warningInput);
    if (warningMinutes > maxWarningMinutes) {
        warningInput.value = String(maxWarningMinutes);
    }
}
function getWarningText(timer, now) {
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
function getFinishText(timer, now) {
    if (isTimerCompleted(timer, now)) {
        const completedAt = timer.completedAt ?? timer.endsAt;
        return `Finished ${formatTime(completedAt)}`;
    }
    if (isTimerPaused(timer)) {
        return `Paused with ${formatRemaining(timer.remainingMs ?? timer.endsAt - now)} left`;
    }
    return `Finishes in ${formatRemaining(timer.endsAt - now)}`;
}
function isTimerCompleted(timer, now) {
    if (timer.pausedAt)
        return Boolean(timer.completedAt);
    return Boolean(timer.completedAt) || timer.endsAt <= now;
}
function isTimerPaused(timer) {
    return Boolean(timer.pausedAt) && !timer.completedAt;
}
function sortTimers(nextTimers) {
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
function getMaxWarningMinutes(durationMinutes) {
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        return 0;
    }
    return Math.max(0, Math.min(MAX_DURATION_MINUTES - 1, Math.floor(durationMinutes) - 1));
}
function readNumberInput(input) {
    return Number(input.value);
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
function formatTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(timestamp));
}
function pad(value) {
    return String(value).padStart(2, "0");
}
function makeAlarmName(timerId, kind) {
    return `${ALARM_PREFIX}${timerId}:${kind}`;
}
async function getTimers() {
    const result = await chrome.storage.local.get(TIMERS_KEY);
    return isTimerArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}
async function setTimers(nextTimers) {
    await chrome.storage.local.set({ [TIMERS_KEY]: nextTimers });
}
function isTimerArray(value) {
    return Array.isArray(value);
}
function isTestNotificationResponse(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    if (candidate.ok === false) {
        return typeof candidate.error === "string";
    }
    return (candidate.ok === true &&
        typeof candidate.notificationId === "string" &&
        typeof candidate.visibleToChrome === "boolean");
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
function queryElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}
export {};
