import { useState, useEffect, useRef, useCallback } from "react";
import { loadGameHighscore, saveGameHighscore } from "../storage.js";

const TILE_COLORS = [
  "#e07b39","#a78bfa","#34d399",
  "#f59e0b","#60a5fa","#f472b6",
  "#fb923c","#4ade80","#818cf8",
];
const GRID = 3; // 3×3
function loadHighscore() { return loadGameHighscore("memory"); }
function saveHighscore(v) { saveGameHighscore("memory", v); }

export default function MemoryFlash({ onComplete, onSkip, T }) {
  // phase: "showing" | "input" | "success" | "fail" | "gameover"
  const [phase, setPhase]       = useState("showing");
  const [sequence, setSequence] = useState([]);
  const [level, setLevel]       = useState(3);
  const [inputIdx, setInputIdx] = useState(0);
  const [lit, setLit]           = useState(-1);   // tile index currently flashing
  const [flashResult, setFlashResult] = useState(null); // null | "ok" | "err"
  const [lives, setLives]       = useState(2);
  const [score, setScore]       = useState(0);
  const [highscore]             = useState(loadHighscore);
  const [newRecord, setNewRecord] = useState(false);
  const phaseRef = useRef("showing");

  const buildSequence = useCallback((len) => {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 9));
  }, []);

  // Show sequence
  const runSequence = useCallback((seq) => {
    phaseRef.current = "showing";
    setPhase("showing");
    setLit(-1);
    let i = 0;
    const step = () => {
      if (i >= seq.length) {
        setTimeout(() => { phaseRef.current = "input"; setPhase("input"); setLit(-1); setInputIdx(0); }, 400);
        return;
      }
      setLit(seq[i]);
      i++;
      setTimeout(() => { setLit(-1); setTimeout(step, 200); }, 600);
    };
    setTimeout(step, 500);
  }, []);

  // Start / restart
  useEffect(() => {
    const seq = buildSequence(3);
    setSequence(seq);
    setLevel(3);
    setLives(2);
    setScore(0);
    runSequence(seq);
  }, [buildSequence, runSequence]);

  const handleTile = (idx) => {
    if (phaseRef.current !== "input") return;
    const expected = sequence[inputIdx];
    if (idx === expected) {
      setFlashResult("ok");
      setTimeout(() => setFlashResult(null), 300);
      const next = inputIdx + 1;
      if (next === sequence.length) {
        // Completed level
        const newScore = score + level;
        setScore(newScore);
        if (newScore > highscore) { saveHighscore(newScore); setNewRecord(true); }
        phaseRef.current = "success";
        setPhase("success");
        setTimeout(() => {
          const newLevel = level + 1;
          const newSeq = buildSequence(newLevel);
          setLevel(newLevel);
          setSequence(newSeq);
          runSequence(newSeq);
        }, 900);
      } else {
        setInputIdx(next);
      }
    } else {
      setFlashResult("err");
      setTimeout(() => setFlashResult(null), 400);
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) {
        phaseRef.current = "gameover";
        setPhase("gameover");
      } else {
        phaseRef.current = "fail";
        setPhase("fail");
        setTimeout(() => runSequence(sequence), 1000);
      }
    }
  };

  const restart = () => {
    setNewRecord(false);
    const seq = buildSequence(3);
    setSequence(seq);
    setLevel(3);
    setLives(2);
    setScore(0);
    runSequence(seq);
  };

  const statusText = {
    showing:  "Merke die Reihenfolge …",
    input:    `Tippe die Sequenz (${inputIdx} / ${sequence.length})`,
    success:  "✓ Richtig!",
    fail:     `✗ Falsch — ${lives} Leben übrig`,
    gameover: "Game Over",
  }[phase] ?? "";

  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const tileSize = isMobile ? 80 : 100;
  const gap = isMobile ? 6 : 8;
  const gridW = GRID * tileSize + (GRID - 1) * gap;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      fontFamily: "'DM Sans', monospace", userSelect: "none" }}>

      {/* HUD */}
      <div style={{ width: gridW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "6px 10px", background: T.card,
        borderRadius: "12px 12px 0 0", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Level {level}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{score} Pkt</span>
        <span style={{ fontSize: 11, color: T.textDim }}>Best {Math.max(highscore, score)}</span>
      </div>

      {/* Grid */}
      <div style={{ background: T.card, padding: 14, borderRadius: phase === "gameover" ? 0 : "0 0 0 0",
        position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID}, ${tileSize}px)`, gap }}>
          {TILE_COLORS.map((color, i) => {
            const isLit = lit === i;
            const isResult = flashResult !== null;
            let bg = T.inputBg;
            if (isLit) bg = color;
            else if (isResult && phase === "input") bg = flashResult === "ok" ? "#22c55e44" : "#ef444444";
            return (
              <button key={i} onClick={() => handleTile(i)}
                style={{
                  width: tileSize, height: tileSize, borderRadius: 12,
                  background: bg,
                  border: `2px solid ${isLit ? color : T.border}`,
                  cursor: phase === "input" ? "pointer" : "default",
                  transition: "background 0.12s, border-color 0.12s",
                  boxShadow: isLit ? `0 0 12px ${color}` : "none",
                  position: "relative", overflow: "hidden",
                }}>
                <div style={{
                  width: "40%", height: "40%", borderRadius: "50%",
                  background: isLit ? "#fff" : color,
                  opacity: isLit ? 0.6 : 0.35,
                  margin: "auto",
                  transition: "background 0.12s, opacity 0.12s",
                }} />
              </button>
            );
          })}
        </div>

        {/* Game Over overlay */}
        {phase === "gameover" && (
          <div style={{ position: "absolute", inset: 0, background: T.card + "f5",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 10, borderRadius: 0 }}>
            <div style={{ fontSize: 13, color: T.textMid, letterSpacing: "0.12em", textTransform: "uppercase" }}>Game Over</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 12, color: T.textMid }}>Punkte · Level {level} erreicht</div>
            {newRecord && <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>🎉 Neuer Rekord!</div>}
            <div style={{ fontSize: 13, color: T.textMid }}>Rekord: {Math.max(highscore, score)} Pkt</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={restart} style={{ padding: "8px 18px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.inputBg, color: T.textMid,
                fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Nochmal!</button>
              <button onClick={onComplete} style={{ padding: "8px 20px", borderRadius: 8,
                border: "none", background: T.accent, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fertig</button>
            </div>
          </div>
        )}
      </div>

      {/* Status + lives + quit */}
      <div style={{ width: gridW, display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "6px 10px", background: T.bg,
        borderRadius: "0 0 12px 12px", borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 10, color: T.textMid, flex: 1 }}>{statusText}</span>
        <span style={{ fontSize: 12, marginRight: 10 }}>
          {Array.from({ length: 2 }, (_, i) => (
            <span key={i} style={{ color: i < lives ? T.accent : T.border }}>♥ </span>
          ))}
        </span>
        <button onClick={onSkip} style={{ fontSize: 10, color: T.textDim, background: "none",
          border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
          Beenden ✕
        </button>
      </div>
    </div>
  );
}
