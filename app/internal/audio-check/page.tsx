"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { speakText } from "@/lib/speech";
import { createSpeechRecognitionSession, type SpeechRecognitionSession } from "@/lib/stt";

type TestStatus = "idle" | "running" | "passed" | "failed" | "blocked";

type TestResult = {
  id: string;
  name: string;
  status: TestStatus;
  points: number;
  detail: string;
};

const targetWord = "practice";

const stages: { id: string; name: string; testIds: string[] }[] = [
  { id: "stage-audio", name: "第一阶段 · 标准发音", testIds: ["standard-audio"] },
  {
    id: "stage-speech",
    name: "第二阶段 · 录音与识别",
    testIds: ["microphone-recording", "speech-recognition", "recording-playback"],
  },
];

const initialResults: TestResult[] = [
  {
    id: "standard-audio",
    name: "标准发音播放",
    status: "idle",
    points: 0,
    detail: "点击播放标准发音。",
  },
  {
    id: "microphone-recording",
    name: "麦克风录音",
    status: "idle",
    points: 0,
    detail: "按住麦克风按钮跟读单词。",
  },
  {
    id: "speech-recognition",
    name: "语音识别",
    status: "idle",
    points: 0,
    detail: "松开按钮后开始识别。",
  },
  {
    id: "recording-playback",
    name: "录音回放",
    status: "idle",
    points: 0,
    detail: "录音结束后会出现回放控件。",
  },
];

function normalizeSpeech(value: string) {
  return value.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
}

export default function AudioCheckPage() {
  const router = useRouter();
  const [fromPractice, setFromPractice] = useState(false);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<TestResult[]>(initialResults);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("按照手机端跟读练习的流程操作。");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromPractice(params.get("next") === "practice");
  }, []);

  const problems = results.filter(
    (result) => result.status === "failed" || result.status === "blocked",
  );
  const score = results.reduce((sum, result) => sum + result.points, 0);
  const usable = problems.length === 0;

  const statusOf = (id: string) =>
    results.find((result) => result.id === id)?.status ?? "idle";
  const isTested = (status: TestStatus) => status !== "idle" && status !== "running";
  const standardAudioTested = isTested(statusOf("standard-audio"));
  const recordingTested =
    isTested(statusOf("microphone-recording")) && isTested(statusOf("speech-recognition"));

  function updateResult(id: string, patch: Partial<TestResult>) {
    setResults((current) =>
      current.map((result) => (result.id === id ? { ...result, ...patch } : result)),
    );
  }

  function restart() {
    setRecordingUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setResults(initialResults);
    setRecognizedText("");
    transcriptRef.current = "";
    setMessage("按照手机端跟读练习的流程操作。");
    setStep(0);
  }

  function playStandardAudio() {
    const started = speakText(targetWord, {
      onStart: () => {
        updateResult("standard-audio", {
          status: "passed",
          points: 25,
          detail: "标准发音已成功播放。",
        });
      },
      onError: () => {
        updateResult("standard-audio", {
          status: "failed",
          points: 0,
          detail: "浏览器无法播放标准发音。",
        });
      },
    });

    if (!started) {
      updateResult("standard-audio", {
        status: "failed",
        points: 0,
        detail: "当前浏览器不支持 speechSynthesis。",
      });
    }
  }

  async function startRecording() {
    if (isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      updateResult("microphone-recording", {
        status: "failed",
        points: 0,
        detail: "当前浏览器不支持 getUserMedia。",
      });
      return;
    }

    setRecognizedText("");
    transcriptRef.current = "";
    setMessage("录音中，请跟读：practice");
    updateResult("microphone-recording", {
      status: "running",
      points: 0,
      detail: "正在请求麦克风并录音。",
    });
    updateResult("speech-recognition", {
      status: "running",
      points: 0,
      detail: "等待语音识别结果。",
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const nextUrl = URL.createObjectURL(blob);
        setRecordingUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        updateResult("microphone-recording", {
          status: "passed",
          points: 25,
          detail: "已成功录下你的语音。",
        });
        updateResult("recording-playback", {
          status: "passed",
          points: 25,
          detail: "录音可以正常回放。",
        });
      };

      const recognition = createSpeechRecognitionSession({
        language: "en",
        onTranscript: (transcript) => {
          transcriptRef.current = transcript;
          setRecognizedText(transcriptRef.current);
        },
        onError: () => {
          updateResult("speech-recognition", {
            status: "failed",
            points: 0,
            detail: "跟读过程中语音识别失败。",
          });
        },
        onEnd: (transcript) => {
          transcriptRef.current = transcript.trim();
          const normalized = normalizeSpeech(transcriptRef.current);
          const matched = normalized.split(" ").includes(targetWord);
          updateResult("speech-recognition", {
            status: matched ? "passed" : "failed",
            points: matched ? 25 : 0,
            detail: matched
              ? `识别到「${transcriptRef.current}」。`
              : `听到「${transcriptRef.current || "（无）"}」，期望是「${targetWord}」。`,
          });
          setMessage(matched ? "测试通过，当前浏览器可以进行跟读练习。" : "识别结果不匹配，请再试一次。");
          recognitionRef.current = null;
        },
      });

      if (!recognition) {
        updateResult("speech-recognition", {
          status: "failed",
          points: 0,
          detail: "当前浏览器不支持 SpeechRecognition。",
        });
      } else {
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
          updateResult("speech-recognition", {
            status: "failed",
            points: 0,
            detail: "当前浏览器无法启动 SpeechRecognition。",
          });
        }
      }

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "UnknownError";
      updateResult("microphone-recording", {
        status: errorName === "NotAllowedError" ? "blocked" : "failed",
        points: 0,
        detail: `麦克风录音失败：${errorName}。`,
      });
      setMessage("该测试需要麦克风权限。");
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
  }

  return (
    <main className="audioCheckPage">
      <div className="audioCheckShell">
        <div className="audioStepDots" aria-hidden="true">
          <span className={step === 0 ? "active" : step > 0 ? "done" : ""} />
          <span className={step === 1 ? "active" : step > 1 ? "done" : ""} />
          <span className={step === 2 ? "active" : ""} />
        </div>

        {step === 0 ? (
          <section className="audioStep">
            <p className="audioStepKicker">第 1 步 / 共 2 步</p>
            <h1>播放标准发音</h1>
            <p className="audioStepHint">
              点击下方按钮，听一听 <strong>practice</strong> 的标准发音。
            </p>
            <div className="audioTestWord">
              <span>/practice/</span>
              <strong>{targetWord}</strong>
            </div>
            <button type="button" className="audioCheckRunButton" onClick={playStandardAudio}>
              播放标准发音
            </button>
            <p className="audioCheckMessage">{message}</p>
            <nav className="audioStepNav">
              <Link href="/" className="audioCheckBack">
                退出
              </Link>
              <button
                type="button"
                className="audioStepNext"
                onClick={() => setStep(1)}
                disabled={!standardAudioTested}
                title={standardAudioTested ? undefined : "请先播放标准发音。"}
              >
                下一步
              </button>
            </nav>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="audioStep">
            <p className="audioStepKicker">第 2 步 / 共 2 步</p>
            <span className="providerBadge srp" title="SpeechRecognitionProvider">
              SRP
            </span>
            <h1>按住跟读</h1>
            <p className="audioStepHint">
              按住麦克风，跟读 <strong>practice</strong>，读完后松开。
            </p>
            <button
              type="button"
              className={`holdToReadButton audioCheckMicButton ${isRecording ? "recording" : ""}`}
              onPointerDown={(event) => {
                event.preventDefault();
                startRecording();
              }}
              onPointerUp={stopRecording}
              onPointerCancel={stopRecording}
              onPointerLeave={stopRecording}
              aria-label={isRecording ? "松开结束跟读" : "按住开始跟读"}
            >
              <svg className="micIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14.25c1.66 0 3-1.34 3-3V6.75c0-1.66-1.34-3-3-3s-3 1.34-3 3v4.5c0 1.66 1.34 3 3 3Z" />
                <path d="M17.5 10.75v.5a5.5 5.5 0 0 1-11 0v-.5" />
                <path d="M12 16.75v3.5" />
                <path d="M8.75 20.25h6.5" />
              </svg>
            </button>
            <p className="audioCheckMessage">{message}</p>
            {recognizedText ? (
              <p className="recognizedText">
                听到：<strong>{recognizedText}</strong>
              </p>
            ) : null}
            {recordingUrl ? (
              <div className="recordingPlayback audioCheckPlayback">
                <span>你的录音</span>
                <audio controls src={recordingUrl} />
              </div>
            ) : null}
            <nav className="audioStepNav">
              <button type="button" className="audioStepBack" onClick={() => setStep(0)}>
                上一步
              </button>
              <button
                type="button"
                className="audioStepNext"
                onClick={() => setStep(2)}
                disabled={!recordingTested}
                title={recordingTested ? undefined : "请先录音并跟读单词。"}
              >
                查看结果
              </button>
            </nav>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="audioStep audioStepResult">
            <p className="audioStepKicker">测试结果</p>

            <div className="audioScore">
              <strong>{score}</strong>
              <span>/ 100</span>
            </div>
            <p className={`audioVerdict ${usable ? "ok" : "bad"}`}>
              {usable
                ? "可用：当前浏览器可以进行跟读练习。"
                : `不可用：还有 ${problems.length} 个问题需要解决。`}
            </p>

            <div className="audioStageSummary">
              {stages.map((stage) => {
                const stageProblems = problems.filter((problem) =>
                  stage.testIds.includes(problem.id),
                );
                return (
                  <div
                    className={`audioStageCard ${stageProblems.length ? "bad" : "ok"}`}
                    key={stage.id}
                  >
                    <div className="audioStageHead">
                      <strong>{stage.name}</strong>
                      <span>
                        {stageProblems.length
                          ? `${stageProblems.length} 个问题`
                          : "通过"}
                      </span>
                    </div>
                    {stageProblems.length ? (
                      <ul>
                        {stageProblems.map((problem) => (
                          <li key={problem.id}>
                            <strong>{problem.name}</strong>
                            <span>{problem.detail}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="audioStageOk">未发现问题。</p>
                    )}
                  </div>
                );
              })}
            </div>
            <nav className="audioStepNav">
              <Link href="/" className="audioCheckBack">
                退出
              </Link>
              <button
                type="button"
                className={fromPractice ? "audioStepBack" : "audioStepNext"}
                onClick={restart}
              >
                重新测试
              </button>
              {fromPractice ? (
                <button
                  type="button"
                  className="audioStepNext"
                  onClick={() => router.push("/?practice=read")}
                >
                  进入单词卡片
                </button>
              ) : null}
            </nav>
          </section>
        ) : null}
      </div>
    </main>
  );
}
