import { useState, useEffect, useRef, useCallback } from "react";

const HS_KEY = "focuspartner_hs_sudoku";
function loadHighscore() { try { return parseInt(localStorage.getItem(HS_KEY)||"0"); } catch { return 0; } }
function saveHighscore(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch {} }

// ── Generator ─────────────────────────────────────────────────────────────────
function sudokuValid(g, pos, num) {
  const r = Math.floor(pos / 6), c = pos % 6;
  for (let i = 0; i < 6; i++) {
    if (g[r * 6 + i] === num) return false;
    if (g[i * 6 + c] === num) return false;
  }
  const br = Math.floor(r / 2) * 2, bc = Math.floor(c / 3) * 3;
  for (let i = br; i < br + 2; i++)
    for (let j = bc; j < bc + 3; j++)
      if (g[i * 6 + j] === num) return false;
  return true;
}

function fillGrid(g, pos) {
  if (pos === 36) return true;
  const nums = [1,2,3,4,5,6].sort(() => Math.random() - 0.5);
  for (const n of nums) {
    if (sudokuValid(g, pos, n)) {
      g[pos] = n;
      if (fillGrid(g, pos + 1)) return true;
      g[pos] = 0;
    }
  }
  return false;
}

// Counts solutions, stops early at 2 (for uniqueness check)
function countSolutions(g, start) {
  for (let i = start; i < 36; i++) {
    if (g[i] !== 0) continue;
    let count = 0;
    for (let n = 1; n <= 6; n++) {
      if (sudokuValid(g, i, n)) {
        g[i] = n;
        count += countSolutions(g, i + 1);
        g[i] = 0;
        if (count >= 2) return 2;
      }
    }
    return count;
  }
  return 1;
}

function generateSudoku() {
  // 1. Build a complete valid grid
  const solution = Array(36).fill(0);
  fillGrid(solution, 0);

  // 2. Remove cells while keeping the solution unique
  const puzzle = [...solution];
  const positions = Array.from({ length: 36 }, (_, i) => i).sort(() => Math.random() - 0.5);

  let removed = 0;
  for (const pos of positions) {
    if (removed >= 22) break; // keep at least 14 givens (moderate difficulty)
    const val = puzzle[pos];
    puzzle[pos] = 0;
    if (countSolutions([...puzzle], 0) === 1) {
      removed++;
    } else {
      puzzle[pos] = val; // put back — removing this cell breaks uniqueness
    }
  }

  return [puzzle, solution];
}
// ─────────────────────────────────────────────────────────────────────────────

function getBox(r, c) { return Math.floor(r / 2) * 2 + Math.floor(c / 3); }

export default function Sudoku({ onComplete, onSkip, T, lm }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const cellSize = isMobile ? 44 : 52;
  const gridW = 6 * cellSize + 7;

  const [[puzzleRef, solutionRef], setPuzzle] = useState(() => generateSudoku());

  const [grid,       setGrid]       = useState(() => [...puzzleRef]);
  const [selected,   setSelected]   = useState(null);
  const [errors,     setErrors]     = useState(new Set());
  const [flashCells, setFlashCells] = useState(new Set());
  const [solved,     setSolved]     = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [highscore]                 = useState(loadHighscore);
  const [newRecord,  setNewRecord]  = useState(false);
  const startTime    = useRef(Date.now());
  const flashTimerRef = useRef(null);

  // Timer
  useEffect(() => {
    if (solved) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [solved]);

  const checkSolved = useCallback((g) => {
    if (g.every((v, i) => v === solutionRef[i])) {
      const t = Math.floor((Date.now() - startTime.current) / 1000);
      setSolved(true);
      const prev = loadHighscore();
      if (prev === 0 || t < prev) { saveHighscore(t); setNewRecord(true); }
    }
  }, [solutionRef]);

  const triggerFlash = useCallback((indices) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashCells(new Set(indices));
    flashTimerRef.current = setTimeout(() => setFlashCells(new Set()), 800);
  }, []);

  const enterValue = useCallback((val) => {
    if (selected === null || puzzleRef[selected] !== 0) return;
    const newGrid = [...grid];
    newGrid[selected] = val;

    const allErrors = new Set();
    newGrid.forEach((v, i) => {
      if (v !== 0 && puzzleRef[i] === 0 && v !== solutionRef[i]) allErrors.add(i);
    });
    setErrors(allErrors);
    setGrid(newGrid);
    checkSolved(newGrid);

    // Flash completed row / col / box
    const rI = Math.floor(selected / 6), cI = selected % 6;
    const toFlash = new Set();

    const rowIdx = Array.from({ length: 6 }, (_, c) => rI * 6 + c);
    if (rowIdx.every(i => newGrid[i] === solutionRef[i])) rowIdx.forEach(i => toFlash.add(i));

    const colIdx = Array.from({ length: 6 }, (_, r) => r * 6 + cI);
    if (colIdx.every(i => newGrid[i] === solutionRef[i])) colIdx.forEach(i => toFlash.add(i));

    const bI = getBox(rI, cI);
    const boxIdx = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
      if (getBox(r, c) === bI) boxIdx.push(r * 6 + c);
    if (boxIdx.every(i => newGrid[i] === solutionRef[i])) boxIdx.forEach(i => toFlash.add(i));

    if (toFlash.size > 0) triggerFlash([...toFlash]);
  }, [selected, grid, puzzleRef, solutionRef, checkSolved, triggerFlash]);

  const clearCell = useCallback(() => {
    if (selected === null || puzzleRef[selected] !== 0) return;
    const newGrid = [...grid];
    newGrid[selected] = 0;
    const allErrors = new Set();
    newGrid.forEach((v, i) => {
      if (v !== 0 && puzzleRef[i] === 0 && v !== solutionRef[i]) allErrors.add(i);
    });
    setErrors(allErrors);
    setGrid(newGrid);
  }, [selected, grid, puzzleRef, solutionRef]);

  const restart = () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    const next = generateSudoku();
    setPuzzle(next);
    setGrid([...next[0]]);
    setSelected(null);
    setErrors(new Set());
    setFlashCells(new Set());
    setSolved(false);
    setNewRecord(false);
    startTime.current = Date.now();
    setElapsed(0);
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "1" && e.key <= "6") { e.preventDefault(); enterValue(parseInt(e.key)); }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") clearCell();
      if (e.key === "Escape") onSkip();
      if (selected === null) return;
      if (e.key === "ArrowRight") setSelected(s => Math.min(35, s + 1));
      if (e.key === "ArrowLeft")  setSelected(s => Math.max(0, s - 1));
      if (e.key === "ArrowDown")  setSelected(s => Math.min(35, s + 6));
      if (e.key === "ArrowUp")    setSelected(s => Math.max(0, s - 6));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, enterValue, clearCell, onSkip]);

  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const selRow = selected !== null ? Math.floor(selected / 6) : -1;
  const selCol = selected !== null ? selected % 6 : -1;
  const selBox = selected !== null ? getBox(selRow, selCol) : -1;
  const selVal = selected !== null ? grid[selected] : 0;

  return (
    <>
      <style>{`
        @keyframes sudokuFlash {
          0%   { background-color: ${lm ? "#bbf7d0" : "#166534"}; }
          60%  { background-color: ${lm ? "#bbf7d0" : "#166534"}; }
          100% { background-color: transparent; }
        }
        .sudoku-flash { animation: sudokuFlash 0.8s ease-out forwards; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: "'DM Sans', monospace", userSelect: "none" }}>

        {/* HUD */}
        <div style={{ width: gridW, display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "6px 10px", background: T.card,
          borderRadius: "12px 12px 0 0", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 13, color: T.textMid }}>{fmtTime(elapsed)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Sudoku 6×6</span>
          <span style={{ fontSize: 11, color: T.textDim }}>
            {highscore > 0 ? `Best ${fmtTime(highscore)}` : "Bestzeit: —"}
          </span>
        </div>

        {/* Grid */}
        <div style={{ background: T.card, padding: "10px", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(6, ${cellSize}px)`,
            gap: 0, border: `2px solid ${T.text}`, borderRadius: 4, overflow: "hidden" }}>
            {grid.map((val, i) => {
              const r = Math.floor(i / 6), c = i % 6;
              const isGiven     = puzzleRef[i] !== 0;
              const isSelected  = i === selected;
              const isSameGroup = r === selRow || c === selCol || getBox(r, c) === selBox;
              const isSameVal   = selVal > 0 && val === selVal && val !== 0;
              const isError     = errors.has(i);
              const isFlash     = flashCells.has(i);
              const rightBorder  = c === 2;
              const bottomBorder = r === 1 || r === 3;

              let bg = "transparent";
              if (!isFlash) {
                if (isSelected)       bg = lm ? "#e07b3925" : "#e07b3935";
                else if (isSameVal)   bg = lm ? "#e07b3912" : "#e07b3920";
                else if (isSameGroup) bg = lm ? "#00000009" : "#ffffff09";
                else bg = T.card;
              }

              return (
                <div key={i}
                  className={isFlash ? "sudoku-flash" : ""}
                  onClick={() => !solved && setSelected(i)}
                  style={{
                    width: cellSize, height: cellSize,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isFlash ? undefined : bg,
                    cursor: isGiven || solved ? "default" : "pointer",
                    fontSize: cellSize > 48 ? 20 : 17, fontWeight: isGiven ? 700 : 500,
                    color: isError ? "#ef4444" : isGiven ? T.text : T.accent,
                    borderRight: `${rightBorder ? 2 : 1}px solid ${rightBorder ? T.text : T.border}`,
                    borderBottom: `${bottomBorder ? 2 : 1}px solid ${bottomBorder ? T.text : T.border}`,
                    boxSizing: "border-box",
                    outline: isSelected ? `2px solid ${T.accent}` : "none",
                    outlineOffset: -2,
                  }}>
                  {val !== 0 ? val : ""}
                </div>
              );
            })}
          </div>

          {/* Solved overlay */}
          {solved && (
            <div style={{ position: "absolute", inset: 0,
              background: lm ? "rgba(237,232,224,0.97)" : "rgba(14,12,9,0.96)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 10 }}>
              <div style={{ fontSize: 28 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.accent }}>Gelöst!</div>
              <div style={{ fontSize: 14, color: T.textMid }}>Zeit: {fmtTime(elapsed)}</div>
              {newRecord && <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Neue Bestzeit!</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={restart} style={{ padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.inputBg, color: T.textMid,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Nochmal</button>
                <button onClick={onComplete} style={{ padding: "8px 20px", borderRadius: 8,
                  border: "none", background: T.accent, color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fertig</button>
              </div>
            </div>
          )}
        </div>

        {/* Number pad */}
        {!solved && (
          <div style={{ display: "flex", gap: 6, padding: "8px 0",
            background: T.bg, width: "100%", justifyContent: "center" }}>
            {[1,2,3,4,5,6].map(n => (
              <button key={n} onClick={() => enterValue(n)}
                style={{ width: cellSize - 6, height: 36, borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.inputBg,
                  color: T.text, fontSize: 16, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit" }}>
                {n}
              </button>
            ))}
            <button onClick={clearCell}
              style={{ width: 36, height: 36, borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.inputBg,
                color: T.textMid, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✕
            </button>
          </div>
        )}

        {/* Bottom bar */}
        <div style={{ width: gridW, display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "5px 10px", background: T.bg,
          borderRadius: "0 0 12px 12px", borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 10, color: T.textDim }}>Feld antippen, dann Zahl</span>
          <button onClick={onSkip}
            style={{ fontSize: 10, color: T.textDim, background: "none", border: "none",
              cursor: "pointer", fontFamily: "inherit" }}>
            Beenden ✕
          </button>
        </div>
      </div>
    </>
  );
}
