"use client";
import { ChatPanel } from "@/components/ChatPanel";
import { Notice, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Assistant" sub="Quick answers about echo, noise, microphones and speakers." />
      <div className="max-w-3xl space-y-3">
        <Notice tone="info">This is a rule-based helper built into the page, not an AI model, and it needs no internet connection. It gives general guidance only.</Notice>
        <ChatPanel guest height="h-[55vh]" />
      </div>
    </>
  );
}
