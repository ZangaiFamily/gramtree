import type { SttOptions } from "./types";

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
  input: Float32Array,
  options?: Record<string, unknown>,
) => Promise<string | WhisperResult>;

type PipelineDevice = "webgpu" | "wasm";
type PipelineDtype = "q8" | "int8" | "uint8" | "fp32";
type PipelineConfig = {
  device: PipelineDevice;
  dtype: PipelineDtype;
};

type WorkerRequest =
  | { id: number; type: "preload" }
  | {
      id: number;
      type: "transcribe";
      audioData: Float32Array;
      options: SttOptions;
    };

type WorkerResponse =
  | { id: number; type: "success"; result?: { text: string; chunks?: WhisperChunk[] } }
  | { id: number; type: "error"; error: string };

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
    return [
      { device: "wasm", dtype: "int8" },
      { device: "wasm", dtype: "uint8" },
      { device: "wasm", dtype: "fp32" },
    ];
  }

  return [
    { device: "webgpu", dtype: "q8" },
    { device: "wasm", dtype: "int8" },
    { device: "wasm", dtype: "uint8" },
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

function isPipelineLoadFallbackError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Can't create a session") ||
    error.message.includes("Missing required scale") ||
    error.message.includes("no available backend found") ||
    error.message.includes("Unsupported device") ||
    error.message.includes("not found") ||
    error.message.includes("404")
  );
}

function isCrossAttentionTimestampError(error: unknown) {
  return error instanceof Error && error.message.includes("cross attentions");
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

function makeGenerationOptions(options: SttOptions, returnWordTimestamps: boolean): Record<string, unknown> {
  const generationOptions: Record<string, unknown> = {
    return_timestamps: returnWordTimestamps ? "word" : true,
  };

  if (!isEnglishOnlyModel) {
    generationOptions.language = options.language ?? "en";
  }

  return generationOptions;
}

async function transcribe(audioData: Float32Array, options: SttOptions) {
  let lastError: unknown = null;

  for (const config of getPreferredPipelineConfigs()) {
    let transcriber: WhisperPipeline;

    try {
      transcriber = await loadPipeline(config);
    } catch (error) {
      lastError = error;
      if (isPipelineLoadFallbackError(error)) {
        delete cachedPipelines[getPipelineCacheKey(config)];
        continue;
      }
      throw error;
    }

    try {
      const result = await withTimeout(
        transcriber(audioData, makeGenerationOptions(options, options.returnWordTimestamps === true)),
        transcriptionTimeoutMs,
        "TWP 录音识别",
      );

      return typeof result === "string" ? { text: result } : {
        text: result.text?.trim() ?? "",
        chunks: result.chunks,
      };
    } catch (error) {
      if (options.returnWordTimestamps && isCrossAttentionTimestampError(error)) {
        const result = await withTimeout(
          transcriber(audioData, makeGenerationOptions(options, false)),
          transcriptionTimeoutMs,
          "TWP 录音识别",
        );

        return typeof result === "string" ? { text: result } : {
          text: result.text?.trim() ?? "",
          chunks: result.chunks,
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
}

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === "preload") {
      const [preferredConfig] = getPreferredPipelineConfigs();
      await loadPipeline(preferredConfig);
      postResponse({ id: request.id, type: "success" });
      return;
    }

    const result = await transcribe(request.audioData, request.options);
    postResponse({ id: request.id, type: "success", result });
  } catch (error) {
    postResponse({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export {};
