import { scoreReadAttempt, type ReadScore } from "./scoring";
import {
  createSpeechRecognitionSession,
  type SpeechRecognitionSession,
  type SpeechRecognitionSessionOptions,
} from "./speechRecognitionProvider";
import { TransformersWhisperProvider } from "./transformersWhisperProvider";
import type { SttTranscript } from "./types";

export type ReadPracticeProviderCode = "TWP" | "SRP";

export type ReadPracticeTranscriptionResult = {
  transcript: SttTranscript;
  score: ReadScore;
};

export type ReadPracticeProvider = {
  code: ReadPracticeProviderCode;
  badge: ReadPracticeProviderCode;
  label: string;
  mode: "post-recording" | "streaming";
  preload?: () => Promise<void>;
  transcribeAndScore?: (audio: Blob, targetText: string) => Promise<ReadPracticeTranscriptionResult>;
  createSession?: (options: SpeechRecognitionSessionOptions) => SpeechRecognitionSession | null;
};

const providers: Record<ReadPracticeProviderCode, ReadPracticeProvider> = {
  TWP: {
    code: "TWP",
    badge: "TWP",
    label: "TransformersWhisperProvider",
    mode: "post-recording",
    preload: () => TransformersWhisperProvider.preload?.() ?? Promise.resolve(),
    async transcribeAndScore(audio, targetText) {
      const transcript = await TransformersWhisperProvider.transcribe(audio, {
        language: "en",
        targetText,
        returnWordTimestamps: true,
      });
      return {
        transcript,
        score: scoreReadAttempt(transcript, targetText),
      };
    },
  },
  SRP: {
    code: "SRP",
    badge: "SRP",
    label: "SpeechRecognitionProvider",
    mode: "streaming",
    createSession: createSpeechRecognitionSession,
  },
};

export function getDefaultReadPracticeProviderCode(): ReadPracticeProviderCode {
  return "SRP";
}

export function isReadPracticeProviderCode(value: string | null): value is ReadPracticeProviderCode {
  return value === "TWP" || value === "SRP";
}

export function getReadPracticeProvider(code: ReadPracticeProviderCode = getDefaultReadPracticeProviderCode()) {
  return providers[code];
}
