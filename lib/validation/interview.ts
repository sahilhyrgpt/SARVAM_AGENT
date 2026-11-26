import { z } from "zod";

export const candidateSchema = z.object({
  id: z.string().min(1, "Candidate ID is required"),
  name: z.string().min(1, "Candidate name is required"),
  phone: z.string().min(6, "Valid phone number is required"),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
});

export const jobSchema = z.object({
  id: z.string().min(1, "Job ID is required"),
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(1, "Job description is required"),
  company_name: z.string().optional(),
  company: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

export const questionSchema = z.object({
  id: z.string().min(1, "Question ID is required"),
  question: z.string().min(1, "Question text is required"),
});

export const createInterviewSchema = z
  .object({
    id: z.string().optional(),
    interview_id: z.string().optional(),
    company_name: z.string().optional(),
    company: z.string().optional(),
    candidate: candidateSchema,
    job: jobSchema,
    questions: z
      .array(questionSchema)
      .min(1, "At least one question is required")
      .max(30, "A maximum of 30 questions is supported per interview"),
    skills: z.array(z.string()).optional(),
  })
  .passthrough();

export const interviewQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z
    .enum([
      "created",
      "initiating",
      "ringing",
      "answered",
      "in_progress",
      "completed",
      "incomplete",
      "score_generated",
      "no_answer",
      "busy",
      "rejected",
      "failed",
      "voicemail",
      "cancelled",
      "connection_error",
      "unknown",
    ])
    .optional(),
  search: z.string().optional(),
});

export const triggerCallSchema = z
  .object({
    idempotencyKey: z.string().optional(),
    company_name: z.string().optional(),
  })
  .optional();

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type InterviewQueryParams = z.infer<typeof interviewQuerySchema>;
