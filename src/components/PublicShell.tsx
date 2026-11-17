"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ChatPanel } from "./ChatPanel";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const [chat, setChat] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="SoundSense home"><Logo /></Link>
          <nav aria-label="Site" className="ml-auto hidden items-center gap-1 sm:flex"><Link className="btn-ghost btn-sm" href="/learn">Learn</Link><Link className="btn-ghost btn-sm" href="/#how">How it works</Link><Link className="btn-ghost btn-sm" href="/#honesty">Our promises</Link></nav>
          <div className="ml-auto flex items-center gap-1 sm:ml-2"><ThemeToggle /><Link className="btn-secondary btn-sm" href="/login">Sign in</Link><Link className="btn-primary btn-sm hidden sm:inline-flex" href="/register">Get started</Link></div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-20 bg-navy text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          <div><Logo /><p className="mt-3 max-w-xs text-sm text-white/60">Making Every Sound Count. Built as a CPP International Project at GLIM Chennai.</p></div>
          <div className="text-sm"><p className="mb-2 font-semibold text-white">Explore</p><ul className="space-y-1.5"><li><Link href="/learn">Learning centre</Link></li><li><Link href="/register">Start an assessment</Link></li><li><Link href="/login">Sign in</Link></li></ul></div>
          <div className="text-sm text-white/60"><p className="mb-2 font-semibold text-white">Good to know</p><p>Microphone readings in the browser are relative unless calibrated. Prices shown are indicative estimates, not quotes. SoundSense is a learning project, not a certified measurement service.</p></div>
        </div>
      </footer>
      <button onClick={() => setChat(!chat)} className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-brand-ink shadow-card" aria-expanded={chat} aria-controls="guest-chat" aria-label={chat ? "Close assistant" : "Ask about sound"}>
        {chat ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}<span className="hidden sm:inline">{chat ? "Close" : "Ask about sound"}</span></button>
      {chat && (
        <div id="guest-chat" role="dialog" aria-label="Assistant" className="fixed bottom-20 right-3 z-40 w-[calc(100%-24px)] max-w-md rounded-2xl border border-line bg-canvas p-3 shadow-card">
          <p className="mb-2 px-1 text-xs text-muted">General acoustics help. Sign in to talk to a consultant or use your assessment.</p>
          <ChatPanel guest height="h-[50vh]" />
        </div>
      )}
    </div>
  );
}
