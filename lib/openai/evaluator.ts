import OpenAI from "openai";
import { InterviewEvaluation, SkillAlignmentItem, TranscriptEntry } from "@/types/interview";
import { logger } from "@/lib/utils/logger";
import { ensureEnvLoaded } from "@/lib/utils/env";

export interface EvaluateInterviewInput {
  companyName?: string;
  jobTitle: string;
  jobDescription: string;
  transcript: TranscriptEntry[] | string;
  skills?: string[];
}

/**
 * Format transcript entries into readable text dialogue for the LLM
 */
export function formatTranscriptForPrompt(transcript: TranscriptEntry[] | string): string {
  if (typeof transcript === "string") {
    return transcript.trim();
  }

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return "";
  }

  return transcript
    .map((entry) => {
      const speakerName =
        entry.speaker === "agent"
          ? "Interviewer (AI)"
          : entry.speaker === "candidate"
            ? "Candidate"
            : "System";
      return `${speakerName}: ${entry.text}`;
    })
    .join("\n\n");
}

function normalizeStringArray(raw: unknown, expectedLength?: number): string[] {
  let list: string[] = [];

  if (Array.isArray(raw)) {
    list = raw
      .map((item) => (typeof item === "string" ? item.trim() : String(item || "")))
      .filter((s) => s.length > 0);
  } else if (typeof raw === "string" && raw.trim().length > 0) {
    list = raw
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter((s) => s.length > 0);
  }

  if (expectedLength && expectedLength > 0) {
    if (list.length === 0) {
      list = Array(expectedLength).fill("No evaluation detail available.");
    } else if (list.length < expectedLength) {
      while (list.length < expectedLength) {
        list.push(list[list.length - 1] || "Consistent performance observed.");
      }
    } else if (list.length > expectedLength) {
      list = list.slice(0, expectedLength);
    }
  }

  return list;
}

export interface EvaluationEligibility {
  eligible: boolean;
  reason?: string;
  candidateTurnCount: number;
  candidateWordCount: number;
  answeredQuestionCount: number;
}

/**
 * Check whether an interview has sufficient candidate participation to generate AI scores.
 * Rejects dropped calls where the candidate only said greeting confirmations (e.g. "Right.", "Yes").
 */
export function isInterviewEligibleForEvaluation(
  transcript: TranscriptEntry[] | string,
  questionAnswers?: Array<{ answer?: string }>
): EvaluationEligibility {
  if (!transcript || (Array.isArray(transcript) && transcript.length === 0)) {
    return {
      eligible: false,
      reason: "Interview transcript is empty.",
      candidateTurnCount: 0,
      candidateWordCount: 0,
      answeredQuestionCount: 0,
    };
  }

  if (Array.isArray(transcript)) {
    const candidateTurns = transcript.filter((t) => t.speaker === "candidate");
    const candidateTurnCount = candidateTurns.length;
    const allCandidateWords = candidateTurns
      .map((t) => t.text.trim())
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);
    const candidateWordCount = allCandidateWords.length;

    const answeredQuestionCount = questionAnswers
      ? questionAnswers.filter((qa) => Boolean(qa.answer && qa.answer.trim().length > 3)).length
      : 0;

    // The candidate must have actually answered interview questions, OR
    // provided substantive responses (at least 2 turns AND >= 8 words).
    // Single greeting confirmations like "Right." or "Yes" do not constitute an interview response.
    if (answeredQuestionCount > 0) {
      return {
        eligible: true,
        candidateTurnCount,
        candidateWordCount,
        answeredQuestionCount,
      };
    }

    if (candidateTurnCount >= 2 && candidateWordCount >= 8) {
      return {
        eligible: true,
        candidateTurnCount,
        candidateWordCount,
        answeredQuestionCount,
      };
    }

    return {
      eligible: false,
      reason: `Insufficient candidate responses (${candidateTurnCount} turns, ${candidateWordCount} words, 0 questions answered). Call ended before interview questions were answered.`,
      candidateTurnCount,
      candidateWordCount,
      answeredQuestionCount,
    };
  }

  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length < 20) {
    return {
      eligible: false,
      reason: "Interview transcript is too short to evaluate.",
      candidateTurnCount: 0,
      candidateWordCount: words.length,
      answeredQuestionCount: 0,
    };
  }

  return {
    eligible: true,
    candidateTurnCount: 1,
    candidateWordCount: words.length,
    answeredQuestionCount: 0,
  };
}

/**
 * Generate candidate interview evaluation and scores using OpenAI
 */
export async function generateInterviewEvaluation(
  input: EvaluateInterviewInput
): Promise<InterviewEvaluation> {
  ensureEnvLoaded();

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Please add OPENAI_API_KEY to your environment variables."
    );
  }

  const eligibility = isInterviewEligibleForEvaluation(input.transcript);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Interview is not eligible for evaluation.");
  }

  const formattedTranscript = formatTranscriptForPrompt(input.transcript);
  if (!formattedTranscript || formattedTranscript.length < 15) {
    throw new Error(
      "Interview transcript is empty or too short to perform AI scoring."
    );
  }

  const skillsToEvaluate = Array.isArray(input.skills) && input.skills.length > 0
    ? input.skills.map((s) => (typeof s === "string" ? s.trim() : String(s || ""))).filter(Boolean)
    : [];

  const systemPrompt = `You are an expert technical interviewer and executive talent evaluator.
Evaluate the candidate's interview performance against the Job Title and Job Description.

You MUST respond strictly with a valid JSON object matching the following schema:
{
  "score": 80, (Average of all skill alignment scores)
  "interviewSummary": [
    "Line 1: High-level overview of the interview and candidate background",
    "Line 2: Technical depth and knowledge exhibited during responses",
    "Line 3: Key topics and questions covered with candidate answers",
    "Line 4: Problem-solving approach and relevance to role requirements",
    "Line 5: Overall sentiment and hiring recommendation summary"
  ],
  "fitForRole": [
    "Line 1: Role alignment and readiness for the day-to-day responsibilities",
    "Line 2: Match between previous experience and the team's needs"
  ],
  "strength": [
    "Line 1: Primary demonstrated strength during the call",
    "Line 2: Secondary demonstrated strength or positive quality"
  ],
  "weekness": [
    "Line 1: Primary area for improvement or knowledge gap identified",
    "Line 2: Secondary area for development or caution"
  ],
  "skillAlignment": [
    {
      "roleRequired": "Java",
      "candidateAligned": 70,
      "summary": [
        "Line 1: Candidate demonstration and depth in this skill",
        "Line 2: Practical experience or gaps observed"
      ]
    }
  ]
}

Constraints:
1. "score": Single overall number between 0 and 100 which will be the average of all skillAlignment scores.
2. "interviewSummary": Array of exactly 5 strings (5 lines summary).
3. "fitForRole": Array of exactly 2 strings (2 lines summary).
4. "strength": Array of exactly 2 strings (2 lines summary).
5. "weekness": Array of exactly 2 strings (2 lines summary).
6. "skillAlignment": ${
    skillsToEvaluate.length > 0
      ? `Evaluate the candidate specifically against these required skills: ${skillsToEvaluate.join(", ")}. Each item in skillAlignment must correspond to one of these required skills ("roleRequired" matching the skill name), with "candidateAligned" (number 0-100) and "summary" (array of exactly 2 strings).`
      : `Array of 3 to 4 skills (pick the 3-4 most critical skills for this role, maximum 4 skills). Each skill must have "roleRequired" (string), "candidateAligned" (number 0-100), and "summary" (array of exactly 2 strings).`
  }
   For Skill Alignment Score ("candidateAligned"), score using the following 10-point intervals:
   - 0: No knowledge of the skill or not answered
   - 1-10: Extremely limited knowledge of the skill
   - 11-20: Very limited knowledge of the skill
   - 21-30: Rudimentary knowledge of the skill
   - 31-40: Elementary knowledge of the skill
   - 41-50: Limited knowledge of the skill
   - 51-60: Basic knowledge of the skill
   - 61-70: Moderate knowledge of the skill
   - 71-80: Good knowledge of the skill
   - 81-90: Very good knowledge of the skill
   - 91-100: Excellent knowledge of the skill
7. Return ONLY the valid JSON object. No markdown wrappers or preamble.`;

  const userMessage = `${input.companyName ? `Company: ${input.companyName}\n` : ""}Job Title:
${input.jobTitle || "Software Engineer"}

Job Description:
${input.jobDescription || "Standard Technical Interview Evaluation"}
${skillsToEvaluate.length > 0 ? `\nTarget Skills to Evaluate:\n${skillsToEvaluate.join(", ")}\n` : ""}
Interview Transcript:
${formattedTranscript}

Evaluate this candidate now according to the JSON specification.`;

  const openai = new OpenAI({ apiKey });
  const configuredModel = (process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();

  let response;
  let modelUsed = configuredModel;

  try {
    response = await openai.chat.completions.create({
      model: configuredModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2500,
    });
  } catch (err: unknown) {
    const errorObj = err as { message?: string; code?: string; status?: number };
    // If gpt-4.1-mini is not found on user's OpenAI account, smoothly fallback to gpt-4.1-mini
    if (
      errorObj?.message?.includes("model") ||
      errorObj?.code === "model_not_found" ||
      errorObj?.status === 404
    ) {
      logger.warn(
        `OpenAI model '${configuredModel}' not found or unavailable, retrying with 'gpt-4.1-mini'`,
        { error: errorObj.message }
      );
      modelUsed = "gpt-4.1-mini";
      response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2500,
      });
    } else {
      throw err;
    }
  }

  const content = response.choices[0]?.message?.content || "{}";
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.error("Failed to parse OpenAI JSON output", { content, error: e });
    throw new Error("Failed to parse evaluation response from OpenAI.");
  }

  // Normalize array fields
  const interviewSummary = normalizeStringArray(parsed.interviewSummary, 5);
  const fitForRole = normalizeStringArray(parsed.fitForRole, 2);
  const strength = normalizeStringArray(parsed.strength, 2);
  const weekness = normalizeStringArray(
    parsed.weekness ?? parsed.weakness,
    2
  );

  // Normalize skillAlignment (support both skillAlignment and skillAllignment keys)
  const rawSkills = Array.isArray(parsed.skillAlignment)
    ? parsed.skillAlignment
    : Array.isArray(parsed.skillAllignment)
    ? parsed.skillAllignment
    : [];

  let skillAlignment: SkillAlignmentItem[] = [];

  if (skillsToEvaluate.length > 0) {
    // If specific skills were provided, prioritize matching those exact skills
    skillAlignment = skillsToEvaluate.map((skillName) => {
      const matched = rawSkills.find(
        (s: Record<string, unknown>) =>
          typeof s.roleRequired === "string" &&
          s.roleRequired.trim().toLowerCase() === skillName.toLowerCase()
      );
      if (matched) {
        const rawAligned = Number(matched.candidateAligned);
        const candidateAligned = isNaN(rawAligned)
          ? 0
          : Math.max(0, Math.min(100, Math.round(rawAligned)));
        const summary = normalizeStringArray(matched.summary, 2);
        return {
          roleRequired: skillName,
          candidateAligned,
          summary,
        };
      }
      return {
        roleRequired: skillName,
        candidateAligned: 0,
        summary: [
          `Candidate engaged with topics related to ${skillName}.`,
          "Demonstrated working baseline understanding during questioning.",
        ],
      };
    });
  } else {
    skillAlignment = rawSkills
      .slice(0, 4)
      .map((item: Record<string, unknown>, idx: number) => {
        const roleRequired =
          typeof item.roleRequired === "string" && item.roleRequired.trim()
            ? item.roleRequired.trim()
            : `Core Skill ${idx + 1}`;
        const rawAligned = Number(item.candidateAligned);
        const candidateAligned = isNaN(rawAligned)
          ? 0
          : Math.max(0, Math.min(100, Math.round(rawAligned)));
        const summary = normalizeStringArray(item.summary, 2);

        return {
          roleRequired,
          candidateAligned,
          summary,
        };
      });

    // Ensure at least 3 skills are present
    while (skillAlignment.length < 3) {
      const idx = skillAlignment.length + 1;
      skillAlignment.push({
        roleRequired: `Requirement Competency ${idx}`,
        candidateAligned: 0,
        summary: [
          "Candidate engaged with topics related to this requirement.",
          "Demonstrated working baseline understanding during questioning.",
        ],
      });
    }
  }

  // Calculate overall score purely as the average of all skillAlignment candidateAligned scores (never using parsed.score)
  const totalSkillScore = skillAlignment.reduce(
    (sum, item) => sum + (typeof item.candidateAligned === "number" ? item.candidateAligned : 0),
    0
  );
  const score = skillAlignment.length > 0
    ? Math.max(0, Math.min(100, Math.round(totalSkillScore / skillAlignment.length)))
    : 0;

  const evaluation: InterviewEvaluation = {
    score,
    interviewSummary,
    fitForRole,
    strength,
    weekness,
    weakness: weekness,
    skillAlignment,
    generatedAt: new Date().toISOString(),
    modelUsed,
  };

  return evaluation;
}
