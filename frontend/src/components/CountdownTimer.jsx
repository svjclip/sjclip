import React, { useEffect, useState } from "react";

function nextSundayMidnight() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 sunday
  const daysUntilSunday = (7 - day) % 7 || 7;
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 0, 0, 0));
  return target;
}

export default function CountdownTimer() {
  const [target] = useState(nextSundayMidnight());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, target.getTime() - now.getTime());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);

  const Box = ({ value, label }) => (
    <div className="flex flex-col items-center">
      <div className="font-mono font-bold text-3xl md:text-4xl text-[#53FC18] neon-text tabular-nums">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mt-1">{label}</div>
    </div>
  );

  return (
    <div className="flex items-center gap-3 md:gap-6" data-testid="countdown-timer">
      <Box value={d} label="Gün" />
      <span className="font-mono text-2xl text-zinc-700">:</span>
      <Box value={h} label="Saat" />
      <span className="font-mono text-2xl text-zinc-700">:</span>
      <Box value={m} label="Dk" />
      <span className="font-mono text-2xl text-zinc-700">:</span>
      <Box value={s} label="Sn" />
    </div>
  );
}
