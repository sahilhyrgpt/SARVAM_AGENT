import React from "react";
import { PhoneCall, CheckCircle2, Radio, XCircle, PhoneMissed } from "lucide-react";
import { InterviewSummaryMetrics } from "@/types/interview";
import { Card } from "@/components/ui/Card";

interface SummaryCardsProps {
  metrics: InterviewSummaryMetrics;
  isLoading?: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ metrics, isLoading = false }) => {
  const cards = [
    {
      title: "Total Calls",
      value: metrics.totalCalls,
      icon: PhoneCall,
      iconColor: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
      glow: "hover:border-orange-500/40",
    },
    {
      title: "Completed",
      value: metrics.completed,
      icon: CheckCircle2,
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      glow: "hover:border-emerald-500/40",
    },
    {
      title: "In Progress",
      value: metrics.inProgress,
      icon: Radio,
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      glow: "hover:border-amber-500/40",
      pulse: metrics.inProgress > 0,
    },
    {
      title: "Failed / Rejected",
      value: metrics.failed,
      icon: XCircle,
      iconColor: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      glow: "hover:border-red-500/40",
    },
    {
      title: "No Answer / Busy",
      value: metrics.noAnswer,
      icon: PhoneMissed,
      iconColor: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      glow: "hover:border-purple-500/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className={`p-4 border ${card.borderColor} ${card.glow} transition-all duration-200 bg-[#131b2e]/90`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{card.title}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bgColor} ${card.iconColor}`}>
                <Icon className={`h-4 w-4 ${card.pulse ? "animate-pulse" : ""}`} />
              </div>
            </div>
            <div className="mt-3">
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-slate-800" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-white">{card.value}</span>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
