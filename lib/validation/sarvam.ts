import { z } from "zod";

export const sarvamContextRequestSchema = z.object({
  interviewId: z.string().optional(),
  interview_id: z.string().optional(),
}).refine((data) => !!(data.interviewId || data.interview_id), {
  message: "Either interviewId or interview_id must be provided",
});

export const sarvamWebhookTurnSchema = z.object({
  role: z.string().optional(),
  speaker: z.string().optional(),
  en_text: z.string().optional().default(""),
  text: z.string().optional(),
  timestamp: z.string().optional(),
});

export const sarvamWebhookPayloadSchema = z.object({
  attempt_id: z.string().min(1, "attempt_id is required"),
  status: z.string().min(1, "status is required"),
  channel_info: z
    .object({
      channel_type: z.string().optional(),
      channel_provider: z.string().optional(),
      agent_phone_number: z.string().optional(),
      channelType: z.string().optional(),
      channelProvider: z.string().optional(),
      agentPhoneNumber: z.string().optional(),
    })
    .optional(),
  duration: z.number().nullable().optional(),
  interaction_id: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  final_agent_variables: z.record(z.string(), z.unknown()).nullable().optional(),
  webhook_config: z
    .object({
      url: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
  interaction_transcript: z.array(sarvamWebhookTurnSchema).nullable().optional(),
});

export const sarvamResultAnswerSchema = z.object({
  question_id: z.string().optional(),
  questionId: z.string().optional(),
  question: z.string().optional(),
  answer: z.string().default(""),
  status: z.enum(["answered", "partial", "not_answered", "skipped"]).optional(),
  follow_ups: z.number().optional(),
  followUps: z.number().optional(),
  score: z.number().optional(),
});

export const sarvamResultPayloadSchema = z.object({
  interview_id: z.string().optional(),
  interviewId: z.string().optional(),
  attempt_id: z.string().optional(),
  interaction_id: z.string().optional(),
  status: z.string().optional(),
  disposition: z.string().optional(),
  duration: z.number().nullable().optional(),
  transcript: z
    .array(
      z.object({
        speaker: z.string().optional(),
        role: z.string().optional(),
        text: z.string().optional(),
        en_text: z.string().optional(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
  output_variables: z.record(z.string(), z.unknown()).optional(),
  answers: z.array(sarvamResultAnswerSchema).optional(),
});

export type SarvamWebhookInput = z.infer<typeof sarvamWebhookPayloadSchema>;
export type SarvamResultInput = z.infer<typeof sarvamResultPayloadSchema>;
