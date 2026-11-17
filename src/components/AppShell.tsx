"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Bell, BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Mic, Package, ScrollText, Settings, Star, UserRound, Users, X, MessagesSquare } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Spinner } from "./ui";
import { call, Me, useApi, useMe } from "@/lib/client";

type Item = { href: string; label: string; icon: any; exact?: boolean };
const CUSTOMER: Item[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/app/measure", label: "Measure & calculate", icon: Mic },
  { href: "/app/bookings", label: "Consultations", icon: CalendarDays },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/chat", label: "Assistant", icon: MessageCircle },
  { href: "/app/learn", label: "Learn", icon: GraduationCap },
  { href: "/app/feedback", label: "Feedback", icon: Star },
];
const CONSULTANT: Item[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/assessments", label: "My cases", icon: ClipboardList },
  { href: "/app/bookings", label: "Consultations", icon: CalendarDays },
  { href: "/app/chats", label: "Chats", icon: MessagesSquare },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/measure", label: "Measure & calculate", icon: Mic },
  { href: "/app/learn", label: "Learn", icon: GraduationCap },
];
const ADMIN: Item[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/app/bookings", label: "Bookings & calendar", icon: CalendarDays },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/admin/users", label: "Customers & staff", icon: Users },
  { href: "/app/admin/products", label: "Products & pricing", icon: Package },
  { href: "/app/admin/feedback", label: "Feedback", icon: Star },
  { href: "/app/chats", label: "Chats", icon: MessagesSquare },
  { href: "/app/admin/settings", label: "Settings", icon: Settings },
  { href: "/app/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/app/learn", label: "Learn", icon: GraduationCap },
];
const NAV = { customer: CUSTOMER, consultant: CONSULTANT, admin: ADMIN } as const;
const BOTTOM = { customer: ["/app", "/app/assessments", "/app/measure", "/app/bookings"], consultant: ["/app", "/app/assessments", "/app/bookings", "/app/chats"], admin: ["/app", "/app/assessments", "/app/bookings", "/app/admin/users"] } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data, error, isLoading } = useMe();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("ss-nav") === "1"); } catch {} }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (error?.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [error, router, path]);
  const { data: notif } = useApi<{ unread: number }>(data ? "/api/notifications" : null, { refreshInterval: 60000 });

  if (isLoading || !data) return <div className="grid min-h-screen place-items-center">{error && error.status !== 401 ? <p role="alert">{error.message}</p> : <Spinner />}</div>;
  const me: Me = data.user;
  const items = NAV[me.role];
  const isActive = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const logout = async () => { await call("/api/auth/logout", { body: {} }).catch(() => {}); router.replace("/login"); };
  const toggle = () => { setCollapsed(!collapsed); try { localStorage.setItem("ss-nav", collapsed ? "0" : "1"); } catch {} };

  const Nav = ({ onNav, compact }: { onNav?: () => void; compact?: boolean }) => (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href} onClick={onNav} aria-current={isActive(i) ? "page" : undefined} title={compact ? i.label : undefined}
          className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive(i) ? "bg-brand-soft text-brand" : "text-ink/80 hover:bg-raised"} ${compact ? "justify-center px-0" : ""}`}>
          <i.icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> {!compact && <span className="truncate">{i.label}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex ${collapsed ? "w-[68px]" : "w-[248px]"} transition-[width]`}>
        <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "px-4"}`}><Link href="/app" aria-label="SoundSense dashboard"><Logo compact={collapsed} /></Link></div>
        <div className="flex-1 overflow-y-auto px-2 py-2"><Nav compact={collapsed} /></div>
        <div className="border-t border-line p-2">
          <button onClick={toggle} className="btn-ghost btn-sm w-full !justify-start gap-3 !px-3" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <><PanelLeftClose className="h-[18px] w-[18px]" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between px-1"><Logo /><button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            <div className="flex-1 overflow-y-auto"><Nav onNav={() => setOpen(false)} /></div>
            <button onClick={logout} className="btn-secondary mt-2"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      )}

      <div className={`${collapsed ? "md:pl-[68px]" : "md:pl-[248px]"} transition-[padding]`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
          <button className="btn-ghost !min-w-[44px] px-0 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Link href="/app" className="md:hidden" aria-label="Dashboard"><Logo compact /></Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Link href="/app/notifications" className="btn-ghost relative !min-w-[44px] px-0" aria-label={`Notifications${notif?.unread ? `, ${notif.unread} unread` : ""}`}>
            <Bell className="h-[18px] w-[18px]" />
            {!!notif?.unread && <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-black">{notif.unread > 9 ? "9+" : notif.unread}</span>}
          </Link>
          <Link href="/app/profile" className="btn-ghost gap-2 !px-2" aria-label="Your profile">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-brand-ink">{me.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
            <span className="hidden max-w-[140px] truncate text-sm font-semibold sm:block">{me.name}</span>
          </Link>
          <button onClick={logout} className="btn-ghost hidden !min-w-[44px] px-0 md:inline-flex" aria-label="Sign out" title="Sign out"><LogOut className="h-[18px] w-[18px]" /></button>
        </header>
        {!me.email_verified_at && <div className="bg-warn/15 px-4 py-2 text-center text-sm">Please verify your e-mail address – check your inbox.</div>}
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 md:pb-12">{children}</main>
      </div>

      {/* mobile bottom nav */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.filter((i) => (BOTTOM[me.role] as readonly string[]).includes(i.href)).map((i) => (
          <Link key={i.href} href={i.href} aria-current={isActive(i) ? "page" : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(i) ? "text-brand" : "text-muted"}`}>
            <i.icon className="h-5 w-5" aria-hidden />{i.label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
void BookOpen; void UserRound;
