import {
  CallInfo,
  CallStatus,
  Interview,
  InterviewFilterParams,
  InterviewSummaryMetrics,
  QuestionAnswer,
  TranscriptEntry,
} from "@/types/interview";
import { CreateInterviewDTO, InterviewRepository, ListInterviewsResult } from "./interface";
import { extractQuestionAnswersFromTranscript } from "@/lib/utils/qa-extractor";

// Global preservation for Next.js development hot-reloads
interface GlobalRepoStore {
  interviews: Map<string, Interview>;
  processedEvents: Set<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __SARVAM_REPO_STORE__: GlobalRepoStore | undefined;
}

if (!globalThis.__SARVAM_REPO_STORE__) {
  globalThis.__SARVAM_REPO_STORE__ = {
    interviews: new Map<string, Interview>(),
    processedEvents: new Set<string>(),
  };
}

export class MemoryInterviewRepository implements InterviewRepository {
  private get store(): GlobalRepoStore {
    return globalThis.__SARVAM_REPO_STORE__!;
  }

  async createInterview(data: CreateInterviewDTO): Promise<Interview> {
    const id = data.id || `INT-${Date.now()}`;
    const now = new Date().toISOString();
    const companyName = data.company_name || data.job?.company_name || "";

    const normalizedSkills =
      (Array.isArray(data.skills) && data.skills) ||
      (Array.isArray(data.job?.skills) && data.job.skills) ||
      [];

    const newInterview: Interview = {
      id,
      company_name: companyName,
      candidate: data.candidate,
      job: {
        ...data.job,
        company_name: companyName,
        skills: normalizedSkills,
      },
      skills: normalizedSkills,
      questions: data.questions.map((q) => ({
        ...q,
        status: q.status || "pending",
      })),
      call: {
        status: (data.call?.status || "created") as CallStatus,
        provider: data.call?.provider || "sarvam",
        ...data.call,
      },
      transcript: [],
      questionAnswers: [],
      metadata: data.metadata || {},
      idempotencyKey: data.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    this.store.interviews.set(id, newInterview);
    return newInterview;
  }

  async getInterview(id: string): Promise<Interview | null> {
    const item = this.store.interviews.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  async listInterviews(params: InterviewFilterParams = {}): Promise<ListInterviewsResult> {
    const { page = 1, limit = 20, status, search } = params;
    let all = Array.from(this.store.interviews.values());

    // Filter by status if supplied
    if (status) {
      all = all.filter((i) => i.call.status === status);
    }

    // Filter by search query (candidate name, candidate ID, job title, phone)
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      all = all.filter(
        (i) =>
          i.candidate.name.toLowerCase().includes(q) ||
          i.candidate.id.toLowerCase().includes(q) ||
          i.candidate.phone.toLowerCase().includes(q) ||
          i.job.title.toLowerCase().includes(q) ||
          i.job.id.toLowerCase().includes(q) ||
          (i.company_name && i.company_name.toLowerCase().includes(q)) ||
          (i.job.company_name && i.job.company_name.toLowerCase().includes(q)) ||
          i.id.toLowerCase().includes(q)
      );
    }

    // Sort descending by creation date
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate Summary Metrics
    const summary: InterviewSummaryMetrics = {
      totalCalls: this.store.interviews.size,
      completed: 0,
      inProgress: 0,
      failed: 0,
      noAnswer: 0,
    };

    for (const interview of this.store.interviews.values()) {
      const st = interview.call.status;
      if (st === "completed" || st === "score_generated") {
        summary.completed++;
      } else if (["initiating", "ringing", "answered", "in_progress"].includes(st)) {
        summary.inProgress++;
      } else if (["failed", "rejected", "connection_error", "cancelled"].includes(st)) {
        summary.failed++;
      } else if (["no_answer", "busy", "voicemail"].includes(st)) {
        summary.noAnswer++;
      }
    }

    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    return {
      interviews: JSON.parse(JSON.stringify(paginated)),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
      summary,
    };
  }

  async updateInterview(id: string, updates: Partial<Interview>): Promise<Interview | null> {
    const existing = this.store.interviews.get(id);
    if (!existing) return null;

    const updated: Interview = {
      ...existing,
      ...updates,
      call: updates.call ? { ...existing.call, ...updates.call } : existing.call,
      candidate: updates.candidate ? { ...existing.candidate, ...updates.candidate } : existing.candidate,
      job: updates.job ? { ...existing.job, ...updates.job } : existing.job,
      updatedAt: new Date().toISOString(),
    };

    this.store.interviews.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async updateCallStatus(
    id: string,
    status: CallStatus,
    extra: Partial<CallInfo> = {}
  ): Promise<Interview | null> {
    const existing = this.store.interviews.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedCall: CallInfo = {
      ...existing.call,
      ...extra,
      status,
    };

    if (status === "answered" || status === "in_progress") {
      if (!updatedCall.startedAt) updatedCall.startedAt = now;
      if (!updatedCall.answeredAt) updatedCall.answeredAt = now;
    } else if (["completed", "incomplete", "score_generated", "failed", "no_answer", "busy", "rejected", "cancelled"].includes(status)) {
      if (!updatedCall.endedAt) updatedCall.endedAt = now;
    }

    const updated: Interview = {
      ...existing,
      call: updatedCall,
      updatedAt: now,
    };

    this.store.interviews.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async saveTranscript(id: string, entries: TranscriptEntry[]): Promise<Interview | null> {
    const existing = this.store.interviews.get(id);
    if (!existing) return null;

    let questionAnswers = existing.questionAnswers || [];
    let updatedQuestions = existing.questions;

    if (existing.questions && existing.questions.length > 0) {
      const extractedQA = extractQuestionAnswersFromTranscript(existing.questions, entries);
      if (extractedQA.length > 0 && extractedQA.some((a) => a.answer)) {
        questionAnswers = extractedQA;
        updatedQuestions = existing.questions.map((q) => {
          const matched = extractedQA.find((a) => a.questionId === q.id);
          if (matched && matched.answer) {
            return {
              ...q,
              status: matched.status,
              answer: matched.answer,
            };
          }
          return q;
        });
      }
    }

    const updated: Interview = {
      ...existing,
      transcript: entries,
      questions: updatedQuestions,
      questionAnswers,
      updatedAt: new Date().toISOString(),
    };

    this.store.interviews.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async saveQuestionAnswers(id: string, answers: QuestionAnswer[]): Promise<Interview | null> {
    const existing = this.store.interviews.get(id);
    if (!existing) return null;

    // Also update questions list statuses
    const updatedQuestions = existing.questions.map((q) => {
      const matched = answers.find((a) => a.questionId === q.id);
      if (matched) {
        return {
          ...q,
          status: matched.status,
          answer: matched.answer,
        };
      }
      return q;
    });

    const updated: Interview = {
      ...existing,
      questions: updatedQuestions,
      questionAnswers: answers,
      updatedAt: new Date().toISOString(),
    };

    this.store.interviews.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async findByProviderCallId(providerCallId: string): Promise<Interview | null> {
    for (const interview of this.store.interviews.values()) {
      if (interview.call.providerCallId === providerCallId) {
        return JSON.parse(JSON.stringify(interview));
      }
    }
    return null;
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    return this.store.processedEvents.has(eventId);
  }

  async markEventProcessed(eventId: string): Promise<void> {
    this.store.processedEvents.add(eventId);
  }
}
