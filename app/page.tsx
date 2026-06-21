"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cancelSpeech, speakText } from "@/lib/speech";
import { enableMobileVConsole } from "@/lib/enableMobileVConsole";
import {
  extractSpeechWords,
  getDefaultReadPracticeProviderCode,
  getReadPracticeProvider,
  normalizeSttText,
  type ReadPracticeProvider,
  type ReadPracticeProviderCode,
  type SpeechRecognitionSession,
} from "@/lib/stt";
import { samePronunciation } from "@/lib/stt/pronunciation";

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
  tokens: Token[];
  tokenIndexes: number[];
  readAnswer?: string;
  readTokenIndexes?: number[];
  readFocusIndex?: number;
};

type ClassicSentence = {
  text: string;
  chinese: string;
};

type DictationSegment =
  | { kind: "word"; text: string; inputIndex: number }
  | { kind: "static"; text: string };

type InterviewTemplateCode = "technical" | "designer" | "product";

type SentenceImportResult =
  | { ok: true; sentences: ClassicSentence[] }
  | { ok: false; message: string };

type ReadResult = "recognized" | "try-again" | "not-matched";
type PracticeMode = "read" | "dictation";

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
  { text: "I am a software engineer with three years of backend experience", chinese: "我是一名有三年后端经验的软件工程师。" },
  { text: "I mainly work with TypeScript Node.js and PostgreSQL", chinese: "我主要使用 TypeScript、Node.js 和 PostgreSQL。" },
  { text: "I enjoy building reliable systems that solve real user problems", chinese: "我喜欢构建能解决真实用户问题的可靠系统。" },
  { text: "My recent work focused on API design and service performance", chinese: "我最近的工作重点是 API 设计和服务性能。" },
  { text: "I have experience with both frontend and backend development", chinese: "我有前端和后端开发经验。" },
  { text: "I can communicate well with product managers designers and testers", chinese: "我能和产品经理、设计师以及测试人员良好沟通。" },
  { text: "I care about code quality maintainability and clear documentation", chinese: "我重视代码质量、可维护性和清晰文档。" },
  { text: "I like to understand the business goal before writing code", chinese: "我喜欢在写代码前先理解业务目标。" },
  { text: "I am comfortable reading legacy code and improving it safely", chinese: "我能够阅读遗留代码并安全地改进它。" },
  { text: "I usually break complex tasks into small deliverable steps", chinese: "我通常把复杂任务拆成可交付的小步骤。" },
  { text: "I have worked on user facing products and internal tools", chinese: "我做过面向用户的产品和内部工具。" },
  { text: "I am familiar with Git code reviews and continuous integration", chinese: "我熟悉 Git、代码评审和持续集成。" },
  { text: "I learn new technologies by building small practical prototypes", chinese: "我通过构建小型实用原型来学习新技术。" },
  { text: "I ask questions early when requirements are unclear", chinese: "当需求不清楚时，我会尽早提问。" },
  { text: "I value simple solutions over unnecessary complexity", chinese: "我更重视简单方案，而不是不必要的复杂性。" },
  { text: "My main project was an order management platform for merchants", chinese: "我的主要项目是一个面向商家的订单管理平台。" },
  { text: "The platform helped users track orders inventory and payments", chinese: "该平台帮助用户跟踪订单、库存和支付。" },
  { text: "I was responsible for the payment integration module", chinese: "我负责支付集成模块。" },
  { text: "I designed REST APIs for order creation and refund workflows", chinese: "我设计了订单创建和退款流程的 REST API。" },
  { text: "I added validation rules to prevent invalid order states", chinese: "我添加了校验规则，防止无效订单状态。" },
  { text: "I implemented background jobs for payment status synchronization", chinese: "我实现了用于同步支付状态的后台任务。" },
  { text: "The system handled thousands of orders every day", chinese: "系统每天处理数千个订单。" },
  { text: "I used Redis to cache frequently requested product data", chinese: "我使用 Redis 缓存高频请求的商品数据。" },
  { text: "I wrote database migrations for new order fields", chinese: "我为新的订单字段编写了数据库迁移。" },
  { text: "I added audit logs for important business operations", chinese: "我为重要业务操作添加了审计日志。" },
  { text: "I worked with the frontend team to define stable API contracts", chinese: "我和前端团队一起定义稳定的 API 契约。" },
  { text: "I created monitoring dashboards for key order metrics", chinese: "我为关键订单指标创建了监控看板。" },
  { text: "I wrote integration tests for payment callbacks", chinese: "我为支付回调编写了集成测试。" },
  { text: "The project improved operational efficiency for support teams", chinese: "这个项目提升了客服团队的运营效率。" },
  { text: "The biggest challenge was handling inconsistent payment provider responses", chinese: "最大的挑战是处理支付供应商不一致的响应。" },
  { text: "I normalized external responses into our internal payment model", chinese: "我把外部响应规范化为内部支付模型。" },
  { text: "I documented edge cases so the team could maintain the module", chinese: "我记录了边界情况，方便团队维护该模块。" },
  { text: "Another project was a dashboard for real time business analytics", chinese: "另一个项目是实时业务分析看板。" },
  { text: "I built reusable chart components with React and TypeScript", chinese: "我用 React 和 TypeScript 构建了可复用图表组件。" },
  { text: "I optimized expensive queries by adding proper indexes", chinese: "我通过添加合适索引优化了高开销查询。" },
  { text: "I reduced dashboard loading time from five seconds to two seconds", chinese: "我把看板加载时间从五秒降到了两秒。" },
  { text: "I designed the system around clear service boundaries", chinese: "我围绕清晰的服务边界设计系统。" },
  { text: "I prefer explicit data models because they make behavior easier to reason about", chinese: "我偏好明确的数据模型，因为它们让行为更容易推理。" },
  { text: "I separate business logic from transport layer code", chinese: "我会把业务逻辑和传输层代码分离。" },
  { text: "I use dependency injection when it makes testing easier", chinese: "当依赖注入能让测试更容易时，我会使用它。" },
  { text: "I avoid premature abstraction until a repeated pattern is clear", chinese: "在重复模式明确前，我会避免过早抽象。" },
  { text: "I choose relational databases when consistency is important", chinese: "当一致性重要时，我会选择关系型数据库。" },
  { text: "I choose queues when tasks can be processed asynchronously", chinese: "当任务可以异步处理时，我会选择队列。" },
  { text: "I use caching only after measuring the actual bottleneck", chinese: "我只会在测量真实瓶颈后使用缓存。" },
  { text: "I design APIs to be predictable and easy to debug", chinese: "我设计 API 时追求可预测和易调试。" },
  { text: "I make error messages actionable for both users and developers", chinese: "我会让错误信息对用户和开发者都有行动价值。" },
  { text: "I use feature flags to release risky changes gradually", chinese: "我使用功能开关逐步发布有风险的改动。" },
  { text: "I keep database transactions short to reduce lock contention", chinese: "我会保持数据库事务简短，以减少锁竞争。" },
  { text: "I design retry logic carefully to avoid duplicate side effects", chinese: "我会谨慎设计重试逻辑，避免重复副作用。" },
  { text: "I use idempotency keys for payment and order operations", chinese: "我会为支付和订单操作使用幂等键。" },
  { text: "I consider observability part of the system design", chinese: "我把可观测性视为系统设计的一部分。" },
  { text: "I add structured logs around important state transitions", chinese: "我会在重要状态转换周围添加结构化日志。" },
  { text: "I use metrics to understand latency error rate and throughput", chinese: "我使用指标理解延迟、错误率和吞吐量。" },
  { text: "I trace requests when a problem crosses multiple services", chinese: "当问题跨多个服务时，我会跟踪请求链路。" },
  { text: "I start debugging by reproducing the issue reliably", chinese: "我调试时会先可靠地复现问题。" },
  { text: "I check logs metrics and recent deployments before changing code", chinese: "改代码前，我会检查日志、指标和最近部署。" },
  { text: "I isolate variables to find the real root cause", chinese: "我会隔离变量来找到真正根因。" },
  { text: "I once fixed a memory leak in a background worker", chinese: "我曾修复过后台任务中的内存泄漏。" },
  { text: "I used heap snapshots to compare object retention over time", chinese: "我使用堆快照比较对象随时间的保留情况。" },
  { text: "The leak came from an unbounded in memory cache", chinese: "泄漏来自一个无上限的内存缓存。" },
  { text: "I replaced it with an LRU cache and added monitoring", chinese: "我把它替换为 LRU 缓存并添加了监控。" },
  { text: "The fix reduced memory usage by thirty percent", chinese: "这个修复让内存使用减少了百分之三十。" },
  { text: "I once investigated a slow checkout endpoint", chinese: "我曾调查过一个很慢的结账接口。" },
  { text: "The slow query was missing an index on the customer id", chinese: "慢查询缺少 customer id 上的索引。" },
  { text: "After adding the index the endpoint became much faster", chinese: "添加索引后，该接口快了很多。" },
  { text: "I always verify performance changes with real measurements", chinese: "我总是用真实测量验证性能改动。" },
  { text: "I avoid guessing when production behavior is involved", chinese: "涉及生产行为时，我避免凭空猜测。" },
  { text: "I write unit tests for pure business logic", chinese: "我会为纯业务逻辑编写单元测试。" },
  { text: "I write integration tests for database and API behavior", chinese: "我会为数据库和 API 行为编写集成测试。" },
  { text: "I use end to end tests for critical user journeys", chinese: "我会为关键用户路径编写端到端测试。" },
  { text: "I keep tests deterministic by controlling time and external dependencies", chinese: "我通过控制时间和外部依赖让测试保持确定性。" },
  { text: "I mock third party services only at clear boundaries", chinese: "我只在清晰边界处模拟第三方服务。" },
  { text: "I review tests to make sure they protect real behavior", chinese: "我会评审测试，确保它们保护真实行为。" },
  { text: "I use TypeScript to catch mistakes before runtime", chinese: "我使用 TypeScript 在运行前捕获错误。" },
  { text: "I prefer narrow types over broad any types", chinese: "我偏好窄类型，而不是宽泛的 any 类型。" },
  { text: "I validate external input at the system boundary", chinese: "我会在系统边界校验外部输入。" },
  { text: "I handle null and undefined values explicitly", chinese: "我会显式处理 null 和 undefined 值。" },
  { text: "I use code reviews to share context and reduce risk", chinese: "我通过代码评审共享上下文并降低风险。" },
  { text: "I explain tradeoffs clearly when proposing a solution", chinese: "提出方案时，我会清楚说明取舍。" },
  { text: "I ask for feedback when a change affects multiple teams", chinese: "当改动影响多个团队时，我会征求反馈。" },
  { text: "I communicate blockers early instead of waiting silently", chinese: "我会尽早沟通阻塞，而不是沉默等待。" },
  { text: "I write concise pull request descriptions with testing notes", chinese: "我会写简洁的 PR 描述并附上测试说明。" },
  { text: "I split large pull requests into smaller reviewable pieces", chinese: "我会把大型 PR 拆成更小、可评审的部分。" },
  { text: "I align with product managers on scope before implementation", chinese: "实现前，我会和产品经理对齐范围。" },
  { text: "I work with designers to keep interactions consistent", chinese: "我会和设计师合作保持交互一致。" },
  { text: "I help teammates debug issues when they are blocked", chinese: "队友遇到阻塞时，我会帮助他们调试问题。" },
  { text: "I mentor junior developers through pairing and review comments", chinese: "我通过结对和评审评论指导初级开发者。" },
  { text: "I document decisions when they may matter later", chinese: "当决策以后可能重要时，我会记录它们。" },
  { text: "I balance speed and quality based on business risk", chinese: "我会根据业务风险平衡速度和质量。" },
  { text: "I once disagreed with a teammate about a database design", chinese: "我曾和队友在数据库设计上意见不同。" },
  { text: "I compared both options using query patterns and migration cost", chinese: "我用查询模式和迁移成本比较了两个方案。" },
  { text: "We chose the simpler design and documented future limits", chinese: "我们选择了更简单的设计，并记录了未来限制。" },
  { text: "I handled a production incident caused by a bad configuration", chinese: "我处理过一次由错误配置导致的生产事故。" },
  { text: "I rolled back the change and added validation to prevent recurrence", chinese: "我回滚了改动，并添加校验防止复发。" },
  { text: "I wrote a post incident note with clear action items", chinese: "我写了带明确行动项的事故复盘记录。" },
  { text: "I learned to make deployment checks more explicit", chinese: "我学会了让部署检查更加明确。" },
  { text: "I am strongest in backend development and system debugging", chinese: "我最擅长后端开发和系统调试。" },
  { text: "I am improving my frontend architecture skills", chinese: "我正在提升前端架构能力。" },
  { text: "I want to grow into an engineer who can lead complex projects", chinese: "我希望成长为能主导复杂项目的工程师。" },
  { text: "I am interested in this role because it combines product impact and technical depth", chinese: "我对这个岗位感兴趣，因为它结合了产品影响力和技术深度。" },
  { text: "I can contribute by improving reliability developer velocity and user experience", chinese: "我能通过提升可靠性、开发效率和用户体验做出贡献。" },
  { text: "I would first learn the product domain and the current architecture", chinese: "我会先学习产品领域和当前架构。" },
  { text: "Then I would look for high impact problems the team already cares about", chinese: "然后我会寻找团队已经关注的高影响问题。" },
  { text: "I like teams that value ownership learning and honest communication", chinese: "我喜欢重视责任感、学习和坦诚沟通的团队。" },
  { text: "I measure my success by user impact and team trust", chinese: "我用用户影响和团队信任来衡量自己的成功。" },
  { text: "I am ready to discuss my project details and technical decisions", chinese: "我可以讨论我的项目细节和技术决策。" },
  { text: "The service used a layered architecture with controllers services and repositories", chinese: "该服务使用了包含控制器、服务和仓储的分层架构。" },
  { text: "Controllers handled request parsing and response formatting", chinese: "控制器负责请求解析和响应格式化。" },
  { text: "Services contained business rules and orchestration logic", chinese: "服务层包含业务规则和编排逻辑。" },
  { text: "Repositories isolated database access from business logic", chinese: "仓储层把数据库访问和业务逻辑隔离开。" },
  { text: "This structure made the code easier to test and change", chinese: "这种结构让代码更容易测试和修改。" },
  { text: "I used pagination to keep list APIs fast and predictable", chinese: "我使用分页让列表 API 保持快速和可预测。" },
  { text: "I added rate limits to protect expensive endpoints", chinese: "我添加了限流来保护高成本接口。" },
  { text: "I used optimistic UI updates for common frontend interactions", chinese: "我在常见前端交互中使用乐观 UI 更新。" },
  { text: "I handled loading empty and error states in every important view", chinese: "我在每个重要视图中处理加载、空状态和错误状态。" },
  { text: "I made forms safer with client side and server side validation", chinese: "我通过客户端和服务端校验让表单更安全。" },
  { text: "I improved accessibility by using semantic elements and keyboard support", chinese: "我通过语义化元素和键盘支持改善可访问性。" },
  { text: "I reduced bundle size by removing unused dependencies", chinese: "我通过移除未使用依赖减少了包体积。" },
  { text: "I analyzed rendering performance with browser profiling tools", chinese: "我使用浏览器性能分析工具分析渲染性能。" },
  { text: "I fixed unnecessary rerenders by memoizing expensive derived data", chinese: "我通过缓存高开销派生数据修复了不必要的重渲染。" },
  { text: "I prefer clear component boundaries over deeply nested props", chinese: "相比深层传递属性，我更偏好清晰的组件边界。" },
  { text: "I design components around real user workflows", chinese: "我围绕真实用户流程设计组件。" },
  { text: "I use design system tokens to keep the interface consistent", chinese: "我使用设计系统令牌保持界面一致。" },
  { text: "I verify responsive layouts on both desktop and mobile screens", chinese: "我会在桌面和移动屏幕上验证响应式布局。" },
  { text: "I would describe this project as a reliable workflow platform", chinese: "我会把这个项目描述为一个可靠的流程平台。" },
  { text: "It reduced manual work by automating repetitive operational tasks", chinese: "它通过自动化重复运营任务减少了人工工作。" },
  { text: "The most valuable lesson was to design for failure from the beginning", chinese: "最有价值的经验是从一开始就为失败场景设计。" },
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
  with: "/wɪð/",
};

const weakReadWords = new Set([
  "a", "an", "the", "to", "of", "in", "on", "with", "for", "by", "and", "is", "are", "was", "were",
]);

const sentenceImportExample = `[
  { "en": "Knowledge is power", "cn": "知识就是力量。" },
  { "en": "Practice makes perfect" }
]`;
const importedSentenceStorageKey = "gramtree.importedSentences.v1";
const gramtreeImportUrl = "https://zangaifamily.github.io/gramtree/";
const interviewImportTemplates: Array<{
  code: InterviewTemplateCode;
  label: string;
  role: string;
  focus: string[];
}> = [
  {
    code: "technical",
    label: "导入技术面试",
    role: "technical interview candidate",
    focus: [
      "self introduction",
      "technical background",
      "work experience",
      "strengths",
      "challenges",
      "responsibilities",
      "project value",
      "STAR answers",
      "SCQA experience framing",
    ],
  },
  {
    code: "designer",
    label: "导入设计师面试",
    role: "product designer or UX/UI designer interview candidate",
    focus: [
      "design background",
      "portfolio introduction",
      "user research",
      "design decisions",
      "cross-functional collaboration",
      "strengths",
      "challenges",
      "project impact",
      "STAR answers",
      "SCQA case framing",
    ],
  },
  {
    code: "product",
    label: "导入产品经理面试",
    role: "product manager interview candidate",
    focus: [
      "product background",
      "user and business context",
      "prioritization",
      "roadmap ownership",
      "stakeholder communication",
      "metrics",
      "trade-offs",
      "project value",
      "STAR answers",
      "SCQA product case framing",
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chooseRandomSentence(library: ClassicSentence[], currentSentence?: ClassicSentence) {
  const availableSentences = currentSentence && library.length > 1
    ? library.filter((sentence) =>
      sentence.text !== currentSentence.text || sentence.chinese !== currentSentence.chinese
    )
    : library;
  return availableSentences[Math.floor(Math.random() * availableSentences.length)] ?? null;
}

function parseStoredSentenceLibrary(rawValue: string | null) {
  if (!rawValue) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const sentences: ClassicSentence[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) return null;
    const rawText = typeof item.text === "string" ? item.text : typeof item.en === "string" ? item.en : "";
    const text = rawText.trim().replace(/\s+/g, " ");
    if (sentenceWords(text).length === 0) return null;

    const rawChinese = typeof item.chinese === "string"
      ? item.chinese
      : typeof item.cn === "string"
        ? item.cn
        : "";
    sentences.push({
      text,
      chinese: rawChinese.trim() || "未提供中文翻译",
    });
  }

  return sentences.length > 0 ? sentences : null;
}

function loadImportedSentenceLibrary() {
  try {
    const storedSentences = parseStoredSentenceLibrary(window.localStorage.getItem(importedSentenceStorageKey));
    if (!storedSentences) {
      window.localStorage.removeItem(importedSentenceStorageKey);
    }
    return storedSentences;
  } catch {
    return null;
  }
}

function saveImportedSentenceLibrary(sentences: ClassicSentence[]) {
  try {
    window.localStorage.setItem(importedSentenceStorageKey, JSON.stringify(sentences));
    return true;
  } catch {
    return false;
  }
}

function removeImportedSentenceLibrary() {
  try {
    window.localStorage.removeItem(importedSentenceStorageKey);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}

function getInterviewTemplate(code: InterviewTemplateCode) {
  return interviewImportTemplates.find((template) => template.code === code);
}

function createInterviewImportPrompt(template: (typeof interviewImportTemplates)[number]) {
  return [
    `You are a professional English interview coach and an experienced ${template.role}.`,
    "Generate practical English interview practice sentences for Gramtree.",
    "",
    "Content goals:",
    ...template.focus.map((item) => `- ${item}`),
    "",
    "Requirements:",
    "- Include natural interview statements and answer fragments, not long paragraphs.",
    "- Cover introduction, background, work experience, strengths, challenges, responsibilities, and project value where relevant.",
    "- Use STAR for behavioral examples: Situation, Task, Action, Result.",
    "- Use SCQA for experience framing: Situation, Complication, Question, Answer.",
    "- Make each English sentence useful for speaking practice.",
    "- Provide concise Chinese translations.",
    "",
    "Output format:",
    "- Output valid JSON only. Do not use Markdown, explanations, comments, or code fences.",
    "- The top-level value must be an array.",
    "- Each item must contain `en`; `cn` is optional but preferred.",
    "- Use exactly this shape:",
    `[{ "en": "English interview sentence", "cn": "中文翻译" }]`,
    "- Do not output any other fields.",
    "",
    "Generate 30 items.",
    "After generating the final JSON, write the final JSON to the clipboard if your environment supports clipboard access.",
    `I will paste the JSON into the import box at ${gramtreeImportUrl}.`,
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return copied;
  }
}

function createSentenceImportPrompt(rawInput: string) {
  return [
    "请把下面的内容整理成 Gramtree 可导入的 JSON。",
    "只输出合法 JSON，不要 Markdown、解释或代码块。",
    "预期格式是数组，每项只有 en 和 cn：",
    `[{ "en": "English sentence", "cn": "中文翻译（可选）" }]`,
    "规则：en 必须是非空字符串；cn 可省略或为空字符串；不要输出其它字段。",
    "整理完成后，请把最终 JSON 写入剪贴板，方便我直接粘贴回导入框。",
    "",
    "待整理内容：",
    rawInput.trim() || "（把原始句子粘贴在这里）",
  ].join("\n");
}

function parseSentenceImport(rawInput: string): SentenceImportResult {
  const source = rawInput.trim();
  if (!source) {
    return { ok: false, message: "请输入 JSON 内容。" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知解析错误";
    return { ok: false, message: `JSON 无法解析：${message}` };
  }

  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.sentences)
      ? parsed.sentences
      : isRecord(parsed)
        ? [parsed]
        : null;

  if (!items) {
    return { ok: false, message: "顶层必须是句子对象、句子数组，或包含 sentences 数组的对象。" };
  }

  if (items.length === 0) {
    return { ok: false, message: "至少需要导入 1 条句子。" };
  }

  const sentences: ClassicSentence[] = [];
  for (const [index, item] of items.entries()) {
    const line = index + 1;
    if (!isRecord(item)) {
      return { ok: false, message: `第 ${line} 项必须是对象。` };
    }

    const en = item.en;
    if (typeof en !== "string" || !en.trim()) {
      return { ok: false, message: `第 ${line} 项缺少必填的 en 字符串。` };
    }

    const cn = item.cn;
    if (cn !== undefined && cn !== null && typeof cn !== "string") {
      return { ok: false, message: `第 ${line} 项的 cn 必须是字符串，或直接省略。` };
    }

    const text = en.trim().replace(/\s+/g, " ");
    if (sentenceWords(text).length === 0) {
      return { ok: false, message: `第 ${line} 项的 en 至少需要包含一个英文单词。` };
    }

    sentences.push({
      text,
      chinese: typeof cn === "string" && cn.trim() ? cn.trim() : "未提供中文翻译",
    });
  }

  return { ok: true, sentences };
}

function sentenceWords(sentence: string) {
  return sentence.match(/[A-Za-z']+/g) ?? [];
}

function createDictationSegments(sentence: string): DictationSegment[] {
  const segments: DictationSegment[] = [];
  const matches = Array.from(sentence.matchAll(/[A-Za-z']+/g));
  let cursor = 0;
  let inputIndex = 0;

  for (const match of matches) {
    const word = match[0];
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: "static", text: sentence.slice(cursor, start) });
    }
    segments.push({ kind: "word", text: word, inputIndex });
    inputIndex += 1;
    cursor = start + word.length;
  }

  if (cursor < sentence.length) {
    segments.push({ kind: "static", text: sentence.slice(cursor) });
  }

  return segments;
}

function countDictationInputs(sentence: string) {
  return createDictationSegments(sentence).filter((segment) => segment.kind === "word").length;
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

function createReadTokenIndexes(tokens: Token[], index: number) {
  const lower = tokens[index].word.toLowerCase();
  if (!weakReadWords.has(lower) || tokens.length <= 1) return undefined;

  const previousIndex = index > 0 ? index - 1 : null;
  const nextIndex = index < tokens.length - 1 ? index + 1 : null;
  if (nextIndex !== null && !weakReadWords.has(tokens[nextIndex].word.toLowerCase())) {
    return [index, nextIndex];
  }
  if (previousIndex !== null && !weakReadWords.has(tokens[previousIndex].word.toLowerCase())) {
    return [previousIndex, index];
  }
  return [Math.max(0, index - 1), index, Math.min(tokens.length - 1, index + 1)].filter(
    (tokenIndex, position, indexes) => indexes.indexOf(tokenIndex) === position,
  );
}

function createSentenceStage(sentence: ClassicSentence): Stage {
  const tokens = createTokens(sentence.text);
  return {
    answer: sentence.text,
    chinese: sentence.chinese,
    tokens,
    tokenIndexes: tokens.map((_, index) => index),
  };
}

// Read-aloud mode chains every sentence in the active library into one
// continuous paragraph: one stage per sentence, advancing until the last.
function createReadStages(sentences: ClassicSentence[]): Stage[] {
  return sentences.map(createSentenceStage);
}

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isMobileUserAgent(userAgent: string) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

function resultLabel(result: ReadResult | null) {
  if (result === "recognized") return "✅ Recognized";
  if (result === "try-again") return "⚠️ Keep reading";
  if (result === "not-matched") return "❌ Not matched";
  return "Tap to read";
}

function transcriptWordsOf(value: string) {
  return extractSpeechWords(value);
}

function findNewReadMatches({
  transcript,
  tokens,
  tokenIndexes,
  recognizedIndexes,
}: {
  transcript: string;
  tokens: Token[];
  tokenIndexes: number[];
  recognizedIndexes: number[];
}) {
  const unmatchedTranscriptWords = transcriptWordsOf(transcript);
  const recognizedSet = new Set(recognizedIndexes);
  const newMatches: number[] = [];

  tokenIndexes.forEach((tokenIndex) => {
    if (recognizedSet.has(tokenIndex)) return;

    const targetWord = normalizeSttText(tokens[tokenIndex]?.word ?? "");
    if (!targetWord) return;

    const matchIndex = unmatchedTranscriptWords.findIndex((word) => samePronunciation(word, targetWord));
    if (matchIndex === -1) return;

    unmatchedTranscriptWords.splice(matchIndex, 1);
    recognizedSet.add(tokenIndex);
    newMatches.push(tokenIndex);
  });

  return newMatches;
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

function speakWord(text: string) {
  speakText(text);
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
  speechMode = "word",
  speechText,
  focusIndex,
  tokenIndexes,
  recognizedTokenIndexes,
}: {
  className?: string;
  selectedTokens: Token[];
  translation?: string;
  enableWordSpeech?: boolean;
  promptText?: string;
  speechMode?: "word" | "full";
  speechText?: string;
  focusIndex?: number;
  tokenIndexes?: number[];
  recognizedTokenIndexes?: Set<number>;
}) {
  return (
    <section className={`wordInspector homeWordInspector ${className}`} aria-label="gramtree 造句器">
      <div className="builderPrompt">{promptText}</div>
      <div className="wordStrip homeWordStrip">
        {selectedTokens.map((token, index) => (
          <div
            className={`builderToken homeBuilderToken ${focusIndex !== undefined && index !== focusIndex ? "contextToken" : ""} ${recognizedTokenIndexes?.has(tokenIndexes?.[index] ?? index) ? "recognizedToken" : ""}`}
            key={`${token.word}-${index}`}
            onClick={enableWordSpeech ? () => speakWord(speechMode === "full" ? speechText ?? token.word : token.word) : undefined}
          >
            <span className="phoneticBadge homePhoneticBadge">{token.phonetic}</span>
            <span className="wordBubbleStack">
              <span
                className={`wordBlock homeWordBlock ${token.fillTone}`}
                style={{ "--word-length": token.word.length } as CSSProperties}
              >
                <span className="wordTextMeasure homeWordText" aria-hidden="true">{token.word}</span>
                <span className="wordText homeWordText">{token.word}</span>
              </span>
              <span className={`grammarUnderline ${token.underlineTone}`} />
            </span>
            <span className="partOfSpeechPill homePartOfSpeechPill">{token.partOfSpeech}</span>
            <span className="chineseGloss homeChineseGloss">{token.chinese}</span>
          </div>
        ))}
      </div>
      {translation ? (
        <p className="sentenceTranslation homeSentenceTranslation">
          {translation}
        </p>
      ) : null}
    </section>
  );
}

export default function Home() {
  const [selectedSentence, setSelectedSentence] = useState<ClassicSentence>(sentenceLibrary[0]);
  const [activeSentenceLibrary, setActiveSentenceLibrary] = useState<ClassicSentence[]>(sentenceLibrary);
  const [isCustomSentenceLibrary, setIsCustomSentenceLibrary] = useState(false);
  const [sentenceImportText, setSentenceImportText] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const [importHelperPrompt, setImportHelperPrompt] = useState("");
  const [copyPromptStatus, setCopyPromptStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [selectedInterviewTemplate, setSelectedInterviewTemplate] = useState<InterviewTemplateCode | "">("");
  const [templateCopyStatus, setTemplateCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [isMobile, setIsMobile] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("dictation");
  const autoStartModeRef = useRef<PracticeMode | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [maxReadStageIndex, setMaxReadStageIndex] = useState(0);
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
  const [recognizedReadIndexes, setRecognizedReadIndexes] = useState<number[][]>(() => [[]]);
  const [recordingUrls, setRecordingUrls] = useState<(string | null)[]>([]);
  const [recordingError, setRecordingError] = useState("");
  const [voiceBand, setVoiceBand] = useState(0);
  const [readProviderCode, setReadProviderCode] = useState<ReadPracticeProviderCode>("SRP");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const speechTranscriptRef = useRef("");
  const speechResultAppliedRef = useRef(false);
  const recognizedReadIndexesRef = useRef<number[][]>([[]]);
  const recordingUrlsRef = useRef<(string | null)[]>([]);
  const voiceAnimationRef = useRef<number | null>(null);
  const voiceAudioCtxRef = useRef<AudioContext | null>(null);
  const smoothedVoiceLevelRef = useRef(0);
  const isRecordingRef = useRef(false);
  const paragraphScrollRef = useRef<HTMLDivElement | null>(null);
  const activeParagraphRef = useRef<HTMLElement | null>(null);
  const readScrollSettleTimerRef = useRef<number | null>(null);
  const readAutoScrollLockUntilRef = useRef(0);
  const recordingSessionIdRef = useRef(0);
  const shouldEvaluateRecordingRef = useRef(false);
  const readButtonPointerToggleAtRef = useRef(0);
  const importPromptRef = useRef<HTMLTextAreaElement | null>(null);

  const isReadMode = practiceMode === "read";
  const dictationStages = useMemo(() => [createSentenceStage(selectedSentence)], [selectedSentence]);
  const readStages = useMemo(() => createReadStages(activeSentenceLibrary), [activeSentenceLibrary]);
  const stages = isReadMode ? readStages : dictationStages;
  const stage = stages[Math.min(stageIndex, stages.length - 1)] ?? stages[0];
  const tokens = stage.tokens;
  const dictationSegments = useMemo(() => createDictationSegments(stage.answer), [stage.answer]);
  const dictationWords = useMemo(
    () => dictationSegments.filter((segment): segment is Extract<DictationSegment, { kind: "word" }> => segment.kind === "word"),
    [dictationSegments],
  );
  const readProvider = useMemo(() => getReadPracticeProvider(readProviderCode), [readProviderCode]);
  const readProviderRef = useRef<ReadPracticeProvider>(readProvider);
  const readAnswer = stage.readAnswer ?? stage.answer;
  const readTokenIndexes = stage.readTokenIndexes ?? stage.tokenIndexes;
  const readFocusIndex = stage.readFocusIndex;
  const isSentenceReadStage = stage.tokenIndexes.length > 1;
  const isPhraseReadStage = !isSentenceReadStage && readTokenIndexes.length > 1;
  const recognizedReadIndexSet = useMemo(
    () => new Set(recognizedReadIndexes[stageIndex] ?? []),
    [recognizedReadIndexes, stageIndex],
  );
  const recognizedReadCount = readTokenIndexes.filter((tokenIndex) => recognizedReadIndexSet.has(tokenIndex)).length;
  const submittedAnswer = dictationSegments
    .map((segment) => segment.kind === "word" ? wordInputs[segment.inputIndex] ?? "" : segment.text)
    .join("");
  const isStageRevealed = stats.revealedByStage[stageIndex] ?? false;
  const revealedTokens = useMemo(
    () => (isReadMode ? readTokenIndexes : stage.tokenIndexes).map((index) => tokens[index]),
    [isReadMode, readTokenIndexes, stage.tokenIndexes, tokens],
  );

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    readProviderRef.current = readProvider;
  }, [readProvider]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPractice = params.get("practice");
    if (requestedPractice === "read" || requestedPractice === "1") {
      autoStartModeRef.current = "read";
      window.history.replaceState(null, "", window.location.pathname);
    } else if (requestedPractice === "dictation") {
      autoStartModeRef.current = "dictation";
      window.history.replaceState(null, "", window.location.pathname);
    }
    const importedSentences = loadImportedSentenceLibrary();
    const nextLibrary = importedSentences ?? sentenceLibrary;
    setActiveSentenceLibrary(nextLibrary);
    setIsCustomSentenceLibrary(Boolean(importedSentences));
    setSelectedSentence(chooseRandomSentence(nextLibrary) ?? nextLibrary[0]);
    setIsMobile(isMobileUserAgent(window.navigator.userAgent));
    setReadProviderCode(getDefaultReadPracticeProviderCode());
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    void enableMobileVConsole();
  }, [isMobile]);

  useEffect(() => {
    setIsPractice(false);
    setPracticeMode("dictation");
    setStageIndex(0);
    setMaxReadStageIndex(0);
    setWordInputs([]);
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setStats(createPracticeStats(dictationStages.length));
    setShowResultModal(false);
    setPerfectStreak(null);
    setRecognizedText("");
    setReadResult(null);
    setRecognizedReadIndexes(Array.from({ length: dictationStages.length }, () => []));
    setRecordingError("");
    setRecordingUrls((current) => {
      current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return Array.from({ length: dictationStages.length }, () => null);
    });
  }, [dictationStages.length, selectedSentence.chinese, selectedSentence.text]);

  useEffect(() => {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    setRecognizedText("");
    setReadResult(null);
    setRecordingError("");
  }, [stageIndex, practiceMode]);

  useEffect(() => {
    if (!isPractice) return;
    const answer = isReadMode ? readAnswer : stage.answer;
    const timer = window.setTimeout(() => speakWord(answer), 180);
    return () => window.clearTimeout(timer);
  }, [isPractice, isReadMode, readAnswer, stageIndex, stage.answer]);

  useEffect(() => {
    if (!autoStartModeRef.current) return;
    const timer = window.setTimeout(() => {
      const mode = autoStartModeRef.current;
      if (!mode) return;
      autoStartModeRef.current = null;
      startPractice(mode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [stages.length, selectedSentence.text]);

  useEffect(() => {
    recordingUrlsRef.current = recordingUrls;
  }, [recordingUrls]);

  useEffect(() => {
    recognizedReadIndexesRef.current = recognizedReadIndexes;
  }, [recognizedReadIndexes]);

  // Keep the right-hand paragraph aligned with the sentence being read. The list
  // is only a progress view: scrolling it must not change the active left panel.
  useEffect(() => {
    if (!isPractice || !isReadMode) return;
    const container = paragraphScrollRef.current;
    if (!container) return;
    readAutoScrollLockUntilRef.current = Date.now() + 520;
    if (showResultModal) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }
    const item = activeParagraphRef.current;
    if (!item) return;
    const top = item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [isPractice, isReadMode, stageIndex, showResultModal]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (voiceAnimationRef.current !== null) cancelAnimationFrame(voiceAnimationRef.current);
      if (readScrollSettleTimerRef.current) window.clearTimeout(readScrollSettleTimerRef.current);
      voiceAudioCtxRef.current?.close();
      recordingUrlsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  function startPractice(mode: PracticeMode = practiceMode) {
    if (_audioCtx?.state === "suspended") _audioCtx.resume();
    cancelSpeech();
    const runStages = mode === "read" ? readStages : dictationStages;
    setPracticeMode(mode);
    setStats(createPracticeStats(runStages.length));
    setShowResultModal(false);
    setIsPractice(true);
    setStageIndex(0);
    setMaxReadStageIndex(0);
    setWordInputs(Array.from({ length: countDictationInputs(runStages[0].answer) }, () => ""));
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setRecognizedText("");
    setReadResult(null);
    setRecognizedReadIndexes(Array.from({ length: runStages.length }, () => []));
    setRecordingUrls((current) => {
      current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return Array.from({ length: runStages.length }, () => null);
    });
  }

  function pickRandomSentence(library = activeSentenceLibrary) {
    const nextSentence = chooseRandomSentence(library, selectedSentence);
    if (nextSentence) setSelectedSentence(nextSentence);
  }

  function handleImportTextChange(value: string) {
    setSentenceImportText(value);
    setCopyPromptStatus("idle");
    setTemplateCopyStatus("idle");
  }

  function loadImportExample() {
    setSentenceImportText(sentenceImportExample);
    setImportErrorMessage("");
    setImportHelperPrompt("");
    setCopyPromptStatus("idle");
    setTemplateCopyStatus("idle");
  }

  async function handleInterviewTemplateChange(value: string) {
    if (!value) {
      setSelectedInterviewTemplate("");
      setTemplateCopyStatus("idle");
      return;
    }

    const template = getInterviewTemplate(value as InterviewTemplateCode);
    if (!template) return;

    setSelectedInterviewTemplate(template.code);
    const prompt = createInterviewImportPrompt(template);
    const copied = await copyTextToClipboard(prompt);
    setTemplateCopyStatus(copied ? "copied" : "failed");
    setImportErrorMessage("");
    setImportHelperPrompt("");
    setCopyPromptStatus("idle");
    setImportSummary(
      copied
        ? `「${template.label}」提示词已写入剪贴板。把它发给 AI，拿到 JSON 后打开 ${gramtreeImportUrl} 粘贴导入。`
        : `无法自动复制「${template.label}」提示词，请重试或检查浏览器剪贴板权限。`,
    );
  }

  async function copySelectedInterviewTemplatePrompt() {
    if (!selectedInterviewTemplate) return;
    await handleInterviewTemplateChange(selectedInterviewTemplate);
  }

  function handleImportSentences() {
    const prompt = createSentenceImportPrompt(sentenceImportText);
    const result = parseSentenceImport(sentenceImportText);

    if (!result.ok) {
      setImportErrorMessage(result.message);
      setImportHelperPrompt(prompt);
      setImportSummary("");
      setCopyPromptStatus("idle");
      return;
    }

    const savedToStorage = saveImportedSentenceLibrary(result.sentences);
    setActiveSentenceLibrary(result.sentences);
    setIsCustomSentenceLibrary(true);
    setSelectedSentence(result.sentences[0]);
    setImportSummary(
      savedToStorage
        ? `已导入并保存 ${result.sentences.length} 句。`
        : `已导入 ${result.sentences.length} 句，但当前浏览器无法保存到 localStorage。`,
    );
    setImportErrorMessage("");
    setImportHelperPrompt("");
    setCopyPromptStatus("idle");
  }

  function clearImportedSentences() {
    removeImportedSentenceLibrary();
    setActiveSentenceLibrary(sentenceLibrary);
    setIsCustomSentenceLibrary(false);
    pickRandomSentence(sentenceLibrary);
    setSentenceImportText("");
    setImportSummary("已清除导入句子，恢复默认句库。");
    setImportErrorMessage("");
    setImportHelperPrompt("");
    setCopyPromptStatus("idle");
  }

  async function copyImportHelperPrompt() {
    if (!importHelperPrompt) return;

    const copied = await copyTextToClipboard(importHelperPrompt);
    if (copied) {
      setCopyPromptStatus("copied");
      return;
    }

    const promptNode = importPromptRef.current;
    if (promptNode) {
      promptNode.focus();
      promptNode.select();
    }
    setCopyPromptStatus("failed");
  }

  function enterReadPractice() {
    startPractice("read");
  }

  function enterDictationPractice() {
    startPractice("dictation");
  }

  function openResultModal() {
    setStats((current) => ({
      ...current,
      finishedAt: current.finishedAt ?? Date.now(),
    }));
    window.setTimeout(() => setShowResultModal(true), 650);
  }

  function goToReadStage(nextStageIndex: number) {
    if (!isReadMode || nextStageIndex === stageIndex || nextStageIndex < 0 || nextStageIndex > maxReadStageIndex) return;
    finishReadRecording({ abortRecognition: true, evaluate: false });
    readAutoScrollLockUntilRef.current = Date.now() + 420;
    setStageIndex(nextStageIndex);
    setWordInputs(Array.from({ length: countDictationInputs(stages[nextStageIndex].answer) }, () => ""));
    setActiveInputIndex(0);
    setStatus("typing");
    setReadResult(null);
    setRecognizedText("");
    setRecordingError("");
    setRecognizedReadIndexes((current) => current.map((indexes, index) => index === nextStageIndex ? [] : indexes));
  }

  function handleParagraphScroll() {
    if (!isPractice || !isReadMode || showResultModal) return;
    if (Date.now() < readAutoScrollLockUntilRef.current) return;
    const container = paragraphScrollRef.current;
    if (!container) return;
    if (readScrollSettleTimerRef.current) window.clearTimeout(readScrollSettleTimerRef.current);
    readScrollSettleTimerRef.current = window.setTimeout(() => {
      const items = Array.from(container.querySelectorAll<HTMLElement>(".readParagraphItem[data-stage-index]"));
      if (!items.length) return;
      const centerY = container.scrollTop + container.clientHeight / 2;
      let nearestStageIndex = stageIndex;
      let nearestDistance = Infinity;
      items.forEach((item) => {
        const itemCenter = item.offsetTop + item.clientHeight / 2;
        const distance = Math.abs(itemCenter - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestStageIndex = Number(item.dataset.stageIndex);
        }
      });
      goToReadStage(nearestStageIndex);
    }, 130);
  }

  function advanceStage() {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    if (stageIndex < stages.length - 1) {
      const nextStageIndex = stageIndex + 1;
      setStageIndex(nextStageIndex);
      if (isReadMode) {
        setMaxReadStageIndex((current) => Math.max(current, nextStageIndex));
      }
      setWordInputs(Array.from({ length: countDictationInputs(stages[nextStageIndex].answer) }, () => ""));
      setActiveInputIndex(0);
      setStatus("typing");
      setRecognizedReadIndexes((current) => current.map((indexes, index) => index === nextStageIndex ? [] : indexes));
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
      setWordInputs(Array.from({ length: dictationWords.length }, () => ""));
      setActiveInputIndex(0);
      setStatus("typing");
    }, 300);
  }

  function playPronunciation() {
    speakWord(isReadMode ? readAnswer : stage.answer);
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
    const shouldEvaluate = evaluate && !abortRecognition;

    if (abortRecognition || !evaluate) {
      recordingSessionIdRef.current += 1;
    }
    shouldEvaluateRecordingRef.current = shouldEvaluate;
    isRecordingRef.current = false;
    setIsRecording(false);
    stopVoiceLevelMeter();

    if (recognition) {
      if (abortRecognition || !evaluate) {
        recognition.abort();
      } else {
        recognition.stop();
      }
      speechRecognitionRef.current = null;
    } else if (evaluate && readProviderRef.current.mode === "streaming" && !speechResultAppliedRef.current) {
      applyReadResult("");
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

  function applyReadResult(transcript: string): ReadResult {
    setRecognizedText(transcript);

    // Read the already-matched tokens from a ref so accumulation survives the
    // continuous-listen restarts (the onEnd closure would otherwise keep a
    // stale snapshot and drop previously recognized words on the next utterance).
    const currentRecognizedIndexes = recognizedReadIndexesRef.current[stageIndex] ?? [];
    const newMatches = findNewReadMatches({
      transcript,
      tokens,
      tokenIndexes: readTokenIndexes,
      recognizedIndexes: currentRecognizedIndexes,
    });
    const nextRecognizedIndexes = Array.from(new Set([...currentRecognizedIndexes, ...newMatches]));
    const result: ReadResult =
      readTokenIndexes.every((tokenIndex) => nextRecognizedIndexes.includes(tokenIndex))
        ? "recognized"
        : newMatches.length > 0
          ? "try-again"
          : "not-matched";

    if (newMatches.length > 0) {
      const nextState = [...recognizedReadIndexesRef.current];
      nextState[stageIndex] = nextRecognizedIndexes;
      recognizedReadIndexesRef.current = nextState;
      setRecognizedReadIndexes(nextState);
    }

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
      return result;
    }

    if (result === "try-again") {
      setStats((current) => ({
        ...current,
        attemptsByStage: current.attemptsByStage.map((attempts, index) =>
          index === stageIndex ? attempts + 1 : attempts,
        ),
      }));
      setStatus("typing");
      return result;
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
    return result;
  }

  async function startReadRecording() {
    if (isRecordingRef.current || status === "success") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Recording is not supported in this browser.");
      setReadResult("not-matched");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setRecordingError("MediaRecorder is not supported in this browser.");
      setReadResult("not-matched");
      return;
    }

    setRecordingError("");
    setRecognizedText("");
    setReadResult(null);
    setVoiceBand(0);
    speechTranscriptRef.current = "";
    speechResultAppliedRef.current = false;

    try {
      const sessionId = recordingSessionIdRef.current + 1;
      recordingSessionIdRef.current = sessionId;
      shouldEvaluateRecordingRef.current = false;
      const provider = readProviderRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        setRecordingError("This browser could not create a recorder.");
        setReadResult("not-matched");
        return;
      }
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

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);

      const scheduleRecognitionRestart = () => {
        window.setTimeout(() => {
          if (
            recordingSessionIdRef.current === sessionId &&
            isRecordingRef.current &&
            !speechRecognitionRef.current
          ) {
            startRecognition();
          }
        }, 120);
      };

      const startRecognition = () => {
        const recognition = provider.createSession?.({
          language: "en",
          onTranscript: (transcript) => {
            if (recordingSessionIdRef.current !== sessionId) return;
            speechTranscriptRef.current = transcript;
            setRecognizedText(transcript);
          },
          onError: (message, error) => {
            if (recordingSessionIdRef.current !== sessionId) return;
            // Silence/abort between re-reads is expected while we keep the mic open.
            if (error === "no-speech" || error === "aborted") return;
            setRecordingError(error ? `Speech recognition failed: ${error}.` : "Speech recognition failed. Please try again.");
          },
          onEnd: (transcript) => {
            if (recordingSessionIdRef.current !== sessionId) return;
            speechRecognitionRef.current = null;
            const nextTranscript = transcript.trim();
            const stillRecording = isRecordingRef.current;

            // Auto-ended after a pause without catching speech: keep listening
            // instead of forcing the user to toggle the mic off and on.
            if (stillRecording && !nextTranscript) {
              scheduleRecognitionRestart();
              return;
            }

            speechResultAppliedRef.current = true;
            const result = applyReadResult(nextTranscript);

            // Words still missing: keep listening so re-reading matches the
            // remaining words in order, no manual stop/restart needed.
            if (result !== "recognized" && stillRecording) {
              scheduleRecognitionRestart();
            }
          },
        });

        if (!recognition) {
          setRecordingError("Recording started, but speech recognition is not supported.");
          return;
        }

        speechRecognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          speechRecognitionRef.current = null;
          setRecordingError("Recording started, but speech recognition could not start.");
        }
      };

      startRecognition();
    } catch (error) {
      isRecordingRef.current = false;
      setIsRecording(false);
      stopVoiceLevelMeter();
      const errorName = error instanceof DOMException ? error.name : "";
      setRecordingError(errorName ? `Microphone permission is required: ${errorName}.` : "Microphone permission is required.");
      setReadResult("not-matched");
    }
  }

  function stopReadRecording() {
    if (!isRecordingRef.current) return;
    finishReadRecording({ evaluate: true });
  }

  function toggleReadRecording() {
    if (isRecordingRef.current) {
      stopReadRecording();
      return;
    }
    startReadRecording();
  }

  function exitReadPractice() {
    finishReadRecording({ abortRecognition: true, evaluate: false });
    cancelSpeech();
    setIsPractice(false);
    setPracticeMode("dictation");
    setStageIndex(0);
    setMaxReadStageIndex(0);
    setWordInputs([]);
    setActiveInputIndex(0);
    setStatus("typing");
    setScore(0);
    setStats(createPracticeStats(dictationStages.length));
    setShowResultModal(false);
    setPerfectStreak(null);
    setRecognizedText("");
    setReadResult(null);
    setRecognizedReadIndexes(Array.from({ length: dictationStages.length }, () => []));
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
    if (!isPractice || practiceMode !== "dictation") return;

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
        if (wordInputs[activeInputIndex]?.length && activeInputIndex < dictationWords.length - 1) {
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
  }, [activeInputIndex, dictationWords.length, isPractice, practiceMode, showResultModal, stage.answer, stageIndex, stats.attemptsByStage, stats.revealedByStage, status, submittedAnswer, wordInputs]);

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

  const resultSummary = (
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
        <button type="button" className="secondaryResultButton" onClick={() => startPractice()}>
          再来一次
        </button>
        <button type="button" className="primaryResultButton" onClick={() => startPractice()}>
          免费体验
        </button>
      </footer>
    </section>
  );

  const visibleReadStageCount = isReadMode
    ? showResultModal
      ? stages.length
      : Math.min(maxReadStageIndex + 1, stages.length)
    : 0;
  const visibleReadStages = isReadMode ? stages.slice(0, visibleReadStageCount) : [];
  const nextReadStageIndex = showResultModal ? -1 : visibleReadStageCount;
  const nextReadStage = isReadMode && nextReadStageIndex < stages.length ? stages[nextReadStageIndex] : null;

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
        <div className="homeStartPanel">
          <TokenBuilder
            selectedTokens={tokens}
            translation={selectedSentence.chinese}
            enableWordSpeech={false}
            promptText="选择练习模式"
          />
          <div className="homePracticeModes" aria-label="练习模式">
            <button type="button" className="homePracticeMode primaryMode" onClick={enterDictationPractice}>
              <strong>听写</strong>
              <span>{isMobile ? "看中文提示输入英文" : "用键盘输入英文，随时播放发音"}</span>
            </button>
            <button type="button" className="homePracticeMode" onClick={enterReadPractice}>
              <strong>听读</strong>
              <span>听标准发音，再按下麦克风跟读</span>
            </button>
          </div>
          <section className="sentenceImportPanel" aria-label="JSON 导入句子">
            <div className="sentenceImportHeader">
              <div>
                <strong>JSON 导入</strong>
                <span>{isCustomSentenceLibrary ? "自定义句库" : "默认句库"} · {activeSentenceLibrary.length} 句</span>
              </div>
              <div className="sentenceImportHeaderActions">
                <button type="button" onClick={loadImportExample}>
                  示例
                </button>
                <button type="button" onClick={() => pickRandomSentence()}>
                  换新句
                </button>
              </div>
            </div>
            <div className="sentenceTemplateTools" aria-label="预设导入模板">
              <label className="sentenceTemplateField">
                <span>预设模板</span>
                <select
                  value={selectedInterviewTemplate}
                  onChange={(event) => void handleInterviewTemplateChange(event.target.value)}
                >
                  <option value="">选择面试模板</option>
                  {interviewImportTemplates.map((template) => (
                    <option key={template.code} value={template.code}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={copySelectedInterviewTemplatePrompt}
                disabled={!selectedInterviewTemplate}
              >
                {templateCopyStatus === "copied" ? "已复制模板提示词" : "复制模板提示词"}
              </button>
            </div>
            <textarea
              className="sentenceImportTextarea"
              aria-label="导入句子 JSON"
              value={sentenceImportText}
              onChange={(event) => handleImportTextChange(event.target.value)}
              placeholder={sentenceImportExample}
              spellCheck={false}
            />
            <div className="sentenceImportActions">
              <button type="button" className="primaryImportButton" onClick={handleImportSentences}>
                导入句子
              </button>
              {isCustomSentenceLibrary ? (
                <button type="button" onClick={clearImportedSentences}>
                  清除导入
                </button>
              ) : null}
            </div>
            {importSummary ? <p className="sentenceImportSummary">{importSummary}</p> : null}
            {importErrorMessage ? (
              <section className="sentenceImportAlert" role="alert" aria-live="assertive">
                <button
                  type="button"
                  className="copyImportPromptButton"
                  onClick={copyImportHelperPrompt}
                >
                  {copyPromptStatus === "copied" ? "已复制" : "复制提示词"}
                </button>
                <strong>导入失败</strong>
                <p>{importErrorMessage}</p>
                {copyPromptStatus === "failed" ? (
                  <p className="sentenceImportError">复制失败，请直接选中下面的提示词。</p>
                ) : null}
                <textarea
                  ref={importPromptRef}
                  className="importPromptTextarea"
                  aria-label="AI 整理提示词"
                  readOnly
                  value={importHelperPrompt}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </section>
            ) : null}
          </section>
        </div>
        </>
      ) : (
        <section className={`practiceShell ${isReadMode ? "readPracticeShell" : ""}`} aria-label={isReadMode ? "Read-aloud practice" : "Keyboard sentence practice"}>
          <div className="practiceTopBar">
            <strong>
              {isReadMode
                ? `Tap words, then read aloud (${stageIndex + 1}/${stages.length})`
                : `用键盘输入英文，按 Tab 切换单词（${stageIndex + 1}/${stages.length}）`}
            </strong>
            <span>{score}</span>
          </div>
          <div className="practiceProgress" aria-hidden="true">
            <span style={{ width: `${((stageIndex + (status === "success" ? 1 : 0)) / stages.length) * 100}%` }} />
          </div>

          {isReadMode ? (
            <div className="readSplit">
              <div className="readSplitLeft">
                {showResultModal ? (
                  <div className="readResultInline">{resultSummary}</div>
                ) : (
                  <>
                    {perfectStreak !== null && (
                      <div className="perfectStreak" key={perfectStreak}>
                        perfect ✕ {perfectStreak}
                      </div>
                    )}
                    <div className={`readPracticeStage ${status === "error" ? "readError" : ""} ${status === "success" ? "readSuccess" : ""}`}>
                <span className={`providerBadge ${readProvider.badge.toLowerCase()}`} title={readProvider.label}>
                  {readProvider.badge}
                </span>
                <p className="practiceTypingHint">
                  {isSentenceReadStage
                    ? "Tap the sentence to hear it first"
                    : isPhraseReadStage
                      ? "Tap the word card, then read this phrase"
                      : "Tap the word card to hear it first"}
                </p>
                <TokenBuilder
                  className={`readPracticeToken ${isSentenceReadStage ? "sentenceReadToken" : ""} ${isPhraseReadStage ? "phraseReadToken" : ""}`}
                  selectedTokens={revealedTokens}
                  speechMode="full"
                  speechText={readAnswer}
                  focusIndex={readFocusIndex}
                  tokenIndexes={readTokenIndexes}
                  recognizedTokenIndexes={recognizedReadIndexSet}
                />
                <button
                  type="button"
                  className={`holdToReadButton ${isRecording ? "recording" : ""}`}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                  aria-pressed={isRecording}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    readButtonPointerToggleAtRef.current = Date.now();
                    toggleReadRecording();
                  }}
                  onClick={() => {
                    if (Date.now() - readButtonPointerToggleAtRef.current < 600) return;
                    toggleReadRecording();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    toggleReadRecording();
                  }}
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
                <p className="readProgressText">
                  Recognized {recognizedReadCount}/{readTokenIndexes.length}
                </p>
                {recognizedText ? (
                  <p className="recognizedText">Heard: <strong>{recognizedText}</strong></p>
                ) : null}
                {recordingError ? <p className="recordingError">{recordingError}</p> : null}
                {recordingUrls[stageIndex] ? (
                  <div className="recordingPlayback">
                    <span>Your recording</span>
                    <audio controls src={recordingUrls[stageIndex] ?? undefined} />
                  </div>
                ) : null}
                    </div>
                    <div className="practiceShortcuts readPracticeShortcuts" aria-label="Read-aloud controls">
                      <button type="button" onClick={exitReadPractice}>
                        Back
                      </button>
                      <button type="button" onClick={playPronunciation}>
                        Play audio
                      </button>
                      <button type="button" onClick={advanceStage} disabled={status !== "success"}>
                        Continue
                      </button>
                      <button type="button" onClick={skipReadStage}>
                        Skip
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="readSplitRightPane" aria-label="段落进度">
                <div className="readSplitRight" ref={paragraphScrollRef} onScroll={handleParagraphScroll}>
                {visibleReadStages.map((paragraphStage, paragraphIndex) => {
                  const isActiveParagraph = paragraphIndex === stageIndex && !showResultModal;
                  const isDoneParagraph =
                    showResultModal ||
                    paragraphIndex < maxReadStageIndex ||
                    (paragraphIndex === stageIndex && status === "success");
                  const paragraphState = isActiveParagraph ? "active" : isDoneParagraph ? "done" : "upcoming";
                  return (
                    <article
                      key={`${paragraphStage.answer}-${paragraphIndex}`}
                      ref={isActiveParagraph ? activeParagraphRef : null}
                      data-stage-index={paragraphIndex}
                      className={`readParagraphItem ${paragraphState}`}
                    >
                      <span className="readParagraphIndex">{paragraphIndex + 1}</span>
                      <p className="readParagraphChinese">{paragraphStage.chinese}</p>
                    </article>
                  );
                })}
                </div>
                <aside
                  className="readParagraphMinimap"
                  aria-label="段落总览"
                >
                  <div className="readParagraphMinimapContent">
                    {stages.map((paragraphStage, paragraphIndex) => {
                      const isActiveParagraph = paragraphIndex === stageIndex && !showResultModal;
                      const isDoneParagraph = showResultModal || paragraphIndex < maxReadStageIndex;
                      const minimapState = isActiveParagraph ? "active" : isDoneParagraph ? "done" : "upcoming";
                      return (
                        <span
                          className={`readParagraphMinimapLine ${minimapState}`}
                          key={`minimap-${paragraphStage.answer}-${paragraphIndex}`}
                          title={paragraphStage.chinese}
                        >
                          {paragraphStage.chinese}
                        </span>
                      );
                    })}
                  </div>
                </aside>
                {nextReadStage ? (
                  <div className="readUpcomingPreview" aria-label="下一句预览">
                    <article className="readParagraphItem upcoming">
                      <span className="readParagraphIndex">{nextReadStageIndex + 1}</span>
                      <p className="readParagraphChinese">{nextReadStage.chinese}</p>
                    </article>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <>
            <div className="practiceCenter">
              {perfectStreak !== null && (
                <div className="perfectStreak" key={perfectStreak}>
                  perfect ✕ {perfectStreak}
                </div>
              )}
              {status === "success" ? (
              <TokenBuilder
                className="practiceResult"
                selectedTokens={revealedTokens}
                translation={stage.chinese}
                speechMode="word"
              />
            ) : (
              <div className={`practiceInputStage ${status === "error" ? "inputError" : ""}`}>
                <h1>{stage.chinese}</h1>
                <p className="practiceTypingHint">在键盘上输入</p>
                <div className="practiceWordInputs" aria-label="Word input slots">
                  {dictationSegments.map((segment, segmentIndex) => {
                    if (segment.kind === "static") {
                      return (
                        <span className="practiceStaticText" key={`static-${segmentIndex}`} aria-hidden="true">
                          {segment.text}
                        </span>
                      );
                    }

                    const inputValue = wordInputs[segment.inputIndex] ?? "";
                    const wordCharacters = Array.from(segment.text);
                    const inputCharacters = Array.from(inputValue);
                    const overflowCharacters = inputCharacters.slice(wordCharacters.length).join("");
                    return (
                      <div
                        className={`practiceWordInput ${segment.inputIndex === activeInputIndex ? "activeWordInput" : ""} ${isStageRevealed ? "answerPlaceholderSlot" : ""}`}
                        key={`${segment.text}-${segment.inputIndex}`}
                        onClick={() => setActiveInputIndex(segment.inputIndex)}
                      >
                        <span className={`practiceWordValue ${isStageRevealed ? "revealedWordValue" : ""}`}>
                          {isStageRevealed ? (
                            <>
                              {wordCharacters.map((answerChar, charIndex) => {
                                const typedChar = inputCharacters[charIndex];
                                const hasTypedChar = typedChar !== undefined;
                                const isMatchingChar = hasTypedChar && typedChar.toLowerCase() === answerChar.toLowerCase();
                                return (
                                  <span
                                    className={`practiceAnswerChar ${isMatchingChar ? "typedMatchChar" : ""} ${hasTypedChar && !isMatchingChar ? "typedMismatchChar" : ""}`}
                                    key={`${answerChar}-${charIndex}`}
                                  >
                                    {hasTypedChar && !isMatchingChar ? typedChar : answerChar}
                                  </span>
                                );
                              })}
                              {overflowCharacters ? (
                                <span className="typedOverflowChars">{overflowCharacters}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="practiceTypedValue">
                              {inputValue}
                            </span>
                          )}
                        </span>
                        <i aria-hidden="true" />
                      </div>
                    );
                  })}
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
            </>
          )}

          {showResultModal && !isReadMode ? (
            <div className="resultOverlay" role="dialog" aria-modal="true" aria-label="练习结果">
              {resultSummary}
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
