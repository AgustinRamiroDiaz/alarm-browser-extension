const TIMERS_KEY = "timers";
const ALARM_PREFIX = "timer:";
const ICON_URL = "icons/timer-128.png";
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
async function handleAlarm(alarm) {
    const parsed = parseAlarmName(alarm.name);
    if (!parsed)
        return;
    const timers = await getTimers();
    const timer = timers.find((item) => item.id === parsed.timerId);
    if (!timer)
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
    await notifyAndPlaySound("finish", `finish:${timer.id}:${Date.now()}`, {
        title: "Timer finished",
        message: timer.label
    });
    await setTimers(timers.filter((item) => item.id !== timer.id));
    await chrome.alarms.clear(makeAlarmName(timer.id, "warning"));
}
async function restoreScheduledAlarms() {
    const timers = await getTimers();
    const now = Date.now();
    const activeTimers = [];
    for (const timer of timers) {
        if (timer.endsAt <= now) {
            await notifyAndPlaySound("finish", `missed:${timer.id}:${now}`, {
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
    await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: ICON_URL,
        title: notification.title,
        message: notification.message
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
export {};
