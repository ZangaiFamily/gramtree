export type SttProviderId = "speech-recognition" | "transformers-whisper";

export type SttWord = {
  text: string;
  start: number | null;
  end: number | null;
};

export type SttTranscript = {
  text: string;
  words: SttWord[];
  provider: SttProviderId;
  model?: string;
  elapsedMs?: number;
};

export type SttOptions = {
  language?: "en";
  targetText?: string;
  returnWordTimestamps?: boolean;
};

export type SttProvider = {
  id: SttProviderId;
  label: string;
  deprecated?: boolean;
  isAvailable: () => Promise<boolean>;
  preload?: () => Promise<void>;
  transcribe: (audio: Blob, options?: SttOptions) => Promise<SttTranscript>;
};

