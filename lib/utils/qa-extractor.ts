import { Question, QuestionAnswer, TranscriptEntry } from "@/types/interview";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "what", "how", "do", "you",
  "tell", "me", "about", "your", "can", "could", "why", "which",
  "who", "when", "where", "difference", "between", "please",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Intelligently extract and map candidate responses to interview questions from the call transcript.
 */
export function extractQuestionAnswersFromTranscript(
  questions: Question[] = [],
  transcript: TranscriptEntry[] = []
): QuestionAnswer[] {
  if (!questions || questions.length === 0) return [];
  if (!transcript || transcript.length === 0) {
    return questions.map((q) => ({
      questionId: q.id,
      question: q.question,
      answer: q.answer || "",
      status: q.answer ? "answered" : "not_answered",
    }));
  }

  // Identify agent turns
  const agentTurns: { idx: number; text: string; cleanText: string }[] = [];
  transcript.forEach((entry, idx) => {
    if (entry.speaker === "agent" && entry.text && entry.text.trim()) {
      agentTurns.push({
        idx,
        text: entry.text,
        cleanText: entry.text.toLowerCase(),
      });
    }
  });

  // Keep track of matched agent turn indices so questions are consumed chronologically
  let lastMatchedTurnIndex = -1;

  return questions.map((q, qIndex) => {
    const qKeywords = extractKeywords(q.question);

    let bestAgentTurn: (typeof agentTurns)[0] | null = null;
    let highestScore = 0;

    // Look for the agent turn asking this question
    for (const at of agentTurns) {
      // Prioritize turns that appear after the previous question was asked
      const isAfterLast = at.idx > lastMatchedTurnIndex;
      let score = 0;

      for (const kw of qKeywords) {
        if (at.cleanText.includes(kw)) {
          score += 1;
        }
      }

      if (isAfterLast) {
        score += 0.5; // Chronological bonus
      }

      if (score > highestScore && score >= 1) {
        highestScore = score;
        bestAgentTurn = at;
      }
    }

    // Fallback: If no keyword match found, but questions are sequential and agent has corresponding turns
    if (!bestAgentTurn && qIndex < agentTurns.length) {
      // Find the first agent turn after lastMatchedTurnIndex that isn'\''t just an intro
      const candidates = agentTurns.filter(
        (at) =>
          at.idx > lastMatchedTurnIndex &&
          !at.cleanText.includes("am i speaking with") &&
          !at.cleanText.includes("good time for a short")
      );
      if (candidates.length > 0) {
        bestAgentTurn = candidates[0];
      }
    }

    if (!bestAgentTurn) {
      return {
        questionId: q.id,
        question: q.question,
        answer: q.answer || "",
        status: q.answer ? "answered" : "not_answered",
      };
    }

    lastMatchedTurnIndex = bestAgentTurn.idx;

    // Collect candidate turns following this agent turn until the next agent question
    const candidateResponses: string[] = [];
    for (let i = bestAgentTurn.idx + 1; i < transcript.length; i++) {
      const entry = transcript[i];
      if (entry.speaker === "candidate") {
        const trimmed = entry.text.trim();
        // Ignore single-word confirmations if followed by a real sentence
        if (trimmed) {
          candidateResponses.push(trimmed);
        }
      } else if (entry.speaker === "agent") {
        // Stop if the agent is asking the next question
        const isNextQuestion = questions.some((otherQ) => {
          if (otherQ.id === q.id) return false;
          const otherKeywords = extractKeywords(otherQ.question);
          const matchCount = otherKeywords.filter((kw) =>
            entry.text.toLowerCase().includes(kw)
          ).length;
          return matchCount >= 2;
        });

        if (isNextQuestion) {
          break;
        }

        // If agent says a short acknowledgment ("That makes sense", "Awesome"), keep collecting candidate response
        const lowerText = entry.text.toLowerCase();
        const isAcknowledgement =
          lowerText.length < 50 &&
          (lowerText.includes("makes sense") ||
            lowerText.includes("sounds interesting") ||
            lowerText.includes("awesome") ||
            lowerText.includes("great") ||
            lowerText.includes("thank you"));

        if (!isAcknowledgement) {
          // If agent starts wrapping up or asking something else, break
          if (
            lowerText.includes("thank you for your time") ||
            lowerText.includes("hiring team will review") ||
            lowerText.includes("next,") ||
            lowerText.includes("now,") ||
            lowerText.includes("finally,") ||
            lowerText.includes("so, moving on")
          ) {
            break;
          }
        }
      }
    }

    let answer = q.answer || candidateResponses.join(" ").trim();
    let status: QuestionAnswer["status"] = "not_answered";

    if (answer) {
      const lowerAnswer = answer.toLowerCase();
      if (
        lowerAnswer.includes("proceed to next") ||
        lowerAnswer.includes("skip that") ||
        lowerAnswer.includes("skip please") ||
        lowerAnswer.includes("next question") ||
        lowerAnswer.includes("pass")
      ) {
        status = "skipped";
      } else {
        status = "answered";
      }
    }

    return {
      questionId: q.id,
      question: q.question,
      answer,
      status,
    };
  });
}
