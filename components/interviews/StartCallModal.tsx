"use client";

import React, { useState } from "react";
import { AlertTriangle, PhoneCall, User, Briefcase, Phone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Interview } from "@/types/interview";
import { useToast } from "@/components/ui/Toast";

interface StartCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  onCallTriggered: (updatedInterview: Interview) => void;
}

export const StartCallModal: React.FC<StartCallModalProps> = ({
  isOpen,
  onClose,
  interview,
  onCallTriggered,
}) => {
  const { success, error: toastError } = useToast();
  const [isCalling, setIsCalling] = useState(false);

  if (!interview) return null;

  const isRetry = ["failed", "no_answer", "busy", "rejected", "connection_error"].includes(
    interview.call.status
  );

  const handleConfirmCall = async () => {
    setIsCalling(true);

    try {
      const res = await fetch(`/api/interviews/${interview.id}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorMsg = data?.error?.message || "Failed to trigger outbound call.";
        toastError("Call Trigger Failed", errorMsg);
        setIsCalling(false);
        return;
      }

      success(
        "Call Initiated",
        `Sarvam AI voice call triggered for ${interview.candidate.name} (${data.data?.providerCallId || data.providerCallId || "initiating"}).`
      );

      // Create updated interview object to refresh UI immediately
      const updated: Interview = {
        ...interview,
        call: {
          ...interview.call,
          status: "initiating",
          startedAt: new Date().toISOString(),
          providerCallId: data.data?.providerCallId || data.providerCallId,
        },
      };

      onCallTriggered(updated);
      onClose();
    } catch {
      toastError("Error", "Could not connect to trigger call API.");
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-white">
          <PhoneCall className="h-5 w-5 text-orange-400" />
          <span>{isRetry ? "Retry Screening Call" : "Initiate Outbound Interview Call"}</span>
        </div>
      }
      description="Sarvam AI Telephony Voice Agent"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Warning Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-amber-200 text-xs">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-300">Live Telephony Confirmation</h4>
            <p>
              This will trigger a <strong className="font-bold text-amber-200">real phone call</strong> to the candidate via Sarvam AI Voice Agent.
            </p>
          </div>
        </div>

        {/* Candidate & Call Details */}
        <div className="rounded-xl border border-[#222f49] bg-[#0c1220] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#222f49] pb-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-orange-400" />
              Candidate Name:
            </span>
            <span className="font-semibold text-white">{interview.candidate.name}</span>
          </div>

          <div className="flex items-center justify-between border-b border-[#222f49] pb-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-purple-400" />
              Phone Number:
            </span>
            <span className="font-mono font-medium text-emerald-400">{interview.candidate.phone}</span>
          </div>

          <div className={`flex items-center justify-between text-xs ${(interview.company_name || interview.job.company_name) ? "border-b border-[#222f49] pb-2" : ""}`}>
            <span className="text-slate-400 flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-amber-400" />
              Job Title:
            </span>
            <span className="font-medium text-slate-200">{interview.job.title}</span>
          </div>

          {(interview.company_name || interview.job.company_name) && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-orange-400" />
                Company:
              </span>
              <span className="font-medium text-orange-300">
                {interview.company_name || interview.job.company_name}
              </span>
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          The voice agent will call the candidate, introduce the role, ask the {interview.questions.length} configured questions, and transcribe answers in real-time.
        </div>

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222f49]">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isCalling}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isCalling}
            onClick={handleConfirmCall}
            leftIcon={<PhoneCall className="h-3.5 w-3.5" />}
          >
            {isRetry ? "Retry Call Now" : "Start Call Now"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
