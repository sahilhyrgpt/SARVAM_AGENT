import { logger } from "@/lib/utils/logger";
import { ensureEnvLoaded } from "@/lib/utils/env";

export interface UpdateTelephonicStatusPayload {
  resumeDataId: string;
  status: string;
  interviewId?: string;
}

export interface SubmitTelephonicDataPayload {
  resumeDataId: string;
  callId: string;
  callData: Record<string, unknown>;
  sarvamData: Record<string, unknown>;
  interviewConversation: Array<{
    speaker?: string;
    text?: string;
    timestamp?: string;
  }>;
  score: number;
  scoreData: Record<string, unknown> | null;
  status: string;
}

export function getBackendBaseUrl(): string {
  ensureEnvLoaded();
  return (
    process.env.BACKEND_BASE_URL ||
    "https://devnodeapi.hyrgpt.com"
  ).replace(/\/$/, "");
}

/**
 * Call backend to update telephonic interview status (e.g. NO_ANSWER, BUSY, REJECTED)
 * POST {BACKEND_BASE_URL}/v1/update-telephonic-interview?region=india
 */
export async function sendBackendStatusUpdate(payload: UpdateTelephonicStatusPayload): Promise<{
  success: boolean;
  statusCode?: number;
  data?: unknown;
  error?: string;
}> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/v1/update-telephonic-interview?region=india`;

  const bodyData = {
    resumeDataId: payload.resumeDataId,
    status: payload.status,
  };

  try {
    logger.info("[Backend Client] Sending status update to backend", {
      url,
      payload: bodyData,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyData),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = `Backend status update failed with HTTP ${response.status}: ${JSON.stringify(data)}`;
      logger.error("[Backend Client] Status update error", {
        httpStatus: response.status,
        url,
        data,
      });
      return { success: false, statusCode: response.status, data, error: errMsg };
    }

    logger.info("[Backend Client] Status update succeeded", { data });
    return { success: true, statusCode: response.status, data };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[Backend Client] Exception during status update to backend", {
      url,
      payload: bodyData,
      error: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

/**
 * Call backend to submit complete telephonic interview data & score
 * POST {BACKEND_BASE_URL}/v1/submit-telephonic-interview?region=india
 */
export async function sendBackendInterviewData(payload: SubmitTelephonicDataPayload): Promise<{
  success: boolean;
  statusCode?: number;
  data?: unknown;
  error?: string;
}> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/v1/submit-telephonic-interview?region=india`;

  try {
    logger.info("[Backend Client] Submitting interview data to backend", {
      url,
      resumeDataId: payload.resumeDataId,
      callId: payload.callId,
      score: payload.score,
      status: payload.status,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = `Backend interview data submit failed with HTTP ${response.status}: ${JSON.stringify(data)}`;
      logger.error("[Backend Client] Interview data submit error", {
        httpStatus: response.status,
        url,
        data,
      });
      return { success: false, statusCode: response.status, data, error: errMsg };
    }

    logger.info("[Backend Client] Interview data submit succeeded", { data });
    return { success: true, statusCode: response.status, data };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[Backend Client] Exception during interview data submit to backend", {
      url,
      resumeDataId: payload.resumeDataId,
      callId: payload.callId,
      error: errMsg,
    });
    return { success: false, error: errMsg };
  }
}
