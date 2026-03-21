import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const R = 108;
const C = 2 * Math.PI * R;
const MODES = ["focus", "shortBreak", "longBreak"];
const STORAGE_KEY = "pomodoro_data";
const WEEK_KEY = "pomodoro_week";
const TASKS_KEY = "focus_tasks";
const TOTALS_KEY = "focus_totals";
const PRESETS_KEY = "focus_presets";
const SETTINGS_KEY = "focus_settings";
const ACHIEVEMENTS_KEY = "focus_achievements";

const DEFAULT_SETTINGS = {
  focus: 25, shortBreak: 5, longBreak: 15,
  autoStart: false, sound: true, tick: false, longBreakInterval: 4,
  ambient: "off", ambientMix: "off", ambientCategory: "neural", dailyGoal: 8,
  eq: { sub: 0, bass: 0, lowMid: 0, mid: 0, upperMid: 0, presence: 0, air: 0 },
  eqMode: "basic",
  ambientVolume: 0.75,
  lightMode: false,
  lang: "de",
  accentColor: "#e07b39",
  autoDark: true,       // follow system prefers-color-scheme
  ambientAutoStop: 0,   // 0=off, minutes until ambient stops (options: 30, 60, 120)
  ambientMixRatio: 0.5, // ratio for mix secondary sound (0=silent, 1=same as main)
  clockSize: "M",       // "S" | "M" | "L" — timer clock font size
  bgStyle: "none",      // "none" | "glow" | "dots" — subtle background texture
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    // Deep merge: saved values override defaults (handles new keys added in updates)
    // Reset ambient to "off" on load — browser blocks AudioContext autoplay without user gesture
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      eq: { ...DEFAULT_SETTINGS.eq, ...(saved.eq || {}) },
      ambient: "off",
      ambientMix: "off",
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

const getDuration = (mode, s) =>
  ({ focus: s.focus, shortBreak: s.shortBreak, longBreak: s.longBreak }[mode] * 60);

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = () => localDateStr();
const yesterdayStr = () => localDateStr(new Date(Date.now() - 86400000));

const makeNoiseBuffer = (ctx, secs) => {
  const size = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buf;
};

const makeBrownNoiseBuffer = (ctx, secs) => {
  const size = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < size; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5; // normalize to audible range
  }
  return buf;
};

function loadDailyData() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const t = todayStr(), y = yesterdayStr();
    if (d.date === t) return { todaySessions: d.todaySessions ?? 0, streak: d.streak ?? 0 };
    if (d.date === y) return { todaySessions: 0, streak: d.streak ?? 0 };
    return { todaySessions: 0, streak: 0 };
  } catch { return { todaySessions: 0, streak: 0 }; }
}

function saveDailyData(todaySessions, streak) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayStr(), todaySessions, streak }));
  } catch {}
}

function loadWeekData() {
  try { return JSON.parse(localStorage.getItem(WEEK_KEY) || "{}"); } catch { return {}; }
}

function saveWeekData(data) {
  try { localStorage.setItem(WEEK_KEY, JSON.stringify(data)); } catch {}
}

function loadTotals() {
  try { return JSON.parse(localStorage.getItem(TOTALS_KEY) || "{}"); } catch { return {}; }
}

function saveTotals(data) {
  try { localStorage.setItem(TOTALS_KEY, JSON.stringify(data)); } catch {}
}

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[null,null,null]"); } catch { return [null, null, null]; }
}

function savePresetsData(data) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(data)); } catch {}
}

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || "[]"); } catch { return []; }
}
function saveAchievements(arr) {
  try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(arr)); } catch {}
}

function DurationInput({ value, onChange, max = 60, style }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const v = Math.max(1, Math.min(max, parseInt(local) || 1));
    setLocal(String(v));
    onChange(v);
  };
  return (
    <input
      type="number" min={1} max={max} value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === "Enter" && commit()}
      className="pomodoro-input"
      style={style}
    />
  );
}

const ACHIEVEMENT_DEFS = [
  { id: "first",    icon: "🎯", de: "Erste Session",        en: "First session",       check: (t) => (t.sessions ?? 0) >= 1   },
  { id: "ten",      icon: "🏅", de: "10 Sessions",           en: "10 sessions",         check: (t) => (t.sessions ?? 0) >= 10  },
  { id: "fifty",    icon: "⭐", de: "50 Sessions",           en: "50 sessions",         check: (t) => (t.sessions ?? 0) >= 50  },
  { id: "hundred",  icon: "💯", de: "100 Sessions",          en: "100 sessions",        check: (t) => (t.sessions ?? 0) >= 100 },
  { id: "streak3",  icon: "🔥", de: "3-Tage-Serie",          en: "3-day streak",        check: (t, s) => s >= 3 },
  { id: "streak7",  icon: "⚡", de: "Wochenkrieger",         en: "Week warrior",        check: (t, s) => s >= 7 },
  { id: "streak30", icon: "🌟", de: "Monats-Meister",        en: "Monthly master",      check: (t, s) => s >= 30 },
  { id: "hours10",  icon: "⏱",  de: "10 Stunden Fokus",     en: "10 hours focused",    check: (t) => (t.minutes ?? 0) >= 600  },
];

export default function PomodoroTimer() {
  const [mode, setMode] = useState("focus");
  const [settings, setSettings] = useState(() => loadSettings());
  const [timeLeft, setTimeLeft] = useState(() => { const s = loadSettings(); return s.focus * 60; });
  const [isRunning, setIsRunning] = useState(false);
  const [breakCycleCount, setBreakCycleCount] = useState(() => loadDailyData().todaySessions);
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [flash, setFlash] = useState(false);
  const [digitPop, setDigitPop] = useState(false);
  const [ringTransition, setRingTransition] = useState(true);
  const [ringFadeIn, setRingFadeIn] = useState(false);
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TASKS_KEY) || "[]"); } catch { return []; }
  });
  const [taskInput, setTaskInput] = useState("");
  const [todaySessions, setTodaySessions] = useState(() => loadDailyData().todaySessions);
  const [streak, setStreak] = useState(() => loadDailyData().streak);
  const [weekData, setWeekData] = useState(() => loadWeekData());
  const [totals, setTotals] = useState(() => loadTotals());
  const [presets, setPresets] = useState(() => loadPresets());

  const [minimalMode, setMinimalMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("focus_welcomed"));
  const [achievements, setAchievements] = useState(() => loadAchievements());
  const [newAchievement, setNewAchievement] = useState(null); // { icon, name } for toast
  const [showDaySummary, setShowDaySummary] = useState(false);
  const [breathPhase, setBreathPhase] = useState("inhale"); // "inhale" | "hold" | "exhale"

  const [ytVideoId, setYtVideoId] = useState(null);
  const [ytActivated, setYtActivated] = useState(false);
  const ytActivatedRef = useRef(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientRef = useRef(null);
  const ambientRef2 = useRef(null);
  const eqRef = useRef(null);
  const volumeGainRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytApiReadyRef = useRef(false);
  const previewTimeoutRef = useRef(null);
  const isPreviewingRef = useRef(false);
  const previewMixTimeoutRef = useRef(null);
  const isPreviewingMixRef = useRef(false);
  const modeRef = useRef(mode);
  const sessionsRef = useRef(breakCycleCount);
  const settingsRef = useRef(settings);
  const isRunningRef = useRef(isRunning);
  const completedRef = useRef(false);
  const todaySessionsRef = useRef(todaySessions);
  const streakRef = useRef(streak);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionsRef.current = breakCycleCount; }, [breakCycleCount]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { todaySessionsRef.current = todaySessions; }, [todaySessions]);
  useEffect(() => { streakRef.current = streak; }, [streak]);

  // Styles + keyframes (static — once)
  useEffect(() => {
    const id = "pomodoro-styles-static";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
      @keyframes ringPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      @keyframes ringFlash { 0%,100%{stroke:var(--accent,#e07b39);opacity:1} 25%,75%{stroke:#fff;opacity:0.95} 50%{stroke:var(--accent,#e07b39);opacity:0.7} }
      @keyframes digitPop { 0%{transform:scale(1)} 45%{transform:scale(1.09)} 100%{transform:scale(1)} }
      @keyframes panelFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes overlayIn { from{opacity:0} to{opacity:1} }
      @keyframes ringFadeIn { from{opacity:0;filter:drop-shadow(0 0 0px transparent)} to{opacity:1;filter:drop-shadow(0 0 6px var(--accent,#e07b39))} }
      .pomodoro-input::-webkit-inner-spin-button,
      .pomodoro-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0 }
      .pomodoro-input { -moz-appearance:textfield; user-select:text; -webkit-user-select:text }
      .pomodoro-input:focus { outline:none; border-color:var(--accent,#e07b39) !important }
      input, textarea { user-select:text; -webkit-user-select:text }
    `;
    document.head.appendChild(el);
    return () => { const e = document.getElementById(id); if (e) e.remove(); };
  }, []);

  // Dynamic hover styles (light/dark + accent color)
  useEffect(() => {
    const id = "pomodoro-styles-dynamic";
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    const rowHover  = settings.lightMode ? "#e4dfd6" : "#131313";
    const optHover  = settings.lightMode ? "#c8c2b8" : "#2e2e2e";
    const iconHover = settings.lightMode ? "#333" : "#555";
    const acc = settings.accentColor ?? "#e07b39";
    const bg  = settings.lightMode ? "#f5f0ea" : "#0a0a0a";
    el.textContent = `
      :root { --accent: ${acc}; }
      html, body { background: ${bg} !important; }
      .task-row:hover { background:${rowHover} !important }
      .ambient-opt:hover { border-color:${optHover} !important }
      .icon-btn:hover { color:${iconHover} !important }
      .pomodoro-input:focus { outline:none; border-color:${acc} !important }
    `;
  }, [settings.lightMode, settings.accentColor]);

  // Tab title
  useEffect(() => {
    document.title = "Focus Partner";
  }, []);

  // Auto-dark: follow system prefers-color-scheme when autoDark is enabled
  useEffect(() => {
    if (!settings.autoDark) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (e) => setSettings(s => ({ ...s, lightMode: !e.matches }));
    apply(mq); // apply immediately
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.autoDark]);

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // Persist tasks
  useEffect(() => {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {}
  }, [tasks]);

  // Pause/resume AudioContext when tab is hidden/visible (save CPU)
  useEffect(() => {
    const handler = () => {
      if (!audioCtxRef.current) return;
      if (document.hidden) audioCtxRef.current.suspend().catch(() => {});
      else audioCtxRef.current.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Audio
  const getCtx = useCallback(() => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  }, []);

  const playChime = useCallback(() => {
    if (!settingsRef.current.sound) return;
    try {
      const ctx = getCtx();
      [[523.25, 0], [659.25, 0.13], [783.99, 0.26], [1046.5, 0.41]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.start(t); osc.stop(t + 0.7);
      });
    } catch (_) {}
  }, [getCtx]);

  const playTick = useCallback(() => {
    const { sound, tick } = settingsRef.current;
    if (!sound || !tick) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine";
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    } catch (_) {}
  }, [getCtx]);

  // Ambient — shared fade-out helper
  const stopAmbientRef = useCallback((ref) => {
    const a = ref.current;
    if (!a) return;
    ref.current = null;
    if (a.intervalId != null) clearInterval(a.intervalId);
    if (a.gain) {
      try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        a.gain.gain.cancelScheduledValues(now);
        a.gain.gain.setValueAtTime(a.gain.gain.value, now);
        a.gain.gain.linearRampToValueAtTime(0, now + 0.4);
        setTimeout(() => { (a.nodes || []).forEach(n => { try { n.stop(); } catch (_) {} }); }, 450);
      } catch (_) {}
    }
  }, [getCtx]);

  const stopAmbient    = useCallback(() => stopAmbientRef(ambientRef),  [stopAmbientRef]);
  const stopAmbientMix = useCallback(() => stopAmbientRef(ambientRef2), [stopAmbientRef]);

  // Lazy-create the 3-band EQ chain (persists across ambient changes)
  const getOrCreateEQ = useCallback((ctx) => {
    if (eqRef.current) return eqRef.current;
    const eq0 = settingsRef.current.eq;
    const mk = (type, freq, q, gainKey) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q != null) f.Q.value = q;
      f.gain.value = eq0[gainKey] ?? 0;
      return f;
    };
    const sub      = mk("lowshelf",  60,    null, "sub");
    const bass     = mk("peaking",  200,    0.8,  "bass");
    const lowMid   = mk("peaking",  500,    0.8,  "lowMid");
    const mid      = mk("peaking",  1000,   0.8,  "mid");
    const upperMid = mk("peaking",  3000,   0.8,  "upperMid");
    const presence = mk("peaking",  6000,   0.8,  "presence");
    const air      = mk("highshelf",10000,  null, "air");
    sub.connect(bass); bass.connect(lowMid); lowMid.connect(mid);
    mid.connect(upperMid); upperMid.connect(presence); presence.connect(air);
    const volGain = ctx.createGain();
    volGain.gain.value = settingsRef.current.ambientVolume ?? 0.75;
    air.connect(volGain); volGain.connect(ctx.destination);
    volumeGainRef.current = volGain;
    eqRef.current = { sub, bass, lowMid, mid, upperMid, presence, air };
    return eqRef.current;
  }, []);

  const startAmbient = useCallback((type, isSecondary = false) => {
    if (isSecondary) stopAmbientMix(); else stopAmbient();
    if (type === "off") return;
    try {
      const ctx = getCtx();
      const eq = getOrCreateEQ(ctx);
      const nodes = [];
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      const scaleGain = ctx.createGain();
      scaleGain.gain.value = isSecondary ? (settingsRef.current.ambientMixRatio ?? 0.5) : 1;
      master.connect(scaleGain); scaleGain.connect(eq.sub ?? eq.bass); // master → scale → EQ chain → destination

      // ── helper: subtle "air" layer so EQ has full-spectrum content ──
      const addAir = (vol = 0.012) => {
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 4); src.loop = true;
        const hpf = ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 800;
        const g = ctx.createGain(); g.gain.value = vol;
        src.connect(hpf); hpf.connect(g); g.connect(master);
        src.start(); nodes.push(src);
      };

      // ── helper: isochronic AM (brain.fm approach — works without headphones) ──
      // Carrier tone amplitude-modulated at beatHz. DC offset 0.5 + LFO ±0.5 = gain 0..1
      const mkIsochronic = (beatHz, carrierFreqs) => {
        const amGain = ctx.createGain(); amGain.gain.value = 0;
        const dc = ctx.createConstantSource(); dc.offset.value = 0.5;
        dc.connect(amGain.gain); dc.start(); nodes.push(dc);
        const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = beatHz;
        const lfoD = ctx.createGain(); lfoD.gain.value = 0.5;
        lfo.connect(lfoD); lfoD.connect(amGain.gain); lfo.start(); nodes.push(lfo);
        carrierFreqs.forEach(([freq, vol]) => {
          const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
          const g = ctx.createGain(); g.gain.value = vol;
          osc.connect(g); g.connect(amGain); osc.start(); nodes.push(osc);
        });
        amGain.connect(master);
      };

      // ── helper: binaural pair ──
      const mkBinaural = (baseFreq, beatHz) => {
        const mk = (freq, pan) => {
          const osc = ctx.createOscillator();
          osc.type = "sine"; osc.frequency.value = freq;
          const panner = ctx.createStereoPanner(); panner.pan.value = pan;
          const g = ctx.createGain(); g.gain.value = 0.42;
          osc.connect(panner); panner.connect(g); g.connect(master);
          osc.start(); nodes.push(osc);
        };
        mk(baseFreq, -1); mk(baseFreq + beatHz, 1);
      };

      if (type === "rain") {
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 4); src.loop = true;
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass"; lpf.frequency.value = 450; lpf.Q.value = 0.8;
        src.connect(lpf); lpf.connect(master);
        src.start(); nodes.push(src);
        master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.5);

      } else if (type === "noise") {
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 4); src.loop = true;
        const hpf = ctx.createBiquadFilter();
        hpf.type = "highpass"; hpf.frequency.value = 250;
        src.connect(hpf); hpf.connect(master);
        src.start(); nodes.push(src);
        master.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.5);

      } else if (type === "brown") {
        // Brown noise: deeper, warmer — great for blocking distractions
        const src = ctx.createBufferSource();
        src.buffer = makeBrownNoiseBuffer(ctx, 6); src.loop = true;
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass"; lpf.frequency.value = 700; lpf.Q.value = 0.5;
        src.connect(lpf); lpf.connect(master);
        src.start(); nodes.push(src);
        master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.5);

      } else if (type === "ocean") {
        // Ocean: noise + slow amplitude modulation (wave rhythm ~0.08 Hz)
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 8); src.loop = true;
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass"; lpf.frequency.value = 320; lpf.Q.value = 0.6;
        const waveGain = ctx.createGain(); waveGain.gain.value = 0.5;
        src.connect(lpf); lpf.connect(waveGain); waveGain.connect(master);
        src.start(); nodes.push(src);
        // LFO for wave swell
        const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
        const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.22;
        lfo.connect(lfoDepth); lfoDepth.connect(waveGain.gain);
        lfo.start(); nodes.push(lfo);
        master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.5);

      } else if (type === "neural") {
        // Alpha hybrid: binaural (headphones) + isochronic AM (without headphones)
        // Both at 10 Hz alpha — relaxed focus & learning
        mkBinaural(200, 10); addAir(0.010);
        mkIsochronic(10, [[220, 0.025], [330, 0.018], [440, 0.012]]); // isochronic layer
        [[220, 0.045], [330, 0.032], [440, 0.022], [550, 0.014], [660, 0.009]].forEach(([freq, vol], i) => {
          const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07 + i * 0.013;
          const lfoDepth = ctx.createGain(); lfoDepth.gain.value = vol * 0.4;
          const oscGain = ctx.createGain(); oscGain.gain.value = vol;
          lfo.connect(lfoDepth); lfoDepth.connect(oscGain.gain);
          osc.connect(oscGain); oscGain.connect(master);
          const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.Q.value = 1.5;
          filt.frequency.setValueAtTime(300 + i * 80, ctx.currentTime);
          filt.frequency.linearRampToValueAtTime(700 + i * 60, ctx.currentTime + 40);
          filt.frequency.linearRampToValueAtTime(300 + i * 80, ctx.currentTime + 80);
          oscGain.connect(filt); filt.connect(master);
          osc.start(); lfo.start(); nodes.push(osc, lfo);
        });
        master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2.5);

      } else if (type === "beta") {
        // Beta binaural (18 Hz) — active concentration, studying, problem solving
        mkBinaural(200, 18); addAir(0.014);
        [[250, 0.03], [375, 0.02], [500, 0.013]].forEach(([freq, vol], i) => {
          const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
          const g = ctx.createGain(); g.gain.value = vol;
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.1 + i * 0.05;
          const ld = ctx.createGain(); ld.gain.value = vol * 0.3;
          lfo.connect(ld); ld.connect(g.gain);
          osc.connect(g); g.connect(master);
          osc.start(); lfo.start(); nodes.push(osc, lfo);
        });
        master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2);

      } else if (type === "theta") {
        // Theta binaural (6 Hz) — creative flow state, meditation, deep relaxation
        mkBinaural(200, 6); addAir(0.010);
        [[180, 0.04], [270, 0.028], [360, 0.018], [540, 0.01]].forEach(([freq, vol], i) => {
          const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
          const g = ctx.createGain(); g.gain.value = vol;
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.05 + i * 0.01;
          const ld = ctx.createGain(); ld.gain.value = vol * 0.5;
          lfo.connect(ld); ld.connect(g.gain);
          osc.connect(g); g.connect(master);
          osc.start(); lfo.start(); nodes.push(osc, lfo);
        });
        master.gain.linearRampToValueAtTime(0.17, ctx.currentTime + 3);

      } else if (type === "fire") {
        // Campfire: brown noise base + bandpass crackle modulated by 4 offset LFOs
        const base = ctx.createBufferSource();
        base.buffer = makeBrownNoiseBuffer(ctx, 6); base.loop = true;
        const baseLpf = ctx.createBiquadFilter();
        baseLpf.type = "lowpass"; baseLpf.frequency.value = 600; baseLpf.Q.value = 0.7;
        const baseGain = ctx.createGain(); baseGain.gain.value = 0.18;
        base.connect(baseLpf); baseLpf.connect(baseGain); baseGain.connect(master);
        base.start(); nodes.push(base);

        const crack = ctx.createBufferSource();
        crack.buffer = makeNoiseBuffer(ctx, 4); crack.loop = true;
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass"; bpf.frequency.value = 1200; bpf.Q.value = 0.4;
        const crackGain = ctx.createGain(); crackGain.gain.value = 0;
        crack.connect(bpf); bpf.connect(crackGain); crackGain.connect(master);
        crack.start(); nodes.push(crack);

        const dc = ctx.createConstantSource(); dc.offset.value = 0.08;
        dc.connect(crackGain.gain); dc.start(); nodes.push(dc);

        [0.3, 0.7, 1.1, 1.7].forEach(hz => {
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = hz;
          const ld = ctx.createGain(); ld.gain.value = 0.045;
          lfo.connect(ld); ld.connect(crackGain.gain);
          lfo.start(); nodes.push(lfo);
        });
        master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.8);

      } else if (type === "wind") {
        // Wind: bandpass noise + 3 offset LFOs for gust variation
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 6); src.loop = true;
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass"; bpf.frequency.value = 700; bpf.Q.value = 0.5;
        const windGain = ctx.createGain(); windGain.gain.value = 0;
        src.connect(bpf); bpf.connect(windGain); windGain.connect(master);
        src.start(); nodes.push(src);

        const dc = ctx.createConstantSource(); dc.offset.value = 0.35;
        dc.connect(windGain.gain); dc.start(); nodes.push(dc);

        [[0.07, 0.15], [0.18, 0.08], [0.31, 0.04]].forEach(([hz, depth]) => {
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = hz;
          const ld = ctx.createGain(); ld.gain.value = depth;
          lfo.connect(ld); ld.connect(windGain.gain);
          lfo.start(); nodes.push(lfo);
        });
        master.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 1.2);

      } else if (type === "focusPlus") {
        // Focus+ — isochronic Beta AM at 15 Hz (brain.fm style, works without headphones)
        // Beta boosts focus-associated brain activity. Isochronic = AM in both channels.
        mkIsochronic(15, [[200, 0.18], [300, 0.10], [400, 0.06], [500, 0.03]]);
        addAir(0.014);
        master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.5);

      } else if (type === "flow") {
        // Flow State — isochronic at 12 Hz (alpha/beta border)
        // The 12 Hz "sensorimotor rhythm" is associated with relaxed, effortless concentration
        mkIsochronic(12, [[220, 0.16], [330, 0.10], [440, 0.07], [550, 0.04]]);
        // Slow evolving pad underneath
        [[165, 0.03], [247, 0.02], [330, 0.015]].forEach(([freq, vol], i) => {
          const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
          const g = ctx.createGain(); g.gain.value = vol;
          const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.04 + i * 0.01;
          const ld = ctx.createGain(); ld.gain.value = vol * 0.4;
          lfo.connect(ld); ld.connect(g.gain);
          osc.connect(g); g.connect(master);
          osc.start(); lfo.start(); nodes.push(osc, lfo);
        });
        addAir(0.010);
        master.gain.linearRampToValueAtTime(0.20, ctx.currentTime + 2);

      } else if (type === "delta") {
        // Delta — isochronic at 2.5 Hz (deep rest, sleep prep, recovery)
        // Very slow AM pulse creates a deeply grounding, sleep-inducing effect
        mkIsochronic(2.5, [[100, 0.20], [150, 0.12], [200, 0.07]]);
        // Warm brown noise bed for texture
        const src = ctx.createBufferSource();
        src.buffer = makeBrownNoiseBuffer(ctx, 6); src.loop = true;
        const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = 300;
        const ng = ctx.createGain(); ng.gain.value = 0.12;
        src.connect(lpf); lpf.connect(ng); ng.connect(master);
        src.start(); nodes.push(src);
        master.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 3);
      }

      if (isSecondary) ambientRef2.current = { nodes, gain: master, scaleGain };
      else ambientRef.current = { nodes, gain: master, scaleGain };
    } catch (_) {}
  }, [getCtx, getOrCreateEQ, stopAmbient, stopAmbientMix]);

  // Live EQ updates — no restart needed, just change filter gain values
  useEffect(() => {
    if (!eqRef.current) return;
    Object.keys(eqRef.current).forEach(k => {
      eqRef.current[k].gain.value = settings.eq[k] ?? 0;
    });
  }, [settings.eq]);

  // Live volume update
  useEffect(() => {
    if (volumeGainRef.current) {
      volumeGainRef.current.gain.setTargetAtTime(settings.ambientVolume, audioCtxRef.current?.currentTime ?? 0, 0.02);
    }
    // Sync YouTube player volume (brain.fm — separate audio system)
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === "function") {
      ytPlayerRef.current.setVolume(Math.round(settings.ambientVolume * 100));
    }
  }, [settings.ambientVolume]);

  // Live mix ratio update — scale secondary ambient when ratio changes
  useEffect(() => {
    if (ambientRef2.current?.scaleGain) {
      ambientRef2.current.scaleGain.gain.setTargetAtTime(
        settings.ambientMixRatio, audioCtxRef.current?.currentTime ?? 0, 0.05
      );
    }
  }, [settings.ambientMixRatio]);

  // Fade ambient in/out when timer starts/stops
  useEffect(() => {
    if (!volumeGainRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const target = settingsRef.current.ambientVolume ?? 0.75;
    const now = ctx.currentTime;
    volumeGainRef.current.gain.cancelScheduledValues(now);
    volumeGainRef.current.gain.setValueAtTime(volumeGainRef.current.gain.value, now);
    if (isRunning) {
      volumeGainRef.current.gain.linearRampToValueAtTime(target, now + 1.2);
    } else {
      volumeGainRef.current.gain.linearRampToValueAtTime(target * 0.22, now + 0.7);
    }
  }, [isRunning]);

  // Preview ambient for 5s when user selects a sound (timer not running)
  const previewAmbient = useCallback((val) => {
    if (val === "off") { isPreviewingRef.current = false; stopAmbient(); return; }
    if (isRunning) return; // timer already driving audio, no preview needed
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    isPreviewingRef.current = true;  // flag: tell the effect not to kill this
    startAmbient(val);
    previewTimeoutRef.current = setTimeout(() => {
      isPreviewingRef.current = false;
      stopAmbient();
      previewTimeoutRef.current = null;
    }, 5000);
  }, [isRunning, startAmbient, stopAmbient]);

  const previewAmbientMix = useCallback((val) => {
    if (isRunning) return;
    if (previewMixTimeoutRef.current) clearTimeout(previewMixTimeoutRef.current);
    if (val === "off") { isPreviewingMixRef.current = false; stopAmbientMix(); return; }
    isPreviewingMixRef.current = true;
    startAmbient(val, true);
    previewMixTimeoutRef.current = setTimeout(() => {
      isPreviewingMixRef.current = false;
      stopAmbientMix();
      previewMixTimeoutRef.current = null;
    }, 5000);
  }, [isRunning, startAmbient, stopAmbientMix]);

  // Ambient effect — skip stopAmbient when a preview is intentionally playing
  useEffect(() => {
    if (isRunning && settings.ambient !== "off") {
      isPreviewingRef.current = false;
      startAmbient(settings.ambient);
    } else if (!isPreviewingRef.current) {
      stopAmbient();
    }
    return () => { if (!isPreviewingRef.current) stopAmbient(); };
  }, [isRunning, settings.ambient, startAmbient, stopAmbient]);

  // Mix ambient effect
  useEffect(() => {
    if (isRunning && settings.ambientMix !== "off") {
      isPreviewingMixRef.current = false;
      startAmbient(settings.ambientMix, true);
    } else if (!isPreviewingMixRef.current) {
      stopAmbientMix();
    }
    return () => { if (!isPreviewingMixRef.current) stopAmbientMix(); };
  }, [isRunning, settings.ambientMix, startAmbient, stopAmbientMix]);

  // Ambient auto-stop after N minutes
  useEffect(() => {
    const mins = settings.ambientAutoStop;
    if (!mins || settings.ambient === "off") return;
    const id = setTimeout(() => {
      setSettings(s => ({ ...s, ambient: "off", ambientMix: "off" }));
    }, mins * 60 * 1000);
    return () => clearTimeout(id);
  }, [settings.ambient, settings.ambientAutoStop]);

  // YouTube IFrame API — load once
  useEffect(() => {
    if (window.YT) { ytApiReadyRef.current = true; return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => { ytApiReadyRef.current = true; };
  }, []);

  const createYtPlayer = useCallback((videoId) => {
    if (!ytApiReadyRef.current || !window.YT) return;
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch (_) {}
      ytPlayerRef.current = null;
    }
    ytPlayerRef.current = new window.YT.Player("yt-player-div", {
      videoId,
      playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: (e) => { if (isRunningRef.current) e.target.playVideo(); },
      },
    });
  }, []);

  // Sync YouTube player with timer running state (only after user activated it)
  useEffect(() => {
    if (!ytActivatedRef.current) return;
    const p = ytPlayerRef.current;
    if (!p || typeof p.playVideo !== "function") return;
    if (isRunning && settings.ambient === "youtube") {
      try { p.playVideo(); } catch (_) {}
    } else {
      try { p.pauseVideo(); } catch (_) {}
    }
  }, [isRunning, settings.ambient, ytActivated]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        getCtx();
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission();
        }
        setIsRunning(r => !r);
      } else if (e.key === "n" || e.key === "N") {
        // Mark the first uncompleted task as done
        setTasks(ts => {
          const idx = ts.findIndex(t => !t.done);
          if (idx === -1) return ts;
          return ts.map((t, i) => i === idx ? { ...t, done: true } : t);
        });
      } else if (e.key === "r" || e.key === "R") {
        clearInterval(intervalRef.current);
        completedRef.current = false;
        setIsRunning(false);
        setRingTransition(false);
        setTimeout(() => setRingTransition(true), 60);
        setTimeLeft(getDuration(modeRef.current, settingsRef.current));
      } else if (e.key === "1") switchModeKey("focus");
      else if (e.key === "2") switchModeKey("shortBreak");
      else if (e.key === "3") switchModeKey("longBreak");
      else if (e.key === "Escape") {
        setShowSettings(false); setShowTasks(false); setShowShortcuts(false);
        // Exit minimal mode — but only if not currently in fullscreen
        // (browser handles Escape→exit-fullscreen first; next Escape then exits minimal)
        if (!document.fullscreenElement) setMinimalMode(false);
      }
      else if (e.key === "?") setShowShortcuts(s => !s);
      else if (e.key === "s" || e.key === "S") {
        setShowSettings(s => !s);
        setShowTasks(false);
      }
    };
    const switchModeKey = (m) => {
      if (modeRef.current === m) return;
      clearInterval(intervalRef.current);
      setIsRunning(false); completedRef.current = false;
      setMode(m); modeRef.current = m;
      setRingTransition(false); setTimeout(() => setRingTransition(true), 60);
      setTimeLeft(getDuration(m, settingsRef.current));
      setDigitPop(true); setTimeout(() => setDigitPop(false), 420);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [getCtx]);

  // Touch swipe — left/right to switch modes
  useEffect(() => {
    let startX = 0;
    const onStart = (e) => { startX = e.touches[0].clientX; };
    const onEnd = (e) => {
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) < 60) return;
      const idx = MODES.indexOf(modeRef.current);
      const next = diff < 0 ? Math.min(idx + 1, MODES.length - 1) : Math.max(idx - 1, 0);
      if (next === idx) return;
      clearInterval(intervalRef.current);
      setIsRunning(false); completedRef.current = false;
      setMode(MODES[next]); modeRef.current = MODES[next];
      setRingTransition(false); setTimeout(() => setRingTransition(true), 60);
      setTimeLeft(getDuration(MODES[next], settingsRef.current));
      setDigitPop(true); setTimeout(() => setDigitPop(false), 420);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const resetRing = useCallback(() => {
    setRingTransition(false);
    setTimeout(() => setRingTransition(true), 60);
  }, []);

  const triggerDigitPop = useCallback(() => {
    setDigitPop(true);
    setTimeout(() => setDigitPop(false), 420);
  }, []);

  const sendNotif = (title, body) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try { new Notification(title, { body, silent: true }); } catch (_) {}
  };

  // Session complete
  const completeSession = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    playChime();
    setFlash(true);
    setTimeout(() => setFlash(false), 950);

    const m = modeRef.current;
    const sess = sessionsRef.current;
    const s = settingsRef.current;
    const curToday = todaySessionsRef.current;
    const curStreak = streakRef.current;

    let nextMode, newSess = sess, newToday = curToday, newStreak = curStreak;

    if (m === "focus") {
      newSess = sess + 1;
      setBreakCycleCount(newSess);
      nextMode = newSess % (settingsRef.current.longBreakInterval || 4) === 0 ? "longBreak" : "shortBreak";
      newToday = curToday + 1;
      if (curToday === 0) {
        try {
          const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
          const t = todayStr(), y = yesterdayStr();
          if (stored.date === t) newStreak = curStreak;
          else if (stored.date === y) newStreak = curStreak + 1;
          else newStreak = 1;
        } catch { newStreak = 1; }
      }
      setTodaySessions(newToday);
      setStreak(newStreak);
      saveDailyData(newToday, newStreak);
      setWeekData(prev => {
        const today = todayStr();
        const updated = { ...prev, [today]: (prev[today] ?? 0) + 1 };
        saveWeekData(updated);
        return updated;
      });
      let updatedTotals;
      setTotals(prev => {
        const focusMinutes = Math.round(settingsRef.current.focus);
        const updated = {
          sessions: (prev.sessions ?? 0) + 1,
          minutes:  (prev.minutes  ?? 0) + focusMinutes,
          longestStreak: Math.max(prev.longestStreak ?? 0, newStreak),
        };
        saveTotals(updated);
        updatedTotals = updated;
        return updated;
      });
      // Check achievements
      setAchievements(prev => {
        const earned = [...prev];
        let newlyEarned = null;
        const checkTotals = updatedTotals || {};
        ACHIEVEMENT_DEFS.forEach(def => {
          if (!earned.includes(def.id) && def.check(checkTotals, newStreak)) {
            earned.push(def.id);
            newlyEarned = def;
          }
        });
        if (newlyEarned) {
          saveAchievements(earned);
          const deLangAch = settingsRef.current.lang !== "en";
          setTimeout(() => {
            setNewAchievement({ icon: newlyEarned.icon, name: deLangAch ? newlyEarned.de : newlyEarned.en });
            setTimeout(() => setNewAchievement(null), 3500);
          }, 1200);
        } else {
          saveAchievements(earned);
        }
        return earned;
      });
      const deLang = settingsRef.current.lang !== "en";
      const goalReached = newToday >= settingsRef.current.dailyGoal && curToday < settingsRef.current.dailyGoal;
      if (goalReached) {
        sendNotif(
          deLang ? "🎉 Tagesziel erreicht!" : "🎉 Daily goal reached!",
          deLang ? `${newToday} Sessions — gut gemacht!` : `${newToday} sessions — great work!`
        );
        setTimeout(() => setShowDaySummary(true), 1800);
      } else {
        sendNotif(
          deLang ? "🦦 Focus abgeschlossen!" : "🦦 Focus complete!",
          deLang
            ? `Weiter zu: ${nextMode === "longBreak" ? "Lange Pause" : "Kurze Pause"}`
            : `Next: ${nextMode === "longBreak" ? "Long Break" : "Short Break"}`
        );
      }
    } else {
      nextMode = "focus";
      const deLang = settingsRef.current.lang !== "en";
      sendNotif(
        deLang ? "☕ Pause vorbei!" : "☕ Break's over!",
        deLang ? "Zeit für eine neue Focus-Session." : "Time for a new focus session."
      );
    }

    setTimeout(() => {
      completedRef.current = false;
      setMode(nextMode); modeRef.current = nextMode;
      resetRing();
      setTimeLeft(getDuration(nextMode, s));
      triggerDigitPop();
      if (s.autoStart) setIsRunning(true);
    }, 950);
  }, [playChime, resetRing, triggerDigitPop]);

  // Timer interval
  useEffect(() => {
    if (!isRunning) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => (t <= 0 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  useEffect(() => {
    if (timeLeft === 0 && isRunning && !completedRef.current) {
      completedRef.current = true;
      completeSession();
    }
  }, [timeLeft, isRunning, completeSession]);

  useEffect(() => {
    if (isRunning && timeLeft > 0 && timeLeft % 60 === 0) playTick();
  }, [timeLeft, isRunning, playTick]);

  // Controls
  const switchMode = (m) => {
    if (m === mode) return;
    clearInterval(intervalRef.current);
    setIsRunning(false); completedRef.current = false;
    setMode(m); modeRef.current = m;
    resetRing(); setTimeLeft(getDuration(m, settings)); triggerDigitPop();
  };

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setIsRunning(false); completedRef.current = false;
    resetRing(); setTimeLeft(getDuration(mode, settings));
  };

  const handleToggle = () => {
    getCtx();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setIsRunning(r => {
      if (!r) { setRingFadeIn(true); setTimeout(() => setRingFadeIn(false), 700); }
      return !r;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Media Session API — OS media controls (lock screen, media keys)
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: "Focus Partner",
      artist: mode === "focus" ? "Fokus-Session" : mode === "shortBreak" ? "Kurze Pause" : "Lange Pause",
      album: "🦦 Focus Partner",
    });
    navigator.mediaSession.playbackState = isRunning ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play",  () => setIsRunning(true));
    navigator.mediaSession.setActionHandler("pause", () => setIsRunning(false));
  }, [isRunning, mode]);

  // Breathing cycle during breaks (4s inhale → 4s exhale)
  useEffect(() => {
    if (!isRunning || mode === "focus") { setBreathPhase("inhale"); return; }
    let phase = "inhale";
    setBreathPhase("inhale");
    const cycle = () => {
      phase = phase === "inhale" ? "exhale" : "inhale";
      setBreathPhase(phase);
    };
    const id = setInterval(cycle, 4000);
    return () => clearInterval(id);
  }, [isRunning, mode]);

  const updateDuration = (key, v) => {
    setSettings(s => ({ ...s, [key]: v }));
    if (mode === key && !isRunning) { resetRing(); setTimeLeft(v * 60); }
  };

  const addTask = () => {
    const text = taskInput.trim();
    if (!text || tasks.length >= 10) return;
    setTasks(ts => [...ts, { id: Date.now(), text, done: false }]);
    setTaskInput("");
  };

  const moveTask = (id, dir) => {
    setTasks(ts => {
      const idx = ts.findIndex(t => t.id === id);
      const next = idx + dir;
      if (next < 0 || next >= ts.length) return ts;
      const arr = [...ts];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  // Derived
  const total = getDuration(mode, settings);
  const progress = total > 0 ? timeLeft / total : 1;
  const dashOffset = C * (1 - progress);
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const tabIdx = MODES.indexOf(mode);
  const activeTask = tasks.find(t => !t.done);
  const sessionProgress = (mode === "focus" && isRunning) ? (1 - progress) : 0;
  const progressPct = Math.min(100, ((todaySessions + sessionProgress) / settings.dailyGoal) * 100);
  const ringAnim = flash ? "ringFlash 0.95s ease-in-out"
    : isRunning ? "ringPulse 2.8s ease-in-out infinite" : "none";
  const lm = settings.lightMode;
  const de = settings.lang !== "en";
  const i18n = {
    focus:        de ? "Fokus"        : "Focus",
    shortBreak:   de ? "Kurze Pause"  : "Short Break",
    longBreak:    de ? "Lange Pause"  : "Long Break",
    sessions:     de ? "Sessions heute" : "sessions today",
    session1:     de ? "Session heute"  : "session today",
    heute:        de ? "heute"         : "today",
    aufgaben:     de ? "Aufgaben"      : "Tasks",
    addTask:      de ? "Aufgabe hinzufügen…" : "Add task…",
    noTasks:      de ? "Keine Aufgaben" : "No tasks",
    clear:        de ? "Erledigte löschen" : "Clear done",
    settings:     de ? "Einstellungen" : "Settings",
    ambient:      de ? "Sound"        : "Sound",
    equalizer:    de ? "Equalizer"    : "Equalizer",
    autoStart:    de ? "Auto-Start"   : "Auto-start",
    chime:        de ? "Abschluss-Ton": "End chime",
    tick:         de ? "Minuten-Tick" : "Minute tick",
    lightMode:    de ? "Hell-Modus"   : "Light mode",
    longBreakAfter: de ? "Lange Pause nach" : "Long break after",
    dailyGoal:    de ? "Tagesziel"    : "Daily goal",
    shortcuts:    de ? "Tastenkürzel" : "Keyboard shortcuts",
    close:        de ? "Klick zum Schließen" : "Click to close",
    start:        de ? "Start"        : "Start",
    pause:        de ? "Pause"        : "Pause",
    reset:        de ? "Reset"        : "Reset",
    eqReset:      de ? "↺ Reset"      : "↺ Reset",
    audioStart:   de ? "▶ Audio starten" : "▶ Play audio",
    audioRunning: de ? "✓ Läuft — Timer steuert Play / Pause" : "✓ Playing — synced with timer",
    noInternet:   de ? "EQ nicht verfügbar bei brain.fm" : "EQ unavailable for brain.fm",
    days:         de ? ["Mo","Di","Mi","Do","Fr","Sa","So"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    tag:          de ? "Tag"  : "day",
    tage:         de ? "Tage" : "days",
    klickPause:   de ? "Pause · Klick" : "Click to pause",
    klickStart:   de ? "Start · Klick" : "Click to start",
    min:          de ? "Min"  : "min",
    vollansicht:  de ? "Vollansicht" : "Full view",
    minimal:      de ? "Minimalmodus" : "Minimal mode",
    fullscreen:   de ? "Vollbild"    : "Fullscreen",
    exitFs:       de ? "Vollbild beenden" : "Exit fullscreen",
    percent:      de ? "von Tagesziel" : "of daily goal",
    totalLabel:   de ? "Gesamt" : "All time",
    totalSess:    de ? "Sessions" : "Sessions",
    totalHours:   de ? "Std." : "hrs",
    totalStreak:  de ? "Längste Serie" : "Best streak",
    breathIn:     de ? "Einatmen"    : "Breathe in",
    breathOut:    de ? "Ausatmen"    : "Breathe out",
    achievements: de ? "Erfolge"     : "Achievements",
    daySummary:   de ? "Tageszusammenfassung" : "Day Summary",
    export:       de ? "Exportieren" : "Export data",
    autoDark:     de ? "Auto Dark-Mode" : "Auto dark mode",
    clockSizeLbl: de ? "Uhrgröße"   : "Clock size",
    bgStyleLbl:   de ? "Hintergrund" : "Background",
    autoStop:     de ? "Sound-Timer" : "Sound timer",
    mixRatio:     de ? "Mix-Anteil"  : "Mix ratio",
  };
  const modeLabels = {
    focus:      de ? "Fokus"         : "Focus",
    shortBreak: de ? "Kurze Pause"   : "Short Break",
    longBreak:  de ? "Lange Pause"   : "Long Break",
  };
  const T = useMemo(() => ({
    bg:        lm ? "#f5f0ea" : "#0a0a0a",
    card:      lm ? "#ede8e0" : "#0d0d0d",
    border:    lm ? "#ddd8cf" : "#1c1c1c",
    text:      lm ? "#1a1a1a" : "#f0ede8",
    textDim:   lm ? "#888" : "#3a3a3a",
    textDim2:  lm ? "#aaa" : "#252525",
    textMid:   lm ? "#555" : "#777",
    tabBg:     lm ? "#e8e3da" : "#111",
    tabActive: lm ? "#ddd8cf" : "#1d1d1d",
    panelBg:   lm ? "#ede8e0" : "#0d0d0d",
    inputBg:   lm ? "#e4dfd6" : "#141414",
    inputBdr:  lm ? "#c8c2b8" : "#222",
    accent:    settings.accentColor ?? "#e07b39",
    accentDim: lm ? "#c4681a" : "#3d2010",
    barEmpty:  lm ? "#e0dad0" : "#181818",
    rowHover:  lm ? "#e4dfd6" : "#131313",
    toggleOff: lm ? "#d0cbc2" : "#1e1e1e",
    shadow:    lm ? "0 24px 60px rgba(0,0,0,0.12)" : "0 24px 60px rgba(0,0,0,0.75)",
    ringSub:   lm ? "#e0dad0" : "#181818",
    ringGhost: lm ? "rgba(224,123,57,0.12)" : "rgba(224,123,57,0.08)",
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lm, settings.accentColor]);

  // Find Monday of current week
  const todayDate = new Date();
  const dow = todayDate.getDay(); // 0=Sun, 1=Mon
  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const last7Days = useMemo(() => {
    const dayLabels = de ? ["Mo","Di","Mi","Do","Fr","Sa","So"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = localDateStr(d);
      const isFuture = d > todayDate;
      const isToday = dateStr === todayStr();
      const label = dayLabels[i];
      const count = isToday ? todaySessions : (weekData[dateStr] ?? 0);
      return { date: dateStr, label, count, isFuture, isToday };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekData, todaySessions, de]);
  const weekMax = Math.max(...last7Days.map(d => d.count), 1);

  // Level system
  const LEVELS = [
    { min: 0,   icon: "🌱", name: de ? "Sämling"  : "Seedling", next: 5   },
    { min: 5,   icon: "🌿", name: de ? "Spross"   : "Sprout",   next: 15  },
    { min: 15,  icon: "🌲", name: de ? "Baum"     : "Tree",     next: 30  },
    { min: 30,  icon: "🌳", name: de ? "Wald"     : "Forest",   next: 60  },
    { min: 60,  icon: "🦦", name: de ? "Meister"  : "Elder",    next: 100 },
    { min: 100, icon: "✨", name: de ? "Legende"  : "Legend",   next: null },
  ];
  const totalSess = totals.sessions ?? 0;
  const currentLevel = [...LEVELS].reverse().find(l => totalSess >= l.min) || LEVELS[0];

  // Shared styles
  const S = {
    panel: {
      position: "fixed", borderRadius: 16,
      background: T.panelBg, border: `1px solid ${T.border}`,
      padding: "20px 22px 18px",
      animation: "panelFade 0.18s ease-out",
      boxShadow: T.shadow,
    },
    sectionLabel: {
      fontSize: 10, fontWeight: 600, letterSpacing: "0.14em",
      textTransform: "uppercase", color: T.textDim, marginBottom: 14,
    },
    row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    label: { fontSize: 13, color: T.textMid },
    input: {
      width: 50, textAlign: "center", background: T.inputBg,
      border: `1px solid ${T.inputBdr}`, borderRadius: 8, color: T.text,
      padding: "5px 6px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
      transition: "border-color 0.15s",
    },
  };

  const Toggle = ({ val, onToggle, label }) => (
    <button onClick={onToggle} role="switch" aria-checked={val} aria-label={`Toggle ${label}`}
      style={{ width: 38, height: 21, borderRadius: 100, background: val ? T.accent : T.toggleOff,
        border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 15, height: 15, borderRadius: "50%", background: val ? T.bg : (lm ? "#aaa" : "#383838"),
        position: "absolute", top: 3, left: val ? 20 : 3, transition: "left 0.18s ease-out, background 0.18s" }} />
    </button>
  );

  return (
    <div className="relative flex items-center justify-center overflow-hidden"
      style={{ background: T.bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: T.text, transition: "background 0.3s, color 0.3s", userSelect: "none" }}>

      {/* Glow */}
      <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(224,123,57,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      {settings.bgStyle === "dots" && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `radial-gradient(circle, ${T.border} 1px, transparent 1px)`,
          backgroundSize: "28px 28px", opacity: 0.5 }} />
      )}
      {settings.bgStyle === "mesh" && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          background: `linear-gradient(135deg, ${T.accent}06 0%, transparent 50%, ${T.accent}04 100%)`,
          opacity: 0.7 }} />
      )}

      {/* Minimal mode toggle — top-left */}
      <button
        onClick={() => setMinimalMode(m => !m)}
        aria-label={minimalMode ? i18n.vollansicht : i18n.minimal}
        title={minimalMode ? i18n.vollansicht : i18n.minimal}
        style={{ position: "fixed", top: 20, left: 24, width: 30, height: 30, borderRadius: "50%",
          background: "transparent", border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          color: minimalMode ? T.accent : T.textMid, transition: "color 0.2s", zIndex: 60 }}
        onMouseEnter={e => { if (!minimalMode) e.currentTarget.style.color=T.text; }}
        onMouseLeave={e => { e.currentTarget.style.color=minimalMode?T.accent:T.textMid; }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {minimalMode
            ? /* eye — "show full UI" */
              <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
            : /* eye-off — "hide UI / enter minimal" */
              <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
          }
        </svg>
      </button>

      {/* Fullscreen toggle — top-right */}
      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? i18n.exitFs : i18n.fullscreen}
        title={isFullscreen ? i18n.exitFs : i18n.fullscreen}
        style={{ position: "fixed", top: 20, right: 24, width: 30, height: 30, borderRadius: "50%",
          background: "transparent", border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          color: isFullscreen ? T.accent : T.textMid, transition: "color 0.2s", zIndex: 60 }}
        onMouseEnter={e => { if (!isFullscreen) e.currentTarget.style.color=T.text; }}
        onMouseLeave={e => { e.currentTarget.style.color=isFullscreen?T.accent:T.textMid; }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isFullscreen
            ? <><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></>
            : <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></>
          }
        </svg>
      </button>

      {/* Minimal mode overlay */}
      {minimalMode && (
        <div
          onClick={handleToggle}
          style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
            background: T.bg, animation: "overlayIn 0.2s ease-out" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: "8rem", lineHeight: 1,
            color: isRunning ? T.accent : T.textDim,
            letterSpacing: "-0.03em", userSelect: "none",
            transition: "color 0.3s",
            animation: digitPop ? "digitPop 0.42s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}>
            {mm}:{ss}
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: T.textDim2, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {activeTask?.text || modeLabels[mode]}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: T.textDim2, opacity: 0.6 }}>
            {isRunning ? i18n.klickPause : i18n.klickStart}
          </div>
        </div>
      )}

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center",
            animation: "overlayIn 0.15s ease-out" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 16, padding: "28px 36px", minWidth: 260 }}>
            <p style={{ ...S.sectionLabel, marginBottom: 20 }}>{i18n.shortcuts}</p>
            {[
              ["Space", de ? "Start / Pause" : "Start / Pause"],
              ["R",     de ? "Reset"          : "Reset"],
              ["N",     de ? "Task abhaken"   : "Check off task"],
              ["S",     de ? "Einstellungen"  : "Settings"],
              ["1 / 2 / 3", de ? "Mode wechseln" : "Switch mode"],
              ["?",    de ? "Shortcuts"       : "Shortcuts"],
              ["Esc",  de ? "Panel schließen" : "Close panel"],
            ].map(([k, a]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 40, marginBottom: 10 }}>
                <code style={{ fontSize: 12, background: T.inputBg, border: `1px solid ${T.inputBdr}`,
                  borderRadius: 6, padding: "2px 8px", color: T.accent }}>{k}</code>
                <span style={{ fontSize: 13, color: T.textMid }}>{a}</span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: T.textDim2, marginTop: 16, textAlign: "center" }}>{i18n.close}</p>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="flex flex-col items-center" style={{ width: 380, gap: 30, position: "relative" }}>

        {/* Wordmark */}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textDim2, marginBottom: -18 }}>
          Focus Partner
        </div>

        {/* Mode tabs */}
        <div className="relative flex w-full" style={{ background: T.tabBg, borderRadius: 100, padding: 4 }}>
          <div style={{ position: "absolute", top: 4, bottom: 4, width: `calc(${100/3}% - 8px)`,
            left: `calc(${tabIdx * (100/3)}% + 4px)`, background: T.tabActive, borderRadius: 100,
            transition: "left 0.32s cubic-bezier(0.4,0,0.2,1)" }} />
          {MODES.map(m => (
            <button key={m} onClick={() => switchMode(m)} aria-label={`Switch to ${modeLabels[m]} mode`}
              style={{ flex: 1, padding: "9px 0", borderRadius: 100, background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 500,
                color: mode === m ? T.accent : T.textDim, transition: "color 0.22s",
                position: "relative", zIndex: 1, letterSpacing: "0.02em" }}>
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {/* Ring */}
        <div style={{ position: "relative", width: 280, height: 280 }}>
          <svg width="280" height="280" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden="true">
            <circle cx="140" cy="140" r={R} fill="none" stroke={T.ringSub} strokeWidth={6} />
            <circle cx="140" cy="140" r={R} fill="none" stroke={T.accent} strokeWidth={1} opacity={lm ? 0.15 : 0.08} />
            <circle cx="140" cy="140" r={R} fill="none" strokeWidth={4} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={dashOffset}
              style={{ stroke: T.accent, transition: ringTransition ? "stroke-dashoffset 1s linear" : "none",
                animation: ringFadeIn ? "ringFadeIn 0.65s ease-out forwards" : ringAnim,
                filter: isRunning && !flash ? "drop-shadow(0 0 6px var(--accent,#e07b39))" : "none" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ animation: digitPop ? "digitPop 0.42s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}>
            <div style={{ fontFamily: "'DM Serif Display', serif",
              fontSize: settings.clockSize === "S" ? "3.6rem" : settings.clockSize === "L" ? "6.2rem" : "4.8rem",
              lineHeight: 1, color: T.text, letterSpacing: "-0.03em", userSelect: "none" }}>
              {mm}:{ss}
            </div>
            <div
              onClick={() => { setShowTasks(true); setShowSettings(false); }}
              title={activeTask ? "Aufgaben öffnen" : "Aufgaben hinzufügen"}
              style={{ marginTop: 10, fontSize: 10, fontWeight: 500, textAlign: "center",
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                cursor: "pointer",
                color: activeTask ? T.textMid : T.textDim,
                letterSpacing: activeTask ? "0.02em" : "0.18em",
                textTransform: activeTask ? "none" : "uppercase" }}>
              {activeTask ? activeTask.text : modeLabels[mode]}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center" style={{ gap: 18 }}>
          <button onClick={handleReset} aria-label="Reset timer"
            className="flex items-center justify-center"
            style={{ width: 46, height: 46, borderRadius: "50%", background: T.inputBg,
              border: `1px solid ${T.border}`, cursor: "pointer", color: T.textDim,
              transition: "color 0.18s, background 0.18s, border-color 0.18s" }}
            onMouseEnter={e => { e.currentTarget.style.color=T.text; e.currentTarget.style.background=T.tabActive; e.currentTarget.style.borderColor=T.inputBdr; }}
            onMouseLeave={e => { e.currentTarget.style.color=T.textDim; e.currentTarget.style.background=T.inputBg; e.currentTarget.style.borderColor=T.border; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
          </button>
          <button onClick={handleToggle} aria-label={isRunning ? "Pause timer" : "Start timer"}
            style={{ width: 136, height: 50, borderRadius: 100, background: T.accent, border: "none",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14.5, fontWeight: 600,
              letterSpacing: "0.06em", color: T.bg, transition: "background 0.18s, transform 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.opacity="0.88")}
            onMouseLeave={e => (e.currentTarget.style.opacity="1")}
            onMouseDown={e => (e.currentTarget.style.transform="scale(0.965)")}
            onMouseUp={e => (e.currentTarget.style.transform="scale(1)")}>
            {isRunning ? i18n.pause : i18n.start}
          </button>
          <div style={{ width: 46 }} />
        </div>

        {/* Breathing animation during breaks */}
        {(mode === "shortBreak" || mode === "longBreak") && isRunning && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: breathPhase === "inhale" ? 48 : 28,
              height: breathPhase === "inhale" ? 48 : 28,
              borderRadius: "50%",
              background: `${T.accent}22`,
              border: `1.5px solid ${T.accent}55`,
              transition: "width 4s ease-in-out, height 4s ease-in-out",
              boxShadow: breathPhase === "inhale" ? `0 0 16px ${T.accent}30` : "none",
            }} />
            <span style={{ fontSize: 10, color: T.textDim2, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {breathPhase === "inhale" ? i18n.breathIn : i18n.breathOut}
            </span>
          </div>
        )}

        {/* Session progress + stats */}
        <div className="flex flex-col items-center" style={{ gap: 8 }}>

          {/* Row 1: count + progress bar + % inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: progressPct >= 100 ? T.accent : T.textDim, transition: "color 0.3s", whiteSpace: "nowrap" }}>
              {todaySessions} / {settings.dailyGoal} {i18n.heute}
            </span>
            <div style={{ width: 90, height: 4, background: T.barEmpty, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, borderRadius: 4,
                background: progressPct >= 100 ? T.accent : `${T.accent}66`,
                transition: "width 0.5s ease-out, background 0.3s",
                boxShadow: progressPct >= 100 ? `0 0 8px ${T.accent}66` : "none" }} />
            </div>
            <span style={{ fontSize: 11, color: progressPct >= 100 ? T.accent : T.textDim2, minWidth: 28, transition: "color 0.3s" }}>
              {Math.round(progressPct)}%
            </span>
          </div>

          {/* Row 2: streak + level (only if data exists) */}
          {(streak > 0 || totalSess > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: T.textDim }}>
              {streak > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span>🔥</span>
                  <span style={{ color: streak >= 7 ? T.accent : T.textDim, fontWeight: streak >= 3 ? 600 : 400, transition: "color 0.3s" }}>
                    {streak}
                  </span>
                </span>
              )}
              {streak > 0 && totalSess > 0 && (
                <span style={{ width: 1, height: 11, background: T.border, display: "inline-block" }} />
              )}
              {totalSess > 0 && (
                <span title={`${totalSess} ${de ? "Sessions gesamt" : "total sessions"}`}
                  style={{ display: "flex", alignItems: "center", gap: 3, cursor: "default" }}>
                  <span>{currentLevel.icon}</span>
                  <span style={{ color: T.textDim2 }}>{currentLevel.name}</span>
                </span>
              )}
            </div>
          )}

          {/* Row 3: all-time stats */}
          {totalSess > 0 && (
            <div style={{ display: "flex", gap: 18 }}>
              {[
                { val: totals.sessions ?? 0, label: i18n.totalSess },
                { val: `${Math.round((totals.minutes ?? 0) / 60 * 10) / 10}`, label: i18n.totalHours },
                { val: totals.longestStreak ?? 0, label: i18n.totalStreak },
              ].map(({ val, label }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{val}</span>
                  <span style={{ fontSize: 9, color: T.textDim2, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Row 4: week bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            {last7Days.map(({ date, label, count, isFuture, isToday }) => {
              const barH = Math.max(3, Math.round((count / weekMax) * 26));
              return (
                <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div title={`${label}: ${count} Sessions`} style={{
                    width: 16, height: barH, borderRadius: 3,
                    opacity: isFuture ? 0.35 : 1,
                    background: isToday
                      ? (progressPct >= 100 ? T.accent : count > 0 ? T.accentDim : T.barEmpty)
                      : count > 0 ? T.toggleOff : T.barEmpty,
                    transition: "height 0.5s ease-out, background 0.3s",
                    boxShadow: isToday && count > 0 ? `0 0 6px ${T.accent}30` : "none",
                  }} />
                  <span style={{ fontSize: 10, color: isToday ? T.textDim : T.textDim2, letterSpacing: "0.05em" }}>{label}</span>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Bottom-left: shortcuts */}
      <button onClick={() => setShowShortcuts(s => !s)} aria-label="Keyboard shortcuts"
        style={{ position: "fixed", bottom: 24, left: 28, width: 36, height: 36, borderRadius: "50%",
          background: "transparent", border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          color: showShortcuts ? T.accent : T.textMid, transition: "color 0.2s",
          fontFamily: "monospace", fontSize: 15, fontWeight: 700 }}
        onMouseEnter={e => { if (!showShortcuts) e.currentTarget.style.color=T.text; }}
        onMouseLeave={e => { e.currentTarget.style.color=showShortcuts?T.accent:T.textMid; }}>
        ?
      </button>

      {/* Bottom-right: tasks + settings */}
      <div style={{ position: "fixed", bottom: 20, right: 24, display: "flex", gap: 2 }}>
        <button onClick={() => { setShowTasks(s => !s); setShowSettings(false); }}
          aria-label="Toggle task list"
          style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: showTasks ? T.accent : T.textMid, transition: "color 0.2s" }}
          onMouseEnter={e => { if (!showTasks) e.currentTarget.style.color=T.text; }}
          onMouseLeave={e => { e.currentTarget.style.color=showTasks?T.accent:T.textMid; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
        <button onClick={() => { setShowSettings(s => !s); setShowTasks(false); }}
          aria-label="Toggle settings panel"
          style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: showSettings ? T.accent : T.textMid, transition: "color 0.2s" }}
          onMouseEnter={e => { if (!showSettings) e.currentTarget.style.color=T.text; }}
          onMouseLeave={e => { e.currentTarget.style.color=showSettings?T.accent:T.textMid; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Task panel */}
      {showTasks && (
        <div style={{ ...S.panel, bottom: 66, right: 20, width: 284 }}>
          <p style={S.sectionLabel}>{i18n.aufgaben}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input type="text" placeholder={i18n.addTask} value={taskInput}
              onChange={e => setTaskInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              disabled={tasks.length >= 10}
              className="pomodoro-input"
              style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.inputBdr}`, borderRadius: 8,
                color: T.text, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
            <button onClick={addTask} disabled={tasks.length >= 10 || !taskInput.trim()}
              aria-label="Add task"
              style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: taskInput.trim() && tasks.length < 10 ? T.accent : T.tabBg,
                border: "none", cursor: taskInput.trim() ? "pointer" : "default",
                color: taskInput.trim() ? T.bg : T.textDim,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          {tasks.length === 0
            ? <p style={{ fontSize: 12, color: T.textDim2, textAlign: "center", padding: "10px 0" }}>{i18n.noTasks}</p>
            : <div style={{ maxHeight: 210, overflowY: "auto" }}>
                {tasks.map((task, taskIdx) => (
                  <div key={task.id} className="task-row"
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 6px",
                      borderRadius: 8, marginBottom: 3, background: "transparent",
                      opacity: task.done ? 0.4 : 1, transition: "opacity 0.2s, background 0.15s" }}>
                    {/* Up/down reorder */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, flexShrink: 0 }}>
                      <button onClick={() => moveTask(task.id, -1)} disabled={taskIdx === 0}
                        aria-label="Move task up"
                        style={{ width: 14, height: 12, background: "transparent", border: "none", cursor: taskIdx === 0 ? "default" : "pointer",
                          color: taskIdx === 0 ? T.inputBdr : T.textDim, display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0, transition: "color 0.15s" }}
                        onMouseEnter={e => { if (taskIdx !== 0) e.currentTarget.style.color=T.textMid; }}
                        onMouseLeave={e => { e.currentTarget.style.color=taskIdx===0?T.inputBdr:T.textDim; }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18,15 12,9 6,15"/>
                        </svg>
                      </button>
                      <button onClick={() => moveTask(task.id, 1)} disabled={taskIdx === tasks.length - 1}
                        aria-label="Move task down"
                        style={{ width: 14, height: 12, background: "transparent", border: "none", cursor: taskIdx === tasks.length - 1 ? "default" : "pointer",
                          color: taskIdx === tasks.length - 1 ? T.inputBdr : T.textDim, display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0, transition: "color 0.15s" }}
                        onMouseEnter={e => { if (taskIdx !== tasks.length - 1) e.currentTarget.style.color=T.textMid; }}
                        onMouseLeave={e => { e.currentTarget.style.color=taskIdx===tasks.length-1?T.inputBdr:T.textDim; }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6,9 12,15 18,9"/>
                        </svg>
                      </button>
                    </div>
                    <button onClick={() => setTasks(ts => ts.map(t => t.id === task.id ? {...t, done: !t.done} : t))}
                      aria-label={task.done ? "Mark incomplete" : "Mark complete"}
                      style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${task.done ? T.accent : T.inputBdr}`,
                        background: task.done ? T.accent : "transparent",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s" }}>
                      {task.done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke={T.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: T.text, textDecoration: task.done ? "line-through" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.text}
                    </span>
                    <button onClick={() => setTasks(ts => ts.filter(t => t.id !== task.id))}
                      aria-label="Remove task"
                      style={{ width: 20, height: 20, borderRadius: 4, background: "transparent", border: "none",
                        cursor: "pointer", color: T.inputBdr, display: "flex", alignItems: "center",
                        justifyContent: "center", transition: "color 0.15s", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color=T.textMid)}
                      onMouseLeave={e => (e.currentTarget.style.color=T.inputBdr)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
          }
          {tasks.some(t => t.done) && (
            <button onClick={() => setTasks(ts => ts.filter(t => !t.done))}
              style={{ marginTop: 10, fontSize: 11, color: T.textDim2, background: "none",
                border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color=T.textMid)}
              onMouseLeave={e => (e.currentTarget.style.color=T.textDim2)}>
              {i18n.clear}
            </button>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ ...S.panel, bottom: 66, right: 20, width: 284, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>

          {/* ── Presets ── */}
          <p style={{ ...S.sectionLabel, marginBottom: 8 }}>{de ? "Profile" : "Presets"}</p>
          <div style={{ display: "flex", gap: 5, marginBottom: 16 }}>
            {presets.map((p, idx) => {
              const savePreset = () => {
                const snap = {
                  label: `${de ? "Profil" : "Preset"} ${idx + 1}`,
                  focus: settings.focus, shortBreak: settings.shortBreak, longBreak: settings.longBreak,
                  ambient: settings.ambient, ambientCategory: settings.ambientCategory,
                  ambientMix: settings.ambientMix, accentColor: settings.accentColor,
                  lightMode: settings.lightMode,
                };
                const next = [...presets]; next[idx] = snap;
                setPresets(next); savePresetsData(next);
              };
              const loadPreset = () => {
                if (!p) return;
                setSettings(s => ({ ...s,
                  focus: p.focus, shortBreak: p.shortBreak, longBreak: p.longBreak,
                  ambient: p.ambient, ambientCategory: p.ambientCategory,
                  ambientMix: p.ambientMix ?? "off", accentColor: p.accentColor,
                  lightMode: p.lightMode,
                }));
              };
              const deletePreset = (e) => {
                e.stopPropagation();
                const next = [...presets]; next[idx] = null;
                setPresets(next); savePresetsData(next);
              };
              return (
                <div key={idx} style={{ flex: 1, position: "relative" }}>
                  {p ? (
                    <>
                      <button onClick={loadPreset}
                        style={{ width: "100%", padding: "6px 4px", borderRadius: 8, fontSize: 10, cursor: "pointer",
                          background: T.tabBg, border: `1px solid ${T.border}`, color: T.textMid,
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "border-color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.accentColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: T.textDim2 }}>{p.focus}m</span>
                      </button>
                      <button onClick={deletePreset}
                        style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%",
                          background: T.inputBg, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 9,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <button onClick={savePreset}
                      style={{ width: "100%", padding: "6px 4px", borderRadius: 8, fontSize: 10, cursor: "pointer",
                        background: "transparent", border: `1px dashed ${T.border}`, color: T.textDim2,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "border-color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = T.textDim}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                      <span style={{ fontSize: 13 }}>+</span>
                      <span style={{ fontSize: 9 }}>{de ? "Speichern" : "Save"}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Timer ── */}
          <p style={{ ...S.sectionLabel, marginBottom: 8 }}>{de ? "Timer" : "Timer"}</p>
          <div style={{ background: T.tabBg, borderRadius: 10, marginBottom: 6 }}>
            {[["focus", modeLabels.focus],["shortBreak", de?"Kurze Pause":"Short Break"],["longBreak", de?"Lange Pause":"Long Break"]].map(([key, label], i, arr) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <DurationInput value={settings[key]} onChange={v => updateDuration(key, v)}
                    style={{ ...S.input, width: 40, padding: "3px 6px", fontSize: 13, textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: T.textDim }}>{i18n.min}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: T.tabBg, borderRadius: 10, marginBottom: 16 }}>
            {[[de?"Lange Pause nach":"Long break after","longBreakInterval",1,8],[de?"Tagesziel":"Daily goal","dailyGoal",1,20]].map(([label, key, min, max], i, arr) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                <DurationInput value={settings[key]} min={min} max={max}
                  onChange={v => setSettings(s => ({ ...s, [key]: v }))}
                  style={{ ...S.input, width: 40, padding: "3px 6px", fontSize: 13, textAlign: "center" }} />
              </div>
            ))}
          </div>

          {/* ── Sound ── */}
          <p style={{ ...S.sectionLabel, marginBottom: 8 }}>{i18n.ambient}</p>
          {(() => {
            const cat = settings.ambientCategory ?? "neural";
            const NEURAL = [["neural","🧠 Alpha"],["focusPlus","🎯 Focus+"],["flow","🌀 Flow"],["beta","🦦 Beta"],["theta","🧘 Theta"],["delta","🌙 Delta"]];
            const NATURE = [["rain","🌧 Rain"],["ocean","🌊 Ocean"],["brown","🟤 Brown"],["noise","⬜ White"],["fire","🔥 Fire"],["wind","💨 Wind"]];
            const YT_VIDEOS = [
              { id: "bMEUAVOOAls", label: "✨ Spells"      },
              { id: "Px3-TRXPtws", label: "🌌 Ultraviolets" },
              { id: "L9iFUdkIkBE", label: "🏯 Kyoto"        },
              { id: "9cRPXoJ6S9E", label: "🌄 Golden"       },
              { id: "kgk8NiflMs0", label: "🌙 Sleep"        },
              { id: "NHOFkcun06s", label: "🌅 Morning"      },
            ];
            const tabBtn = (key, label) => (
              <button key={key}
                onClick={() => setSettings(s => ({ ...s, ambientCategory: key }))}
                style={{ flex: 1, padding: "4px 6px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  letterSpacing: "0.04em", cursor: "pointer", border: "none", transition: "all 0.15s",
                  background: cat === key ? T.accent : "transparent",
                  color: cat === key ? T.bg : T.textDim }}>
                {label}
              </button>
            );
            const soundBtn = (val, label) => (
              <button key={val} className="ambient-opt"
                onClick={() => {
                  setSettings(s => {
                    if (!isRunning && s.ambientMix !== "off") previewAmbientMix(s.ambientMix);
                    return { ...s, ambient: val };
                  });
                  previewAmbient(val);
                }}
                style={{ padding: "5px 2px", borderRadius: 7, fontSize: 10,
                  background: settings.ambient === val ? T.tabActive : "transparent",
                  border: `1px solid ${settings.ambient === val ? T.accent : T.border}`,
                  color: settings.ambient === val ? T.accent : T.textDim,
                  cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                {label}
              </button>
            );
            return (
              <div style={{ marginBottom: 16 }}>
                {/* Volume row */}
                <div style={{ background: T.tabBg, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 13, color: T.text, flexShrink: 0 }}>{de ? "Lautstärke" : "Volume"}</span>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{settings.ambientVolume === 0 ? "🔇" : settings.ambientVolume < 0.4 ? "🔈" : "🔉"}</span>
                    <input type="range" min={0} max={1} step={0.01}
                      value={settings.ambientVolume}
                      onChange={e => setSettings(s => ({ ...s, ambientVolume: Number(e.target.value) }))}
                      style={{ flex: 1, accentColor: T.accent, cursor: "pointer", height: 3 }}
                      aria-label="Ambient volume" />
                    <span style={{ fontSize: 11, color: T.textDim, width: 28, textAlign: "right", flexShrink: 0 }}>
                      {Math.round(settings.ambientVolume * 100)}%
                    </span>
                  </div>
                </div>

                {/* Auto-stop row */}
                <div style={{ background: T.tabBg, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: T.text }}>{i18n.autoStop}</span>
                    <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: `1px solid ${T.border}` }}>
                      {[[0,"Off"],[30,"30m"],[60,"1h"],[120,"2h"]].map(([v, l]) => (
                        <button key={v} onClick={() => setSettings(s => ({ ...s, ambientAutoStop: v }))}
                          style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", border: "none",
                            background: settings.ambientAutoStop === v ? T.accent : "transparent",
                            color: settings.ambientAutoStop === v ? T.bg : T.textDim,
                            transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Off + category row */}
                <div style={{ background: T.tabBg, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      onClick={() => { setSettings(s => ({ ...s, ambient: "off" })); previewAmbient("off"); }}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.04em", cursor: "pointer", border: `1px solid ${T.border}`, transition: "all 0.15s",
                        background: settings.ambient === "off" ? T.tabActive : "transparent",
                        color: settings.ambient === "off" ? T.accent : T.textDim }}>
                      Off
                    </button>
                    <div style={{ display: "flex", flex: 1, gap: 2, background: T.inputBg, borderRadius: 7, padding: "2px 3px" }}>
                      {tabBtn("neural", "🧠 Neural")}
                      {tabBtn("nature", "🌿 Nature")}
                      {tabBtn("brainfm", "🎵 brain.fm")}
                    </div>
                  </div>
                </div>

                {/* Sound grid */}
                {cat !== "brainfm" && (
                  <div style={{ background: T.tabBg, borderRadius: 10, padding: "10px 10px 6px", marginBottom: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(3, 1fr)`, gap: 5 }}>
                      {(cat === "neural" ? NEURAL : NATURE).map(([v, l]) => soundBtn(v, l))}
                    </div>
                    {/* Mix row */}
                    {settings.ambient !== "off" && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Mix</span>
                          <div style={{ flex: 1, height: 1, background: T.border }} />
                          {settings.ambientMix !== "off" && (
                            <button onClick={() => setSettings(s => ({ ...s, ambientMix: "off" }))}
                              style={{ fontSize: 11, color: T.textDim, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(3, 1fr)`, gap: 5 }}>
                          {(cat === "neural" ? NEURAL : NATURE)
                            .filter(([v]) => v !== settings.ambient)
                            .map(([v, l]) => (
                              <button key={v}
                                onClick={() => {
                                  setSettings(s => {
                                    const next = s.ambientMix === v ? "off" : v;
                                    if (!isRunning) {
                                      if (s.ambient !== "off") previewAmbient(s.ambient);
                                      previewAmbientMix(next);
                                    }
                                    return { ...s, ambientMix: next };
                                  });
                                }}
                                style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10,
                                  background: settings.ambientMix === v ? T.inputBg : "transparent",
                                  border: `1px solid ${settings.ambientMix === v ? `${T.accent}88` : T.border}`,
                                  color: settings.ambientMix === v ? T.accent : T.textDim2,
                                  cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                                {l}
                              </button>
                            ))}
                        </div>
                        {settings.ambientMix !== "off" && (
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 10, color: T.textDim2, flexShrink: 0 }}>{i18n.mixRatio}</span>
                            <input type="range" min={0.1} max={1} step={0.05}
                              value={settings.ambientMixRatio}
                              onChange={e => setSettings(s => ({ ...s, ambientMixRatio: Number(e.target.value) }))}
                              style={{ flex: 1, accentColor: T.accent, cursor: "pointer", height: 3 }}
                              aria-label="Mix ratio" />
                            <span style={{ fontSize: 10, color: T.textDim2, width: 26, flexShrink: 0 }}>
                              {Math.round(settings.ambientMixRatio * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* brain.fm tab */}
                {cat === "brainfm" && (
                  <div style={{ background: T.tabBg, borderRadius: 10, padding: "10px 10px 8px", marginBottom: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 6 }}>
                      {YT_VIDEOS.map(v => (
                        <button key={v.id}
                          onClick={() => {
                            setYtVideoId(v.id);
                            setYtActivated(false); ytActivatedRef.current = false;
                            setSettings(s => ({ ...s, ambient: "youtube" }));
                            if (ytPlayerRef.current) {
                              try { ytPlayerRef.current.destroy(); } catch (_) {}
                              ytPlayerRef.current = null;
                            }
                          }}
                          style={{ padding: "5px 2px", borderRadius: 7, fontSize: 10,
                            background: ytVideoId === v.id && settings.ambient === "youtube" ? T.tabActive : "transparent",
                            border: `1px solid ${ytVideoId === v.id && settings.ambient === "youtube" ? T.accent : T.border}`,
                            color: ytVideoId === v.id && settings.ambient === "youtube" ? T.accent : T.textDim,
                            cursor: "pointer", transition: "all 0.15s", textAlign: "center" }}>
                          <div style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.label}</div>
                        </button>
                      ))}
                    </div>
                    {ytVideoId && settings.ambient === "youtube" && !ytActivated && (
                      <button
                        onClick={() => {
                          if (!window.YT || !window.YT.Player) return;
                          if (ytPlayerRef.current) {
                            try { ytPlayerRef.current.destroy(); } catch (_) {}
                            ytPlayerRef.current = null;
                          }
                          const vid = ytVideoId;
                          ytPlayerRef.current = new window.YT.Player("yt-player-div", {
                            videoId: vid,
                            playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
                            events: {
                              onReady: (e) => { e.target.setVolume(Math.round(settingsRef.current.ambientVolume * 100)); e.target.playVideo(); setYtActivated(true); ytActivatedRef.current = true; },
                              onStateChange: (e) => { if (e.data === 0) { e.target.seekTo(0); e.target.playVideo(); } },
                            },
                          });
                        }}
                        style={{ width: "100%", padding: "7px 0", borderRadius: 7,
                          background: T.tabActive, border: `1px solid ${T.accent}`,
                          color: T.accent, fontSize: 10, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {i18n.audioStart}
                      </button>
                    )}
                    {ytVideoId && settings.ambient === "youtube" && ytActivated && (
                      <p style={{ fontSize: 10, color: T.accent, margin: 0, textAlign: "center" }}>{i18n.audioRunning}</p>
                    )}
                  </div>
                )}

                {/* EQ */}
                {settings.ambient !== "off" && (() => {
                  const ytActive = settings.ambient === "youtube";
                  const ALL_BANDS = [["sub","Sub","60Hz"],["bass","Bass","200Hz"],["lowMid","Lo Mid","500Hz"],["mid","Mid","1kHz"],["upperMid","Hi Mid","3kHz"],["presence","Pres","6kHz"],["air","Air","10kHz"]];
                  const BASIC_BANDS = [["bass","Bass","200Hz"],["mid","Mid","1kHz"],["air","Treble","10kHz"]];
                  const bands = settings.eqMode === "advanced" ? ALL_BANDS : BASIC_BANDS;
                  const resetEq = { sub: 0, bass: 0, lowMid: 0, mid: 0, upperMid: 0, presence: 0, air: 0 };
                  return (
                    <div style={{ background: T.tabBg, borderRadius: 10, padding: "10px 12px 12px", marginBottom: 6,
                      opacity: ytActive ? 0.35 : 1, pointerEvents: ytActive ? "none" : "auto", transition: "opacity 0.2s" }}>
                      {ytActive && (
                        <p style={{ fontSize: 9, color: T.textDim, margin: "0 0 8px", textAlign: "center" }}>{i18n.noInternet}</p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textDim, letterSpacing: "0.1em", textTransform: "uppercase" }}>{i18n.equalizer}</span>
                          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
                            {["basic","advanced"].map(m => (
                              <button key={m} onClick={() => setSettings(s => ({ ...s, eqMode: m }))}
                                style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", border: "none",
                                  background: settings.eqMode === m ? T.accent : "transparent",
                                  color: settings.eqMode === m ? T.bg : T.textDim, transition: "all 0.15s" }}>
                                {m === "basic" ? "Basic" : "Adv"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => setSettings(s => ({ ...s, eq: resetEq }))}
                          style={{ fontSize: 11, color: T.textDim, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                          aria-label="Reset EQ">↺</button>
                      </div>
                      {settings.eqMode === "advanced" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                          {bands.map(([key, label, hz]) => (
                            <div key={key} style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              <span style={{ color: settings.eq[key] !== 0 ? T.accent : T.textDim2, fontSize: 10, fontWeight: settings.eq[key] !== 0 ? 600 : 400 }}>
                                {settings.eq[key] > 0 ? `+${settings.eq[key]}` : settings.eq[key]}
                              </span>
                              <div style={{ height: 80, width: "100%", position: "relative" }}>
                                <input type="range" min={-12} max={12} step={1}
                                  value={settings.eq[key]}
                                  onChange={e => setSettings(s => ({ ...s, eq: { ...s.eq, [key]: Number(e.target.value) } }))}
                                  style={{ position: "absolute", width: 72, top: "50%", left: "50%",
                                    transform: "translate(-50%, -50%) rotate(-90deg)", accentColor: T.accent, cursor: "pointer" }}
                                  aria-label={`${label} EQ`} />
                              </div>
                              <span style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.04em",
                                textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", width: "100%" }}>{label}</span>
                              <span style={{ fontSize: 10, color: T.textDim2, whiteSpace: "nowrap" }}>{hz}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10 }}>
                          {bands.map(([key, label, hz]) => (
                            <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              <span style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>{label}</span>
                              <span style={{ fontSize: 10, color: T.textDim2 }}>{hz}</span>
                              <input type="range" min={-12} max={12} step={1}
                                value={settings.eq[key]}
                                onChange={e => setSettings(s => ({ ...s, eq: { ...s.eq, [key]: Number(e.target.value) } }))}
                                style={{ width: "100%", accentColor: T.accent, cursor: "pointer" }}
                                aria-label={`${label} EQ`} />
                              <span style={{ fontSize: 10, color: settings.eq[key] !== 0 ? T.accent : T.textDim2 }}>
                                {settings.eq[key] > 0 ? `+${settings.eq[key]}` : settings.eq[key]} dB
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── Verhalten ── */}
          <p style={{ ...S.sectionLabel, marginBottom: 8 }}>{de ? "Verhalten" : "Behavior"}</p>
          <div style={{ background: T.tabBg, borderRadius: 10, marginBottom: 16 }}>
            {[["autoStart",i18n.autoStart],["sound",i18n.chime],["tick",i18n.tick]].map(([key, label], i, arr) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                <Toggle val={settings[key]} onToggle={() => setSettings(s => ({ ...s, [key]: !s[key] }))} label={label} />
              </div>
            ))}
          </div>

          {/* ── Darstellung ── */}
          <p style={{ ...S.sectionLabel, marginBottom: 8 }}>{de ? "Darstellung" : "Appearance"}</p>
          <div style={{ background: T.tabBg, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.text }}>{i18n.autoDark}</span>
              <Toggle val={settings.autoDark} onToggle={() => setSettings(s => ({ ...s, autoDark: !s.autoDark }))} label="Auto dark" />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.text }}>{de ? "Hell-Modus" : "Light mode"}</span>
              <Toggle val={settings.lightMode} onToggle={() => setSettings(s => ({ ...s, lightMode: !s.lightMode }))} label="Light Mode" />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.text }}>{de ? "Sprache" : "Language"}</span>
              <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: `1px solid ${T.border}` }}>
                {["de","en"].map(l => (
                  <button key={l} onClick={() => setSettings(s => ({ ...s, lang: l }))}
                    style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                      background: settings.lang === l ? T.accent : "transparent",
                      color: settings.lang === l ? T.bg : T.textMid,
                      transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.text }}>{i18n.clockSizeLbl}</span>
              <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: `1px solid ${T.border}` }}>
                {["S","M","L"].map(sz => (
                  <button key={sz} onClick={() => setSettings(s => ({ ...s, clockSize: sz }))}
                    style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                      background: settings.clockSize === sz ? T.accent : "transparent",
                      color: settings.clockSize === sz ? T.bg : T.textMid,
                      transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}>
                    {sz}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.text }}>{de ? "Akzentfarbe" : "Accent"}</span>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {["#e07b39","#4a9eff","#7c5cbf","#3db87a","#e05555","#d4a017"].map(c => (
                  <button key={c} onClick={() => setSettings(s => ({ ...s, accentColor: c }))}
                    title={c}
                    style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: "none",
                      cursor: "pointer", outline: settings.accentColor === c ? `2px solid ${c}` : "none",
                      outlineOffset: 2, transition: "outline 0.15s", flexShrink: 0 }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px" }}>
              <span style={{ fontSize: 13, color: T.text }}>{i18n.bgStyleLbl}</span>
              <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: `1px solid ${T.border}` }}>
                {[["none","—"],["dots","···"],["mesh","▦"]].map(([v, l]) => (
                  <button key={v} onClick={() => setSettings(s => ({ ...s, bgStyle: v }))}
                    style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                      background: settings.bgStyle === v ? T.accent : "transparent",
                      color: settings.bgStyle === v ? T.bg : T.textMid,
                      transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Daten */}
          <div style={{ ...S.sectionLabel, marginTop: 10 }}>{de ? "Daten" : "Data"}</div>
          {achievements.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ ...S.sectionLabel, marginTop: 10 }}>{i18n.achievements}</div>
              <div style={{ background: T.tabBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ACHIEVEMENT_DEFS.filter(d => achievements.includes(d.id)).map(d => (
                    <span key={d.id} title={de ? d.de : d.en}
                      style={{ fontSize: 18, cursor: "default" }}>
                      {d.icon}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div style={{ background: T.tabBg, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <button onClick={() => {
              if (!window.confirm(de ? "Alle Statistiken zurücksetzen?" : "Reset all statistics?")) return;
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(WEEK_KEY);
              localStorage.removeItem(TOTALS_KEY);
              setTodaySessions(0); setBreakCycleCount(0); setStreak(0);
              setWeekData({}); setTotals({});
            }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none",
              textAlign: "left", fontSize: 13, color: "#e05050", cursor: "pointer", fontFamily: "inherit" }}>
              {de ? "Statistiken zurücksetzen" : "Reset statistics"}
            </button>
            <button onClick={() => {
              const rows = [["Datum","Sessions"]];
              Object.entries(weekData).sort().forEach(([d, c]) => rows.push([d, c]));
              rows.push([]);
              rows.push(["Gesamt Sessions", totals.sessions ?? 0]);
              rows.push(["Fokus Minuten", totals.minutes ?? 0]);
              rows.push(["Längste Serie", totals.longestStreak ?? 0]);
              const csv = rows.map(r => r.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url;
              a.download = `focus-partner-${todayStr()}.csv`; a.click();
              URL.revokeObjectURL(url);
            }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none",
              textAlign: "left", fontSize: 13, color: T.textMid, cursor: "pointer", fontFamily: "inherit",
              borderTop: `1px solid ${T.border}` }}>
              {de ? "Statistiken exportieren (CSV)" : "Export statistics (CSV)"}
            </button>
          </div>

        </div>
      )}

      {/* YouTube player — always in DOM so YT.Player() can target it */}
      <div id="yt-player-div" style={{ width: 1, height: 1, opacity: 0, position: "fixed", top: -10, left: -10, pointerEvents: "none" }} />

      {/* Achievement toast */}
      {newAchievement && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: T.panelBg, border: `1px solid ${T.accent}66`,
          borderRadius: 14, padding: "10px 18px", zIndex: 70,
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${T.accent}22`,
          animation: "panelFade 0.3s ease-out",
        }}>
          <span style={{ fontSize: 22 }}>{newAchievement.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              {de ? "Erfolg freigeschaltet" : "Achievement unlocked"}
            </div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{newAchievement.name}</div>
          </div>
        </div>
      )}

      {/* Day summary overlay */}
      {showDaySummary && (
        <div onClick={() => setShowDaySummary(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
            animation: "overlayIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.panelBg, border: `1px solid ${T.border}`,
            borderRadius: 20, padding: "32px 36px", maxWidth: 300, textAlign: "center",
            boxShadow: T.shadow }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.text, marginBottom: 6,
              fontFamily: "DM Serif Display, serif" }}>
              {de ? "Tagesziel erreicht!" : "Daily goal reached!"}
            </div>
            <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 20 }}>
              {de
                ? `${todaySessions} Sessions · ${Math.round(todaySessions * settings.focus)} Min. Fokus`
                : `${todaySessions} sessions · ${Math.round(todaySessions * settings.focus)} min focused`}
            </div>
            <div style={{ display: "flex", gap: 18, justifyContent: "center", marginBottom: 22 }}>
              {[
                { val: todaySessions, label: de ? "Heute" : "Today" },
                { val: streak > 0 ? `🔥 ${streak}` : "–", label: de ? "Serie" : "Streak" },
                { val: `${Math.round(todaySessions * settings.focus)} min`, label: de ? "Fokus" : "Focus" },
              ].map(({ val, label }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.accent }}>{val}</span>
                  <span style={{ fontSize: 10, color: T.textDim2, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowDaySummary(false)}
              style={{ background: T.accent, color: T.bg, border: "none", borderRadius: 10,
                padding: "10px 30px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {de ? "Super 💪" : "Awesome 💪"}
            </button>
          </div>
        </div>
      )}

      {/* Welcome popup — shown once on first visit */}
      {showWelcome && (
        <div onClick={() => { localStorage.setItem("focus_welcomed", "1"); setShowWelcome(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
            animation: "overlayIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.panelBg, border: `1px solid ${T.border}`,
            borderRadius: 20, padding: "32px 36px", maxWidth: 300, textAlign: "center",
            boxShadow: T.shadow }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🦦</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.text, marginBottom: 10,
              fontFamily: "DM Serif Display, serif", lineHeight: 1.3 }}>
              {de ? "Willkommen bei Focus Partner" : "Welcome to Focus Partner"}
            </div>
            <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65, marginBottom: 22 }}>
              {de
                ? <>Tipp: Öffne die <strong style={{ color: T.text }}>Einstellungen ⚙️</strong> (rechts unten) um Ambient Sounds einzustellen — Rain, Neural, brain.fm und mehr.</>
                : <>Tip: Open <strong style={{ color: T.text }}>Settings ⚙️</strong> (bottom right) to set up ambient sounds — Rain, Neural, brain.fm and more.</>}
            </div>
            <button onClick={() => { localStorage.setItem("focus_welcomed", "1"); setShowWelcome(false); }}
              style={{ background: T.accent, color: T.bg, border: "none", borderRadius: 10,
                padding: "10px 30px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "opacity 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              {de ? "Los geht's" : "Let's go"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
