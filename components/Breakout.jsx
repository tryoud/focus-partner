import { useEffect, useRef, useState, useCallback } from "react";
import { loadGameHighscore, saveGameHighscore } from "../storage.js";

const GAME_DURATION = 60;
const CANVAS_H = 300;
const PADDLE_H = 10;
const PADDLE_Y = 278;
const BALL_R = 7;
const MAX_LIVES = 3;
function loadHighscore() { return loadGameHighscore("breakout"); }
function saveHighscore(v) { saveGameHighscore("breakout", v); }

// 10 procedural patterns — picked randomly each game
const PATTERNS = [
  (r, c, rows, cols) => true,                                                       // full
  (r, c, rows, cols) => (r + c) % 2 === 0,                                         // checkerboard
  (r, c, rows, cols) => r % 2 === 0,                                               // alternate rows
  (r, c, rows, cols) => c % 2 === 0,                                               // alternate cols
  (r, c, rows, cols) => r === 0 || r === rows-1 || c === 0 || c === cols-1,        // hollow border
  (r, c, rows, cols) => r === Math.floor(rows/2) || c === Math.floor(cols/2),      // plus / cross
  (r, c, rows, cols) => (r % 2 === 0) ? (c % 2 === 0) : (c % 2 === 1),           // zigzag
  (r, c, rows, cols) => c % 3 !== 1,                                               // vertical stripes
  (r, c, rows, cols) => Math.random() < 0.7,                                       // sparse random
  (r, c, rows, cols) => Math.random() < 0.88,                                      // dense random
];

function makeBricks(cols, rows, canvasW, brickW, brickH, gap) {
  const offsetX = (canvasW - cols * (brickW + gap) + gap) / 2;
  const colors  = ["#e07b39","#f59e0b","#34d399","#60a5fa","#a78bfa"];
  const patternFn = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

  const bricks = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (patternFn(r, c, rows, cols))
        bricks.push({ x: offsetX + c * (brickW + gap), y: 28 + r * (brickH + gap),
          w: brickW, h: brickH, color: colors[r % colors.length], alive: true });

  // Fallback: if too few bricks (e.g. very sparse roll), regenerate
  return bricks.length >= 8 ? bricks : makeBricks(cols, rows, canvasW, brickW, brickH, gap);
}

export default function Breakout({ onComplete, onSkip, T, lm }) {
  const canvasRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const difficulty = isMobile
    ? { canvasW: 320, cols: 6, brickW: 44, brickGap: 4, paddleW: 58, paddleSpeed: 8.4, launchVx: 2.4, launchVy: -2.9, bounceVxScale: 3.4 }
    : { canvasW: 400, cols: 8, brickW: 42, brickGap: 5, paddleW: 88, paddleSpeed: 7.8, launchVx: 2.1, launchVy: -2.6, bounceVxScale: 3.0 };
  const canvasW = difficulty.canvasW;
  const cols = difficulty.cols;
  const rows = 5;
  const brickW = difficulty.brickW;
  const brickH = 14;
  const brickGap = difficulty.brickGap;

  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef({ left: false, right: false });
  const themeRef = useRef({ T, lm });
  const audioCtxRef = useRef(null);
  const roundRef = useRef(1);
  const scoreRef = useRef(0);
  useEffect(() => { themeRef.current = { T, lm }; }, [T, lm]);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [highscore] = useState(loadHighscore);
  const [newRecord, setNewRecord] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const confirmQuitRef = useRef(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [round, setRound] = useState(1);

  const getRoundSettings = useCallback((roundNumber) => {
    const speedBoost = 1 + (roundNumber - 1) * 0.14;
    const paddleScale = Math.max(0.72, 1 - (roundNumber - 1) * 0.05);
    return {
      paddleW: Math.round(difficulty.paddleW * paddleScale),
      paddleSpeed: difficulty.paddleSpeed * Math.min(1.35, 1 + (roundNumber - 1) * 0.04),
      launchVx: difficulty.launchVx * speedBoost,
      launchVy: difficulty.launchVy * speedBoost,
      bounceVxScale: difficulty.bounceVxScale * Math.min(1.45, 1 + (roundNumber - 1) * 0.06),
    };
  }, [difficulty]);

  function getAudioCtx() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }
  function playBrick() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
    } catch {}
  }
  function playWall() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start(); osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }
  function playLose() {
    try {
      const ctx = getAudioCtx();
      [220, 180, 140].forEach((f, i) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.12);
        g.gain.setValueAtTime(0.14, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.14);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.14);
      });
    } catch {}
  }

  function initState(roundNumber) {
    const roundSettings = getRoundSettings(roundNumber);
    const bricks = makeBricks(cols, rows, canvasW, brickW, brickH, brickGap);
    return {
      round: roundNumber,
      roundSettings,
      paddleX: canvasW / 2,
      ball: {
        x: canvasW / 2,
        y: PADDLE_Y - BALL_R - 2,
        vx: roundSettings.launchVx,
        vy: roundSettings.launchVy,
      },
      bricks,
      totalBricks: bricks.length,
      clearedBricks: 0,
      score: scoreRef.current,
      lives: MAX_LIVES,
      elapsed: 0,
      lastTime: null,
      running: true,
      ballLaunched: false,
    };
  }

  const endGame = useCallback((score, didWin) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stateRef.current.running = false;
    scoreRef.current = score;
    if (score > highscore) { saveHighscore(score); setNewRecord(true); }
    setFinalScore(score);
    setWon(didWin);
    setGameOver(true);
    playLose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highscore]);

  const resetGame = useCallback((advanceRound) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    const nextRound = advanceRound ? roundRef.current + 1 : 1;
    roundRef.current = nextRound;
    setRound(nextRound);
    scoreRef.current = advanceRound ? finalScore : 0;
    setGameOver(false); setWon(false); setFinalScore(0); setNewRecord(false);
    setLives(MAX_LIVES); setPaused(false); pausedRef.current = false;
    confirmQuitRef.current = false; setConfirmQuit(false);
    setGameKey(k => k + 1);
  }, [finalScore]);

  // Game loop
  useEffect(() => {
    stateRef.current = initState(roundRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // HiDPI / Retina sharpness
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvasW * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width  = canvasW + "px";
    canvas.style.height = CANVAS_H + "px";
    ctx.scale(dpr, dpr);

    const s = stateRef.current;

    const loop = (ts) => {
      if (!s.running) return;
      rafRef.current = requestAnimationFrame(loop);
      if (document.hidden || pausedRef.current) { s.lastTime = ts; return; }

      const { T: th, lm: isLight } = themeRef.current;
      const dt = s.lastTime ? Math.min(ts - s.lastTime, 50) : 16;
      s.lastTime = ts;
      s.elapsed += dt / 1000;
      if (s.elapsed >= GAME_DURATION) { endGame(s.score, true); return; }

      // Paddle movement
      const pspd = s.roundSettings.paddleSpeed * (dt / 16);
      if (keysRef.current.left)  s.paddleX -= pspd;
      if (keysRef.current.right) s.paddleX += pspd;
      s.paddleX = Math.max(s.roundSettings.paddleW / 2, Math.min(canvasW - s.roundSettings.paddleW / 2, s.paddleX));

      // Ball movement
      const b = s.ball;
      if (!s.ballLaunched) {
        b.x = s.paddleX; b.y = PADDLE_Y - BALL_R - 2;
      } else {
        const steps = Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)));
        for (let step = 0; step < steps; step++) {
          b.x += b.vx / steps;
          b.y += b.vy / steps;

          // Wall bounces
          if (b.x - BALL_R <= 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); playWall(); }
          if (b.x + BALL_R >= canvasW) { b.x = canvasW - BALL_R; b.vx = -Math.abs(b.vx); playWall(); }
          if (b.y - BALL_R <= 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); playWall(); }

          // Paddle
          if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
              b.x >= s.paddleX - s.roundSettings.paddleW / 2 && b.x <= s.paddleX + s.roundSettings.paddleW / 2) {
            b.vy = -Math.abs(b.vy);
            const rel = (b.x - s.paddleX) / (s.roundSettings.paddleW / 2);
            b.vx = rel * s.roundSettings.bounceVxScale;
            b.y = PADDLE_Y - BALL_R;
            playWall();
          }

          // Ball lost
          if (b.y - BALL_R > CANVAS_H) {
            s.lives--;
            setLives(s.lives);
            if (s.lives <= 0) { endGame(s.score, false); return; }
            playLose();
            b.x = s.paddleX; b.y = PADDLE_Y - BALL_R - 2;
            b.vx = s.roundSettings.launchVx;
            b.vy = s.roundSettings.launchVy;
            s.ballLaunched = false;
            break;
          }

          // Brick collision
          for (const brick of s.bricks) {
            if (!brick.alive) continue;
            if (b.x + BALL_R > brick.x && b.x - BALL_R < brick.x + brick.w &&
                b.y + BALL_R > brick.y && b.y - BALL_R < brick.y + brick.h) {
              brick.alive = false;
              s.clearedBricks++;
              s.score = ((s.round - 1) * 100) + Math.floor((s.clearedBricks / s.totalBricks) * 100);
              playBrick();
              const overlapL = (b.x + BALL_R) - brick.x;
              const overlapR = (brick.x + brick.w) - (b.x - BALL_R);
              const overlapT = (b.y + BALL_R) - brick.y;
              const overlapB = (brick.y + brick.h) - (b.y - BALL_R);
              const minH = Math.min(overlapL, overlapR);
              const minV = Math.min(overlapT, overlapB);
              if (minH < minV) b.vx *= -1; else b.vy *= -1;
              break;
            }
          }
        }

        // All bricks cleared
        if (s.bricks.every(b => !b.alive)) { endGame(s.score, true); return; }
      }

      // ── Draw ────────────────────────────────────────────────────────────
      ctx.fillStyle = th.card;
      ctx.fillRect(0, 0, canvasW, CANVAS_H);

      // Timer bar
      const pct = s.elapsed / GAME_DURATION;
      ctx.fillStyle = th.inputBg;
      ctx.fillRect(0, 0, canvasW, 5);
      ctx.fillStyle = th.accent;
      ctx.fillRect(0, 0, canvasW * (1 - pct), 5);

      // Bricks
      s.bricks.forEach(brick => {
        if (!brick.alive) return;
        ctx.fillStyle = brick.color;
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3);
        ctx.fill();
      });

      // Paddle
      ctx.fillStyle = th.accent;
      ctx.beginPath();
      ctx.roundRect(s.paddleX - s.roundSettings.paddleW / 2, PADDLE_Y, s.roundSettings.paddleW, PADDLE_H, 5);
      ctx.fill();

      // Ball
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? "#1a1a1a" : "#f0ede8";
      ctx.fill();

      // Ground line
      ctx.strokeStyle = th.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H - 1);
      ctx.lineTo(canvasW, CANVAS_H - 1);
      ctx.stroke();
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, endGame, gameKey]);

  // Mouse/touch paddle control
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getX = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return Math.max(0, Math.min(canvasW, clientX - rect.left));
    };
    const onMove = (e) => {
      if (stateRef.current) stateRef.current.paddleX = getX(e);
    };
    const onStart = (e) => {
      if (stateRef.current) {
        stateRef.current.paddleX = getX(e);
        stateRef.current.ballLaunched = true;
      }
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("touchmove", onMove, { passive: true });
    canvas.addEventListener("touchstart", onStart, { passive: true });
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchstart", onStart);
    };
  }, [canvasW]);

  // Keyboard
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a") keysRef.current.left  = true;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = true;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (stateRef.current) stateRef.current.ballLaunched = true; }
      if (e.key === " " && !stateRef.current?.ballLaunched && !confirmQuitRef.current) {
        pausedRef.current = !pausedRef.current; setPaused(p => !p);
      }
      if (e.key === "Escape") {
        if (confirmQuitRef.current) { confirmQuitRef.current = false; setConfirmQuit(false); pausedRef.current = false; setPaused(false); }
        else { confirmQuitRef.current = true; setConfirmQuit(true); pausedRef.current = true; setPaused(true); }
      }
      if (e.key === "Enter" && confirmQuitRef.current) onSkip();
    };
    const onUp = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a") keysRef.current.left  = false;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [onSkip]);

  // Pause on hidden
  useEffect(() => {
    const h = () => { pausedRef.current = document.hidden; setPaused(document.hidden); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const [hudScore, setHudScore] = useState(0);
  const [hudTime, setHudTime]   = useState(GAME_DURATION);
  useEffect(() => {
    const id = setInterval(() => {
      if (!gameOver && stateRef.current) {
        setHudScore(stateRef.current.score);
        setHudTime(Math.max(0, Math.ceil(GAME_DURATION - stateRef.current.elapsed)));
        setLives(stateRef.current.lives);
      }
    }, 250);
    return () => clearInterval(id);
  }, [gameOver]);

  const mm = String(Math.floor(hudTime / 60)).padStart(2,"0");
  const ss = String(hudTime % 60).padStart(2,"0");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'DM Sans', monospace", userSelect: "none" }}>

      {/* HUD */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "6px 10px", background: T.card,
        borderRadius: "12px 12px 0 0", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, color: T.textMid }}>{mm}:{ss}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{hudScore} Pkt</span>
        <span style={{ fontSize: 11, color: T.textDim }}>
          Runde {round} · {"♥ ".repeat(lives)}{"♡ ".repeat(Math.max(0, MAX_LIVES - lives))}
        </span>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef}
          style={{ display: "block", cursor: "none", width: canvasW, height: CANVAS_H }} />

        {/* Confirm quit */}
        {confirmQuit && !gameOver && (
          <div style={{ position: "absolute", inset: 0, background: lm ? "rgba(245,240,234,0.92)" : "rgba(0,0,0,0.88)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Spiel beenden?</div>
            <div style={{ fontSize: 11, color: T.textMid }}>Enter = Ja · Esc = Nein</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onSkip} style={{ padding: "7px 18px", borderRadius: 8, border: "none",
                background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Beenden</button>
              <button onClick={() => { confirmQuitRef.current = false; setConfirmQuit(false); pausedRef.current = false; setPaused(false); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.inputBg, color: T.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Weiter</button>
            </div>
          </div>
        )}

        {/* Pause */}
        {paused && !confirmQuit && !gameOver && (
          <div style={{ position: "absolute", inset: 0, background: lm ? "rgba(245,240,234,0.75)" : "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: T.accent, letterSpacing: "0.1em" }}>
            PAUSIERT
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div style={{ position: "absolute", inset: 0,
            background: lm ? "rgba(237,232,224,0.97)" : "rgba(14,12,9,0.96)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 13, color: T.textMid, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              {won ? "🎉 Geschafft!" : "Game Over"}
            </div>
            <div style={{ fontSize: 38, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{finalScore}</div>
            <div style={{ fontSize: 12, color: T.textMid }}>Standardisierte Punkte · Runde {round}</div>
            {newRecord && <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Neuer Rekord!</div>}
            <div style={{ fontSize: 13, color: T.textMid }}>Rekord: {Math.max(highscore, finalScore)} Pkt</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => resetGame(won)} style={{ padding: "8px 18px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.inputBg, color: T.textMid,
                fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {won ? "Nächstes Level" : "Nochmal"}
              </button>
              <button onClick={onComplete} style={{ padding: "8px 20px", borderRadius: 8,
                border: "none", background: T.accent, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fertig</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "5px 10px", background: T.bg,
        borderRadius: "0 0 12px 12px", borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 10, color: T.textDim }}>← → / Maus</span>
        <button onClick={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p); }}
          style={{ fontSize: 10, color: T.textMid, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" }}>
          {paused ? "▶ Weiter" : "⏸ Pause"}
        </button>
        <button onClick={onSkip}
          style={{ fontSize: 10, color: T.textDim, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" }}>
          Beenden ✕
        </button>
      </div>
    </div>
  );
}
