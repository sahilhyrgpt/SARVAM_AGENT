"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/dashboard/Header";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { CreateInterviewForm } from "@/components/interviews/CreateInterviewForm";
import { InterviewTable } from "@/components/interviews/InterviewTable";
import { StartCallModal } from "@/components/interviews/StartCallModal";
import { InterviewDetailModal } from "@/components/interviews/InterviewDetailModal";
import { Interview, InterviewSummaryMetrics } from "@/types/interview";
import { useToast } from "@/components/ui/Toast";

export default function DashboardPage() {
  const { error: toastError } = useToast();

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [metrics, setMetrics] = useState<InterviewSummaryMetrics>({
    totalCalls: 0,
    completed: 0,
    inProgress: 0,
    failed: 0,
    noAnswer: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals state
  const [selectedInterviewForCall, setSelectedInterviewForCall] = useState<Interview | null>(null);
  const [selectedInterviewForDetail, setSelectedInterviewForDetail] = useState<Interview | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Track interview IDs already sent for post-call processing to avoid duplicate calls
  const postCallProcessedRef = useRef<Set<string>>(new Set());


  const fetchInterviews = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/interviews?${params.toString()}`);

      if (res.status === 401) {
        // Session expired or unauthorized - redirect to login to stop any retry loops
        window.location.href = "/login";
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        const fetchedList: Interview[] = data.data?.interviews || [];
        const fetchedSummary: InterviewSummaryMetrics = data.data?.summary || {
          totalCalls: fetchedList.length,
          completed: 0,
          inProgress: 0,
          failed: 0,
          noAnswer: 0,
        };

        setInterviews(fetchedList);
        setMetrics(fetchedSummary);

        // Also update open detail modal if active
        setSelectedInterviewForDetail((prev) => {
          if (!prev) return null;
          const fresh = fetchedList.find((i) => i.id === prev.id);
          return fresh || prev;
        });
      } else {
        if (!silent) {
          toastError("Error", data?.error?.message || "Failed to load interviews.");
        }
      }
    } catch {
      if (!silent) {
        toastError("Network Error", "Unable to connect to interview service.");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [searchQuery, statusFilter, toastError]);

  // Initial load and filter effect
  useEffect(() => {
    fetchInterviews(false);
  }, [fetchInterviews]);


  // Auto-trigger post-call processing when a call transitions to "completed"
  // This runs the full pipeline: Sarvam sync → transcript → Q&A → AI scoring
  useEffect(() => {
    const completedWithoutScores = interviews.filter(
      (i) =>
        i.call.status === "completed" &&
        !i.evaluation &&
        !postCallProcessedRef.current.has(i.id)
    );

    for (const interview of completedWithoutScores) {
      postCallProcessedRef.current.add(interview.id);

      // Fire-and-forget: call the post-call-process API
      fetch(`/api/interviews/${interview.id}/post-call-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data?.interview) {
            // Update local state with the fully processed interview
            setInterviews((prev) =>
              prev.map((item) =>
                item.id === interview.id ? data.data.interview : item
              )
            );
            // Also update the detail modal if it's showing this interview
            setSelectedInterviewForDetail((prev) =>
              prev?.id === interview.id ? data.data.interview : prev
            );
          }
          // Refresh the full list to get updated metrics
          fetchInterviews(true);
        })
        .catch(() => {
          // Non-fatal: user can retry manually via the Score button
          postCallProcessedRef.current.delete(interview.id);
        });
    }
  }, [interviews, fetchInterviews]);

  // Handle Interview Created from Form
  const handleInterviewCreated = (newInterview: Interview) => {
    setInterviews((prev) => [newInterview, ...prev]);
    setMetrics((prev) => ({
      ...prev,
      totalCalls: prev.totalCalls + 1,
    }));
  };

  // Handle View Details
  const handleViewDetails = (interview: Interview) => {
    setSelectedInterviewForDetail(interview);
    setIsDetailModalOpen(true);
  };

  // Handle Start / Retry Call Click
  const handleTriggerCallClick = (interview: Interview) => {
    setSelectedInterviewForCall(interview);
    setIsCallModalOpen(true);
  };

  // Handle Call Triggered Confirmation
  const handleCallTriggered = (updated: Interview) => {
    setInterviews((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    // Update interview list
    fetchInterviews(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16]">
      <Header userEmail="admin@hyrgpt.com" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Summary Metrics */}
        <section aria-label="Dashboard Metrics">
          <SummaryCards metrics={metrics} isLoading={isLoading && interviews.length === 0} />
        </section>

        {/* Create Interview Form */}
        <section aria-label="Create Interview Form">
          <CreateInterviewForm onInterviewCreated={handleInterviewCreated} />
        </section>

        {/* Interviews Management Table */}
        <section aria-label="Interview Calls List">
          <InterviewTable
            interviews={interviews}
            isLoading={isLoading}
            onViewDetails={handleViewDetails}
            onTriggerCall={handleTriggerCallClick}
            onInterviewUpdated={handleCallTriggered}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </section>
      </main>

      {/* Confirmation Modal before triggering real call */}
      <StartCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        interview={selectedInterviewForCall}
        onCallTriggered={handleCallTriggered}
      />

      {/* Detailed Modal with Q&A and Chat Transcript */}
      <InterviewDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        interview={selectedInterviewForDetail}
        onInterviewUpdated={(updated) => handleCallTriggered(updated)}
      />
    </div>
  );
}
