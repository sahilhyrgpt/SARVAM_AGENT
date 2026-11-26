"use client";

import React, { useState, useMemo } from "react";
import { extractQuestionAnswersFromTranscript } from "@/lib/utils/qa-extractor";
import {
  User,
  Briefcase,
  Phone,
  Clock,
  Calendar,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Bot,
  UserCheck,
  CheckCircle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Volume2,
  Download,
  ExternalLink,
  Target,
  TrendingUp,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Interview } from "@/types/interview";
import { useToast } from "@/components/ui/Toast";

interface InterviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  onInterviewUpdated?: (updated: Interview) => void;
}

export const InterviewDetailModal: React.FC<InterviewDetailModalProps> = ({
  isOpen,
  onClose,
  interview,
  onInterviewUpdated,
}) => {
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingScore, setIsGeneratingScore] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  // Intelligently extract responses from transcript if structured QA is not already present
  const extractedQA = useMemo(() => {
    if (!interview?.questions || !interview?.transcript) return [];
    return extractQuestionAnswersFromTranscript(interview.questions, interview.transcript);
  }, [interview?.questions, interview?.transcript]);

  // Extract configured skills for the interview/job
  const configuredSkills: string[] = useMemo(() => {
    if (!interview) return [];
    const raw = [
      ...(Array.isArray(interview.skills) ? interview.skills : []),
      ...(Array.isArray(interview.job?.skills) ? interview.job.skills : []),
    ];
    return Array.from(
      new Set(
        raw
          .map((s) =>
            typeof s === "string"
              ? s.trim()
              : typeof s === "object" && s && "name" in s
              ? String((s as any).name).trim()
              : ""
          )
          .filter((s) => s.length > 0)
      )
    );
  }, [interview]);

  if (!interview) return null;

  const toggleQuestion = (qId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const handleSyncFromSarvam = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/interviews/${interview.id}/sync`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.interview) {
        toastSuccess("Synced with Sarvam", "Latest call telemetry, duration, and audio fetched successfully.");
        if (onInterviewUpdated) {
          onInterviewUpdated(data.data.interview);
        }
      } else {
        toastError("Sync Failed", data?.error?.message || "Could not fetch details from Sarvam.");
      }
    } catch {
      toastError("Network Error", "Unable to connect to sync endpoint.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateScore = async () => {
    if (!interview) return;
    setIsGeneratingScore(true);
    try {
      const res = await fetch("/api/get-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.data?.interview) {
        toastSuccess(
          "Score Generated",
          `Overall Score: ${data.data.evaluation?.score || data.data.score}/100. Status updated to Score Generated.`
        );
        if (onInterviewUpdated) {
          onInterviewUpdated(data.data.interview);
        }
      } else {
        toastError("Scoring Failed", data?.error?.message || "Failed to generate scores.");
      }
    } catch {
      toastError("Network Error", "Unable to connect to get-scores API.");
    } finally {
      setIsGeneratingScore(false);
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (seconds === undefined || seconds === null) return "N/A";
    if (seconds <= 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span className="text-white font-bold">{interview.candidate.name}</span>
          <Badge status={interview.call.status} size="sm" />
        </div>
      }
      description={`Interview ID: ${interview.id}`}
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* AI CANDIDATE EVALUATION & SCORES (CALL DETAILS ON TOP) */}
        {/* ========================================================================= */}
        {interview.evaluation ? (
          <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-b from-[#0e1e2c]/95 via-[#0d1726]/95 to-[#0a111c]/95 p-4 sm:p-5 space-y-4 shadow-xl shadow-teal-950/20">
            {/* Header / Score Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f3148]">
              <div className="flex items-center gap-3.5">
                {/* Score Circle Badge */}
                <div
                  className={`flex flex-col items-center justify-center h-16 w-16 rounded-2xl border shadow-inner shrink-0 ${
                    interview.evaluation.score >= 75
                      ? "bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-emerald-950/50"
                      : interview.evaluation.score >= 50
                      ? "bg-amber-950/70 border-amber-500/50 text-amber-300 shadow-amber-950/50"
                      : "bg-rose-950/70 border-rose-500/50 text-rose-300 shadow-rose-950/50"
                  }`}
                >
                  <span className="text-2xl font-black tracking-tight leading-none">
                    {interview.evaluation.score}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    / 100
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-teal-400" />
                      Candidate Evaluation & Score
                    </h3>
                    <Badge status="score_generated" size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Synthesized from Job Description, requirements, and full interview transcript
                    {interview.evaluation.generatedAt && (
                      <span className="ml-1 text-[11px] text-slate-500">
                        • {new Date(interview.evaluation.generatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  {configuredSkills.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      <span className="text-[10.5px] font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                        <Target className="h-3 w-3 text-teal-400" /> Target Skills:
                      </span>
                      {configuredSkills.map((sk, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-500/15 text-teal-200 border border-teal-500/30"
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Re-generate Score Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateScore}
                isLoading={isGeneratingScore}
                className="text-xs shrink-0 border-teal-500/40 text-teal-300 hover:bg-teal-950/50"
              >
                <div className="flex items-center">
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1.5 ${
                      isGeneratingScore ? "animate-spin" : ""
                    }`}
                  />
                  Regenerate Score
                </div>
              </Button>
            </div>

            {/* 1. Interview Summary (5 lines summary) */}
            <div className="rounded-xl border border-[#22334d] bg-[#0c1424] p-3.5 space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Interview Summary (5-Point Analysis)
              </h4>
              <div className="space-y-1.5 pt-1">
                {interview.evaluation.interviewSummary?.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed">
                    <span className="h-4 w-4 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Fit for Role, Strengths & Weaknesses (3-box responsive grid) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Fit for Role */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 space-y-1.5 text-xs">
                <h5 className="font-bold text-blue-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Fit for Role (2-Line Summary)
                </h5>
                <div className="space-y-1 pt-1 text-slate-300 text-[11.5px] leading-relaxed">
                  {interview.evaluation.fitForRole?.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strengths */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-xs">
                <h5 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Key Strengths (2-Line Summary)
                </h5>
                <div className="space-y-1 pt-1 text-slate-300 text-[11.5px] leading-relaxed">
                  {interview.evaluation.strength?.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-400 mt-0.5">•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weaknesses */}
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 space-y-1.5 text-xs">
                <h5 className="font-bold text-rose-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Areas to Develop (2-Line Summary)
                </h5>
                <div className="space-y-1 pt-1 text-slate-300 text-[11.5px] leading-relaxed">
                  {(interview.evaluation.weekness || interview.evaluation.weakness)?.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-rose-400 mt-0.5">•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Skill Alignment (up to 4 skills) */}
            {interview.evaluation.skillAlignment && interview.evaluation.skillAlignment.length > 0 && (
              <div className="rounded-xl border border-[#22334d] bg-[#0c1424] p-3.5 space-y-2.5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" /> Skill Alignment (Role vs Candidate)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {interview.evaluation.skillAlignment.map((skill, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-[#1e2a3f] bg-[#090f1a] p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white truncate text-xs">
                          {skill.roleRequired}
                        </span>
                        <span
                          className={`font-bold text-[11px] px-2 py-0.5 rounded-full border ${
                            skill.candidateAligned >= 75
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                              : skill.candidateAligned >= 50
                              ? "bg-amber-950/80 text-amber-300 border-amber-500/40"
                              : "bg-rose-950/80 text-rose-300 border-rose-500/40"
                          }`}
                        >
                          {skill.candidateAligned}% Aligned
                        </span>
                      </div>
                      {/* Visual Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-[#182338] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            skill.candidateAligned >= 75
                              ? "bg-emerald-500"
                              : skill.candidateAligned >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, skill.candidateAligned))}%` }}
                        />
                      </div>
                      <div className="space-y-1 text-slate-300 text-[11px] leading-relaxed pt-1">
                        {skill.summary?.map((line, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-1">
                            <span className="text-purple-400">•</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Generate Score CTA Banner (Manual Scoring Trigger) */
          <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-r from-teal-950/40 via-[#0d1e2a] to-[#0c1824] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-teal-950/30">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-teal-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-400" />
                Generate Candidate Score & Evaluation Manually
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {interview.transcript && interview.transcript.length > 0
                  ? `Transcript available (${interview.transcript.length} turns recorded). Click below to generate 100-point score, 5-line summary, role fit, strengths, weaknesses, and skill alignment with OpenAI.`
                  : "No local transcript turns yet. Clicking will auto-sync the latest conversation from Sarvam AI and generate evaluation scores."}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateScore}
              isLoading={isGeneratingScore}
              className="text-xs shrink-0 bg-teal-600 hover:bg-teal-500 text-white font-semibold border-none shadow-md shadow-teal-950/40 px-4 py-2"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Generate AI Score
              </div>
            </Button>
          </div>
        )}

        {/* Sync Action Banner */}
        {(interview.call.providerCallId || interview.call.interactionId || interview.call.status !== "unknown") && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#111827] border border-[#222f49]">
            <div className="space-y-1 text-xs text-slate-300">
              {interview.call.providerCallId && (
                <div>
                  <span className="text-slate-400">Attempt ID:</span>{" "}
                  <span className="font-mono text-white">{interview.call.providerCallId}</span>
                </div>
              )}
              {interview.call.interactionId && (
                <div>
                  <span className="text-slate-400">Interaction ID:</span>{" "}
                  <span className="font-mono text-cyan-300">{interview.call.interactionId}</span>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncFromSarvam}
              isLoading={isSyncing}
              className="text-xs shrink-0"
            >
              <div className="flex items-center">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
                Sync from Sarvam
              </div>
            </Button>
          </div>
        )}

        {/* Top Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Candidate & Job Box */}
          <div className="rounded-xl border border-[#222f49] bg-[#0c1220] p-4 space-y-2 text-xs">
            <h4 className="font-semibold text-orange-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Candidate & Role
            </h4>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Candidate ID:</span>
                <span className="font-mono text-white">{interview.candidate.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="font-mono text-emerald-400">{interview.candidate.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Role:</span>
                <span className="font-medium text-white">{interview.job.title}</span>
              </div>
              {(interview.company_name || interview.job.company_name) && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Company:</span>
                  <span className="font-medium text-orange-300">
                    {interview.company_name || interview.job.company_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Job ID:</span>
                <span className="font-mono text-slate-400">{interview.job.id}</span>
              </div>
              {configuredSkills.length > 0 && (
                <div className="pt-2 border-t border-[#1e2a3f] mt-1.5">
                  <div className="flex items-center gap-1 mb-1.5 text-slate-400">
                    <Target className="h-3 w-3 text-orange-400" />
                    <span className="font-semibold text-[10.5px] uppercase tracking-wider text-orange-300">
                      Target Interview Skills:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {configuredSkills.map((sk, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-500/15 text-orange-200 border border-orange-500/30"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Telephony Metrics Box */}
          <div className="rounded-xl border border-[#222f49] bg-[#0c1220] p-4 space-y-2 text-xs">
            <h4 className="font-semibold text-purple-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Call Telemetry
            </h4>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Duration:</span>
                <span className="font-semibold text-white">{formatDuration(interview.call.duration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Provider:</span>
                <span className="capitalize text-slate-300">{interview.call.provider || "Sarvam AI"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Attempt ID:</span>
                <span className="font-mono text-[11px] text-slate-300 truncate max-w-[150px]" title={interview.call.providerCallId || "N/A"}>
                  {interview.call.providerCallId || "N/A"}
                </span>
              </div>
              {interview.call.interactionId && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Interaction ID:</span>
                  <span className="font-mono text-[11px] text-cyan-300 truncate max-w-[150px]" title={interview.call.interactionId}>
                    {interview.call.interactionId}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Started:</span>
                <span className="text-slate-300">{formatDate(interview.call.startedAt || interview.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Recording Player if available */}
        {(interview.call.recordingUrl || interview.call.interactionId || interview.call.status === "completed") && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5" /> Call Audio Recording
              </h4>
              <a
                href={`/api/interviews/${interview.id}/recording`}
                target="_blank"
                rel="noopener noreferrer"
                download={`${interview.candidate.name.replace(/\s+/g, "_")}_call_recording.wav`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-[11px] font-medium transition-colors"
                title="Download or open raw call recording"
              >
                <Download className="h-3 w-3" />
                <span>Download (.wav)</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-70 ml-0.5" />
              </a>
            </div>
            <div className="pt-1">
              <audio
                controls
                preload="metadata"
                src={`/api/interviews/${interview.id}/recording`}
                className="w-full h-9 rounded-lg bg-[#111827] outline-none"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          </div>
        )}

        {/* AI Output Variables & Summary if present */}
        {interview.outputVariables && Object.keys(interview.outputVariables).length > 0 && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-2 text-xs">
            <h4 className="font-semibold text-purple-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" /> AI Evaluation & Output Variables
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-200">
              {Object.entries(interview.outputVariables).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between p-2 rounded bg-purple-900/30 border border-purple-800/30">
                  <span className="text-slate-400 font-mono">{key}:</span>
                  <span className="font-semibold text-purple-200">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions and Answers Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#222f49] pb-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-amber-400" />
              Questions & Candidate Answers ({interview.questions.length})
            </h4>
          </div>

          <div className="space-y-2.5">
            {interview.questions.map((q, idx) => {
              const matchedQA =
                interview.questionAnswers?.find((qa) => qa.questionId === q.id && qa.answer?.trim()) ||
                extractedQA.find((qa) => qa.questionId === q.id);
              const isExpanded = expandedQuestions[q.id] ?? true;
              const hasAnswer = !!(matchedQA?.answer?.trim() || q.answer?.trim());
              const isSkipped = matchedQA?.status === "skipped";

              return (
                <div
                  key={q.id || idx}
                  className="rounded-xl border border-[#222f49] bg-[#0c1220] overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleQuestion(q.id)}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#131b2e] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 flex-1 pr-4">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-500/10 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/30">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">{q.question}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {hasAnswer ? (
                        isSkipped ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/40">
                            Skipped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/40">
                            <CheckCircle className="h-3 w-3" /> Answered
                          </span>
                        )
                      ) : interview.call.status === "completed" ? (
                        <span className="text-[10px] text-slate-500 font-medium">Not Answered</span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">Pending Call</span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3.5 pt-0 border-t border-[#222f49]/60 text-xs space-y-2 mt-2">
                      <div className="rounded-lg bg-[#111827] p-3 text-slate-300 border border-slate-800">
                        <div className="text-[11px] font-medium text-slate-400 mb-1">Candidate Response:</div>
                        <p className="text-xs leading-relaxed text-slate-100">
                          {matchedQA?.answer || q.answer || (
                            <span className="italic text-slate-500">
                              {interview.call.status === "completed"
                                ? "No response recorded for this question during the call."
                                : "No response recorded yet. Initiate call to receive candidate transcript."}
                            </span>
                          )}
                        </p>
                      </div>

                      {matchedQA?.summary && (
                        <div className="text-[11px] text-purple-300 bg-purple-950/30 p-2 rounded border border-purple-800/30">
                          <strong>AI Summary:</strong> {matchedQA.summary}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Conversation Transcript Panel */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222f49] pb-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-orange-400" />
              Conversation Transcript
            </h4>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400">
                {interview.transcript.length} turns recorded
              </span>
              {interview.transcript.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateScore}
                  isLoading={isGeneratingScore}
                  className="text-xs px-2.5 py-1 border-teal-500/40 text-teal-300 hover:bg-teal-950/60"
                >
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-teal-400" />
                    {interview.evaluation ? "Regenerate Score" : "Generate Score from Transcript"}
                  </div>
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#222f49] bg-[#0c1220] p-4 max-h-[350px] overflow-y-auto space-y-3">
            {interview.transcript.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                No transcript turns available. When an outbound call is placed, turn-by-turn conversation will appear here.
              </div>
            ) : (
              interview.transcript.map((entry, index) => {
                const isAgent = entry.speaker === "agent";
                return (
                  <div
                    key={index}
                    className={`flex flex-col ${isAgent ? "items-start" : "items-end"} gap-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                      {isAgent ? (
                        <>
                          <Bot className="h-3 w-3 text-orange-400" />
                          <span className="font-semibold text-orange-400">Sarvam AI Agent</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-emerald-400">
                            {interview.candidate.name} (Candidate)
                          </span>
                          <UserCheck className="h-3 w-3 text-emerald-400" />
                        </>
                      )}
                      {entry.timestamp && <span className="text-slate-500 font-mono">[{entry.timestamp}]</span>}
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-md leading-relaxed ${isAgent
                        ? "rounded-tl-sm bg-[#1a233a] border border-[#28385e] text-slate-100"
                        : "rounded-tr-sm bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-500/30 text-emerald-100"
                        }`}
                    >
                      {entry.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
