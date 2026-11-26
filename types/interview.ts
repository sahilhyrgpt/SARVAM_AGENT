export type CallStatus =
  | "created"
  | "initiating"
  | "ringing"
  | "answered"
  | "in_progress"
  | "completed"
  | "incomplete"
  | "score_generated"
  | "no_answer"
  | "busy"
  | "rejected"
  | "failed"
  | "voicemail"
  | "cancelled"
  | "connection_error"
  | "unknown";

export interface Candidate {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  company_name?: string;
  skills?: string[];
}

export interface Question {
  id: string;
  question: string;
  status?: "pending" | "asked" | "answered" | "skipped" | "partial" | "not_answered";
  answer?: string;
}

export interface CallInfo {
  status: CallStatus;
  provider: string; // e.g., "sarvam"
  providerCallId?: string; // attempt_id or interaction_id from Sarvam
  interactionId?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  duration?: number | null; // seconds
  disposition?: string | null;
  failureReason?: string | null;
  recordingUrl?: string | null;
  channelInfo?: {
    channelType?: string;
    channelProvider?: string;
    agentPhoneNumber?: string;
    channel_type?: string;
    channel_provider?: string;
    agent_phone_number?: string;
  };
}

export interface TranscriptEntry {
  speaker: "agent" | "candidate" | "system";
  text: string;
  timestamp?: string;
}

export interface QuestionAnswer {
  questionId: string;
  question: string;
  answer: string;
  status: "answered" | "partial" | "not_answered" | "skipped";
  followUps?: number;
  score?: number;
  summary?: string;
  notes?: string;
}

export interface SkillAlignmentItem {
  roleRequired: string;
  candidateAligned: number; // score from 100
  summary: string[]; // 2 line summary
}

export interface InterviewEvaluation {
  score: number; // score from 100
  interviewSummary: string[]; // 5 lines summary
  fitForRole: string[]; // 2 lines summary
  strength: string[]; // 2 lines summary
  weekness: string[]; // 2 lines summary
  weakness?: string[]; // optional alias
  skillAlignment: SkillAlignmentItem[]; // max 3, 4 skills
  generatedAt?: string;
  modelUsed?: string;
}

export interface Interview {
  id: string;
  company_name?: string;
  candidate: Candidate;
  job: Job;
  skills?: string[];
  questions: Question[];
  call: CallInfo;
  transcript: TranscriptEntry[];
  questionAnswers: QuestionAnswer[];
  evaluation?: InterviewEvaluation;
  outputVariables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewFilterParams {
  page?: number;
  limit?: number;
  status?: CallStatus;
  search?: string;
}

export interface InterviewPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface InterviewSummaryMetrics {
  totalCalls: number;
  completed: number;
  inProgress: number;
  failed: number;
  noAnswer: number;
}
