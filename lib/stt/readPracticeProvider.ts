import {
  createSpeechRecognitionSession,
  type SpeechRecognitionSession,
  type SpeechRecognitionSessionOptions,
} from "./speechRecognitionProvider";

export type ReadPracticeProviderCode = "SRP";

export type ReadPracticeProvider = {
  code: ReadPracticeProviderCode;
  badge: ReadPracticeProviderCode;
  label: string;
  mode: "streaming";
  createSession?: (options: SpeechRecognitionSessionOptions) => SpeechRecognitionSession | null;
};

const providers: Record<ReadPracticeProviderCode, ReadPracticeProvider> = {
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

export function getReadPracticeProvider(code: ReadPracticeProviderCode = getDefaultReadPracticeProviderCode()) {
  return providers[code];
}
