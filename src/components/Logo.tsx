export function LogoMark({ size = 32 }: { size?: number }) {
  const bars = [10, 18, 26, 14, 22, 8];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--navy))" />
      {bars.map((h, i) => (
        <rect key={i} x={5 + i * 4} y={16 - h / 2} width="2.4" height={h} rx="1.2" fill={i === 2 ? "rgb(var(--accent))" : "rgb(var(--brand))"} className="ss-bar" style={{ animationDelay: `${i * 0.12}s`, animationDuration: "2.4s" }} />
      ))}
    </svg>
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && <span className="font-display text-[19px] font-semibold tracking-tight">SoundSense</span>}
    </span>
  );
}
