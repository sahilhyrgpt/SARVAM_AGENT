/**
 * Sarvam AI Voice Agent Telephony & API Types
 * Derived from official Sarvam AI Voice Agents documentation
 */

export interface SarvamOutboundConnectionConfig {
  connection_id?: string;
  agent_phone_number?: string;
}

export interface SarvamAppOverrides {
  initial_bot_message?: string | null;
  initial_state_name?: string | null;
  initial_language_name?:
    | "Bengali"
    | "Gujarati"
    | "Kannada"
    | "Malayalam"
    | "Tamil"
    | "Telugu"
    | "Punjabi"
    | "Sanskrit"
    | "Odia"
    | "Marathi"
    | "Hindi"
    | "English"
    | "Assamese"
    | string
    | null;
}

export interface SarvamAppConfig {
  app_id: string;
  app_version?: number;
  connection_config?: SarvamOutboundConnectionConfig;
  agent_variables?: Record<string, unknown>;
  app_type?: string;
  app_overrides?: SarvamAppOverrides;
}

export interface SarvamUserConfig {
  user_phone_number: string;
}

export interface SarvamWebhookConfig {
  url: string;
  metadata?: Record<string, unknown> | null;
}

export interface SarvamOutboundRequestPayload {
  app_config: SarvamAppConfig;
  user_config: SarvamUserConfig;
  webhook_config?: SarvamWebhookConfig;
}

export interface SarvamOutboundResponse {
  attempt_id: string;
}

export interface SarvamTranscriptTurn {
  role?: "agent" | "user" | string;
  speaker?: "agent" | "candidate" | "system" | string;
  en_text?: string;
  text?: string;
  timestamp?: string;
}

export interface SarvamChannelInfo {
  channel_type?: string;
  channel_provider?: string;
  agent_phone_number?: string;
  channelType?: string;
  channelProvider?: string;
  agentPhoneNumber?: string;
}

export interface SarvamWebhookPayload {
  attempt_id: string;
  status: "connected" | "no_answer" | "busy" | "failed" | string;
  channel_info?: SarvamChannelInfo;
  duration?: number | null;
  interaction_id?: string | null;
  failure_reason?: string | null;
  final_agent_variables?: Record<string, unknown> | null;
  webhook_config?: {
    url?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
  interaction_transcript?: SarvamTranscriptTurn[] | null;
}

export interface SarvamResultPayload {
  interview_id?: string;
  interviewId?: string;
  attempt_id?: string;
  interaction_id?: string;
  status?: string;
  disposition?: string;
  duration?: number | null;
  transcript?: Array<{
    speaker?: string;
    role?: string;
    text?: string;
    en_text?: string;
    timestamp?: string;
  }>;
  output_variables?: Record<string, unknown>;
  answers?: Array<{
    question_id?: string;
    questionId?: string;
    question?: string;
    answer: string;
    status?: "answered" | "partial" | "not_answered" | "skipped";
    follow_ups?: number;
    followUps?: number;
    score?: number;
  }>;
}

export interface SarvamContextRequest {
  interviewId?: string;
  interview_id?: string;
}

export interface SarvamContextResponse {
  interviewId: string;
  candidate: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  job: {
    id: string;
    title: string;
    description: string;
  };
  questions: Array<{
    id: string;
    question: string;
  }>;
}
