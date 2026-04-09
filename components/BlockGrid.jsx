import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGameHighscore, saveGameHighscore } from "../storage.js";

const GRID_SIZE = 8;
const OFFER_COUNT = 3;
const PIECE_COLORS = ["#e07b39", "#f59e0b", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];

const SHAPES = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[1, 0], [1, 1], [1, 2], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
];

const createEmptyBoard = () =>
  Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));

const getShapeSize = (cells) => ({
  w: Math.max(...cells.map(([x]) => x)) + 1,
  h: Math.max(...cells.map(([, y]) => y)) + 1,
});

const getCenterAnchorCell = (piece) => {
  if (!piece?.cells?.length) return [0, 0];
  const centerX = piece.cells.reduce((sum, [x]) => sum + x, 0) / piece.cells.length;
  const centerY = piece.cells.reduce((sum, [, y]) => sum + y, 0) / piece.cells.length;
  return piece.cells.reduce((best, cell) => {
    const bestDist = Math.hypot(best[0] - centerX, best[1] - centerY);
    const cellDist = Math.hypot(cell[0] - centerX, cell[1] - centerY);
    return cellDist < bestDist ? cell : best;
  }, piece.cells[0]);
};

function createPiece(id) {
  const cells = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return {
    id,
    cells,
    color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)],
  };
}

function canPlace(board, piece, startX, startY) {
  return piece.cells.every(([dx, dy]) => {
    const x = startX + dx;
    const y = startY + dy;
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && !board[y][x];
  });
}

function placePiece(board, piece, startX, startY) {
  const nextBoard = board.map((row) => [...row]);
  piece.cells.forEach(([dx, dy]) => {
    nextBoard[startY + dy][startX + dx] = piece.color;
  });

  const fullRows = [];
  const fullCols = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    if (nextBoard[y].every(Boolean)) fullRows.push(y);
  }
  for (let x = 0; x < GRID_SIZE; x++) {
    if (nextBoard.every((row) => row[x])) fullCols.push(x);
  }

  fullRows.forEach((y) => {
    for (let x = 0; x < GRID_SIZE; x++) nextBoard[y][x] = null;
  });
  fullCols.forEach((x) => {
    for (let y = 0; y < GRID_SIZE; y++) nextBoard[y][x] = null;
  });

  return {
    board: nextBoard,
    clearedLines: fullRows.length + fullCols.length,
  };
}

function hasAnyMove(board, piece) {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (canPlace(board, piece, x, y)) return true;
    }
  }
  return false;
}

function createOfferSet(seed) {
  return Array.from({ length: OFFER_COUNT }, (_, index) => createPiece(`${seed}-${index}-${Math.random()}`));
}

export default function BlockGrid({ onComplete, onSkip, T, lm }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const cellSize = isMobile ? 32 : 38;
  const boardSize = GRID_SIZE * cellSize + (GRID_SIZE - 1) * 4;
  const mobileDragLift = isMobile ? (cellSize * 3 + 8) : 0;
  const boardRef = useRef(null);

  const [board, setBoard] = useState(createEmptyBoard);
  const [pieces, setPieces] = useState(() => createOfferSet("start"));
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastGain, setLastGain] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [highscore] = useState(() => loadGameHighscore("blockgrid"));
  const [newRecord, setNewRecord] = useState(false);
  const [pulseCells, setPulseCells] = useState([]);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [dragState, setDragState] = useState(null);

  const selectedPiece = pieces.find((piece) => piece.id === selectedPieceId) || null;
  const activeAnchorCell = dragState?.anchorCell || getCenterAnchorCell(selectedPiece);

  useEffect(() => {
    if (selectedPieceId && !pieces.some((piece) => piece.id === selectedPieceId)) {
      setSelectedPieceId(null);
    }
  }, [pieces, selectedPieceId]);

  useEffect(() => {
    if (!selectedPieceId && pieces[0]?.id) setSelectedPieceId(pieces[0].id);
  }, [pieces, selectedPieceId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameOver || pieces.length === 0) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      const activeElementTag = document.activeElement?.tagName;
      if (activeElementTag === "INPUT" || activeElementTag === "TEXTAREA") return;

      e.preventDefault();

      const currentIndex = Math.max(0, pieces.findIndex((piece) => piece.id === selectedPieceId));
      const direction = (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 1;
      const nextIndex = (currentIndex + direction + pieces.length) % pieces.length;
      setSelectedPieceId(pieces[nextIndex].id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameOver, pieces, selectedPieceId]);

  useEffect(() => {
    if (gameOver) return;
    const remaining = pieces.filter(Boolean);
    if (remaining.length > 0 && remaining.every((piece) => !hasAnyMove(board, piece))) {
      setGameOver(true);
    }
  }, [board, pieces, gameOver]);

  const boardCells = useMemo(
    () => board.flatMap((row, y) => row.map((value, x) => ({ x, y, value }))),
    [board]
  );

  const previewPlacement = useMemo(() => {
    if (!selectedPiece || !hoveredCell) return { cells: [], valid: false };
    const originX = hoveredCell.x - activeAnchorCell[0];
    const originY = hoveredCell.y - activeAnchorCell[1];
    const cells = selectedPiece.cells.map(([dx, dy]) => ({
      x: originX + dx,
      y: originY + dy,
      key: `${originX + dx}-${originY + dy}`,
    }));
    return {
      cells,
      valid: canPlace(board, selectedPiece, originX, originY),
    };
  }, [activeAnchorCell, board, hoveredCell, selectedPiece]);

  const getBoardCellFromPoint = useCallback((clientX, clientY, visualLiftY = 0) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const adjustedY = clientY - visualLiftY;
    if (clientX < rect.left || clientX > rect.right || adjustedY < rect.top || adjustedY > rect.bottom) return null;

    const x = Math.floor((clientX - rect.left) / (cellSize + 4));
    const y = Math.floor((adjustedY - rect.top) / (cellSize + 4));
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
    return { x, y };
  }, [cellSize]);

  const handlePlace = useCallback((x, y, pieceOverride = null) => {
    const pieceToPlace = pieceOverride || selectedPiece;
    if (!pieceToPlace || gameOver) return;
    if (!canPlace(board, pieceToPlace, x, y)) return;

    const placedCells = pieceToPlace.cells.map(([dx, dy]) => `${x + dx}-${y + dy}`);
    const result = placePiece(board, pieceToPlace, x, y);
    const nextCombo = result.clearedLines > 0 ? combo + 1 : 0;
    const gain = pieceToPlace.cells.length * 10 + result.clearedLines * 40 + nextCombo * 15;
    const nextScore = score + gain;

    setBoard(result.board);
    setPulseCells(placedCells);
    setTimeout(() => setPulseCells([]), 220);
    setCombo(nextCombo);
    setLastGain(gain);
    setScore(nextScore);
    if (nextScore > highscore) {
      saveGameHighscore("blockgrid", nextScore);
      setNewRecord(true);
    }

    const nextPieces = pieces.map((piece) => (piece.id === pieceToPlace.id ? null : piece)).filter(Boolean);
    if (nextPieces.length === 0) {
      setPieces(createOfferSet(`set-${nextScore}`));
      setSelectedPieceId(null);
    } else {
      setPieces(nextPieces);
      setSelectedPieceId(nextPieces[0]?.id ?? null);
    }
    setHoveredCell(null);
  }, [board, combo, gameOver, highscore, pieces, score, selectedPiece]);

  const handleBoardInteract = useCallback((x, y) => {
    if (!selectedPiece) return;
    const originX = x - activeAnchorCell[0];
    const originY = y - activeAnchorCell[1];
    handlePlace(originX, originY);
  }, [activeAnchorCell, handlePlace, selectedPiece]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e) => {
      const point = { x: e.clientX, y: e.clientY };
      setDragState((current) => current ? { ...current, pointerX: point.x, pointerY: point.y } : current);
      setHoveredCell(getBoardCellFromPoint(point.x, point.y, isMobile ? mobileDragLift : 0));
    };

    const handlePointerUp = (e) => {
      const targetCell = getBoardCellFromPoint(e.clientX, e.clientY, isMobile ? mobileDragLift : 0);
      const draggedPiece = pieces.find((piece) => piece.id === dragState.pieceId);
      if (targetCell && draggedPiece) {
        const originX = targetCell.x - dragState.anchorCell[0];
        const originY = targetCell.y - dragState.anchorCell[1];
        if (canPlace(board, draggedPiece, originX, originY)) {
          setSelectedPieceId(draggedPiece.id);
          handlePlace(originX, originY, draggedPiece);
        }
      }
      setDragState(null);
      setHoveredCell(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [board, dragState, getBoardCellFromPoint, handlePlace, isMobile, mobileDragLift, pieces]);

  const restart = () => {
    setBoard(createEmptyBoard());
    setPieces(createOfferSet("restart"));
    setSelectedPieceId(null);
    setScore(0);
    setCombo(0);
    setLastGain(0);
    setGameOver(false);
    setNewRecord(false);
    setPulseCells([]);
    setHoveredCell(null);
    setDragState(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, userSelect: "none", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: boardSize, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.card, borderRadius: "12px 12px 0 0", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Block Grid 8x8</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{score}</span>
        <span style={{ fontSize: 11, color: T.textDim }}>Best {Math.max(highscore, score)}</span>
      </div>

      <div
        onMouseLeave={() => setHoveredCell(null)}
        style={{ position: "relative", background: lm ? "#ddd8cf" : "#131313", padding: 10, borderRadius: 18, border: `1px solid ${T.border}` }}
      >
        <div
          ref={boardRef}
          style={{ display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, ${cellSize}px)`, gap: 4, touchAction: "none" }}
        >
          {boardCells.map(({ x, y, value }) => {
            const active = pulseCells.includes(`${x}-${y}`);
            const previewCell = previewPlacement.cells.find((cell) => cell.key === `${x}-${y}`);
            const previewVisible = !value && previewCell;
            const previewBg = previewVisible
              ? previewPlacement.valid
                ? `${selectedPiece?.color ?? T.accent}88`
                : "rgba(224,80,80,0.35)"
              : null;
            return (
              <button
                key={`${x}-${y}`}
                onClick={() => handleBoardInteract(x, y)}
                onMouseEnter={() => setHoveredCell({ x, y })}
                onFocus={() => setHoveredCell({ x, y })}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 8,
                  border: `1px solid ${previewVisible ? (previewPlacement.valid ? selectedPiece?.color ?? T.accent : "#e05050") : value ? value : T.border}`,
                  background: value || previewBg || (lm ? "#f5f0ea" : "#0d0d0d"),
                  boxShadow: active
                    ? `0 0 10px ${T.accent}`
                    : previewVisible
                      ? `inset 0 0 0 1px ${previewPlacement.valid ? `${selectedPiece?.color ?? T.accent}` : "#e05050"}`
                      : "none",
                  cursor: selectedPiece && !gameOver ? "pointer" : "default",
                  transition: "transform 0.12s, box-shadow 0.12s, background 0.12s",
                  padding: 0,
                }}
              />
            );
          })}
        </div>

        {gameOver && (
          <div style={{ position: "absolute", inset: 0, background: lm ? "rgba(245,240,234,0.95)" : "rgba(10,10,10,0.94)", borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 13, color: T.textMid, letterSpacing: "0.14em", textTransform: "uppercase" }}>Game Over</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 12, color: T.textMid }}>Punkte</div>
            {newRecord && <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Neuer Rekord!</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={restart} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.inputBg, color: T.textMid, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Nochmal</button>
              <button onClick={onComplete} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fertig</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: boardSize, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {pieces.map((piece) => {
          const size = getShapeSize(piece.cells);
          const previewCell = isMobile ? 18 : 20;
          const selected = piece.id === selectedPieceId;
          return (
            <button
              key={piece.id}
              onClick={() => setSelectedPieceId(piece.id)}
              onPointerDown={(e) => {
                if (gameOver) return;
                const ghostGap = 4;
                const ghostWidth = size.w * cellSize + (size.w - 1) * ghostGap;
                const ghostHeight = size.h * cellSize + (size.h - 1) * ghostGap;
                setSelectedPieceId(piece.id);
                setDragState({
                  pieceId: piece.id,
                  anchorCell: getCenterAnchorCell(piece),
                  pointerX: e.clientX,
                  pointerY: e.clientY,
                  offsetX: ghostWidth / 2,
                  offsetY: ghostHeight / 2 + mobileDragLift,
                });
              }}
              style={{
                minHeight: 92,
                borderRadius: 12,
                border: `1px solid ${selected ? T.accent : T.border}`,
                background: selected ? T.tabActive : T.card,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                touchAction: "none",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${size.w}, ${previewCell}px)`,
                  gridTemplateRows: `repeat(${size.h}, ${previewCell}px)`,
                  gap: 3,
                }}
              >
                {Array.from({ length: size.w * size.h }, (_, index) => {
                  const x = index % size.w;
                  const y = Math.floor(index / size.w);
                  const filled = piece.cells.some(([dx, dy]) => dx === x && dy === y);
                  return (
                    <div
                      key={`${piece.id}-${x}-${y}`}
                      style={{
                        width: previewCell,
                        height: previewCell,
                        borderRadius: 5,
                        background: filled ? piece.color : "transparent",
                        border: filled ? `1px solid ${piece.color}` : "1px solid transparent",
                      }}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ width: boardSize, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 2px 0" }}>
        <span style={{ fontSize: 10, color: T.textDim }}>
          {selectedPiece ? "Pfeile fuer Teile, dann Feld ansteuern und klicken" : "Teil waehlen"}
        </span>
        <span style={{ fontSize: 10, color: combo > 0 ? T.accent : T.textDim }}>
          {combo > 0 ? `Combo x${combo + 1}` : lastGain > 0 ? `+${lastGain}` : ""}
        </span>
        <button onClick={onSkip} style={{ fontSize: 10, color: T.textDim, background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
          Beenden x
        </button>
      </div>

      {dragState && selectedPiece && (
        <div
          style={{
            position: "fixed",
            left: dragState.pointerX - dragState.offsetX,
            top: dragState.pointerY - dragState.offsetY,
            pointerEvents: "none",
            zIndex: 200,
            opacity: previewPlacement.valid ? 0.96 : 0.82,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${getShapeSize(selectedPiece.cells).w}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${getShapeSize(selectedPiece.cells).h}, ${cellSize}px)`,
              gap: 4,
            }}
          >
            {Array.from({ length: getShapeSize(selectedPiece.cells).w * getShapeSize(selectedPiece.cells).h }, (_, index) => {
              const x = index % getShapeSize(selectedPiece.cells).w;
              const y = Math.floor(index / getShapeSize(selectedPiece.cells).w);
              const filled = selectedPiece.cells.some(([dx, dy]) => dx === x && dy === y);
              return (
                <div
                  key={`drag-${selectedPiece.id}-${x}-${y}`}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 6,
                    background: filled ? (previewPlacement.valid ? selectedPiece.color : "rgba(224,80,80,0.45)") : "transparent",
                    border: filled ? `1px solid ${previewPlacement.valid ? selectedPiece.color : "#e05050"}` : "1px solid transparent",
                    boxShadow: filled ? `0 8px 18px ${previewPlacement.valid ? `${selectedPiece.color}44` : "rgba(224,80,80,0.20)"}` : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
