import type { SttOptions, SttProvider, SttTranscript } from "./types";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export type SpeechRecognitionSession = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionSessionOptions = {
  language?: "en";
  interimResults?: boolean;
  onTranscript?: (transcript: string) => void;
  onError?: (message: string, error?: string) => void;
  onEnd?: (transcript: string) => void;
};

export function createSpeechRecognitionSession({
  language = "en",
  interimResults = true,
  onTranscript,
  onError,
  onEnd,
}: SpeechRecognitionSessionOptions): SpeechRecognitionSession | null {
  const SpeechRecognition = getSpeechRecognitionConstructor();
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  let transcript = "";

  recognition.lang = language === "en" ? "en-US" : "en-US";
  recognition.continuous = false;
  recognition.interimResults = interimResults;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let nextTranscript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      nextTranscript += event.results[index][0]?.transcript ?? "";
    }
    transcript = nextTranscript.trim();
    onTranscript?.(transcript);
  };

  recognition.onerror = (event) => {
    const error = (event as SpeechRecognitionErrorEventLike).error;
    onError?.(error ? `语音识别失败：${error}。` : "语音识别失败，请再试一次。", error);
  };

  recognition.onend = () => {
    onEnd?.(transcript.trim());
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => {
      recognition.onend = null;
      recognition.abort();
    },
  };
}

/**
 * @deprecated Kept as a compatibility fallback. New STT work should use a provider
 * with stable cross-browser behavior, such as TransformersWhisperProvider.
 */
export const SpeechRecognitionProvider: SttProvider = {
  id: "speech-recognition",
  label: "Browser SpeechRecognition",
  deprecated: true,
  async isAvailable() {
    return Boolean(getSpeechRecognitionConstructor());
  },
  async transcribe(_audio: Blob, options: SttOptions = {}): Promise<SttTranscript> {
    const startedAt = performance.now();

    return new Promise((resolve, reject) => {
      const session = createSpeechRecognitionSession({
        language: options.language,
        onError: (message) => reject(new Error(message)),
        onEnd: (transcript) => {
          resolve({
            text: transcript,
            words: transcript
              ? transcript.split(/\s+/).map((word) => ({ text: word, start: null, end: null }))
              : [],
            provider: "speech-recognition",
            elapsedMs: performance.now() - startedAt,
          });
        },
      });

      if (!session) {
        reject(new Error("当前浏览器不支持 SpeechRecognition。"));
        return;
      }

      try {
        session.start();
      } catch {
        resolve({
          text: "",
          words: [],
          provider: "speech-recognition",
          elapsedMs: performance.now() - startedAt,
        });
      }
    });
  },
};
