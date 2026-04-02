import {
  STORAGE_KEY, WEEK_KEY, TASKS_KEY, TOTALS_KEY,
  SETTINGS_KEY, ACHIEVEMENTS_KEY, DEFAULT_SETTINGS,
} from "./constants.js";

// ── Date helpers ─────────────────────────────────────────────────────────────

export const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const todayStr     = () => localDateStr();
export const yesterdayStr = () => localDateStr(new Date(Date.now() - 86400000));

// ── Duration ──────────────────────────────────────────────────────────────────

export const getDuration = (mode, s) =>
  ({ focus: s.focus, shortBreak: s.shortBreak, longBreak: s.longBreak }[mode] * 60);

// ── Settings ──────────────────────────────────────────────────────────────────

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    // Deep merge: saved values override defaults (handles new keys added in updates).
    // Reset ambient to "off" on load — browser blocks AudioContext autoplay without user gesture.
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      eq: { ...DEFAULT_SETTINGS.eq, ...(saved.eq || {}) },
      ambient: "off",
      ambientMix: "off",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(data) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch {}
}

// ── Daily data (today's sessions + streak) ────────────────────────────────────

export function loadDailyData() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const t = todayStr(), y = yesterdayStr();
    if (d.date === t) return { todaySessions: d.todaySessions ?? 0, streak: d.streak ?? 0 };
    if (d.date === y) return { todaySessions: 0, streak: d.streak ?? 0 };
    return { todaySessions: 0, streak: 0 };
  } catch {
    return { todaySessions: 0, streak: 0 };
  }
}

export function saveDailyData(todaySessions, streak) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayStr(), todaySessions, streak }));
  } catch {}
}

// ── Week data ─────────────────────────────────────────────────────────────────

export function loadWeekData() {
  try { return JSON.parse(localStorage.getItem(WEEK_KEY) || "{}"); } catch { return {}; }
}

export function saveWeekData(data) {
  try { localStorage.setItem(WEEK_KEY, JSON.stringify(data)); } catch {}
}

// ── All-time totals ───────────────────────────────────────────────────────────

export function loadTotals() {
  try { return JSON.parse(localStorage.getItem(TOTALS_KEY) || "{}"); } catch { return {}; }
}

export function saveTotals(data) {
  try { localStorage.setItem(TOTALS_KEY, JSON.stringify(data)); } catch {}
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function loadTasks() {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || "[]"); } catch { return []; }
}

export function saveTasks(data) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(data)); } catch {}
}

// ── Achievements ──────────────────────────────────────────────────────────────

export function loadAchievements() {
  try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || "[]"); } catch { return []; }
}

export function saveAchievements(arr) {
  try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(arr)); } catch {}
}
