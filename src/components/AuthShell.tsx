import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthShell({ title, sub, children, foot }: { title: string; sub?: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" aria-label="SoundSense home"><Logo /></Link>
        <div>
          <p className="font-display text-4xl font-semibold leading-tight">Diagnose first.<br />Recommend second.<br /><span className="text-accent">Sell last.</span></p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">Most “bad audio” problems are not fixed by buying a better microphone. SoundSense helps you find the actual cause before anyone mentions a product.</p>
        </div>
        <Waveform />
      </aside>
      <main id="main" className="flex flex-col px-5 py-6 sm:px-10">
        <div className="mb-8 flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden" aria-label="SoundSense home"><Logo /></Link>
          <ThemeToggle />
        </div>
        <div className="m-auto w-full max-w-[420px] pb-10">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
          <div className="mt-6">{children}</div>
          {foot && <div className="mt-6 text-sm text-muted">{foot}</div>}
        </div>
      </main>
    </div>
  );
}

function Waveform() {
  const h = [14, 26, 40, 22, 52, 34, 68, 44, 30, 58, 36, 20, 46, 28, 60, 38, 18, 32, 50, 24, 42, 16];
  return (
    <svg viewBox="0 0 330 90" className="w-full max-w-md" aria-hidden>
      {h.map((v, i) => <rect key={i} x={i * 15} y={45 - v / 2} width="6" height={v} rx="3" fill={i === 6 ? "rgb(var(--accent))" : "rgb(var(--brand))"} opacity={i === 6 ? 1 : 0.35 + (v / 68) * 0.6} />)}
    </svg>
  );
}
