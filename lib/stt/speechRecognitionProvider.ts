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
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      throw new Error("当前浏览器不支持 SpeechRecognition。");
    }

    const startedAt = performance.now();
    const recognition = new SpeechRecognition();
    let transcript = "";

    recognition.lang = options.language === "en" ? "en-US" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    return new Promise((resolve, reject) => {
      recognition.onresult = (event) => {
        let nextTranscript = "";
        for (let index = 0; index < event.results.length; index += 1) {
          nextTranscript += event.results[index][0]?.transcript ?? "";
        }
        transcript = nextTranscript.trim();
      };

      recognition.onerror = () => {
        reject(new Error("SpeechRecognition 识别失败。"));
      };

      recognition.onend = () => {
        resolve({
          text: transcript,
          words: transcript
            ? transcript.split(/\s+/).map((word) => ({ text: word, start: null, end: null }))
            : [],
          provider: "speech-recognition",
          elapsedMs: performance.now() - startedAt,
        });
      };

      recognition.start();
    });
  },
};

