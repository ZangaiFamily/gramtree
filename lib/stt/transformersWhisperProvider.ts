import type { SttOptions, SttProvider, SttTranscript, SttWord } from "./types";

type TransformersModule = {
  pipeline: (
    task: "automatic-speech-recognition",
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<WhisperPipeline>;
};

type WhisperChunk = {
  text?: string;
  timestamp?: [number | null, number | null];
};

type WhisperResult = {
  text?: string;
  chunks?: WhisperChunk[];
};

type WhisperPipeline = (
  input: string | Float32Array,
  options?: Record<string, unknown>,
) => Promise<string | WhisperResult>;

const modelId = "onnx-community/whisper-tiny.en";
let cachedPipeline: Promise<WhisperPipeline> | null = null;

async function importTransformers(): Promise<TransformersModule> {
  return import("@huggingface/transformers") as Promise<TransformersModule>;
}

async function loadPipeline() {
  if (!cachedPipeline) {
    cachedPipeline = importTransformers().then(({ pipeline }) =>
      pipeline("automatic-speech-recognition", modelId, {
        dtype: "q8",
        device: typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm",
      }),
    );
  }
  return cachedPipeline;
}

function chunksToWords(chunks: WhisperChunk[] | undefined): SttWord[] {
  return (chunks ?? []).map((chunk) => ({
    text: chunk.text?.trim() ?? "",
    start: chunk.timestamp?.[0] ?? null,
    end: chunk.timestamp?.[1] ?? null,
  })).filter((word) => word.text.length > 0);
}

export const TransformersWhisperProvider: SttProvider = {
  id: "transformers-whisper",
  label: "Transformers.js Whisper Tiny",
  async isAvailable() {
    if (typeof window === "undefined") return false;
    try {
      await importTransformers();
      return true;
    } catch {
      return false;
    }
  },
  async preload() {
    await loadPipeline();
  },
  async transcribe(audio: Blob, options: SttOptions = {}): Promise<SttTranscript> {
    const startedAt = performance.now();
    const transcriber = await loadPipeline();
    const audioUrl = URL.createObjectURL(audio);

    try {
      const result = await transcriber(audioUrl, {
        language: options.language ?? "en",
        return_timestamps: options.returnWordTimestamps ? "word" : true,
      });

      if (typeof result === "string") {
        return {
          text: result,
          words: result.split(/\s+/).map((word) => ({ text: word, start: null, end: null })),
          provider: "transformers-whisper",
          model: modelId,
          elapsedMs: performance.now() - startedAt,
        };
      }

      return {
        text: result.text?.trim() ?? "",
        words: chunksToWords(result.chunks),
        provider: "transformers-whisper",
        model: modelId,
        elapsedMs: performance.now() - startedAt,
      };
    } finally {
      URL.revokeObjectURL(audioUrl);
    }
  },
};
