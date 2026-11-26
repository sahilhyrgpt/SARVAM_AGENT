import {
  CallInfo,
  CallStatus,
  Interview,
  InterviewFilterParams,
  InterviewPagination,
  InterviewSummaryMetrics,
  QuestionAnswer,
  TranscriptEntry,
} from "@/types/interview";

export interface CreateInterviewDTO {
  id?: string;
  company_name?: string;
  candidate: Interview["candidate"];
  job: Interview["job"];
  skills?: string[];
  questions: Interview["questions"];
  call?: Partial<CallInfo>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ListInterviewsResult {
  interviews: Interview[];
  pagination: InterviewPagination;
  summary: InterviewSummaryMetrics;
}

export interface InterviewRepository {
  /**
   * Create a new interview record
   */
  createInterview(data: CreateInterviewDTO): Promise<Interview>;

  /**
   * Retrieve a single interview by ID
   */
  getInterview(id: string): Promise<Interview | null>;

  /**
   * Retrieve a list of interviews with filtering and pagination
   */
  listInterviews(params?: InterviewFilterParams): Promise<ListInterviewsResult>;

  /**
   * Update an interview record
   */
  updateInterview(id: string, updates: Partial<Interview>): Promise<Interview | null>;

  /**
   * Update the call status and call metadata
   */
  updateCallStatus(
    id: string,
    status: CallStatus,
    extra?: Partial<CallInfo>
  ): Promise<Interview | null>;

  /**
   * Save or append transcript entries
   */
  saveTranscript(id: string, entries: TranscriptEntry[]): Promise<Interview | null>;

  /**
   * Save structured question answers
   */
  saveQuestionAnswers(id: string, answers: QuestionAnswer[]): Promise<Interview | null>;

  /**
   * Find an interview by the provider's call/attempt ID
   */
  findByProviderCallId(providerCallId: string): Promise<Interview | null>;

  /**
   * Check if a webhook event has already been processed (Idempotency)
   */
  isEventProcessed(eventId: string): Promise<boolean>;

  /**
   * Mark a webhook event as processed
   */
  markEventProcessed(eventId: string): Promise<void>;
}
