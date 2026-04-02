export default function PauseInvitation({ pauseTimeLeft, onStartGame, onSkip, highscore }) {
  if (pauseTimeLeft < 30) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#0e0c09",
        border: "1px solid #d4a017",
        borderRadius: 14,
        padding: "12px 16px",
        animation: "slideUpFade 0.3s ease-out",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px #d4a01722",
        maxWidth: 340,
      }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "#1a1714", border: "1px solid #2a2520",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>
          ◆
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2d9cc", marginBottom: 2 }}>
            Nutze die Pause für Crystal Rush!
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {highscore > 0 ? `Dein Rekord: ${highscore} Pkt` : "Erstes Spiel — was schaffst du?"}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <button
            onClick={onStartGame}
            style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: "#d4a017", color: "#0e0c09",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap",
            }}>
            Spielen →
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "transparent", color: "#555",
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>
            Überspringen
          </button>
        </div>
      </div>
    </>
  );
}
