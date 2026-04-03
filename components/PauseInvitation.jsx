const GAMES = [
  { id: "crystal",  icon: "🔮", name: "Crystal Rush", desc: "Kristalle fangen" },
  { id: "memory",   icon: "🧠", name: "Memory Flash",  desc: "Sequenz merken"  },
  { id: "breakout", icon: "🏓", name: "Breakout",       desc: "Steine zerstören"},
  { id: "sudoku",   icon: "🔢", name: "Sudoku 6×6",    desc: "Zahlen einsetzen"},
];

function loadHighscore(gameId) {
  try { return parseInt(localStorage.getItem(`focuspartner_hs_${gameId}`) || "0"); } catch { return 0; }
}

export default function PauseInvitation({ pauseTimeLeft, onStartGame, onSkip, T }) {
  if (pauseTimeLeft < 30) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .game-card:hover { opacity: 0.88; transform: scale(1.03); }
      `}</style>
      <div style={{
        background: T.card, border: `1px solid ${T.accent}`,
        borderRadius: 16, padding: "14px 16px",
        animation: "slideUpFade 0.3s ease-out",
        boxShadow: T.shadow, maxWidth: 360, width: "100%",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10, textAlign: "center" }}>
          Minispiel in der Pause spielen?
        </div>

        {/* 2×2 game card grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {GAMES.map(g => {
            const hs = loadHighscore(g.id);
            return (
              <button key={g.id} className="game-card"
                onClick={() => onStartGame(g.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  gap: 3, padding: "10px 12px", borderRadius: 10,
                  background: T.inputBg, border: `1px solid ${T.border}`,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "opacity 0.15s, transform 0.15s",
                }}>
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{g.name}</span>
                <span style={{ fontSize: 10, color: T.textMid }}>{g.desc}</span>
                {hs > 0 && (
                  <span style={{ fontSize: 9, color: T.accent, marginTop: 1 }}>Rekord: {hs}</span>
                )}
              </button>
            );
          })}
        </div>

        <button onClick={onSkip} style={{
          width: "100%", padding: "6px", borderRadius: 8, border: "none",
          background: "transparent", color: T.textMid, fontSize: 11,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Überspringen
        </button>
      </div>
    </>
  );
}
