import React from "react";
import { CallStatus } from "@/types/interview";

interface BadgeProps {
  status: CallStatus | string;
  className?: string;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({ status, className = "", size = "md" }) => {
  const normalized = (status || "unknown").toLowerCase();

  let styles = "bg-slate-800/80 text-slate-300 border-slate-700";
  let dotColor = "bg-slate-400";
  let label = status;

  switch (normalized) {
    case "score_generated":
    case "score-generated":
      styles = "bg-teal-950/70 text-teal-300 border-teal-500/50 shadow-teal-950/40";
      dotColor = "bg-teal-400";
      label = "Score Generated";
      break;
    case "incomplete":
      styles = "bg-rose-950/60 text-rose-300 border-rose-500/40 shadow-rose-950/30";
      dotColor = "bg-rose-400";
      label = "Incomplete Call";
      break;
    case "completed":
      styles = "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-emerald-950/30";
      dotColor = "bg-emerald-400";
      label = "Completed";
      break;
    case "in_progress":
    case "in-progress":
      styles = "bg-amber-950/60 text-amber-300 border-amber-500/40 animate-pulse shadow-amber-950/30";
      dotColor = "bg-amber-400";
      label = "In Progress";
      break;
    case "initiating":
      styles = "bg-orange-950/60 text-orange-300 border-orange-500/40 animate-pulse";
      dotColor = "bg-orange-400";
      label = "Initiating";
      break;
    case "ringing":
      styles = "bg-blue-950/60 text-blue-300 border-blue-500/40 animate-pulse";
      dotColor = "bg-blue-400";
      label = "Ringing";
      break;
    case "answered":
      styles = "bg-cyan-950/60 text-cyan-300 border-cyan-500/40";
      dotColor = "bg-cyan-400";
      label = "Answered";
      break;
    case "no_answer":
    case "no-answer":
      styles = "bg-violet-950/60 text-violet-300 border-violet-500/40";
      dotColor = "bg-violet-400";
      label = "No Answer";
      break;
    case "busy":
      styles = "bg-purple-950/60 text-purple-300 border-purple-500/40";
      dotColor = "bg-purple-400";
      label = "Busy";
      break;
    case "rejected":
      styles = "bg-rose-950/60 text-rose-300 border-rose-500/40";
      dotColor = "bg-rose-400";
      label = "Rejected";
      break;
    case "failed":
    case "connection_error":
      styles = "bg-red-950/60 text-red-300 border-red-500/40";
      dotColor = "bg-red-400";
      label = normalized === "connection_error" ? "Connection Error" : "Failed";
      break;
    case "voicemail":
      styles = "bg-indigo-950/60 text-indigo-300 border-indigo-500/40";
      dotColor = "bg-indigo-400";
      label = "Voicemail";
      break;
    case "created":
      styles = "bg-slate-800/80 text-slate-300 border-slate-700/80";
      dotColor = "bg-slate-400";
      label = "Created";
      break;
    case "cancelled":
      styles = "bg-zinc-800/80 text-zinc-400 border-zinc-700";
      dotColor = "bg-zinc-500";
      label = "Cancelled";
      break;
  }

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1.5"
      : "px-2.5 py-1 text-xs gap-2 font-medium";

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-sm whitespace-nowrap shrink-0 ${styles} ${sizeClasses} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{label}</span>
    </span>
  );
};
