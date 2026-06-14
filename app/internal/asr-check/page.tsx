"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  scoreReadAttempt,
  SpeechRecognitionProvider,
  TransformersWhisperProvider,
  type ReadScore,
  type SttTranscript,
} from "@/lib/stt";

type ProviderStatus = {
  transformers: "checking" | "available" | "missing";
  speechRecognition: "checking" | "available" | "missing";
};

const targetText = "practice makes perfect";

type PullStatus = "idle" | "loading" | "success" | "error";

export default function AsrCheckPage() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    transformers: "checking",
    speechRecognition: "checking",
  });
  const [pullStatus, setPullStatus] = useState<PullStatus>("idle");
  const [pullResult, setPullResult] = useState("尚未发起拉取。");
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [message, setMessage] = useState("录一段英文，验证纯前端 Whisper tiny STT。");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<SttTranscript | null>(null);
  const [score, setScore] = useState<ReadScore | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function checkProviders() {
      const [transformersAvailable, speechAvailable] = await Promise.all([
        TransformersWhisperProvider.isAvailable(),
        SpeechRecognitionProvider.isAvailable(),
      ]);

      if (cancelled) return;
      setProviderStatus({
        transformers: transformersAvailable ? "available" : "missing",
        speechRecognition: speechAvailable ? "available" : "missing",
      });
    }

    checkProviders();

    return () => {
      cancelled = true;
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      setRecordingUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, []);

  async function pullTransformersWhisper() {
    if (pullStatus === "loading") return;
    const startedAt = performance.now();
    setPullStatus("loading");
    setPullResult("正在拉取并初始化 TWP 模型资源...");

    try {
      await TransformersWhisperProvider.preload?.();
      const elapsedMs = Math.round(performance.now() - startedAt);
      setPullStatus("success");
      setPullResult(`拉取完成：${TransformersWhisperProvider.label} 已初始化，用时 ${elapsedMs}ms。`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setPullStatus("error");
      setPullResult(`拉取失败：${detail}`);
    }
  }

  async function startRecording() {
    if (isRecording || isRecognizing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("当前浏览器不支持麦克风录音。");
      return;
    }

    setTranscript(null);
    setScore(null);
    setMessage(`录音中，请读：${targetText}`);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const nextUrl = URL.createObjectURL(audio);
        setRecordingUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        transcribe(audio);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "UnknownError";
      setMessage(`麦克风录音失败：${errorName}。`);
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    setIsRecognizing(true);
    setMessage("正在用浏览器端 Whisper tiny 识别...");
    recorderRef.current?.stop();
  }

  async function transcribe(audio: Blob) {
    try {
      const result = await TransformersWhisperProvider.transcribe(audio, {
        language: "en",
        targetText,
        returnWordTimestamps: true,
      });
      setTranscript(result);
      setScore(scoreReadAttempt(result, targetText));
      setMessage("识别完成。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setMessage(`Transformers.js Whisper 识别失败：${detail}`);
    } finally {
      setIsRecognizing(false);
    }
  }

  const canRecord = !isRecognizing && providerStatus.transformers === "available";

  return (
    <main className="audioCheckPage">
      <nav className="internalToolMenu" aria-label="Internal tools">
        <Link href="/">Home</Link>
        <Link href="/internal">Internal</Link>
        <Link href="/internal/audio-check">Audio check</Link>
      </nav>

      <div className="asrPullPanel" aria-live="polite">
        <button
          type="button"
          className="audioCheckRunButton asrPullButton"
          disabled={pullStatus === "loading"}
          onClick={pullTransformersWhisper}
        >
          {pullStatus === "loading" ? "拉取中" : "拉取 TWP"}
        </button>
        <p className={`asrPullResult ${pullStatus}`}>{pullResult}</p>
      </div>

      <section className="audioCheckShell">
        <div className="audioStep">
          <p className="audioStepKicker">Internal · ASR provider spike</p>
          <span className="providerBadge twp" title="TransformersWhisperProvider">
            TWP
          </span>
          <h1>浏览器端 Whisper STT</h1>
          <p className="audioStepHint">
            目标句子：<strong>{targetText}</strong>
          </p>

          <div className="audioStageSummary">
            <div className={`audioStageCard ${providerStatus.transformers === "available" ? "ok" : "bad"}`}>
              <div className="audioStageHead">
                <strong>{TransformersWhisperProvider.label}</strong>
                <span>{providerStatus.transformers}</span>
              </div>
              <p className="audioStageOk">
                新方案 provider，使用 Transformers.js 加载 Whisper tiny。
              </p>
            </div>

            <div className={`audioStageCard ${providerStatus.speechRecognition === "available" ? "ok" : "bad"}`}>
              <div className="audioStageHead">
                <strong>{SpeechRecognitionProvider.label}</strong>
                <span>{providerStatus.speechRecognition}</span>
              </div>
              <p className="audioStageOk">
                Deprecated fallback：保留旧浏览器原生识别方案，但新代码不优先依赖。
              </p>
            </div>
          </div>

          <button
            type="button"
            className={`holdToReadButton audioCheckMicButton ${isRecording ? "recording" : ""}`}
            disabled={!canRecord && !isRecording}
            onPointerDown={(event) => {
              event.preventDefault();
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            aria-label={isRecording ? "结束录音并识别" : "开始录音"}
            aria-pressed={isRecording}
          >
            <svg className="micIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 14.25c1.66 0 3-1.34 3-3V6.75c0-1.66-1.34-3-3-3s-3 1.34-3 3v4.5c0 1.66 1.34 3 3 3Z" />
              <path d="M17.5 10.75v.5a5.5 5.5 0 0 1-11 0v-.5" />
              <path d="M12 16.75v3.5" />
              <path d="M8.75 20.25h6.5" />
            </svg>
          </button>

          <p className="audioCheckMessage">{message}</p>

          {recordingUrl ? (
            <div className="recordingPlayback audioCheckPlayback">
              <span>你的录音</span>
              <audio controls src={recordingUrl} />
            </div>
          ) : null}

          {transcript ? (
            <div className="audioStageSummary">
              <div className="audioStageCard ok">
                <div className="audioStageHead">
                  <strong>Transcript</strong>
                  <span>{Math.round(transcript.elapsedMs ?? 0)}ms</span>
                </div>
                <p className="audioStageOk">{transcript.text || "（空）"}</p>
              </div>

              {score ? (
                <div className="audioStageCard ok">
                  <div className="audioStageHead">
                    <strong>Word-level score</strong>
                    <span>{score.result}</span>
                  </div>
                  <p className="audioStageOk">
                    completeness {Math.round(score.completeness * 100)}% · accuracy{" "}
                    {Math.round(score.wordAccuracy * 100)}%
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
