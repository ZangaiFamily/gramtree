import { samePronunciation } from "./pronunciation";

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

function findMatchingWordIndex(words: string[], targetWord: string) {
  return words.findIndex((word) => samePronunciation(word, targetWord));
}

export function compareSpeechToTarget(transcript: string, target: string): ReadScoreResult {
  return scoreWords(wordsOf(transcript), wordsOf(target)).result;
}

function scoreWords(transcriptWords: string[], targetWords: string[]): ReadScore {
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
    const matchIndex = findMatchingWordIndex(unmatchedTranscript, word);
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
