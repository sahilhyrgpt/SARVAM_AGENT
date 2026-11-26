import { Collection, Document } from "mongodb";
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
import { getDb } from "./mongodb";

import { extractQuestionAnswersFromTranscript } from "@/lib/utils/qa-extractor";

interface InterviewDoc extends Omit<Interview, "id">, Document {
  _id: string;
}

interface ProcessedEventDoc extends Document {
  _id: string;
  processedAt: string;
}

export class MongoInterviewRepository implements InterviewRepository {
  private async getInterviewsCollection(): Promise<Collection<InterviewDoc>> {
    const db = await getDb();
    return db.collection<InterviewDoc>("interviews");
  }

  private async getEventsCollection(): Promise<Collection<ProcessedEventDoc>> {
    const db = await getDb();
    return db.collection<ProcessedEventDoc>("processed_events");
  }

  private mapDoc(doc: InterviewDoc | null): Interview | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return {
      id: _id,
      company_name: doc.company_name || doc.job?.company_name || "",
      ...rest,
    };
  }

  async createInterview(data: CreateInterviewDTO): Promise<Interview> {
    const col = await this.getInterviewsCollection();
    const id = data.id || `INT-${Date.now()}`;
    const now = new Date().toISOString();
    const companyName = data.company_name || data.job?.company_name || "";

    const normalizedSkills =
      (Array.isArray(data.skills) && data.skills) ||
      (Array.isArray(data.job?.skills) && data.job.skills) ||
      [];

    const newInterview: InterviewDoc = {
      _id: id,
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

    await col.insertOne(newInterview);
    return this.mapDoc(newInterview)!;
  }

  async getInterview(id: string): Promise<Interview | null> {
    const col = await this.getInterviewsCollection();
    const doc = await col.findOne({ _id: id });
    return this.mapDoc(doc);
  }

  async listInterviews(params: InterviewFilterParams = {}): Promise<ListInterviewsResult> {
    const col = await this.getInterviewsCollection();
    const { page = 1, limit = 20, status, search } = params;

    const query: Record<string, unknown> = {};

    if (status) {
      query["call.status"] = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, "i");
      query.$or = [
        { "candidate.name": regex },
        { "candidate.id": regex },
        { "candidate.phone": regex },
        { "job.title": regex },
        { "job.id": regex },
        { company_name: regex },
        { "job.company_name": regex },
        { _id: regex },
      ];
    }

    const offset = (page - 1) * limit;

    const [interviewsDocs, total, allStatusCounts] = await Promise.all([
      col
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
      col
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: "$call.status", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const summary: InterviewSummaryMetrics = {
      totalCalls: 0,
      completed: 0,
      inProgress: 0,
      failed: 0,
      noAnswer: 0,
    };

    for (const group of allStatusCounts) {
      const st = group._id as CallStatus;
      const count = group.count;
      summary.totalCalls += count;

      if (st === "completed" || st === "score_generated") {
        summary.completed += count;
      } else if (["initiating", "ringing", "answered", "in_progress"].includes(st)) {
        summary.inProgress += count;
      } else if (["failed", "rejected", "connection_error", "cancelled"].includes(st)) {
        summary.failed += count;
      } else if (["no_answer", "busy", "voicemail"].includes(st)) {
        summary.noAnswer += count;
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const interviews = interviewsDocs.map((doc) => this.mapDoc(doc)!);

    return {
      interviews,
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
    const col = await this.getInterviewsCollection();
    const now = new Date().toISOString();

    const { id: _ignored, ...fieldsToUpdate } = updates;

    const updateDoc: Record<string, unknown> = {
      ...fieldsToUpdate,
      updatedAt: now,
    };

    const res = await col.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: "after" }
    );

    return this.mapDoc(res);
  }

  async updateCallStatus(
    id: string,
    status: CallStatus,
    extra: Partial<CallInfo> = {}
  ): Promise<Interview | null> {
    const col = await this.getInterviewsCollection();
    const now = new Date().toISOString();

    const setFields: Record<string, unknown> = {
      "call.status": status,
      updatedAt: now,
    };

    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) {
        setFields[`call.${k}`] = v;
      }
    }

    if (status === "answered" || status === "in_progress") {
      setFields["call.answeredAt"] = now;
    } else if (["completed", "incomplete", "score_generated", "failed", "no_answer", "busy", "rejected", "cancelled"].includes(status)) {
      setFields["call.endedAt"] = now;
    }

    const res = await col.findOneAndUpdate(
      { _id: id },
      { $set: setFields },
      { returnDocument: "after" }
    );

    return this.mapDoc(res);
  }

  async saveTranscript(id: string, entries: TranscriptEntry[]): Promise<Interview | null> {
    const col = await this.getInterviewsCollection();
    const existing = await this.getInterview(id);
    const now = new Date().toISOString();

    const setFields: Record<string, unknown> = {
      transcript: entries,
      updatedAt: now,
    };

    if (existing && existing.questions && existing.questions.length > 0) {
      const extractedQA = extractQuestionAnswersFromTranscript(existing.questions, entries);
      if (extractedQA.length > 0 && extractedQA.some((a) => a.answer)) {
        setFields.questionAnswers = extractedQA;
        setFields.questions = existing.questions.map((q) => {
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

    const res = await col.findOneAndUpdate(
      { _id: id },
      { $set: setFields },
      { returnDocument: "after" }
    );

    return this.mapDoc(res);
  }

  async saveQuestionAnswers(id: string, answers: QuestionAnswer[]): Promise<Interview | null> {
    const col = await this.getInterviewsCollection();
    const existing = await this.getInterview(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    // Sync status back to questions array
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

    const res = await col.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          questions: updatedQuestions,
          questionAnswers: answers,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

    return this.mapDoc(res);
  }

  async findByProviderCallId(providerCallId: string): Promise<Interview | null> {
    const col = await this.getInterviewsCollection();
    const doc = await col.findOne({ "call.providerCallId": providerCallId });
    return this.mapDoc(doc);
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const col = await this.getEventsCollection();
    const doc = await col.findOne({ _id: eventId });
    return !!doc;
  }

  async markEventProcessed(eventId: string): Promise<void> {
    const col = await this.getEventsCollection();
    await col.updateOne(
      { _id: eventId },
      { $set: { processedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }
}
