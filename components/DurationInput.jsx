import { useState, useEffect } from "react";

export default function DurationInput({ value, onChange, max = 60, style }) {
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
