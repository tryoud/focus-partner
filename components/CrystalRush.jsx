import { useEffect, useRef, useState, useCallback } from "react";
import { loadGameHighscore, saveGameHighscore } from "../storage.js";

const GAME_DURATION = 60;
const CANVAS_W_DESKTOP = 400;
const CANVAS_W_MOBILE  = 320;
const CANVAS_H = 300;
const PLAYER_W = 32;
const PLAYER_H = 32;
const PLAYER_Y = 260;
const CRYSTAL_SIZE = 16;

function scoreToHighscore(score) { return Math.max(loadGameHighscore("crystal"), score); }

function saveHighscore(score) {
  saveGameHighscore("crystal", score);
}

function loadHighscore() {
  return loadGameHighscore("crystal");
}

function getPhase(elapsed) {
  if (elapsed >= 50) return { speed: 5, spawnMs: 400, fever: true };
  if (elapsed >= 35) return { speed: 4, spawnMs: 400, fever: false };
  if (elapsed >= 15) return { speed: 3, spawnMs: 600, fever: false };
  return { speed: 2, spawnMs: 800, fever: false };
}

function getComboMultiplier(combo) {
  if (combo >= 8) return 3;
  if (combo >= 3) return 2;
  return 1;
}

function spawnCrystal(canvasW, lm, elapsed) {
  const r = Math.random();
  let type, color, pts;
  if (r < 0.05) {
    type = "crystal"; color = "#a78bfa"; pts = 5;
  } else if (r < 0.20) {
    type = "gold"; color = "#f59e0b"; pts = 3;
  } else if (r < 0.35 && elapsed >= 15) {
    type = "bad"; color = "#ef4444"; pts = -3;
  } else {
    type = "normal"; color = lm ? "#64748b" : "#e2e8f0"; pts = 1;
  }
  return {
    id: Math.random(),
    x: CRYSTAL_SIZE + Math.random() * (canvasW - CRYSTAL_SIZE * 2),
    y: -CRYSTAL_SIZE,
    type, color, pts,
  };
}

function drawPlayer(ctx, x, canvasW, accent) {
  const px = Math.max(PLAYER_W / 2, Math.min(canvasW - PLAYER_W / 2, x));
  ctx.fillStyle = accent;
  ctx.fillRect(px - 14, PLAYER_Y - 14, 28, 24);
  ctx.fillRect(px - 12, PLAYER_Y - 20, 8, 8);
  ctx.fillRect(px + 4, PLAYER_Y - 20, 8, 8);
  ctx.fillStyle = "#0e0c09";
  ctx.fillRect(px - 7, PLAYER_Y - 8, 4, 4);
  ctx.fillRect(px + 3, PLAYER_Y - 8, 4, 4);
  ctx.fillRect(px - 3, PLAYER_Y - 1, 6, 2);
}

function drawCrystal(ctx, crystal) {
  ctx.save();
  ctx.translate(crystal.x, crystal.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = crystal.color;
  ctx.shadowColor = crystal.color;
  ctx.shadowBlur = crystal.type === "bad" ? 10 : 6;
  ctx.fillRect(-CRYSTAL_SIZE / 2, -CRYSTAL_SIZE / 2, CRYSTAL_SIZE, CRYSTAL_SIZE);
  ctx.restore();
}

function checkCollision(crystal, playerX, canvasW) {
  const px = Math.max(PLAYER_W / 2, Math.min(canvasW - PLAYER_W / 2, playerX));
  return (
    crystal.y >= PLAYER_Y - PLAYER_H / 2 &&
    crystal.y <= PLAYER_Y + PLAYER_H / 2 + 8 &&
    crystal.x >= px - PLAYER_W / 2 - 4 &&
    crystal.x <= px + PLAYER_W / 2 + 4
  );
}

export default function CrystalRush({ onComplete, onSkip, T, lm }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    playerX: 200,
    crystals: [],
    score: 0,
    elapsed: 0,
    lastTime: null,
    lastSpawn: 0,
    running: true,
    popups: [],
    feverPulse: 0,
    combo: 0,
    redFlash: 0,
    feverSoundPlayed: false,
  });
  const keysRef = useRef({ left: false, right: false });
  const rafRef = useRef(null);
  const themeRef = useRef({ T, lm });
  const audioCtxRef = useRef(null);
  useEffect(() => { themeRef.current = { T, lm }; }, [T, lm]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const canvasW = isMobile ? CANVAS_W_MOBILE : CANVAS_W_DESKTOP;

  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [highscore] = useState(loadHighscore);
  const [newRecord, setNewRecord] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const confirmQuitRef = useRef(false);

  // ── Audio helpers ──────────────────────────────────────────────────────────
  function getAudioCtx() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function playCollect(pts) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const freq = pts >= 5 ? 880 : pts >= 3 ? 660 : 440;
      const dur = pts >= 5 ? 0.12 : pts >= 3 ? 0.10 : 0.08;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + dur);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
    } catch {}
  }

  function playBadHit() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }

  function playFeverStart() {
    try {
      const ctx = getAudioCtx();
      [440, 550, 660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.1);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.1);
      });
    } catch {}
  }

  function playGameOver() {
    try {
      const ctx = getAudioCtx();
      [440, 330, 220].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.18);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.18);
      });
    } catch {}
  }

  const endGame = useCallback((score) => {
    stateRef.current.running = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (score > highscore) { saveHighscore(score); setNewRecord(true); }
    setFinalScore(score);
    setGameOver(true);
    playGameOver();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highscore]);

  const resetGame = useCallback(() => {
    stateRef.current = {
      playerX: canvasW / 2,
      crystals: [],
      score: 0,
      elapsed: 0,
      lastTime: null,
      lastSpawn: 0,
      running: true,
      popups: [],
      feverPulse: 0,
      combo: 0,
      redFlash: 0,
      feverSoundPlayed: false,
    };
    setGameOver(false);
    setFinalScore(0);
    setNewRecord(false);
    setPaused(false);
    pausedRef.current = false;
  }, [canvasW]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;
    s.playerX = canvasW / 2;

    const loop = (ts) => {
      if (!s.running) return;
      rafRef.current = requestAnimationFrame(loop);

      if (document.hidden || pausedRef.current) {
        s.lastTime = ts;
        return;
      }

      const { T: th, lm: isLight } = themeRef.current;

      const dt = s.lastTime ? Math.min(ts - s.lastTime, 100) : 16;
      s.lastTime = ts;
      s.elapsed += dt / 1000;

      if (s.elapsed >= GAME_DURATION) {
        endGame(s.score);
        return;
      }

      const phase = getPhase(s.elapsed);
      const timeLeft = GAME_DURATION - s.elapsed;
      const fever = timeLeft <= 10;

      // Fever sound — once
      if (fever && !s.feverSoundPlayed) {
        s.feverSoundPlayed = true;
        playFeverStart();
      }

      const spd = 4 * (dt / 16);
      if (keysRef.current.left)  s.playerX -= spd;
      if (keysRef.current.right) s.playerX += spd;
      s.playerX = Math.max(PLAYER_W / 2, Math.min(canvasW - PLAYER_W / 2, s.playerX));

      if (ts - s.lastSpawn > phase.spawnMs) {
        s.crystals.push(spawnCrystal(canvasW, isLight, s.elapsed));
        s.lastSpawn = ts;
      }

      // Move + collision
      const hit = [];
      s.crystals = s.crystals.filter(c => {
        c.y += phase.speed * (dt / 16);
        if (checkCollision(c, s.playerX, canvasW)) {
          if (c.type === "bad") {
            s.score = Math.max(0, s.score - 3);
            s.combo = 0;
            s.redFlash = 8;
            playBadHit();
            hit.push({ x: c.x, y: PLAYER_Y - 20, text: "-3", age: 0, bad: true });
          } else {
            s.combo++;
            const mult = getComboMultiplier(s.combo);
            const pts = c.pts * mult * (fever ? 2 : 1);
            s.score += pts;
            playCollect(c.pts);
            hit.push({ x: c.x, y: PLAYER_Y - 20, text: `+${pts}`, age: 0, bad: false });
          }
          return false;
        }
        // Crystal fell off — reset combo only for good crystals
        if (c.y >= CANVAS_H + CRYSTAL_SIZE) {
          if (c.type !== "bad") s.combo = 0;
          return false;
        }
        return true;
      });
      s.popups.push(...hit);
      s.popups = s.popups.filter(p => { p.age += dt; return p.age < 700; });

      s.feverPulse = fever ? (s.feverPulse + dt * 0.004) % (Math.PI * 2) : 0;

      // ── Draw ──────────────────────────────────────────────────────────────
      // Background
      if (fever) {
        const pulse = 0.5 + 0.5 * Math.sin(s.feverPulse);
        if (isLight) {
          ctx.fillStyle = `rgb(${Math.round(245 - pulse * 30)},${Math.round(220 - pulse * 40)},${Math.round(200 - pulse * 60)})`;
        } else {
          ctx.fillStyle = `rgb(${Math.round(14 + pulse * 12)},${Math.round(12 + pulse * 2)},9)`;
        }
      } else {
        ctx.fillStyle = th.card;
      }
      ctx.fillRect(0, 0, canvasW, CANVAS_H);

      // Ground line
      ctx.strokeStyle = th.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, PLAYER_Y + PLAYER_H / 2 + 4);
      ctx.lineTo(canvasW, PLAYER_Y + PLAYER_H / 2 + 4);
      ctx.stroke();

      s.crystals.forEach(c => drawCrystal(ctx, c));
      drawPlayer(ctx, s.playerX, canvasW, th.accent);

      // Score popups
      ctx.font = "bold 14px monospace";
      s.popups.forEach(p => {
        ctx.globalAlpha = 1 - p.age / 700;
        ctx.fillStyle = p.bad ? "#ef4444" : "#f59e0b";
        ctx.fillText(p.text, p.x - 8, p.y - (p.age / 700) * 30);
      });
      ctx.globalAlpha = 1;

      // Timer bar
      const pct = s.elapsed / GAME_DURATION;
      ctx.fillStyle = th.inputBg;
      ctx.fillRect(0, 0, canvasW, 6);
      ctx.fillStyle = fever ? "#f97316" : th.accent;
      ctx.fillRect(0, 0, canvasW * (1 - pct), 6);

      // Combo text
      if (s.combo >= 3) {
        const mult = getComboMultiplier(s.combo);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = mult >= 3 ? "#f97316" : "#fbbf24";
        ctx.globalAlpha = 1;
        ctx.fillText(`×${mult} COMBO`, 8, 20);
      }

      // FEVER text
      if (fever) {
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = "#f97316";
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(s.feverPulse * 4);
        ctx.fillText("🔥 FEVER!", canvasW / 2 - 36, 24);
        ctx.globalAlpha = 1;
      }

      // Red flash on bad hit
      if (s.redFlash > 0) {
        ctx.fillStyle = `rgba(239,68,68,${(s.redFlash / 8) * 0.35})`;
        ctx.fillRect(0, 0, canvasW, CANVAS_H);
        s.redFlash--;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
    };
  }, [canvasW, endGame]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") keysRef.current.left  = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
      if (e.key === " ") {
        e.preventDefault();
        if (!confirmQuitRef.current) {
          pausedRef.current = !pausedRef.current;
          setPaused(p => !p);
        }
      }
      if (e.key === "Escape") {
        if (confirmQuitRef.current) {
          confirmQuitRef.current = false;
          setConfirmQuit(false);
          pausedRef.current = false;
          setPaused(false);
        } else {
          confirmQuitRef.current = true;
          setConfirmQuit(true);
          pausedRef.current = true;
          setPaused(true);
        }
      }
      if (e.key === "Enter" && confirmQuitRef.current) {
        onSkip();
      }
    };
    const onUp = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") keysRef.current.left  = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [onSkip]);

  // ── Pause on tab hide ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => { pausedRef.current = document.hidden; setPaused(document.hidden); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const isNewRecord = newRecord && finalScore > 0;

  // Live HUD
  const [hudScore, setHudScore] = useState(0);
  const [hudTimeLeft, setHudTimeLeft] = useState(GAME_DURATION);
  useEffect(() => {
    const id = setInterval(() => {
      if (!gameOver) {
        setHudScore(stateRef.current.score);
        setHudTimeLeft(Math.max(0, Math.ceil(GAME_DURATION - stateRef.current.elapsed)));
      }
    }, 250);
    return () => clearInterval(id);
  }, [gameOver]);

  const mm = String(Math.floor(hudTimeLeft / 60)).padStart(2, "0");
  const ss = String(hudTimeLeft % 60).padStart(2, "0");

  const btnBase = {
    background: "none", border: "none", cursor: "pointer",
    fontFamily: "inherit", padding: "2px 6px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      fontFamily: "'DM Sans', monospace", userSelect: "none" }}>

      {/* HUD bar */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "6px 10px", background: T.card,
        borderRadius: "12px 12px 0 0", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, color: T.textMid, letterSpacing: "0.08em" }}>
          {mm}:{ss}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: hudTimeLeft <= 10 ? "#f97316" : T.accent }}>
          {hudScore} Pkt
        </span>
        <span style={{ fontSize: 11, color: T.textDim }}>
          Best {highscore}
        </span>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={canvasW} height={CANVAS_H}
          style={{ display: "block", borderRadius: gameOver ? 0 : "0 0 0 0" }} />

        {/* Confirm quit overlay */}
        {confirmQuit && !gameOver && (
          <div style={{ position: "absolute", inset: 0,
            background: lm ? "rgba(245,240,234,0.92)" : "rgba(0,0,0,0.88)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Spiel beenden?</div>
            <div style={{ fontSize: 11, color: T.textMid }}>Enter = Ja &nbsp;·&nbsp; Esc = Nein</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={onSkip}
                style={{ padding: "7px 18px", borderRadius: 8, border: "none",
                  background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>
                Beenden
              </button>
              <button onClick={() => { confirmQuitRef.current = false; setConfirmQuit(false); pausedRef.current = false; setPaused(false); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.inputBg, color: T.textMid, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit" }}>
                Weiter
              </button>
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {paused && !confirmQuit && !gameOver && (
          <div style={{ position: "absolute", inset: 0,
            background: lm ? "rgba(245,240,234,0.75)" : "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: T.accent, letterSpacing: "0.1em" }}>
            PAUSIERT
          </div>
        )}

        {/* Game Over overlay */}
        {gameOver && (
          <div style={{ position: "absolute", inset: 0,
            background: lm ? "rgba(237,232,224,0.97)" : "rgba(14,12,9,0.96)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 13, color: T.textMid, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Game Over
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: T.accent, lineHeight: 1 }}>
              {finalScore}
            </div>
            <div style={{ fontSize: 12, color: T.textMid }}>Punkte</div>

            {isNewRecord && (
              <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>
                🎉 Neuer Rekord!
              </div>
            )}

            <div style={{ fontSize: 13, color: T.textMid }}>
              Rekord: {Math.max(highscore, finalScore)} Pkt
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { resetGame(); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.inputBg, color: T.textMid, fontSize: 13, cursor: "pointer",
                  fontFamily: "inherit" }}>
                Nochmal!
              </button>
              <button onClick={() => onComplete()}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none",
                  background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>
                Fertig
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile touch controls */}
      {isMobile && !gameOver && (
        <div style={{ width: canvasW, display: "flex", gap: 2 }}>
          <button
            onPointerDown={() => keysRef.current.left = true}
            onPointerUp={() => keysRef.current.left = false}
            onPointerLeave={() => keysRef.current.left = false}
            style={{ flex: 1, height: 52, fontSize: 22, background: T.inputBg,
              border: `1px solid ${T.border}`, borderTop: "none", cursor: "pointer",
              color: T.textMid, fontFamily: "inherit" }}>
            ←
          </button>
          <button
            onPointerDown={() => keysRef.current.right = true}
            onPointerUp={() => keysRef.current.right = false}
            onPointerLeave={() => keysRef.current.right = false}
            style={{ flex: 1, height: 52, fontSize: 22, background: T.inputBg,
              border: `1px solid ${T.border}`, borderTop: "none", cursor: "pointer",
              color: T.textMid, fontFamily: "inherit" }}>
            →
          </button>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "5px 10px", background: T.bg,
        borderRadius: "0 0 12px 12px", borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 10, color: T.textDim }}>← → bewegen</span>
        <button
          onClick={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p); }}
          style={{ ...btnBase, fontSize: 10, color: T.textMid }}>
          {paused ? "▶ Weiter" : "⏸ Pause"}
        </button>
        <button onClick={onSkip} style={{ ...btnBase, fontSize: 10, color: T.textDim }}>
          Beenden ✕
        </button>
      </div>
    </div>
  );
}
