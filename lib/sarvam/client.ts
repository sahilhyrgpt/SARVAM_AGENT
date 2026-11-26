import { Interview, TranscriptEntry } from "@/types/interview";
import { SarvamOutboundRequestPayload, SarvamOutboundResponse } from "@/types/sarvam";
import { normalizeSarvamTranscript, mapSarvamCallStatus, cleanSarvamId, isSarvamSentinel } from "./mapper";
import { logger } from "@/lib/utils/logger";
import { ensureEnvLoaded } from "@/lib/utils/env";

export interface SarvamConfig {
  apiKey: string;
  agentId: string;
  agentVersion: number;
  phoneNumber: string;
  apiBaseUrl: string;
  orgId: string;
  workspaceId: string;
  connectionId: string;
}

export function getSarvamConfig(): SarvamConfig {
  ensureEnvLoaded();
  return {
    apiKey: (process.env.SARVAM_API_KEY || "").trim(),
    agentId: (process.env.SARVAM_AGENT_ID || "").trim(),
    agentVersion: process.env.SARVAM_AGENT_VERSION
      ? parseInt(process.env.SARVAM_AGENT_VERSION, 10)
      : 13,
    phoneNumber: (process.env.SARVAM_PHONE_NUMBER || "").trim(),
    apiBaseUrl: (process.env.SARVAM_API_BASE_URL || "https://apps.sarvam.ai").trim().replace(/\/$/, ""),
    orgId: (process.env.SARVAM_ORG_ID || "default").trim(),
    workspaceId: (process.env.SARVAM_WORKSPACE_ID || "default").trim(),
    connectionId: (process.env.SARVAM_CONNECTION_ID || "").trim(),
  };
}

export interface TriggerCallResult {
  success: boolean;
  provider: "sarvam";
  providerCallId: string;
  error?: string;
  details?: unknown;
}

export interface SyncCallDetailsResult {
  success: boolean;
  status?: string;
  duration?: number;
  interactionId?: string;
  attemptId?: string;
  transcript?: TranscriptEntry[];
  recordingUrl?: string;
  agentVariables?: Record<string, unknown>;
  rawDetails?: unknown;
  error?: string;
}

export class SarvamClient {
  private config: SarvamConfig;

  constructor(config?: Partial<SarvamConfig>) {
    this.config = {
      ...getSarvamConfig(),
      ...config,
    };
  }

  /**
   * Determine if real Sarvam credentials are configured
   */
  public isConfigured(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiKey !== "replace-me" &&
      this.config.agentId &&
      this.config.agentId !== "replace-me"
    );
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      "X-API-Key": this.config.apiKey,
      "api-subscription-key": this.config.apiKey,
      "Authorization": `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Trigger an instant outbound call for an interview according to official Sarvam docs:
   * POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds
   */
  async createOutboundCall(
    interview: Interview,
    normalizedPhone: string,
    appUrl: string
  ): Promise<TriggerCallResult> {
    const isConfigured = this.isConfigured();

    if (!isConfigured) {
      if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_MOCK_CALLS === "true") {
        const mockAttemptId = `mock_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        logger.warn("SARVAM_API_KEY or SARVAM_AGENT_ID not configured; generated mock attempt ID for local testing.", {
          interviewId: interview.id,
          providerCallId: mockAttemptId,
        });

        return {
          success: true,
          provider: "sarvam",
          providerCallId: mockAttemptId,
        };
      }

      return {
        success: false,
        provider: "sarvam",
        providerCallId: "",
        error: "Sarvam AI is not configured. Please set SARVAM_API_KEY and SARVAM_AGENT_ID in environment variables.",
      };
    }

    const orgId = this.config.orgId || "default";
    const workspaceId = this.config.workspaceId || "default";
    const appId = this.config.agentId;
    const connectionId = this.config.connectionId || this.config.phoneNumber;
    const agentPhoneNumber = this.config.phoneNumber;

    const endpointUrl = `${this.config.apiBaseUrl}/api/outbounds/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;
    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/sarvam/webhook`;

    const companyName = interview.company_name || interview.job.company_name || "HYRGPT";

    const agentVariables: Record<string, unknown> = {
      interview_id: interview.id,
      candidate_name: interview.candidate.name,
      company_name: companyName,
      job_title: interview.job.title,
      job_description: interview.job.description || "",
      questions: JSON.stringify(
        interview.questions.map((q) => ({
          id: q.id,
          question: q.question,
        }))
      ),
    };

    // Ensure app_version is always passed and is at least 13 (which contains company_name).
    // If an older version (< 13) is passed from legacy environment, override to 13.
    const parsedVersion = this.config.agentVersion;
    const effectiveVersion =
      typeof parsedVersion === "number" && parsedVersion >= 13 ? parsedVersion : 13;

    const payload: SarvamOutboundRequestPayload = {
      app_config: {
        app_id: appId,
        app_version: effectiveVersion,
        connection_config: {
          connection_id: connectionId,
          agent_phone_number: agentPhoneNumber,
        },
        agent_variables: agentVariables,
        app_type: "agent",
        app_overrides: {
          initial_language_name: "English",
        },
      },
      user_config: {
        user_phone_number: normalizedPhone,
      },
      webhook_config: {
        url: webhookUrl,
        metadata: {
          interview_id: interview.id,
        },
      },
    };

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          ...this.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        logger.error("Sarvam Outbound Call API Error", {
          status: String(response.status),
          interviewId: interview.id,
          details: responseData,
        });

        const errorMsg =
          responseData.error?.data?.details ||
          responseData.error?.message ||
          responseData.message ||
          responseData.error ||
          `Sarvam API responded with status ${response.status}`;

        return {
          success: false,
          provider: "sarvam",
          providerCallId: "",
          error: typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
          details: responseData,
        };
      }

      const outboundResponse = responseData as SarvamOutboundResponse;
      const attemptId =
        outboundResponse.attempt_id ||
        (responseData as Record<string, string>).id ||
        `att_${Date.now()}`;

      return {
        success: true,
        provider: "sarvam",
        providerCallId: attemptId,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error contacting Sarvam API";
      logger.error("Failed to connect to Sarvam Outbound API", {
        interviewId: interview.id,
        error: errorMessage,
      });

      return {
        success: false,
        provider: "sarvam",
        providerCallId: "",
        error: errorMessage,
      };
    }
  }

  /**
   * Directly fetch interaction details (interaction_id, audio_url, duration, status) from Sarvam Analytics
   * by querying the /attempts API with start_datetime and end_datetime
   */
  async fetchInteractionByAttemptId(
    attemptId: string,
    interviewId?: string
  ): Promise<{ interactionId?: string; recordingUrl?: string; duration?: number; status?: string } | null> {
    if (!this.isConfigured() || !attemptId) return null;

    const orgId = this.config.orgId || "default";
    const workspaceId = this.config.workspaceId || "default";
    const appId = this.config.agentId;

    const baseAnalyticsUrl = `${this.config.apiBaseUrl}/api/analytics/v1/${orgId}/${workspaceId}/${appId}`;
    const startDatetime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";
    const endDatetime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";

    const attemptsUrl = new URL(`${baseAnalyticsUrl}/attempts`);
    attemptsUrl.searchParams.set("start_datetime", startDatetime);
    attemptsUrl.searchParams.set("end_datetime", endDatetime);
    attemptsUrl.searchParams.set("limit", "100");

    try {
      const attemptsRes = await fetch(attemptsUrl.toString(), {
        method: "GET",
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(12000),
      });

      if (attemptsRes.ok) {
        const attemptsJson = await attemptsRes.json().catch(() => ({}));
        const items = Array.isArray(attemptsJson.items)
          ? attemptsJson.items
          : Array.isArray(attemptsJson)
            ? attemptsJson
            : [];

        // 1. Prioritize interview_id match in agent_variables
        let matched: Record<string, unknown> | undefined;
        if (interviewId) {
          matched = items.find(
            (it: Record<string, unknown>) =>
              it.agent_variables &&
              typeof it.agent_variables === "object" &&
              (it.agent_variables as Record<string, unknown>).interview_id === interviewId
          );
        }

        // 2. Second priority: Match by explicit attempt_id or interaction_id
        if (!matched && attemptId && !isSarvamSentinel(attemptId)) {
          matched = items.find(
            (it: Record<string, unknown>) =>
              it.attempt_id === attemptId ||
              it.id === attemptId ||
              cleanSarvamId(it.interaction_id as string) === attemptId
          );
        }

        if (matched) {
          const cleanedInterId = cleanSarvamId(matched.interaction_id as string);
          let recUrl = interviewId
            ? `/api/interviews/${interviewId}/recording`
            : (matched.audio_url as string) || (matched.recording_url as string) || undefined;

          if (recUrl && recUrl.includes("NO_INTERACTION_ID")) {
            recUrl = cleanedInterId ? recUrl.replace(/NO_INTERACTION_ID/g, encodeURIComponent(cleanedInterId)) : undefined;
          }
          return {
            interactionId: cleanedInterId,
            recordingUrl: recUrl,
            duration: typeof matched.duration_in_seconds === "number" ? Math.round(matched.duration_in_seconds) : undefined,
            status: (matched.connectivity_status as string) || undefined,
          };
        }
      }
    } catch (err) {
      logger.warn("Error fetching interaction from attempt ID", { attemptId, err });
    }
    return null;
  }

  /**
   * Fetch recording for a specific interaction or attempt:
   * GET https://apps.sarvam.ai/api/analytics/v1/{org_id}/{workspace_id}/{app_id}/recordings/{interaction_id}
   */
  async fetchRecording(interactionId: string, interviewId?: string): Promise<string | null> {
    if (!this.isConfigured() || !interactionId) return null;

    const orgId = this.config.orgId || "default";
    const workspaceId = this.config.workspaceId || "default";
    const appId = this.config.agentId;

    const baseAnalyticsUrl = `${this.config.apiBaseUrl}/api/analytics/v1/${orgId}/${workspaceId}/${appId}`;

    try {
      const encodedInteractionId = encodeURIComponent(interactionId);
      const urlsToTry = Array.from(new Set([
        `${baseAnalyticsUrl}/recordings/${encodedInteractionId}`,
        `${baseAnalyticsUrl}/recordings/${interactionId}`,
      ]));

      for (const rUrl of urlsToTry) {
        try {
          const rRes = await fetch(rUrl, {
            method: "GET",
            headers: this.getAuthHeaders(),
            signal: AbortSignal.timeout(6000),
          });

          if (rRes.ok) {
            const contentType = rRes.headers.get("content-type") || "";

            // If Sarvam returns raw audio stream, use our streaming proxy route
            if (contentType.startsWith("audio/") || contentType.includes("octet-stream")) {
              return interviewId
                ? `/api/interviews/${interviewId}/recording`
                : `/api/sarvam/recording?interaction_id=${encodedInteractionId}`;
            }

            // If JSON returned with a presigned URL
            const rawJson = await rRes.json().catch(() => ({}));
            const recObj = rawJson as Record<string, unknown>;
            const audio =
              (recObj.audio_url as string) ||
              (recObj.recording_url as string) ||
              (recObj.url as string) ||
              (recObj.signed_url as string) ||
              (recObj.audio_uri as string);

            if (audio) return audio;
            if (interviewId) return `/api/interviews/${interviewId}/recording`;
          }
        } catch {
          // try next URL
        }
      }
    } catch (err) {
      logger.error("Error fetching recording from Sarvam", {
        org_id: orgId,
        workspace_id: workspaceId,
        app_id: appId,
        interaction_id: interactionId,
        err,
      });
    }
    return null;
  }

  /**
   * Fetch transcript for a specific interaction or attempt:
   * GET https://apps.sarvam.ai/api/analytics/v1/{org_id}/{workspace_id}/{app_id}/transcripts/{interaction_id}
   */
  async fetchTranscript(interactionId: string): Promise<TranscriptEntry[]> {
    if (!this.isConfigured() || !interactionId) return [];

    const orgId = this.config.orgId || "default";
    const workspaceId = this.config.workspaceId || "default";
    const appId = this.config.agentId;

    const baseAnalyticsUrl = `${this.config.apiBaseUrl}/api/analytics/v1/${orgId}/${workspaceId}/${appId}`;

    try {
      const encodedInteractionId = encodeURIComponent(interactionId);
      const urlsToTry = Array.from(new Set([
        `${baseAnalyticsUrl}/transcripts/${encodedInteractionId}`,
        `${baseAnalyticsUrl}/transcripts/${interactionId}`,
      ]));

      for (const tUrl of urlsToTry) {
        try {
          const tRes = await fetch(tUrl, {
            method: "GET",
            headers: this.getAuthHeaders(),
            signal: AbortSignal.timeout(6000),
          });

          if (tRes.ok) {
            const rawJson = await tRes.json().catch(() => null);
            const parsed = normalizeSarvamTranscript(rawJson);
            if (parsed.length > 0) {
              return parsed;
            }
          }
        } catch {
          // try next URL
        }
      }
    } catch (err) {
      logger.error("Error fetching transcript from Sarvam", {
        org_id: orgId,
        workspace_id: workspaceId,
        app_id: appId,
        interaction_id: interactionId,
        err,
      });
    }
    return [];
  }

  /**
   * Fetch call attempts, interaction details, recording, and transcripts directly from Sarvam Analytics API
   */
  async fetchCallAnalytics(attemptOrInteractionId: string, interviewId?: string): Promise<SyncCallDetailsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "Sarvam AI credentials not configured.",
      };
    }

    const orgId = this.config.orgId || "default";
    const workspaceId = this.config.workspaceId || "default";
    const appId = this.config.agentId;

    const baseAnalyticsUrl = `${this.config.apiBaseUrl}/api/analytics/v1/${orgId}/${workspaceId}/${appId}`;

    const extractInteractionIdFromObj = (item: Record<string, unknown> | null | undefined): string | null => {
      if (!item || typeof item !== "object") return null;
      // Check all possible field names for interaction ID and filter sentinel values
      const candidates: (string | undefined)[] = [
        typeof item.interaction_id === "string" ? item.interaction_id.trim() : undefined,
        typeof item.interactionId === "string" ? (item.interactionId as string).trim() : undefined,
        typeof item.interaction === "string" ? (item.interaction as string).trim() : undefined,
      ];
      // Check array fields
      if (Array.isArray(item.interaction_ids) && item.interaction_ids.length > 0 && typeof item.interaction_ids[0] === "string") {
        candidates.push((item.interaction_ids[0] as string).trim());
      }
      if (Array.isArray(item.interactions) && item.interactions.length > 0) {
        const first = item.interactions[0];
        if (typeof first === "string") candidates.push(first.trim());
        else if (typeof first === "object" && first !== null) {
          const obj = first as Record<string, unknown>;
          if (typeof obj.interaction_id === "string") candidates.push(obj.interaction_id.trim());
          if (typeof obj.id === "string") candidates.push(obj.id.trim());
        }
      }
      if (typeof item.call_id === "string") candidates.push(item.call_id.trim());
      if (typeof item.session_id === "string") candidates.push(item.session_id.trim());
      // Return the first non-sentinel value
      for (const c of candidates) {
        if (c && !isSarvamSentinel(c)) return c;
      }
      return null;
    };

    try {
      // Clean ISO datetime without milliseconds (e.g. 2026-08-01T00:00:00Z) required by Sarvam API
      const startDatetime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";
      const endDatetime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";

      // 1. Fetch attempts list
      const attemptsUrl = new URL(`${baseAnalyticsUrl}/attempts`);
      attemptsUrl.searchParams.set("start_datetime", startDatetime);
      attemptsUrl.searchParams.set("end_datetime", endDatetime);
      attemptsUrl.searchParams.set("limit", "100");

      let itemsList: Record<string, unknown>[] = [];
      try {
        const attemptsRes = await fetch(attemptsUrl.toString(), {
          method: "GET",
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(12000),
        });
        if (attemptsRes.ok) {
          const attemptsJson = await attemptsRes.json().catch(() => ({}));
          if (Array.isArray(attemptsJson)) itemsList = attemptsJson;
          else if (Array.isArray(attemptsJson.items)) itemsList = attemptsJson.items;
          else if (Array.isArray(attemptsJson.data)) itemsList = attemptsJson.data;
          else if (Array.isArray(attemptsJson.attempts)) itemsList = attemptsJson.attempts;
        }
      } catch (e) {
        logger.warn("Attempts query error", { e });
      }

      // 2. Fetch interactions list
      let interList: Record<string, unknown>[] = [];
      try {
        const interactionsUrl = new URL(`${baseAnalyticsUrl}/interactions`);
        interactionsUrl.searchParams.set("start_datetime", startDatetime);
        interactionsUrl.searchParams.set("end_datetime", endDatetime);
        interactionsUrl.searchParams.set("limit", "100");

        const interRes = await fetch(interactionsUrl.toString(), {
          method: "GET",
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(12000),
        });
        if (interRes.ok) {
          const interJson = await interRes.json().catch(() => ({}));
          if (Array.isArray(interJson)) interList = interJson;
          else if (Array.isArray(interJson.items)) interList = interJson.items;
          else if (Array.isArray(interJson.data)) interList = interJson.data;
          else if (Array.isArray(interJson.interactions)) interList = interJson.interactions;
        }
      } catch (e) {
        logger.warn("Interactions query error", { e });
      }

      // 3. Match attempt from attempts list
      let attemptItem: Record<string, unknown> | null = null;
      if (itemsList.length > 0) {
        // Priority 1: Match by interview_id in agent_variables (most specific!)
        if (interviewId) {
          attemptItem = itemsList.find((it: Record<string, unknown>) => {
            const av = it.agent_variables as Record<string, unknown> | undefined;
            return av && typeof av === "object" && av.interview_id === interviewId;
          }) || null;
        }

        // Priority 2: Match by interaction_id (non-sentinel)
        if (!attemptItem && attemptOrInteractionId && !isSarvamSentinel(attemptOrInteractionId)) {
          attemptItem = itemsList.find((it: Record<string, unknown>) => {
            const cleaned = cleanSarvamId(it.interaction_id as string);
            return cleaned && cleaned === cleanSarvamId(attemptOrInteractionId);
          }) || null;
        }

        // Priority 3: Match by attempt_id
        if (!attemptItem && attemptOrInteractionId && !isSarvamSentinel(attemptOrInteractionId)) {
          attemptItem = itemsList.find((it: Record<string, unknown>) => {
            return it.attempt_id === attemptOrInteractionId || it.id === attemptOrInteractionId;
          }) || null;
        }
      }

      // Early return: if no attempt and no interaction found, Sarvam has no data for this call yet.
      // This prevents defaulting to "completed" when the call was just triggered.
      if (!attemptItem && interList.length === 0 && itemsList.length === 0) {
        return {
          success: true,
          status: undefined,
          transcript: [],
        };
      }

      // 4. Match interaction from interactions list
      let matchedInter: Record<string, unknown> | null = null;
      if (interList.length > 0) {
        // Priority 1: Match by interview_id in agent_variables
        if (interviewId) {
          matchedInter = interList.find((it: Record<string, unknown>) => {
            const av = it.agent_variables as Record<string, unknown> | undefined;
            return av && typeof av === "object" && av.interview_id === interviewId;
          }) || null;
        }

        // Priority 2: Match by interaction_id
        if (!matchedInter) {
          const targetInterId =
            extractInteractionIdFromObj(attemptItem) ||
            (attemptOrInteractionId && !isSarvamSentinel(attemptOrInteractionId) ? cleanSarvamId(attemptOrInteractionId) : null);

          if (targetInterId) {
            matchedInter = interList.find((it: Record<string, unknown>) => {
              const cleaned = extractInteractionIdFromObj(it) || cleanSarvamId(it.id as string);
              return cleaned === targetInterId;
            }) || null;
          }
        }

        // Priority 3: Match by attempt_id
        if (!matchedInter && attemptOrInteractionId && !isSarvamSentinel(attemptOrInteractionId)) {
          matchedInter = interList.find((it: Record<string, unknown>) => {
            return it.attempt_id === attemptOrInteractionId || it.job_id === attemptOrInteractionId;
          }) || null;
        }
      }

      // If no matching attempt or interaction was found in Sarvam data,
      // return without a status so the caller preserves the current status.
      if (!attemptItem && !matchedInter) {
        return {
          success: true,
          status: undefined,
          transcript: [],
        };
      }

      let interactionId =
        extractInteractionIdFromObj(matchedInter) ||
        extractInteractionIdFromObj(attemptItem) ||
        "";

      // Fallback: decode URI component if raw string is an interaction path
      if (!interactionId && (attemptOrInteractionId.includes("/") || attemptOrInteractionId.includes("%2F") || attemptOrInteractionId.startsWith("org_") || attemptOrInteractionId.startsWith("int_") || attemptOrInteractionId.startsWith("interaction_"))) {
        interactionId = cleanSarvamId(decodeURIComponent(attemptOrInteractionId)) || "";
      }

      const connectivityStatus =
        (matchedInter?.connectivity_status as string) ||
        (attemptItem?.connectivity_status as string) ||
        (matchedInter?.status as string) ||
        (attemptItem?.status as string) ||
        undefined;

      // Determine accurate duration (prefer positive numbers over 0)
      const durCandidates = [
        typeof matchedInter?.duration_in_seconds === "number" && matchedInter.duration_in_seconds > 0 ? matchedInter.duration_in_seconds : undefined,
        typeof attemptItem?.duration_in_seconds === "number" && attemptItem.duration_in_seconds > 0 ? attemptItem.duration_in_seconds : undefined,
        typeof matchedInter?.duration === "number" && matchedInter.duration > 0 ? matchedInter.duration : undefined,
        typeof attemptItem?.duration === "number" && attemptItem.duration > 0 ? attemptItem.duration : undefined,
        typeof matchedInter?.duration_in_seconds === "number" ? matchedInter.duration_in_seconds : undefined,
        typeof attemptItem?.duration_in_seconds === "number" ? attemptItem.duration_in_seconds : undefined,
      ];
      const validDur = durCandidates.find((d) => d !== undefined);
      const duration = typeof validDur === "number" ? Math.round(validDur) : undefined;

      const realAttemptId =
        (attemptItem?.attempt_id as string) ||
        (matchedInter?.attempt_id as string) ||
        (matchedInter?.job_id as string) ||
        (attemptItem?.id as string) ||
        attemptOrInteractionId;

      const agentVariables = {
        ...((attemptItem?.agent_variables as Record<string, unknown>) || {}),
        ...((matchedInter?.agent_variables as Record<string, unknown>) || {}),
      };

      // Ensure recordingUrl is set to the browser-playable authenticated proxy endpoint
      let audioUrl: string | undefined = undefined;
      if (interviewId && (interactionId || realAttemptId)) {
        audioUrl = `/api/interviews/${interviewId}/recording`;
      }
      if (!audioUrl && interactionId) {
        audioUrl = (await this.fetchRecording(interactionId, interviewId)) || undefined;
      }
      if (!audioUrl && attemptOrInteractionId) {
        audioUrl = (await this.fetchRecording(attemptOrInteractionId, interviewId)) || undefined;
      }

      // 5. Fetch transcript using interactionId or fallback to attemptOrInteractionId
      let transcriptEntries: TranscriptEntry[] = [];
      if (interactionId) {
        transcriptEntries = await this.fetchTranscript(interactionId);
      }
      if (transcriptEntries.length === 0 && attemptOrInteractionId && attemptOrInteractionId !== interactionId) {
        const fallbackTranscripts = await this.fetchTranscript(attemptOrInteractionId);
        if (fallbackTranscripts.length > 0) {
          transcriptEntries = fallbackTranscripts;
        }
      }

      return {
        success: true,
        status: connectivityStatus ? mapSarvamCallStatus(connectivityStatus) : undefined,
        duration,
        interactionId: cleanSarvamId(interactionId) || undefined,
        attemptId: realAttemptId,
        recordingUrl: audioUrl,
        agentVariables: Object.keys(agentVariables).length > 0 ? agentVariables : undefined,
        transcript: transcriptEntries,
        rawDetails: {
          attempt: attemptItem,
          interaction: matchedInter,
          transcriptCount: transcriptEntries.length,
          audioUrl,
          interactionId,
        },
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Error fetching analytics from Sarvam";
      logger.error("Failed to fetch analytics from Sarvam", {
        org_id: orgId,
        workspace_id: workspaceId,
        app_id: appId,
        interaction_id: attemptOrInteractionId,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

let clientInstance: SarvamClient | null = null;

export function getSarvamClient(): SarvamClient {
  if (!clientInstance) {
    clientInstance = new SarvamClient();
  }
  return clientInstance;
}
