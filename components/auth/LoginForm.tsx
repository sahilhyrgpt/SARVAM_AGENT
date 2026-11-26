"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Lock, Mail, AlertCircle, Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export const LoginForm: React.FC = () => {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState("admin@hyrgpt.com");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorMsg = data?.error?.message || "Invalid credentials. Please verify your email and password.";
        setError(errorMsg);
        toastError("Login Failed", errorMsg);
        setIsLoading(false);
        return;
      }

      success("Signed In Successfully", "Redirecting to AI Interview Console...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network or server error occurred. Please try again.");
      toastError("Error", "Unable to connect to login server.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card glow="orange" className="border-[#222f49] shadow-2xl shadow-black/80 bg-[#131b2e]/95">
        <CardHeader className="text-center pt-8 pb-6 border-b border-[#222f49]">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25 border border-orange-400/40">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-extrabold text-center justify-center text-white">
            AI Interview Console
          </CardTitle>
          <CardDescription className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">
            Manage candidate screening calls powered by Sarvam AI
          </CardDescription>
        </CardHeader>

        <CardContent className="p-8 space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-3.5 rounded-lg bg-red-950/60 border border-red-500/30 text-red-200 text-xs animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hyrgpt.com"
                  className="w-full rounded-lg border border-[#222f49] bg-[#0c1220] px-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-[#222f49] bg-[#0c1220] px-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2 font-semibold shadow-md"
              leftIcon={<PhoneCall className="h-4 w-4" />}
            >
              Sign In
            </Button>
          </form>

          <div className="pt-2 text-center text-xs text-slate-500">
            Internal recruitment operations • Telephony powered by Sarvam AI
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
