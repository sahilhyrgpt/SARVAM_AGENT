import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interview Console — Sarvam Voice Platform",
  description: "Manage and trigger candidate screening calls powered by Sarvam AI Voice Agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-[#f8fafc] antialiased selection:bg-orange-500/30 selection:text-orange-200 min-h-screen">
        <div className="ambient-glow" />
        <ToastProvider>
          <div className="relative z-10 min-h-screen flex flex-col">
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
