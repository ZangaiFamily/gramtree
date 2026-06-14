import type { SttTranscript } from "./types";

export type ReadScoreResult = "recognized" | "try-again" | "not-matched";

export type ReadScore = {
  result: ReadScoreResult;
  completeness: number;
  wordAccuracy: number;
  matchedWords: string[];
  missingWords: string[];
  extraWords: string[];
};

export function normalizeSttText(value: string) {
  return value.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordsOf(value: string) {
  const normalized = normalizeSttText(value);
  return normalized ? normalized.split(" ") : [];
}

export function scoreReadAttempt(transcript: SttTranscript, targetText: string): ReadScore {
  const targetWords = wordsOf(targetText);
  const transcriptWords = wordsOf(transcript.text);

  if (!targetWords.length || !transcriptWords.length) {
    return {
      result: "not-matched",
      completeness: 0,
      wordAccuracy: 0,
      matchedWords: [],
      missingWords: targetWords,
      extraWords: transcriptWords,
    };
  }

  const unmatchedTranscript = [...transcriptWords];
  const matchedWords: string[] = [];
  const missingWords: string[] = [];

  targetWords.forEach((word) => {
    const matchIndex = unmatchedTranscript.indexOf(word);
    if (matchIndex === -1) {
      missingWords.push(word);
      return;
    }
    matchedWords.push(word);
    unmatchedTranscript.splice(matchIndex, 1);
  });

  const completeness = matchedWords.length / targetWords.length;
  const wordAccuracy = matchedWords.length / Math.max(targetWords.length, transcriptWords.length);
  const result: ReadScoreResult =
    completeness >= 1 ? "recognized" : matchedWords.length > 0 ? "try-again" : "not-matched";

  return {
    result,
    completeness,
    wordAccuracy,
    matchedWords,
    missingWords,
    extraWords: unmatchedTranscript,
  };
}

