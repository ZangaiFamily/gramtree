import type { SttOptions, SttProvider, SttTranscript, SttWord } from "./types";

type TransformersModule = {
  env: {
    fetch: typeof fetch;
  };
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

type PipelineDevice = "webgpu" | "wasm";
type PipelineDtype = "q8" | "fp32";
type PipelineConfig = {
  device: PipelineDevice;
  dtype: PipelineDtype;
};

const modelId = "onnx-community/whisper-tiny.en";
const isEnglishOnlyModel = modelId.endsWith(".en");
const fetchTimeoutMs = 30_000;
const pipelineTimeoutMs = 60_000;
const transcriptionTimeoutMs = 45_000;
const cachedPipelines: Partial<Record<string, Promise<WhisperPipeline>>> = {};
let didConfigureTransformers = false;

function createTimeoutError(label: string, timeoutMs: number) {
  return new Error(`${label} 超时，请检查网络后重试。（${Math.round(timeoutMs / 1000)} 秒）`);
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs);
  });

  return Promise.race([task, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function importTransformers(): Promise<TransformersModule> {
  const transformers = await import("@huggingface/transformers") as TransformersModule;
  if (!didConfigureTransformers && typeof fetch !== "undefined" && typeof AbortController !== "undefined") {
    const baseFetch = transformers.env.fetch ?? fetch.bind(globalThis);
    transformers.env.fetch = async (input, init = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
      const externalSignal = init.signal;
      const abortFromExternalSignal = () => controller.abort();

      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
        }
      }

      try {
        return await baseFetch(input, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener("abort", abortFromExternalSignal);
      }
    };
    didConfigureTransformers = true;
  }
  return transformers;
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  const vendor = navigator.vendor || "";
  const isAppleVendor = vendor.includes("Apple");
  const notOtherBrowser = !userAgent.match(/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i) && !userAgent.includes("Chrome") && !userAgent.includes("Android");

  return isAppleVendor && notOtherBrowser;
}

function getPipelineCacheKey({ device, dtype }: PipelineConfig) {
  return `${device}:${dtype}`;
}

function getPreferredPipelineConfigs(): PipelineConfig[] {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || isSafariBrowser()) {
    return [{ device: "wasm", dtype: "fp32" }];
  }

  return [
    { device: "webgpu", dtype: "q8" },
    { device: "wasm", dtype: "fp32" },
  ];
}

function isWebGpuBackendError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("no available backend found") ||
    error.message.includes("[webgpu]") ||
    error.message.includes("webgpuInit") ||
    error.message.includes("Unsupported device: \"webgpu\"")
  );
}

async function loadPipeline(config: PipelineConfig) {
  const cacheKey = getPipelineCacheKey(config);

  if (!cachedPipelines[cacheKey]) {
    cachedPipelines[cacheKey] = withTimeout(
      importTransformers().then(({ pipeline }) =>
        pipeline("automatic-speech-recognition", modelId, {
          dtype: config.dtype,
          device: config.device,
        }),
      ),
      pipelineTimeoutMs,
      "TWP 模型加载",
    ).catch((error) => {
      delete cachedPipelines[cacheKey];
      throw error;
    });
  }
  return cachedPipelines[cacheKey];
}

function chunksToWords(chunks: WhisperChunk[] | undefined): SttWord[] {
  return (chunks ?? []).map((chunk) => ({
    text: chunk.text?.trim() ?? "",
    start: chunk.timestamp?.[0] ?? null,
    end: chunk.timestamp?.[1] ?? null,
  })).filter((word) => word.text.length > 0);
}

function isCrossAttentionTimestampError(error: unknown) {
  return error instanceof Error && error.message.includes("cross attentions");
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
    const [preferredConfig] = getPreferredPipelineConfigs();
    await loadPipeline(preferredConfig);
  },
  async transcribe(audio: Blob, options: SttOptions = {}): Promise<SttTranscript> {
    const startedAt = performance.now();
    const audioUrl = URL.createObjectURL(audio);

    try {
      const makeGenerationOptions = (returnWordTimestamps: boolean): Record<string, unknown> => {
        const generationOptions: Record<string, unknown> = {
          return_timestamps: returnWordTimestamps ? "word" : true,
        };

        if (!isEnglishOnlyModel) {
          generationOptions.language = options.language ?? "en";
        }

        return generationOptions;
      };

      let lastError: unknown = null;
      for (const config of getPreferredPipelineConfigs()) {
        const transcriber = await loadPipeline(config);

        try {
          const result = await withTimeout(
            transcriber(audioUrl, makeGenerationOptions(options.returnWordTimestamps === true)),
            transcriptionTimeoutMs,
            "TWP 录音识别",
          );

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
        } catch (error) {
          if (options.returnWordTimestamps && isCrossAttentionTimestampError(error)) {
            const result = await withTimeout(
              transcriber(audioUrl, makeGenerationOptions(false)),
              transcriptionTimeoutMs,
              "TWP 录音识别",
            );

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
          }

          lastError = error;
          if (config.device === "webgpu" && isWebGpuBackendError(error)) {
            delete cachedPipelines[getPipelineCacheKey(config)];
            continue;
          }

          throw error;
        }
      }

      throw lastError ?? new Error("TWP 录音识别失败。");
    } finally {
      URL.revokeObjectURL(audioUrl);
    }
  },
};
