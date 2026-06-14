import type { SttOptions, SttProvider, SttTranscript, SttWord } from "./types";

type WhisperChunk = {
  text?: string;
  timestamp?: [number | null, number | null];
};

type WhisperResult = {
  text?: string;
  chunks?: WhisperChunk[];
};

type WorkerTranscribeResponse = {
  text: string;
  chunks?: WhisperChunk[];
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
  | { id: number; type: "success"; result?: WorkerTranscribeResponse }
  | { id: number; type: "error"; error: string };

const modelId = "onnx-community/whisper-tiny.en";
const workerTimeoutMs = 75_000;
const targetSampleRate = 16_000;
let workerInstance: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, {
  resolve: (result: WorkerTranscribeResponse | undefined) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}>();

function createTimeoutError(label: string, timeoutMs: number) {
  return new Error(`${label} 超时，请检查网络后重试。（${Math.round(timeoutMs / 1000)} 秒）`);
}

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("./transformersWhisperWorker.ts", import.meta.url), {
      type: "module",
    });

    workerInstance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = pendingRequests.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      pendingRequests.delete(response.id);

      if (response.type === "error") {
        pending.reject(new Error(response.error));
        return;
      }

      pending.resolve(response.result);
    };

    workerInstance.onerror = (event) => {
      const error = new Error(event.message || "TWP worker failed.");
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
        pendingRequests.delete(id);
      }
      workerInstance?.terminate();
      workerInstance = null;
    };
  }

  return workerInstance;
}

function postWorkerRequest(request: WorkerRequest, transfer?: Transferable[]) {
  const worker = getWorker();

  return new Promise<WorkerTranscribeResponse | undefined>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(request.id);
      reject(createTimeoutError("TWP worker", workerTimeoutMs));
    }, workerTimeoutMs);

    pendingRequests.set(request.id, { resolve, reject, timeoutId });
    worker.postMessage(request, transfer ?? []);
  });
}

function chunksToWords(chunks: WhisperChunk[] | undefined): SttWord[] {
  return (chunks ?? []).map((chunk) => ({
    text: chunk.text?.trim() ?? "",
    start: chunk.timestamp?.[0] ?? null,
    end: chunk.timestamp?.[1] ?? null,
  })).filter((word) => word.text.length > 0);
}

function mixToMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / buffer.numberOfChannels;
    }
  }

  return mono;
}

function resampleLinear(input: Float32Array, sourceSampleRate: number, nextSampleRate: number) {
  if (sourceSampleRate === nextSampleRate) return input;

  const ratio = sourceSampleRate / nextSampleRate;
  const nextLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(nextLength);

  for (let index = 0; index < nextLength; index += 1) {
    const sourceIndex = index * ratio;
    const before = Math.floor(sourceIndex);
    const after = Math.min(before + 1, input.length - 1);
    const weight = sourceIndex - before;
    output[index] = input[before] * (1 - weight) + input[after] * weight;
  }

  return output;
}

async function decodeAudioBlob(audio: Blob) {
  const AudioContextConstructor = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("当前浏览器不支持 AudioContext。");
  }

  const audioContext = new AudioContextConstructor();
  try {
    const arrayBuffer = await audio.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return resampleLinear(mixToMono(audioBuffer), audioBuffer.sampleRate, targetSampleRate);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export const TransformersWhisperProvider: SttProvider = {
  id: "transformers-whisper",
  label: "Transformers.js Whisper Tiny",
  async isAvailable() {
    return typeof window !== "undefined" && typeof Worker !== "undefined";
  },
  async preload() {
    await postWorkerRequest({ id: ++requestId, type: "preload" });
  },
  async transcribe(audio: Blob, options: SttOptions = {}): Promise<SttTranscript> {
    const startedAt = performance.now();
    const audioData = await decodeAudioBlob(audio);
    const result = await postWorkerRequest({
      id: ++requestId,
      type: "transcribe",
      audioData,
      options,
    }, [audioData.buffer]);

    const text = result?.text?.trim() ?? "";

    return {
      text,
      words: result?.chunks?.length
        ? chunksToWords(result.chunks)
        : text.split(/\s+/).filter(Boolean).map((word) => ({ text: word, start: null, end: null })),
      provider: "transformers-whisper",
      model: modelId,
      elapsedMs: performance.now() - startedAt,
    };
  },
};
