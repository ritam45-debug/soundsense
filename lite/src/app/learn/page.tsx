import type { Metadata } from "next";
import { LearnContent } from "@/components/LearnContent";
import { PublicShell } from "@/components/PublicShell";
export const metadata: Metadata = { title: "Learning centre", description: "Plain-language guides to echo, reverberation, noise, microphones and speakers." };
export default function Page() {
  return <PublicShell><div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><h1 className="font-display text-3xl font-semibold">Learning centre</h1><p className="mb-8 mt-2 text-muted">Plain-language guides to echo, noise, microphones and speakers.</p><LearnContent /></div></PublicShell>;
}
