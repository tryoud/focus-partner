export default function Toggle({ val, onToggle, label, T }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={val}
      aria-label={`Toggle ${label}`}
      style={{
        width: 38, height: 21, borderRadius: 100,
        background: val ? T.accent : T.toggleOff,
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        width: 15, height: 15, borderRadius: "50%",
        background: val ? T.bg : T.toggleThumb,
        position: "absolute", top: 3,
        left: val ? 20 : 3,
        transition: "left 0.18s ease-out, background 0.18s",
      }} />
    </button>
  );
}
