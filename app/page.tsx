"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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

type ClassicSentence = {
  text: string;
  chinese: string;
};

type ReadResult = "recognized" | "try-again" | "not-matched";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
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

type BrowserWindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
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

const sentenceLibrary: ClassicSentence[] = [
  { text: "Knowledge is power", chinese: "知识就是力量。" },
  { text: "Time is money", chinese: "时间就是金钱。" },
  { text: "Practice makes perfect", chinese: "熟能生巧。" },
  { text: "Honesty is the best policy", chinese: "诚实是最好的策略。" },
  { text: "Actions speak louder than words", chinese: "行动胜于言语。" },
  { text: "Better late than never", chinese: "迟做总比不做好。" },
  { text: "Every cloud has a silver lining", chinese: "黑暗中总有一线希望。" },
  { text: "No pain no gain", chinese: "没有付出就没有收获。" },
  { text: "Fortune favors the brave", chinese: "幸运眷顾勇敢者。" },
  { text: "The early bird catches the worm", chinese: "早起的鸟儿有虫吃。" },
  { text: "Where there is a will there is a way", chinese: "有志者事竟成。" },
  { text: "All roads lead to Rome", chinese: "条条大路通罗马。" },
  { text: "Rome was not built in a day", chinese: "罗马不是一天建成的。" },
  { text: "Look before you leap", chinese: "三思而后行。" },
  { text: "Still waters run deep", chinese: "静水流深。" },
  { text: "Birds of a feather flock together", chinese: "物以类聚，人以群分。" },
  { text: "A friend in need is a friend indeed", chinese: "患难见真情。" },
  { text: "The pen is mightier than the sword", chinese: "笔胜于剑。" },
  { text: "Necessity is the mother of invention", chinese: "需求是发明之母。" },
  { text: "Beauty is in the eye of the beholder", chinese: "美存在于观者眼中。" },
  { text: "Hope springs eternal", chinese: "希望永存。" },
  { text: "Less is more", chinese: "少即是多。" },
  { text: "Love conquers all", chinese: "爱能征服一切。" },
  { text: "Silence is golden", chinese: "沉默是金。" },
  { text: "Seeing is believing", chinese: "眼见为实。" },
  { text: "The truth will set you free", chinese: "真理会让你自由。" },
  { text: "This too shall pass", chinese: "这一切也会过去。" },
  { text: "To know oneself is true wisdom", chinese: "认识自己才是真智慧。" },
  { text: "The journey matters more than the destination", chinese: "旅程比目的地更重要。" },
  { text: "Small steps lead to great journeys", chinese: "小步能走向伟大的旅程。" },
  { text: "Dreams begin with a single step", chinese: "梦想始于一步。" },
  { text: "Courage grows by facing fear", chinese: "勇气在面对恐惧中成长。" },
  { text: "Kind words cost nothing", chinese: "善言无需成本。" },
  { text: "Patience is a quiet strength", chinese: "耐心是一种安静的力量。" },
  { text: "Wisdom begins in wonder", chinese: "智慧始于好奇。" },
  { text: "The best time is now", chinese: "最好的时间就是现在。" },
  { text: "Light tomorrow with today", chinese: "用今天照亮明天。" },
  { text: "Great minds think alike", chinese: "英雄所见略同。" },
  { text: "Good things take time", chinese: "好事需要时间。" },
  { text: "Life is a beautiful journey", chinese: "人生是一段美丽旅程。" },
  { text: "Learn from yesterday", chinese: "从昨天学习。" },
  { text: "Live for today", chinese: "为今天而活。" },
  { text: "Hope for tomorrow", chinese: "为明天怀抱希望。" },
  { text: "Make each day count", chinese: "让每一天都有意义。" },
  { text: "Keep your eyes on the stars", chinese: "把目光投向星辰。" },
  { text: "Stay hungry stay foolish", chinese: "保持渴望，保持天真。" },
  { text: "Simplicity is the ultimate sophistication", chinese: "简洁是终极的精致。" },
  { text: "Be yourself everyone else is taken", chinese: "做你自己，别人都已经有人做了。" },
  { text: "Think different", chinese: "换个角度思考。" },
  { text: "I love coding and vibing every morning", chinese: "我每天早上喜欢写代码，也享受当下的状态。" },
];

const wordGlosses: Record<string, string> = {
  a: "一个",
  actions: "行动",
  alike: "相似",
  all: "全部",
  and: "和",
  beautiful: "美丽的",
  beauty: "美",
  be: "成为",
  before: "在……之前",
  begin: "开始",
  begins: "开始",
  beholder: "观看者",
  believing: "相信",
  best: "最好的",
  better: "更好的",
  bird: "鸟",
  birds: "鸟儿",
  brave: "勇敢者",
  built: "建成",
  by: "通过",
  catches: "抓住",
  cloud: "云",
  coding: "写代码",
  conquers: "征服",
  cost: "花费",
  courage: "勇气",
  day: "一天",
  deep: "深",
  destination: "目的地",
  different: "不同的",
  dreams: "梦想",
  each: "每个",
  early: "早的",
  else: "其他人",
  eternal: "永恒的",
  every: "每个",
  everyone: "每个人",
  eye: "眼睛",
  eyes: "眼睛",
  facing: "面对",
  favors: "眷顾",
  feather: "羽毛",
  fear: "恐惧",
  flock: "聚集",
  foolish: "天真",
  for: "为了",
  fortune: "幸运",
  free: "自由",
  friend: "朋友",
  gain: "收获",
  golden: "金色的",
  good: "好的",
  great: "伟大的",
  grows: "成长",
  has: "有",
  hope: "希望",
  honesty: "诚实",
  hungry: "渴望",
  i: "我",
  in: "在……中",
  indeed: "真正地",
  invention: "发明",
  is: "是",
  journey: "旅程",
  journeys: "旅程",
  keep: "保持",
  kind: "善良的",
  know: "认识",
  knowledge: "知识",
  late: "晚",
  lead: "通向",
  learn: "学习",
  leap: "跳跃",
  less: "更少",
  life: "人生",
  light: "照亮",
  lining: "边缘",
  live: "生活",
  look: "看",
  louder: "更响亮",
  love: "爱",
  makes: "造就",
  matters: "重要",
  minds: "头脑",
  mightier: "更强大",
  money: "金钱",
  more: "更多",
  morning: "早晨",
  mother: "母亲",
  necessity: "必要",
  need: "需要",
  never: "从不",
  no: "没有",
  not: "不",
  nothing: "没有东西",
  now: "现在",
  of: "……的",
  on: "在……上",
  oneself: "自己",
  pain: "痛苦",
  pass: "过去",
  patience: "耐心",
  pen: "笔",
  perfect: "完美",
  policy: "策略",
  power: "力量",
  practice: "练习",
  quiet: "安静的",
  roads: "道路",
  rome: "罗马",
  run: "流动",
  seeing: "看见",
  set: "使",
  shall: "将会",
  silver: "银色的",
  silence: "沉默",
  simplicity: "简洁",
  single: "单个的",
  small: "小的",
  speak: "说话",
  springs: "涌出",
  stars: "星辰",
  stay: "保持",
  steps: "脚步",
  still: "静止的",
  strength: "力量",
  sword: "剑",
  take: "需要",
  taken: "被占用",
  than: "比",
  the: "这个",
  there: "那里",
  things: "事情",
  think: "思考",
  this: "这",
  time: "时间",
  to: "到",
  today: "今天",
  tomorrow: "明天",
  too: "也",
  true: "真正的",
  truth: "真理",
  ultimate: "终极的",
  vibing: "享受状态",
  was: "曾经是",
  waters: "水",
  way: "方法",
  where: "哪里",
  will: "意志",
  wisdom: "智慧",
  with: "和",
  wonder: "好奇",
  words: "话语",
  worm: "虫子",
  yesterday: "昨天",
  you: "你",
  your: "你的",
};

const wordPhonetics: Record<string, string> = {
  a: "/ə/",
  and: "/ænd/",
  be: "/biː/",
  every: "/ˈevri/",
  i: "/aɪ/",
  is: "/ɪz/",
  love: "/lʌv/",
  morning: "/ˈmɔːrnɪŋ/",
  the: "/ðə/",
  to: "/tuː/",
  you: "/juː/",
};

function sentenceWords(sentence: string) {
  return sentence.match(/[A-Za-z']+/g) ?? [];
}

function inferTokenMeta(word: string): Omit<Token, "word"> {
  const lower = word.toLowerCase();
  const pronouns = new Set(["i", "you", "your", "this"]);
  const determiners = new Set(["a", "the", "all", "every", "each", "no"]);
  const conjunctions = new Set(["and", "than"]);
  const prepositions = new Set(["in", "of", "on", "to", "with", "for", "by", "before"]);
  const verbs = new Set([
    "be", "begin", "begins", "believing", "built", "catches", "coding", "conquers", "cost",
    "facing", "favors", "flock", "grows", "has", "is", "keep", "know", "lead", "learn",
    "leap", "light", "live", "look", "love", "makes", "matters", "pass", "practice", "run",
    "seeing", "set", "shall", "speak", "springs", "stay", "take", "think", "vibing", "was", "will",
  ]);
  const adjectives = new Set([
    "beautiful", "best", "better", "brave", "different", "early", "eternal", "foolish",
    "golden", "good", "great", "hungry", "kind", "late", "less", "louder", "mightier",
    "more", "perfect", "quiet", "silver", "single", "small", "still", "true", "ultimate",
  ]);

  if (pronouns.has(lower)) {
    return {
      phonetic: wordPhonetics[lower] ?? `/${lower}/`,
      partOfSpeech: "代词",
      chinese: wordGlosses[lower] ?? "代词",
      fillTone: "tokenFillPronoun",
      underlineTone: "tokenUnderlinePronoun",
    };
  }

  if (determiners.has(lower)) {
    return {
      phonetic: wordPhonetics[lower] ?? `/${lower}/`,
      partOfSpeech: "限定词",
      chinese: wordGlosses[lower] ?? "限定词",
      fillTone: "tokenFillDefault",
      underlineTone: "tokenUnderlineDeterminer",
    };
  }

  if (conjunctions.has(lower) || prepositions.has(lower)) {
    return {
      phonetic: wordPhonetics[lower] ?? `/${lower}/`,
      partOfSpeech: conjunctions.has(lower) ? "连词" : "介词",
      chinese: wordGlosses[lower] ?? "连接",
      fillTone: "tokenFillDefault",
      underlineTone: "tokenUnderlineParticle",
    };
  }

  if (verbs.has(lower)) {
    return {
      phonetic: wordPhonetics[lower] ?? `/${lower}/`,
      partOfSpeech: lower.endsWith("ing") ? "动名词" : "动词",
      chinese: wordGlosses[lower] ?? "动作",
      fillTone: lower === "love" ? "tokenFillLike" : "tokenFillPhrase",
      underlineTone: "tokenUnderlineVerb",
    };
  }

  if (adjectives.has(lower)) {
    return {
      phonetic: wordPhonetics[lower] ?? `/${lower}/`,
      partOfSpeech: "形容词",
      chinese: wordGlosses[lower] ?? "形容",
      fillTone: "tokenFillPhrase",
      underlineTone: "tokenUnderlineModifier",
    };
  }

  return {
    phonetic: wordPhonetics[lower] ?? `/${lower}/`,
    partOfSpeech: "名词",
    chinese: wordGlosses[lower] ?? "词",
    fillTone: "tokenFillTime",
    underlineTone: "tokenUnderlineNoun",
  };
}

function createTokens(sentence: string): Token[] {
  return sentenceWords(sentence).map((word) => ({
    word,
    ...inferTokenMeta(word),
  }));
}

function createStages(tokens: Token[], sentence: ClassicSentence): Stage[] {
  return [
    ...tokens.map((token, index) => ({
      answer: token.word,
      chinese: token.chinese,
      tokenIndexes: [index],
    })),
    {
      answer: sentence.text,
      chinese: sentence.chinese,
      tokenIndexes: tokens.map((_, index) => index),
    },
  ];
}

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isMobileUserAgent(userAgent: string) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

function normalizeSpeechText(value: string) {
  return value.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
}

function compareSpeechToTarget(transcript: string, target: string): ReadResult {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const normalizedTarget = normalizeSpeechText(target);
  if (!normalizedTranscript) return "not-matched";
  if (normalizedTranscript === normalizedTarget) return "recognized";

  const transcriptWords = normalizedTranscript.split(" ");
  const targetWords = normalizedTarget.split(" ");
  if (targetWords.length === 1 && transcriptWords.includes(normalizedTarget)) return "recognized";

  const matchedWords = targetWords.filter((word) => transcriptWords.includes(word)).length;
  return matchedWords > 0 ? "try-again" : "not-matched";
}

function resultLabel(result: ReadResult | null) {
  if (result === "recognized") return "✅ 识别成功";
  if (result === "try-again") return "⚠️ 再试一次";
  if (result === "not-matched") return "❌ 未匹配";
  return "按住跟读";
}

function voiceLevelBand(level: number) {
  if (level >= 0.8) return 3;
  if (level >= 0.45) return 2;
  if (level >= 0.25) return 1;
  return 0;
}

function createPracticeStats(stageCount: number): PracticeStats {
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
    attemptsByStage: Array.from({ length: stageCount }, () => 0),
    revealedByStage: Array.from({ length: stageCount }, () => false),
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
  selectedTokens,
  translation,
  enableWordSpeech = true,
  promptText = "按鼠标任意键开始造这个句子",
}: {
  className?: string;
  selectedTokens: Token[];
  translation: string;
  enableWordSpeech?: boolean;
  promptText?: string;
}) {
  return (
    <section className={`wordInspector homeWordInspector ${className}`} aria-label="gramtree 造句器">
      <div className="builderPrompt">{promptText}</div>
      <div className="wordStrip homeWordStrip">
        {selectedTokens.map((token, index) => (
          <div
            className="builderToken homeBuilderToken"
            key={`${token.word}-${index}`}
            onClick={enableWordSpeech ? () => speakWord(token.word) : undefined}
          >
            <span className="phoneticBadge homePhoneticBadge">{token.phonetic}</span>
            <span className="wordBubbleStack">
              <span
                className={`wordBlock homeWordBlock ${token.fillTone}`}
                style={{ "--word-length": token.word.length } as CSSProperties}
              >
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
  const router = useRouter();
  const [selectedSentence, setSelectedSentence] = useState<ClassicSentence>(sentenceLibrary[0]);
  const [isMobile, setIsMobile] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const autoStartRef = useRef(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [wordInputs, setWordInputs] = useState<string[]>([]);
  const [activeInputIndex, setActiveInputIndex] = useState(0);
  const [status, setStatus] = useState<"typing" | "success" | "error">("typing");
  const [score, setScore] = useState(0);
  const [stats, setStats] = useState<PracticeStats>(() => createPracticeStats(sentenceWords(sentenceLibrary[0].text).length + 1));
  const [showResultModal, setShowResultModal] = useState(false);
  const [perfectStreak, setPerfectStreak] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [readResult, setReadResult] = useState<ReadResult | null>(null);
  const [recordingUrls, setRecordingUrls] = useState<(string | null)[]>([]);
  const [recordingError, setRecordingError] = useState("");
  const [voiceBand, setVoiceBand] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechTranscriptRef = useRef("");
  const recordingUrlsRef = useRef<(string | null)[]>([]);
  const voiceAnimationRef = useRef<number | null>(null);
  const voiceAudioCtxRef = useRef<AudioContext | null>(null);
  const smoothedVoiceLevelRef = useRef(0);
  const isRecordingRef = useRef(false);
  const recordingSessionIdRef = useRef(0);

  const tokens = useMemo(() => createTokens(selectedSentence.text), [selectedSentence.text]);
  const desktopStages = useMemo(() => createStages(tokens, selectedSentence), [selectedSentence, tokens]);
  const mobileStages = desktopStages;
  const stages = isMobile ? mobileStages : desktopStages;
  const stage = stages[stageIndex];
  const stageWords = useMemo(() => stage.answer.split(" "), [stage.answer]);
  const isSentenceReadStage = isMobile && stage.tokenIndexes.length > 1;
  const submittedAnswer = wordInputs.join(" ");
  const revealedTokens = useMemo(
    () => stage.tokenIndexes.map((index) => tokens[index]),
    [stage.tokenIndexes, tokens],
  );

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("practice") === "1") {
      autoStartRef.current = true;
      window.history.replaceState(null, "", window.location.pathname);
    }
    const nextSentence = sentenceLibrary[Math.floor(Math.random() * sentenceLibrary.length)];
    setSelectedSentence(nextSentence);
    setIsMobile(isMobileUserAgent(window.navigator.userAgent));
  }, []);

  useEffect(() => {
    setIsPractice(false);
    setStageIndex(0);
    setWordInputs([]);
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setStats(createPracticeStats(stages.length));
    setShowResultModal(false);
    setPerfectStreak(null);
    setRecognizedText("");
    setReadResult(null);
    setRecordingError("");
    setRecordingUrls((current) => {
      current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return Array.from({ length: stages.length }, () => null);
    });
  }, [stages.length, selectedSentence.text, isMobile]);

  useEffect(() => {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    setRecognizedText("");
    setReadResult(null);
    setRecordingError("");
  }, [stageIndex, isMobile]);

  useEffect(() => {
    if (!isPractice) return;
    const answer = stage.answer;
    const timer = window.setTimeout(() => speakWord(answer), 180);
    return () => window.clearTimeout(timer);
  }, [isPractice, stageIndex, stage.answer]);

  useEffect(() => {
    if (!autoStartRef.current) return;
    const timer = window.setTimeout(() => {
      if (!autoStartRef.current) return;
      autoStartRef.current = false;
      startPractice();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [stages.length, selectedSentence.text, isMobile]);

  useEffect(() => {
    recordingUrlsRef.current = recordingUrls;
  }, [recordingUrls]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (voiceAnimationRef.current !== null) cancelAnimationFrame(voiceAnimationRef.current);
      voiceAudioCtxRef.current?.close();
      recordingUrlsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  function startPractice() {
    if (_audioCtx?.state === "suspended") _audioCtx.resume();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setStats(createPracticeStats(stages.length));
    setShowResultModal(false);
    setIsPractice(true);
    setStageIndex(0);
    setWordInputs(Array.from({ length: stages[0].answer.split(" ").length }, () => ""));
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
  }

  function handleEnterPractice() {
    if (isMobile) {
      setShowMicPrompt(true);
      return;
    }
    startPractice();
  }

  function startPracticeWithoutMicTest() {
    setShowMicPrompt(false);
    startPractice();
  }

  function openResultModal() {
    setStats((current) => ({
      ...current,
      finishedAt: current.finishedAt ?? Date.now(),
    }));
    window.setTimeout(() => setShowResultModal(true), 650);
  }

  function advanceStage() {
    finishReadRecording({ abortRecognition: true, evaluate: false });
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

  function stopVoiceLevelMeter() {
    if (voiceAnimationRef.current !== null) {
      cancelAnimationFrame(voiceAnimationRef.current);
      voiceAnimationRef.current = null;
    }
    voiceAudioCtxRef.current?.close();
    voiceAudioCtxRef.current = null;
    smoothedVoiceLevelRef.current = 0;
    setVoiceBand(0);
  }

  function startVoiceLevelMeter(stream: MediaStream) {
    stopVoiceLevelMeter();
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      const source = audioCtx.createMediaStreamSource(stream);
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      voiceAudioCtxRef.current = audioCtx;

      const update = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = sample - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length) / 128;
        const level = Math.min(1, Math.max(0, (rms - 0.035) * 4));
        smoothedVoiceLevelRef.current = smoothedVoiceLevelRef.current * 0.72 + level * 0.28;
        setVoiceBand(voiceLevelBand(smoothedVoiceLevelRef.current));
        voiceAnimationRef.current = requestAnimationFrame(update);
      };

      update();
    } catch {
      setVoiceBand(0);
    }
  }

  function finishReadRecording({
    abortRecognition = false,
    evaluate = true,
  }: {
    abortRecognition?: boolean;
    evaluate?: boolean;
  } = {}) {
    const recorder = mediaRecorderRef.current;
    const recognition = speechRecognitionRef.current;

    if (abortRecognition || !evaluate) {
      recordingSessionIdRef.current += 1;
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    stopVoiceLevelMeter();

    if (recognition) {
      if (abortRecognition || !evaluate) {
        recognition.onend = null;
        recognition.abort();
      } else {
        recognition.stop();
      }
      speechRecognitionRef.current = null;
    } else if (evaluate) {
      applyReadResult("not-matched", "");
    }

    if (recorder) {
      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
    }
  }

  function applyReadResult(result: ReadResult, transcript: string) {
    setRecognizedText(transcript);
    setReadResult(result);

    if (result === "recognized") {
      if (status !== "success") {
        playSuccessChime();
        const wasPerfect = stats.attemptsByStage[stageIndex] === 0 && !stats.revealedByStage[stageIndex];
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
      }
      setStatus("success");
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
  }

  async function startReadRecording() {
    if (isRecordingRef.current || status === "success") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("当前浏览器不支持录音。");
      setReadResult("not-matched");
      return;
    }

    setRecordingError("");
    setRecognizedText("");
    setReadResult(null);
    setVoiceBand(0);
    speechTranscriptRef.current = "";

    try {
      const sessionId = recordingSessionIdRef.current + 1;
      recordingSessionIdRef.current = sessionId;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream);
      startVoiceLevelMeter(stream);
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingSessionIdRef.current !== sessionId) return;
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const nextUrl = URL.createObjectURL(blob);
        setRecordingUrls((current) => {
          const next = [...current];
          if (next[stageIndex]) URL.revokeObjectURL(next[stageIndex]);
          next[stageIndex] = nextUrl;
          return next;
        });
      };

      const SpeechRecognition = (window as BrowserWindowWithSpeechRecognition).SpeechRecognition
        ?? (window as BrowserWindowWithSpeechRecognition).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        speechRecognitionRef.current = recognition;
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
          let transcript = "";
          for (let index = 0; index < event.results.length; index += 1) {
            transcript += event.results[index][0]?.transcript ?? "";
          }
          speechTranscriptRef.current = transcript.trim();
          setRecognizedText(speechTranscriptRef.current);
        };
        recognition.onerror = () => {
          if (recordingSessionIdRef.current !== sessionId) return;
          setRecordingError("语音识别失败，请再试一次。");
        };
        recognition.onend = () => {
          if (recordingSessionIdRef.current !== sessionId) return;
          const transcript = speechTranscriptRef.current.trim();
          applyReadResult(compareSpeechToTarget(transcript, stage.answer), transcript);
          speechRecognitionRef.current = null;
        };
        recognition.start();
      } else {
        setRecordingError("当前浏览器不支持语音识别。");
      }

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      isRecordingRef.current = false;
      setIsRecording(false);
      stopVoiceLevelMeter();
      setRecordingError("跟读练习需要麦克风权限。");
      setReadResult("not-matched");
    }
  }

  function stopReadRecording() {
    if (!isRecordingRef.current) return;
    finishReadRecording({ evaluate: true });
  }

  function exitMobileReadPractice() {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPractice(false);
    setStageIndex(0);
    setWordInputs([]);
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setStats(createPracticeStats(stages.length));
    setShowResultModal(false);
    setPerfectStreak(null);
    setRecognizedText("");
    setReadResult(null);
    setRecordingError("");
  }

  function skipReadStage() {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    setStats((current) => ({
      ...current,
      skipped: current.skipped + 1,
      currentStreak: 0,
      revealedByStage: current.revealedByStage.map((isRevealed, index) =>
        index === stageIndex ? true : isRevealed,
      ),
    }));
    setReadResult(null);
    setRecognizedText("");
    if (stageIndex === stages.length - 1) {
      openResultModal();
    } else {
      advanceStage();
    }
  }

  useEffect(() => {
    if (!isPractice || isMobile) return;

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
      <nav className="homeInternalMenu" aria-label="内部页面">
        <Link
          href="/internal"
          className="internalLink"
          aria-label="打开内部语法图页面"
        >
          内部
        </Link>
        <Link
          href="/internal/audio-check"
          className="internalLink"
          aria-label="打开音频能力检测页面"
        >
          音频检测
        </Link>
      </nav>

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
        <>
        <div
          className="homeBuilderButton"
          role="button"
          tabIndex={0}
          onClick={handleEnterPractice}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleEnterPractice();
            }
          }}
        >
          <TokenBuilder
            selectedTokens={tokens}
            translation={selectedSentence.chinese}
            enableWordSpeech={false}
            promptText={isMobile ? "点击开始读这个句子" : "按鼠标任意键开始造这个句子"}
          />
        </div>
        {showMicPrompt ? (
          <div
            className="micPromptOverlay"
            role="dialog"
            aria-modal="true"
            aria-label="麦克风检测"
            onClick={() => setShowMicPrompt(false)}
          >
            <div className="micPromptCard" onClick={(event) => event.stopPropagation()}>
              <span className="micPromptIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 14.25c1.66 0 3-1.34 3-3V6.75c0-1.66-1.34-3-3-3s-3 1.34-3 3v4.5c0 1.66 1.34 3 3 3Z" />
                  <path d="M17.5 10.75v.5a5.5 5.5 0 0 1-11 0v-.5" />
                  <path d="M12 16.75v3.5" />
                  <path d="M8.75 20.25h6.5" />
                </svg>
              </span>
              <h2>先测一下麦克风？</h2>
              <p>朗读练习需要使用麦克风。你确认过它是否可用了吗？要不要现在快速测一下？</p>
              <div className="micPromptActions">
                <button
                  type="button"
                  className="micPromptGhost"
                  onClick={startPracticeWithoutMicTest}
                >
                  不用，直接开始
                </button>
                <button
                  type="button"
                  className="micPromptPrimary"
                  onClick={() => router.push("/internal/audio-check?next=practice")}
                >
                  先测试麦克风
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      ) : (
        <section className="practiceShell" aria-label="Keyboard sentence practice">
          <div className="practiceTopBar">
            <strong>
              {isMobile ? "点击单词听发音，按住按钮朗读" : "用键盘输入英文，按 Tab 切换单词"}（{stageIndex + 1}/{stages.length}）
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
            {isMobile ? (
              <div className={`mobileReadStage ${status === "error" ? "readError" : ""} ${status === "success" ? "readSuccess" : ""}`}>
                <p className="practiceTypingHint">
                  {isSentenceReadStage ? "先点完整句子听标准发音" : "先点单词卡片听标准发音"}
                </p>
                <TokenBuilder
                  className={`mobileReadToken ${isSentenceReadStage ? "mobileSentenceReadToken" : ""}`}
                  selectedTokens={revealedTokens}
                  translation={stage.chinese}
                />
                <button
                  type="button"
                  className={`holdToReadButton ${isRecording ? "recording" : ""}`}
                  aria-label={isRecording ? "松开结束录音" : "按住开始录音"}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startReadRecording();
                  }}
                  onPointerUp={stopReadRecording}
                  onPointerCancel={stopReadRecording}
                  onPointerLeave={stopReadRecording}
                  disabled={status === "success"}
                >
                  <svg className="micIcon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 14.25c1.66 0 3-1.34 3-3V6.75c0-1.66-1.34-3-3-3s-3 1.34-3 3v4.5c0 1.66 1.34 3 3 3Z" />
                    <path d="M17.5 10.75v.5a5.5 5.5 0 0 1-11 0v-.5" />
                    <path d="M12 16.75v3.5" />
                    <path d="M8.75 20.25h6.5" />
                    <rect className={`micSignalBar ${isRecording && voiceBand >= 1 ? "active" : ""}`} x="9.85" y="10.15" width="4.3" height="1.8" rx="0.9" />
                    <rect className={`micSignalBar ${isRecording && voiceBand >= 2 ? "active" : ""}`} x="9.85" y="8" width="4.3" height="1.8" rx="0.9" />
                    <rect className={`micSignalBar ${isRecording && voiceBand >= 3 ? "active" : ""}`} x="9.85" y="5.85" width="4.3" height="1.8" rx="0.9" />
                  </svg>
                </button>
                <div className={`readResultBadge ${readResult ?? "idle"}`}>
                  {resultLabel(readResult)}
                </div>
                {recognizedText ? (
                  <p className="recognizedText">听到：<strong>{recognizedText}</strong></p>
                ) : null}
                {recordingError ? <p className="recordingError">{recordingError}</p> : null}
                {recordingUrls[stageIndex] ? (
                  <div className="recordingPlayback">
                    <span>你的录音</span>
                    <audio controls src={recordingUrls[stageIndex] ?? undefined} />
                  </div>
                ) : null}
              </div>
            ) : status === "success" ? (
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

          {isMobile ? (
            <div className="practiceShortcuts mobileReadShortcuts" aria-label="Read-aloud controls">
              <button type="button" onClick={exitMobileReadPractice}>
                返回
              </button>
              <button type="button" onClick={playPronunciation}>
                播放标准发音
              </button>
              <button type="button" onClick={advanceStage} disabled={status !== "success"}>
                继续
              </button>
              <button type="button" onClick={skipReadStage}>
                跳过
              </button>
            </div>
          ) : (
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
          )}

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
