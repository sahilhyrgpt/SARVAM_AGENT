"use client";

import React, { useState } from "react";
import { Eye, PhoneCall, RotateCcw, Search, Filter, Phone, Sparkles } from "lucide-react";
import { Interview, CallStatus } from "@/types/interview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface InterviewTableProps {
  interviews: Interview[];
  isLoading: boolean;
  onViewDetails: (interview: Interview) => void;
  onTriggerCall: (interview: Interview) => void;
  onInterviewUpdated?: (updated: Interview) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}

export const InterviewTable: React.FC<InterviewTableProps> = ({
  interviews,
  isLoading,
  onViewDetails,
  onTriggerCall,
  onInterviewUpdated,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}) => {
  const [scoringId, setScoringId] = useState<string | null>(null);

  const handleRowGenerateScore = async (interview: Interview) => {
    setScoringId(interview.id);
    try {
      const res = await fetch("/api/get-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.interview) {
        if (onInterviewUpdated) {
          onInterviewUpdated(data.data.interview);
        }
      }
    } catch (e) {
      console.error("Error generating score:", e);
    } finally {
      setScoringId(null);
    }
  };
  const formatDuration = (seconds?: number | null) => {
    if (seconds === undefined || seconds === null) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  const isCallActive = (status: CallStatus) => {
    return ["initiating", "ringing", "answered", "in_progress"].includes(status);
  };

  const isCallCompleted = (status: CallStatus) => {
    return status === "completed" || status === "score_generated";
  };

  const isCallRetryable = (status: CallStatus) => {
    return ["incomplete", "no_answer", "busy", "rejected", "failed", "connection_error", "cancelled"].includes(
      status
    );
  };

  return (
    <Card className="border-[#222f49] bg-[#131b2e]/90 shadow-xl">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Phone className="h-5 w-5 text-purple-400" />
            <span>Interview Call Management</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Review candidate interviews, monitor call progression, and initiate Sarvam AI voice calls
          </CardDescription>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search candidate, role, phone..."
              className="w-full rounded-lg border border-[#222f49] bg-[#0c1220] px-8 py-1.5 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="rounded-lg border border-[#222f49] bg-[#0c1220] px-3 py-1.5 text-xs text-slate-200 focus:border-purple-500 focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="created">Created</option>
              <option value="initiating">Initiating</option>
              <option value="ringing">Ringing</option>
              <option value="in_progress">In Progress</option>
              <option value="score_generated">Score Generated</option>
              <option value="completed">Completed</option>
              <option value="incomplete">Incomplete Call</option>
              <option value="no_answer">No Answer</option>
              <option value="busy">Busy</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table View (Desktop & Tablet) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-y border-[#222f49] bg-[#0c1220]/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Candidate</th>
                <th className="px-5 py-3 whitespace-nowrap">Job Title</th>
                <th className="px-5 py-3 whitespace-nowrap">Phone</th>
                <th className="px-5 py-3 whitespace-nowrap">Status</th>
                <th className="px-5 py-3 whitespace-nowrap">Score</th>
                <th className="px-5 py-3 whitespace-nowrap">Created</th>
                <th className="px-5 py-3 whitespace-nowrap">Duration</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222f49]/60">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-5 py-4 text-right"><Skeleton className="h-7 w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <PhoneCall className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                    No interviews found matching the current filters.
                  </td>
                </tr>
              ) : (
                interviews.map((interview) => {
                  const status = interview.call.status;
                  const active = isCallActive(status);
                  const completed = isCallCompleted(status);
                  const retryable = isCallRetryable(status);

                  return (
                    <tr
                      key={interview.id}
                      className="hover:bg-[#182238]/60 transition-colors group"
                    >
                      {/* Candidate */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-white group-hover:text-orange-400 transition-colors">
                          {interview.candidate.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {interview.candidate.id}
                        </div>
                      </td>

                      {/* Job Title */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-medium text-slate-200">{interview.job.title}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          {(interview.company_name || interview.job.company_name) && (
                            <>
                              <span className="text-orange-300 font-medium">
                                {interview.company_name || interview.job.company_name}
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span>{interview.questions.length} questions</span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-3.5 font-mono text-slate-300 whitespace-nowrap">
                        {interview.candidate.phone}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Badge status={status} size="sm" />
                      </td>

                      {/* Score */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {interview.evaluation?.score !== undefined ? (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm ${interview.evaluation.score >= 75
                                ? "bg-emerald-950/70 text-emerald-300 border-emerald-500/40 shadow-emerald-950/30"
                                : interview.evaluation.score >= 50
                                  ? "bg-amber-950/70 text-amber-300 border-amber-500/40 shadow-amber-950/30"
                                  : "bg-teal-950/70 text-teal-300 border-teal-500/40 shadow-teal-950/30"
                              }`}
                          >
                            {interview.evaluation.score}/100
                          </span>
                        ) : isCallCompleted(status) || (interview.transcript && interview.transcript.length > 0) ? (
                          <button
                            type="button"
                            onClick={() => handleRowGenerateScore(interview)}
                            disabled={scoringId === interview.id}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 border border-teal-500/40 transition-colors shadow-sm cursor-pointer"
                            title="Generate AI score with OpenAI"
                          >
                            <Sparkles
                              className={`h-3 w-3 text-teal-400 ${scoringId === interview.id ? "animate-spin" : ""
                                }`}
                            />
                            <span>{scoringId === interview.id ? "Scoring..." : "Score"}</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                        {formatDate(interview.createdAt)}
                      </td>

                      {/* Duration */}
                      <td className="px-5 py-3.5 font-mono text-slate-300 whitespace-nowrap">
                        {formatDuration(interview.call.duration)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewDetails(interview)}
                            className="text-xs px-2.5 py-1"
                            leftIcon={<Eye className="h-3.5 w-3.5" />}
                          >
                            View
                          </Button>

                          {retryable ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onTriggerCall(interview)}
                              className="text-xs px-2.5 py-1"
                              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                            >
                              Retry Call
                            </Button>
                          ) : active ? (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled
                              className="text-xs px-2.5 py-1"
                              leftIcon={<PhoneCall className="h-3.5 w-3.5 animate-pulse" />}
                            >
                              Calling...
                            </Button>
                          ) : !completed ? (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => onTriggerCall(interview)}
                              className="text-xs px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium shadow-md shadow-orange-950/40"
                              leftIcon={<PhoneCall className="h-3.5 w-3.5" />}
                            >
                              Start Call
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
