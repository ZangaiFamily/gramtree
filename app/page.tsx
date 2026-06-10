"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type Token = {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  chinese: string;
  fillTone: string;
  underlineTone: string;
};

type Stage = {
  answer: string;
  chinese: string;
  tokenIndexes: number[];
};

type PracticeStats = {
  startedAt: number;
  finishedAt: number | null;
  answered: number;
  perfect: number;
  good: number;
  skipped: number;
  mistakes: number;
  currentStreak: number;
  maxStreak: number;
  attemptsByStage: number[];
  revealedByStage: boolean[];
};

const tokens: Token[] = [
  {
    word: "The",
    phonetic: "/ðə/",
    partOfSpeech: "限定词",
    chinese: "（定冠词）",
    fillTone: "tokenFillPhrase",
    underlineTone: "tokenUnderlineDeterminer",
  },
  {
    word: "gramtree",
    phonetic: "/ˈgræm triː/",
    partOfSpeech: "名词",
    chinese: "语法树",
    fillTone: "tokenFillPhrase",
    underlineTone: "tokenUnderlineNoun",
  },
];

const stages: Stage[] = [
  { answer: "The", chinese: "（定冠词）", tokenIndexes: [0] },
  { answer: "gramtree", chinese: "语法树", tokenIndexes: [1] },
  { answer: "The gramtree", chinese: "语法树", tokenIndexes: [0, 1] },
];

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createPracticeStats(): PracticeStats {
  return {
    startedAt: Date.now(),
    finishedAt: null,
    answered: 0,
    perfect: 0,
    good: 0,
    skipped: 0,
    mistakes: 0,
    currentStreak: 0,
    maxStreak: 0,
    attemptsByStage: Array.from({ length: stages.length }, () => 0),
    revealedByStage: Array.from({ length: stages.length }, () => false),
  };
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}分${seconds}秒`;
}

let _speechRequestId = 0;

function speakWord(text: string) {
  if (!("speechSynthesis" in window)) return;
  const requestId = ++_speechRequestId;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return false;
    const usVoice = voices.find((v) => /en-US/.test(v.lang) && /(Google|Microsoft|Samantha)/.test(v.name))
      ?? voices.find((v) => /en-US/.test(v.lang));
    if (usVoice) utterance.voice = usVoice;
    return true;
  };
  const speak = () => {
    if (requestId !== _speechRequestId) return;
    window.speechSynthesis.cancel();
    requestAnimationFrame(() => {
      if (requestId !== _speechRequestId) return;
      window.speechSynthesis.speak(utterance);
    });
  };
  if (!pickVoice()) {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      if (requestId !== _speechRequestId) return;
      pickVoice();
      speak();
    }, { once: true });
  } else {
    speak();
  }
}

let _audioCtx: AudioContext | null = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function playKeyClick() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    [250, 650, 1200].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    });
  } catch { /* audio not available */ }
}

function playSuccessChime() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.045;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch { /* audio not available */ }
}

function TokenBuilder({
  className = "",
  selectedTokens = tokens,
  translation = "语法树",
  enableWordSpeech = true,
}: {
  className?: string;
  selectedTokens?: Token[];
  translation?: string;
  enableWordSpeech?: boolean;
}) {
  return (
    <section className={`wordInspector homeWordInspector ${className}`} aria-label="gramtree sentence builder">
      <div className="builderPrompt">按任意键，开始造这个句子</div>
      <div className="wordStrip homeWordStrip">
        {selectedTokens.map((token) => (
          <div
            className="builderToken homeBuilderToken"
            key={token.word}
            onClick={enableWordSpeech ? () => speakWord(token.word) : undefined}
          >
            <span className="phoneticBadge homePhoneticBadge">{token.phonetic}</span>
            <span className="wordBubbleStack">
              <span className={`wordBlock homeWordBlock ${token.fillTone}`}>
                <span className="wordText homeWordText">{token.word}</span>
              </span>
              <span className={`grammarUnderline ${token.underlineTone}`} />
            </span>
            <span className="partOfSpeechPill homePartOfSpeechPill">{token.partOfSpeech}</span>
            <span className="chineseGloss homeChineseGloss">{token.chinese}</span>
          </div>
        ))}
      </div>
      <p className="sentenceTranslation homeSentenceTranslation">
        {translation}
      </p>
    </section>
  );
}

export default function Home() {
  const [isPractice, setIsPractice] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [wordInputs, setWordInputs] = useState<string[]>([]);
  const [activeInputIndex, setActiveInputIndex] = useState(0);
  const [status, setStatus] = useState<"typing" | "success" | "error">("typing");
  const [score, setScore] = useState(0);
  const [stats, setStats] = useState<PracticeStats>(() => createPracticeStats());
  const [showResultModal, setShowResultModal] = useState(false);
  const [perfectStreak, setPerfectStreak] = useState<number | null>(null);

  const stage = stages[stageIndex];
  const stageWords = useMemo(() => stage.answer.split(" "), [stage.answer]);
  const submittedAnswer = wordInputs.join(" ");
  const revealedTokens = useMemo(
    () => stage.tokenIndexes.map((index) => tokens[index]),
    [stage.tokenIndexes],
  );

  function startPractice() {
    if (_audioCtx?.state === "suspended") _audioCtx.resume();
    const speechRequestId = ++_speechRequestId;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setStats(createPracticeStats());
    setShowResultModal(false);
    setIsPractice(true);
    setStageIndex(0);
    setWordInputs(Array.from({ length: stages[0].answer.split(" ").length }, () => ""));
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setTimeout(() => {
      if (speechRequestId !== _speechRequestId) return;
      speakWord(stages[0].answer);
    }, 200);
  }

  function openResultModal() {
    setStats((current) => ({
      ...current,
      finishedAt: current.finishedAt ?? Date.now(),
    }));
    window.setTimeout(() => setShowResultModal(true), 650);
  }

  function advanceStage() {
    if (stageIndex < stages.length - 1) {
      const nextStageIndex = stageIndex + 1;
      setStageIndex(nextStageIndex);
      setWordInputs(Array.from({ length: stages[nextStageIndex].answer.split(" ").length }, () => ""));
      setActiveInputIndex(0);
      setStatus("typing");
    } else {
      setStatus("success");
      openResultModal();
    }
  }

  function submitStage() {
    if (normalizeInput(submittedAnswer) === normalizeInput(stage.answer)) {
      playSuccessChime();
      const wasPerfect = stats.attemptsByStage[stageIndex] === 0 && !stats.revealedByStage[stageIndex];
      if (wasPerfect) {
        const nextStreak = stats.currentStreak + 1;
        setPerfectStreak(nextStreak);
        window.setTimeout(() => setPerfectStreak(null), 1000);
      }
      const points = wasPerfect ? 1000 : 720;
      setScore((current) => current + points);
      setStats((current) => {
        const nextStreak = current.currentStreak + 1;
        return {
          ...current,
          answered: current.answered + 1,
          perfect: current.perfect + (wasPerfect ? 1 : 0),
          good: current.good + (wasPerfect ? 0 : 1),
          currentStreak: nextStreak,
          maxStreak: Math.max(current.maxStreak, nextStreak),
        };
      });
      setStatus("success");
      if (stageIndex === stages.length - 1) {
        openResultModal();
      }
      return;
    }

    setStats((current) => ({
      ...current,
      mistakes: current.mistakes + 1,
      currentStreak: 0,
      attemptsByStage: current.attemptsByStage.map((attempts, index) =>
        index === stageIndex ? attempts + 1 : attempts,
      ),
    }));
    setStatus("error");
    window.setTimeout(() => {
      setWordInputs(Array.from({ length: stageWords.length }, () => ""));
      setActiveInputIndex(0);
      setStatus("typing");
    }, 300);
  }

  function playPronunciation() {
    speakWord(stage.answer);
  }

  function showAnswer() {
    setStats((current) => {
      if (current.revealedByStage[stageIndex]) return current;

      return {
        ...current,
        skipped: current.skipped + 1,
        currentStreak: 0,
        revealedByStage: current.revealedByStage.map((isRevealed, index) =>
          index === stageIndex ? true : isRevealed,
        ),
      };
    });
    setWordInputs(stageWords);
    setActiveInputIndex(stageWords.length - 1);
    setStatus("typing");
  }

  function handleSubmitClick() {
    if (status === "success") {
      advanceStage();
      return;
    }

    submitStage();
  }

  useEffect(() => {
    if (!isPractice) return;

    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "'") {
        event.preventDefault();
        playPronunciation();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === ";") {
        event.preventDefault();
        showAnswer();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        if (showResultModal) {
          setShowResultModal(false);
        } else {
          setIsPractice(false);
        }
        return;
      }

      if (status === "success") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          advanceStage();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitStage();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        playKeyClick();
        setWordInputs((current) =>
          current.map((value, index) =>
            index === activeInputIndex ? value.slice(0, -1) : value,
          ),
        );
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        if (wordInputs[activeInputIndex]?.length && activeInputIndex < stageWords.length - 1) {
          setActiveInputIndex((current) => current + 1);
        }
        return;
      }

      if (event.key.length === 1 && /^[a-zA-Z']$/.test(event.key)) {
        playKeyClick();
        setWordInputs((current) =>
          current.map((value, index) =>
            index === activeInputIndex ? `${value}${event.key}` : value,
          ),
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeInputIndex, isPractice, showResultModal, stage.answer, stageIndex, stageWords, stats.attemptsByStage, stats.revealedByStage, status, submittedAnswer, wordInputs]);

  const finishedAt = stats.finishedAt ?? Date.now();
  const duration = formatDuration(finishedAt - stats.startedAt);
  const grade = score >= 8500 ? "S" : score >= 7000 ? "A" : score >= 5200 ? "B" : "C";

  const snowflakes = useMemo(() => {
    return Array.from({ length: 45 }).map((_, i) => ({
      left: (i * 2.3 + 1.7 * (i % 7)) % 100,
      size: 4 + (i % 5) * 2,
      duration: 5 + (i % 6),
      delay: (i * -0.3) % 8,
      drift: (i % 7 - 3) * 12,
      opacity: 0.35 + (i % 4) * 0.15,
    }));
  }, [showResultModal]);

  return (
    <main className={`gramtreeHome ${isPractice ? "practiceHome" : ""}`}>
      {!isPractice && (<>
      <Link
        href="/internal"
        className="internalLink"
        aria-label="Open internal grammar diagram page"
      >
        Internal
      </Link>

      <a
        className="githubCorner"
        href="https://github.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
        style={{ left: 20, right: 'auto' }}
      >
        <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
      </>)}

      {!isPractice ? (
        <div
          className="homeBuilderButton"
          role="button"
          tabIndex={0}
          onClick={startPractice}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startPractice();
            }
          }}
        >
          <TokenBuilder enableWordSpeech={false} />
        </div>
      ) : (
        <section className="practiceShell" aria-label="Keyboard sentence practice">
          <div className="practiceTopBar">
            <strong>
              用键盘输入英文，按 Tab 切换单词（{stageIndex + 1}/{stages.length}）
            </strong>
            <span>{score}</span>
          </div>
          <div className="practiceProgress" aria-hidden="true">
            <span style={{ width: `${((stageIndex + (status === "success" ? 1 : 0)) / stages.length) * 100}%` }} />
          </div>

          <div className="practiceCenter">
            {perfectStreak !== null && (
              <div className="perfectStreak" key={perfectStreak}>
                perfect ✕ {perfectStreak}
              </div>
            )}
            {status === "success" ? (
              <TokenBuilder className="practiceResult" selectedTokens={revealedTokens} translation={stage.chinese} />
            ) : (
              <div className={`practiceInputStage ${status === "error" ? "inputError" : ""}`}>
                <h1>{stage.chinese}</h1>
                <p className="practiceTypingHint">在键盘上输入</p>
                <div className="practiceWordInputs" aria-label="Word input slots">
                  {stageWords.map((word, index) => (
                    <div
                      className={`practiceWordInput ${index === activeInputIndex ? "activeWordInput" : ""}`}
                      key={`${word}-${index}`}
                      onClick={() => setActiveInputIndex(index)}
                    >
                      <span>{wordInputs[index]}</span>
                      <i aria-hidden="true" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="practiceShortcuts" aria-label="Keyboard shortcuts">
            <button type="button" onClick={playPronunciation}>
              <kbd>Ctrl</kbd><kbd>&apos;</kbd> 播放发音
            </button>
            <button type="button" onClick={handleSubmitClick}>
              <kbd>Enter</kbd> {status === "success" ? "继续" : "提交"}
            </button>
            <button type="button" onClick={showAnswer}>
              <kbd>Ctrl</kbd><kbd>;</kbd> 显示答案
            </button>
          </div>

          {showResultModal ? (
            <div className="resultOverlay" role="dialog" aria-modal="true" aria-label="练习结果">
              <section className="resultModal">
                <header className="resultHeader">
                  <span>🎉</span>
                  <strong>太强了！</strong>
                </header>
                <div className="resultScoreRow">
                  <div>
                    <strong className="resultGrade">{grade}</strong>
                    <span className="resultScore">/{score.toLocaleString()}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>{stats.perfect}</dt>
                      <dd>完美</dd>
                    </div>
                    <div>
                      <dt>{stats.good}</dt>
                      <dd>很好</dd>
                    </div>
                    <div>
                      <dt>{stats.skipped}</dt>
                      <dd>跳过</dd>
                    </div>
                  </dl>
                </div>
                <div className="resultStatsGrid">
                  <div>
                    <span>练习时长</span>
                    <strong>{duration}</strong>
                  </div>
                  <div>
                    <span>答题数</span>
                    <strong>{stats.answered}</strong>
                  </div>
                  <div>
                    <span>最大连击 🔥</span>
                    <strong>{stats.maxStreak}</strong>
                  </div>
                </div>
                <div className="resultMessage">
                  <strong>刷着刷着就记住了，这就是 gramtree 的学习方式</strong>
                  <span>每次进入测试都会重新统计本轮数据</span>
                </div>
                <footer className="resultActions">
                  <button type="button" className="secondaryResultButton" onClick={startPractice}>
                    再来一次
                  </button>
                  <button type="button" className="primaryResultButton" onClick={startPractice}>
                    免费体验
                  </button>
                </footer>
              </section>
              <div className="snowLayer" aria-hidden="true">
                {snowflakes.map((s, i) => (
                  <i key={i} style={{
                    '--left': `${s.left}%`,
                    '--size': `${s.size}px`,
                    '--duration': `${s.duration}s`,
                    '--delay': `${s.delay}s`,
                    '--drift': `${s.drift}px`,
                    '--opacity': s.opacity,
                  } as CSSProperties} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
