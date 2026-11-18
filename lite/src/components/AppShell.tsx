"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { ClipboardList, Database, GraduationCap, LayoutDashboard, Menu, MessageCircle, Mic, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

type Item = { href: string; label: string; icon: any; exact?: boolean };
const ITEMS: Item[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/app/measure", label: "Measure & calculate", icon: Mic },
  { href: "/app/chat", label: "Assistant", icon: MessageCircle },
  { href: "/app/learn", label: "Learn", icon: GraduationCap },
  { href: "/app/data", label: "My data", icon: Database },
];
const BOTTOM = ["/app", "/app/assessments", "/app/measure", "/app/data"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("ss-nav") === "1"); } catch {} }, []);
  useEffect(() => setOpen(false), [path]);
  const isActive = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const toggle = () => { setCollapsed(!collapsed); try { localStorage.setItem("ss-nav", collapsed ? "0" : "1"); } catch {} };

  const Nav = ({ onNav, compact }: { onNav?: () => void; compact?: boolean }) => (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} onClick={onNav} aria-current={isActive(i) ? "page" : undefined} title={compact ? i.label : undefined}
          className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive(i) ? "bg-brand-soft text-brand" : "text-ink/80 hover:bg-raised"} ${compact ? "justify-center px-0" : ""}`}>
          <i.icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> {!compact && <span className="truncate">{i.label}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex ${collapsed ? "w-[68px]" : "w-[248px]"} transition-[width]`}>
        <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "px-4"}`}><Link href="/app" aria-label="SoundSense dashboard"><Logo compact={collapsed} /></Link></div>
        <div className="flex-1 overflow-y-auto px-2 py-2"><Nav compact={collapsed} /></div>
        <div className="border-t border-line p-2">
          <button onClick={toggle} className="btn-ghost btn-sm w-full !justify-start gap-3 !px-3" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <><PanelLeftClose className="h-[18px] w-[18px]" /> Collapse</>}
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between px-1"><Logo /><button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            <div className="flex-1 overflow-y-auto"><Nav onNav={() => setOpen(false)} /></div>
          </div>
        </div>
      )}

      <div className={`${collapsed ? "md:pl-[68px]" : "md:pl-[248px]"} transition-[padding]`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
          <button className="btn-ghost !min-w-[44px] px-0 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Link href="/app" className="md:hidden" aria-label="Dashboard"><Logo compact /></Link>
          <div className="flex-1" />
          <span className="hidden rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand sm:inline">No sign-in · saved on this device only</span>
          <ThemeToggle />
          <Link href="/" className="btn-ghost btn-sm">Home</Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 md:pb-12">{children}</main>
      </div>

      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {ITEMS.filter((i) => BOTTOM.includes(i.href)).map((i) => (
          <Link key={i.href} href={i.href} aria-current={isActive(i) ? "page" : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(i) ? "text-brand" : "text-muted"}`}>
            <i.icon className="h-5 w-5" aria-hidden />{i.label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
