import { NextRequest, NextResponse } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { getSarvamConfig } from "@/lib/sarvam/client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Stream/Proxy the call audio recording from Sarvam Analytics API to the browser
 * GET /api/interviews/:id/recording
 */
interface CachedAudio {
  buffer: ArrayBuffer;
  contentType: string;
  cachedAt: number;
}

const audioBufferCache = new Map<string, CachedAudio>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return new NextResponse("Interview ID is required", { status: 400 });
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(id);

  if (!interview) {
    return new NextResponse("Interview not found", { status: 404 });
  }

  const interactionId = interview.call.interactionId || interview.call.providerCallId;
  if (!interactionId) {
    return new NextResponse("No interaction ID available for this interview", { status: 404 });
  }

  const config = getSarvamConfig();
  if (!config.apiKey || !config.agentId) {
    return new NextResponse("Sarvam configuration missing", { status: 500 });
  }

  try {
    let audioBuffer: ArrayBuffer;
    let contentType = "audio/wav";

    // 1. Check in-memory cache first to avoid re-fetching ~2.4MB on every range probe
    const cached = audioBufferCache.get(interactionId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      audioBuffer = cached.buffer;
      contentType = cached.contentType;
    } else {
      const orgId = config.orgId || "default";
      const workspaceId = config.workspaceId || "default";
      const appId = config.agentId;

      const baseAnalyticsUrl = `${config.apiBaseUrl}/api/analytics/v1/${orgId}/${workspaceId}/${appId}`;
      const encodedInteractionId = encodeURIComponent(interactionId);
      const recordingUrlsToTry = Array.from(
        new Set([
          `${baseAnalyticsUrl}/recordings/${encodedInteractionId}`,
          `${baseAnalyticsUrl}/recordings/${interactionId}`,
        ])
      );

      let sarvamRes: Response | null = null;
      for (const rUrl of recordingUrlsToTry) {
        const res = await fetch(rUrl, {
          method: "GET",
          headers: {
            "X-API-Key": config.apiKey,
            "api-subscription-key": config.apiKey,
            Authorization: `Bearer ${config.apiKey}`,
          },
        });
        if (res.ok) {
          sarvamRes = res;
          break;
        }
      }

      if (!sarvamRes || !sarvamRes.ok) {
        return new NextResponse("Recording not found on Sarvam", {
          status: 404,
        });
      }

      const receivedType = sarvamRes.headers.get("content-type") || "";

      // If Sarvam returned a JSON redirect/presigned URL instead of raw audio stream
      if (receivedType.includes("application/json")) {
        const json = await sarvamRes.json().catch(() => ({}));
        const redirectUrl = json.audio_url || json.recording_url || json.url || json.signed_url;
        if (redirectUrl) {
          return NextResponse.redirect(redirectUrl);
        }
      }

      contentType = receivedType.startsWith("audio/") ? receivedType : "audio/wav";
      audioBuffer = await sarvamRes.arrayBuffer();

      // Store in cache
      audioBufferCache.set(interactionId, {
        buffer: audioBuffer,
        contentType,
        cachedAt: Date.now(),
      });
    }

    const totalLength = audioBuffer.byteLength;
    const rangeHeader = req.headers.get("range");

    // 2. Handle HTTP Range Request (RFC 7233) required by Safari/Chrome <audio> players
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] && parts[1].trim() !== "" ? parseInt(parts[1], 10) : totalLength - 1;

      if (start >= totalLength || end >= totalLength || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${totalLength}`,
          },
        });
      }

      const chunk = audioBuffer.slice(start, end + 1);
      const chunkSize = end - start + 1;

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${totalLength}`,
          "Content-Length": chunkSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        },
      });
    }

    // 3. Standard Full Response if no Range header is sent
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": totalLength.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error streaming recording";
    logger.error("Error in recording stream proxy", { error: errorMsg });
    return new NextResponse(errorMsg, { status: 502 });
  }
}
