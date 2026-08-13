const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const ICON_PATH = "icons/timer-128.png";
const ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACR0lEQVR4nO3YMY4UURBEwb0JSIi74XF3TJzFxliBYH5n1q8wnt+dFTPSzNvX79/etbe39AMIAAEgAASAABAAAkAACAABIAAEgAD4rfefP2pLbwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwCQABIAAEgAAQAALg4zb+tFsNwG/9pQD86bMUQPqfv+kQxgJIH/0WCOMApI98G4RRANKHvRHBCADpY94MoR5A+oC3I6gGcOIYXz59/mObENQCOPVpTAFoRVAJ4OTXcRJAI4I6ACfHbwDQhqAKwOnhWwA0IagB8MToTQBaEAAAQP4hnhq8DUADgjiAJ8duBJBGAAAAe47fCiCJAAAA9hy/GUAKAQAA7Dl+O4AEAgAA2HP8CQCeRgAAAAAAAAAAG44/BcCTCAAAAAAAAAAAAAAAAAAAAACIPyMAYQANCAAIA0hDAKAEQAoBAIUgAFgO4EkIABQDeAICAAMAnEQAwCAEJyAAMBDBKyFcCaAdQQuEJ+8BwEEIAAwG8AoIAFwA4H8QAHARgn+B0H58AA5DAOBiBH8Dof34ABxGAMASBK8odQMASloJAILs8QEoaTWA7QjS21cA2IogvTkAAPQA2IYgvXUlgC0I0htXA7gdQXrbEQBuRZDedBSA2xCktxwJ4BYE6Q1HA5iOIL3dFQAmQkhvdSWAKQjSG10NoBlCepNVAJogpDdYDSAJIf3OAIQgpN8RgIdBpN8BAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAD6uF+H1VmaGhp0uQAAAABJRU5ErkJggg==";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
let creatingOffscreenDocument = null;
chrome.runtime.onInstalled.addListener(() => {
    void restoreScheduledAlarms();
});
chrome.runtime.onStartup.addListener(() => {
    void restoreScheduledAlarms();
});
chrome.alarms.onAlarm.addListener((alarm) => {
    void handleAlarm(alarm);
});
chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    console.info("Timer notification closed:", { notificationId, byUser });
});
chrome.notifications.onClicked.addListener((notificationId) => {
    console.info("Timer notification clicked:", { notificationId });
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isTestNotificationMessage(message))
        return false;
    void createTestNotification()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
        console.warn("Test notification failed:", error);
        sendResponse({ ok: false, error: formatError(error) });
    });
    return true;
});
async function handleAlarm(alarm) {
    const parsed = parseAlarmName(alarm.name);
    if (!parsed)
        return;
    const timers = await getTimers();
    const timer = timers.find((item) => item.id === parsed.timerId);
    if (!timer)
        return;
    if (timer.completedAt)
        return;
    if (timer.pausedAt)
        return;
    if (parsed.kind === "warning") {
        if (Date.now() >= timer.endsAt)
            return;
        const minutesLeft = Math.max(1, Math.round((timer.endsAt - Date.now()) / 60000));
        await notifyAndPlaySound("warning", `warning:${timer.id}:${Date.now()}`, {
            title: "Timer warning",
            message: `${timer.label} ends in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`
        });
        return;
    }
    const completedAt = Date.now();
    await notifyAndPlaySound("finish", `finish:${timer.id}:${completedAt}`, {
        title: "Timer finished",
        message: timer.label
    });
    await setTimers(timers.map((item) => (item.id === timer.id ? { ...item, completedAt } : item)));
    await chrome.alarms.clear(makeAlarmName(timer.id, "warning"));
}
async function restoreScheduledAlarms() {
    const timers = await getTimers();
    const now = Date.now();
    const activeTimers = [];
    for (const timer of timers) {
        if (timer.completedAt) {
            activeTimers.push(timer);
            continue;
        }
        if (timer.pausedAt) {
            activeTimers.push(timer);
            continue;
        }
        if (timer.endsAt <= now) {
            await notifyAndPlaySound("finish", `missed:${timer.id}:${now}`, {
                title: "Timer finished",
                message: timer.label
            });
            activeTimers.push({ ...timer, completedAt: now });
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
async function notifyAndPlaySound(sound, notificationId, notification) {
    const results = await Promise.allSettled([
        showNotification(notificationId, notification),
        playTimerSound(sound)
    ]);
    for (const result of results) {
        if (result.status === "rejected") {
            console.warn("Timer notification side effect failed:", result.reason);
        }
    }
}
async function showNotification(notificationId, notification) {
    const createdId = await createNotificationWithIconFallback(notificationId, {
        type: "basic",
        title: notification.title,
        message: notification.message,
        contextMessage: "Timer Warnings",
        eventTime: Date.now(),
        priority: 2,
        requireInteraction: true
    });
    const activeNotifications = await chrome.notifications.getAll();
    console.info("Timer notification created:", {
        requestedId: notificationId,
        createdId,
        visibleToChrome: Object.hasOwn(activeNotifications, createdId)
    });
}
async function playTimerSound(sound) {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
        target: "timer-audio",
        type: "play-sound",
        sound
    });
}
async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl]
    });
    if (contexts.length > 0)
        return;
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
function makeAlarmName(timerId, kind) {
    return `${ALARM_PREFIX}${timerId}:${kind}`;
}
function parseAlarmName(name) {
    if (!name.startsWith(ALARM_PREFIX))
        return null;
    const match = /^timer:([^:]+):(warning|finish)$/.exec(name);
    if (!match)
        return null;
    return { timerId: match[1], kind: match[2] };
}
async function getTimers() {
    const result = await chrome.storage.local.get(TIMERS_KEY);
    return isTimerArray(result[TIMERS_KEY]) ? result[TIMERS_KEY] : [];
}
async function setTimers(timers) {
    await chrome.storage.local.set({ [TIMERS_KEY]: timers });
}
function isTimerArray(value) {
    return Array.isArray(value);
}
async function createTestNotification() {
    const notificationId = `test:${Date.now()}`;
    const createdId = await createNotificationWithIconFallback(notificationId, {
        type: "basic",
        title: "Timer test notification",
        message: "If banners are enabled, this should appear now.",
        contextMessage: "Timer Warnings",
        eventTime: Date.now(),
        priority: 2,
        requireInteraction: true
    });
    const activeNotifications = await chrome.notifications.getAll();
    console.info("Test notification created:", {
        requestedId: notificationId,
        createdId,
        activeNotifications
    });
    return {
        notificationId: createdId,
        visibleToChrome: Object.hasOwn(activeNotifications, createdId)
    };
}
async function createNotificationWithIconFallback(notificationId, options) {
    try {
        return await chrome.notifications.create(notificationId, {
            ...options,
            iconUrl: chrome.runtime.getURL(ICON_PATH)
        });
    }
    catch (error) {
        if (!isImageDownloadError(error)) {
            throw error;
        }
        console.warn("Notification icon file failed to load; retrying with embedded PNG icon.", error);
        return chrome.notifications.create(notificationId, {
            ...options,
            iconUrl: ICON_DATA_URL
        });
    }
}
function isTestNotificationMessage(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return candidate.target === "timer-background" && candidate.type === "test-notification";
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
function isImageDownloadError(error) {
    return formatError(error).includes("Unable to download all specified images");
}
export {};
