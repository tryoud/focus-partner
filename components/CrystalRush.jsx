import { useEffect, useRef, useState, useCallback } from "react";

const GAME_DURATION = 60;
const CANVAS_W_DESKTOP = 400;
const CANVAS_W_MOBILE  = 320;
const CANVAS_H = 300;
const PLAYER_W = 32;
const PLAYER_H = 32;
const PLAYER_Y = 260;
const CRYSTAL_SIZE = 16;

function scoreToHighscore(score) {
  try {
    const stored = parseInt(localStorage.getItem("focuspartner_crystal_rush_highscore") || "0");
    return Math.max(stored, score);
  } catch { return score; }
}

function saveHighscore(score) {
  try { localStorage.setItem("focuspartner_crystal_rush_highscore", String(score)); } catch {}
}

function loadHighscore() {
  try { return parseInt(localStorage.getItem("focuspartner_crystal_rush_highscore") || "0"); } catch { return 0; }
}

function scoreToCrystals(score) {
  if (score >= 201) return 5;
  if (score >= 101) return 3;
  if (score >= 51)  return 2;
  if (score >= 21)  return 1;
  return 0;
}

function getPhase(elapsed) {
  if (elapsed >= 50) return { speed: 5, spawnMs: 400, fever: true };
  if (elapsed >= 35) return { speed: 4, spawnMs: 400, fever: false };
  if (elapsed >= 15) return { speed: 3, spawnMs: 600, fever: false };
  return { speed: 2, spawnMs: 800, fever: false };
}

function spawnCrystal(canvasW) {
  const r = Math.random();
  let type, color, pts;
  if (r < 0.05) { type = "crystal"; color = "#a78bfa"; pts = 5; }
  else if (r < 0.25) { type = "gold"; color = "#fbbf24"; pts = 3; }
  else { type = "normal"; color = "#e2e8f0"; pts = 1; }
  return {
    id: Math.random(),
    x: CRYSTAL_SIZE + Math.random() * (canvasW - CRYSTAL_SIZE * 2),
    y: -CRYSTAL_SIZE,
    type, color, pts,
  };
}

function drawPlayer(ctx, x, canvasW) {
  const px = Math.max(PLAYER_W / 2, Math.min(canvasW - PLAYER_W / 2, x));
  // Body
  ctx.fillStyle = "#e07b39";
  ctx.fillRect(px - 14, PLAYER_Y - 14, 28, 24);
  // Ears
  ctx.fillRect(px - 12, PLAYER_Y - 20, 8, 8);
  ctx.fillRect(px + 4, PLAYER_Y - 20, 8, 8);
  // Eyes
  ctx.fillStyle = "#0e0c09";
  ctx.fillRect(px - 7, PLAYER_Y - 8, 4, 4);
  ctx.fillRect(px + 3, PLAYER_Y - 8, 4, 4);
  // Mouth
  ctx.fillRect(px - 3, PLAYER_Y - 1, 6, 2);
}

function drawCrystal(ctx, crystal) {
  ctx.save();
  ctx.translate(crystal.x, crystal.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = crystal.color;
  ctx.shadowColor = crystal.color;
  ctx.shadowBlur = 6;
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

export default function CrystalRush({ onComplete, onSkip }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    playerX: 200,
    crystals: [],
    score: 0,
    elapsed: 0,
    lastTime: null,
    lastSpawn: 0,
    running: true,
    popups: [], // { x, y, text, age }
    feverPulse: 0,
  });
  const keysRef = useRef({ left: false, right: false });
  const rafRef = useRef(null);

  const canvasW = typeof window !== "undefined" && window.innerWidth < 480 ? CANVAS_W_MOBILE : CANVAS_W_DESKTOP;

  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [highscore] = useState(loadHighscore);
  const [newRecord, setNewRecord] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const endGame = useCallback((score) => {
    stateRef.current.running = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const best = scoreToHighscore(score);
    if (score > highscore) { saveHighscore(score); setNewRecord(true); }
    setFinalScore(score);
    setGameOver(true);
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
    };
    setGameOver(false);
    setFinalScore(0);
    setNewRecord(false);
    setPaused(false);
    pausedRef.current = false;
  }, [canvasW]);

  // Game loop
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

      // Player movement (4px per 16ms frame, scale by dt)
      const spd = 4 * (dt / 16);
      if (keysRef.current.left)  s.playerX -= spd;
      if (keysRef.current.right) s.playerX += spd;
      s.playerX = Math.max(PLAYER_W / 2, Math.min(canvasW - PLAYER_W / 2, s.playerX));

      // Spawn crystals
      if (ts - s.lastSpawn > phase.spawnMs) {
        s.crystals.push(spawnCrystal(canvasW));
        s.lastSpawn = ts;
      }

      // Move crystals + collision
      const hit = [];
      s.crystals = s.crystals.filter(c => {
        c.y += phase.speed * (dt / 16);
        if (checkCollision(c, s.playerX, canvasW)) {
          const pts = fever ? c.pts * 2 : c.pts;
          s.score += pts;
          hit.push({ x: c.x, y: PLAYER_Y - 20, text: `+${pts}`, age: 0 });
          return false;
        }
        return c.y < CANVAS_H + CRYSTAL_SIZE;
      });
      s.popups.push(...hit);
      s.popups = s.popups.filter(p => { p.age += dt; return p.age < 700; });

      // Fever pulse
      s.feverPulse = fever ? (s.feverPulse + dt * 0.004) % (Math.PI * 2) : 0;

      // ── Draw ────────────────────────────────────────────────────────
      // Background
      if (fever) {
        const pulse = 0.5 + 0.5 * Math.sin(s.feverPulse);
        const r = Math.round(14 + pulse * 12);
        const g = Math.round(12 + pulse * 2);
        ctx.fillStyle = `rgb(${r},${g},9)`;
      } else {
        ctx.fillStyle = "#0e0c09";
      }
      ctx.fillRect(0, 0, canvasW, CANVAS_H);

      // Ground line
      ctx.strokeStyle = "#2a2520";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, PLAYER_Y + PLAYER_H / 2 + 4);
      ctx.lineTo(canvasW, PLAYER_Y + PLAYER_H / 2 + 4);
      ctx.stroke();

      // Crystals
      s.crystals.forEach(c => drawCrystal(ctx, c));

      // Player
      drawPlayer(ctx, s.playerX, canvasW);

      // Score popup text
      ctx.font = "bold 14px monospace";
      s.popups.forEach(p => {
        const alpha = 1 - p.age / 700;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(p.text, p.x - 8, p.y - (p.age / 700) * 30);
      });
      ctx.globalAlpha = 1;

      // HUD — timer bar
      const pct = s.elapsed / GAME_DURATION;
      ctx.fillStyle = "#1a1714";
      ctx.fillRect(0, 0, canvasW, 6);
      ctx.fillStyle = fever ? "#f97316" : "#e07b39";
      ctx.fillRect(0, 0, canvasW * (1 - pct), 6);

      // FEVER text
      if (fever) {
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = "#f97316";
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(s.feverPulse * 4);
        ctx.fillText("🔥 FEVER!", canvasW / 2 - 36, 24);
        ctx.globalAlpha = 1;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [canvasW, endGame]);

  // Keyboard
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") keysRef.current.left  = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
    };
    const onUp = (e) => {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") keysRef.current.left  = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // Pause on tab hide
  useEffect(() => {
    const handler = () => { pausedRef.current = document.hidden; setPaused(document.hidden); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const crystalsEarned = scoreToCrystals(finalScore);
  const isNewRecord = newRecord && finalScore > 0;

  // Live HUD values read from ref each render (score updates via canvas, not state)
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

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      fontFamily: "'DM Sans', monospace", userSelect: "none" }}>

      {/* HUD bar */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "6px 10px", background: "#0e0c09",
        borderRadius: "12px 12px 0 0", borderBottom: "1px solid #2a2520" }}>
        <span style={{ fontSize: 13, color: "#888", letterSpacing: "0.08em" }}>
          {mm}:{ss}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: hudTimeLeft <= 10 ? "#f97316" : "#e07b39" }}>
          {hudScore} Pkt
        </span>
        <span style={{ fontSize: 11, color: "#444" }}>
          Best {highscore}
        </span>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={canvasW} height={CANVAS_H}
          style={{ display: "block", borderRadius: gameOver ? 0 : "0 0 12px 12px" }} />

        {/* Pause overlay */}
        {paused && !gameOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#e07b39", letterSpacing: "0.1em" }}>
            PAUSIERT
          </div>
        )}

        {/* Game Over overlay */}
        {gameOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(14,12,9,0.96)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 10, borderRadius: "0 0 12px 12px" }}>
            <div style={{ fontSize: 13, color: "#666", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Game Over
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#e07b39", lineHeight: 1 }}>
              {finalScore}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>Punkte</div>

            {isNewRecord && (
              <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>
                🎉 Neuer Rekord!
              </div>
            )}

            <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>◆ {crystalsEarned}</div>
                <div style={{ fontSize: 10, color: "#555" }}>Kristalle</div>
              </div>
              <div style={{ width: 1, background: "#222" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#888" }}>
                  {isNewRecord ? finalScore : Math.max(highscore, finalScore)}
                </div>
                <div style={{ fontSize: 10, color: "#555" }}>Bestzeit</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { resetGame(); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #333",
                  background: "#1a1714", color: "#aaa", fontSize: 13, cursor: "pointer",
                  fontFamily: "inherit" }}>
                Nochmal!
              </button>
              <button
                onClick={() => onComplete(finalScore, crystalsEarned)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none",
                  background: "#e07b39", color: "#0e0c09", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>
                Fertig
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ width: canvasW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "5px 10px", background: "#0a0908",
        borderRadius: "0 0 12px 12px", borderTop: "1px solid #1a1714" }}>
        <span style={{ fontSize: 10, color: "#444" }}>← → bewegen</span>
        <button
          onClick={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p); }}
          style={{ fontSize: 10, color: "#555", background: "none", border: "none",
            cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" }}>
          {paused ? "▶ Weiter" : "⏸ Pause"}
        </button>
        <button
          onClick={onSkip}
          style={{ fontSize: 10, color: "#444", background: "none", border: "none",
            cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" }}>
          Beenden ✕
        </button>
      </div>
    </div>
  );
}
