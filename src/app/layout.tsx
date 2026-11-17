import type { Metadata, Viewport } from "next";
import "@fontsource-variable/sora";
import "@fontsource-variable/figtree";
import "./globals.css";
import { PwaRegister } from "@/components/Pwa";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "SoundSense – Making Every Sound Count", template: "%s · SoundSense" },
  description: "Diagnose first. Recommend second. Sell last. A smart acoustic assessment, diagnosis and consultation platform for meeting rooms, offices, classrooms and public-address spaces.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SoundSense", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#102a36" }, { media: "(prefers-color-scheme: dark)", color: "#0a1318" }],
};

// Runs before first paint so there is no light→dark flash.
const THEME_INIT = `try{var t=localStorage.getItem('ss-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink">Skip to content</a>
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
