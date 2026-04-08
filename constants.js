export const R = 108;
export const C = 2 * Math.PI * R;
export const MODES = ["focus", "shortBreak", "longBreak"];

export const STORAGE_KEY      = "pomodoro_data";
export const WEEK_KEY         = "pomodoro_week";
export const TASKS_KEY        = "focus_tasks";
export const TOTALS_KEY       = "focus_totals";
export const SETTINGS_KEY     = "focus_settings";
export const ACHIEVEMENTS_KEY = "focus_achievements";
export const GAME_HIGHSCORE_KEYS = {
  breakout: "focuspartner_hs_breakout",
  blockgrid: "focuspartner_hs_blockgrid",
  crystal: "focuspartner_hs_crystal",
  memory: "focuspartner_hs_memory",
  sudoku: "focuspartner_hs_sudoku",
};

export const DEFAULT_SETTINGS = {
  focus: 25, shortBreak: 5, longBreak: 15,
  autoStart: false, sound: true, tick: false, longBreakInterval: 4,
  ambient: "off", ambientMix: "off", ambientCategory: "neural", dailyGoal: 8,
  eq: { sub: 0, bass: 0, lowMid: 0, mid: 0, upperMid: 0, presence: 0, air: 0 },
  eqMode: "basic",
  ambientVolume: 0.75,
  lightMode: false,
  lang: "de",
  accentColor: "#e07b39",
  autoDark: true,
  ambientMixRatio: 0.5,
  uiScale: "M",
};

export const ACHIEVEMENT_DEFS = [
  { id: "first",    icon: "🎯", de: "Erste Session",    en: "First session",    check: (t)    => (t.sessions ?? 0) >= 1   },
  { id: "ten",      icon: "🏅", de: "10 Sessions",       en: "10 sessions",      check: (t)    => (t.sessions ?? 0) >= 10  },
  { id: "fifty",    icon: "⭐", de: "50 Sessions",       en: "50 sessions",      check: (t)    => (t.sessions ?? 0) >= 50  },
  { id: "hundred",  icon: "💯", de: "100 Sessions",      en: "100 sessions",     check: (t)    => (t.sessions ?? 0) >= 100 },
  { id: "streak3",  icon: "🔥", de: "3-Tage-Serie",      en: "3-day streak",     check: (t, s) => s >= 3  },
  { id: "streak7",  icon: "⚡", de: "Wochenkrieger",     en: "Week warrior",     check: (t, s) => s >= 7  },
  { id: "streak30", icon: "🌟", de: "Monats-Meister",    en: "Monthly master",   check: (t, s) => s >= 30 },
  { id: "hours10",  icon: "⏱",  de: "10 Stunden Fokus", en: "10 hours focused", check: (t)    => (t.minutes ?? 0) >= 600  },
];
