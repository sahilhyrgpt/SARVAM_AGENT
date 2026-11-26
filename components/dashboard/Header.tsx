"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LogOut, ShieldCheck, Activity } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface HeaderProps {
  userEmail?: string;
}

export const Header: React.FC<HeaderProps> = ({ userEmail = "admin@hyrgpt.com" }) => {
  const router = useRouter();
  const { info } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      info("Logged Out", "You have been signed out.");
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-[#222f49] bg-[#090d16]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 border border-orange-400/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight sm:text-lg">
                AI Interview Console
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-purple-950/60 px-2 py-0.5 text-[10px] font-semibold text-purple-300 border border-purple-500/30">
                Sarvam AI Voice
              </span>
            </div>
            <p className="hidden text-[11px] text-slate-400 sm:block">
              Candidate Screening & Telephony Platform
            </p>
          </div>
        </div>

        {/* Right Nav: Admin info & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#222f49] bg-[#131b2e] px-3 py-1.5 text-xs text-slate-300">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <Activity className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-slate-400">telephony:</span>
            <span className="font-medium text-emerald-400">ready</span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[#222f49] bg-[#131b2e] px-3 py-1.5 text-xs text-slate-200">
            <ShieldCheck className="h-4 w-4 text-orange-400" />
            <span className="font-medium max-w-[150px] truncate">{userEmail}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            isLoading={isLoggingOut}
            leftIcon={<LogOut className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};
