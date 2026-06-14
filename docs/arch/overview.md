# gramtree 架构概览

本文档基于当前代码生成，描述 gramtree 的前端架构、核心数据流、练习模式、音频能力和部署边界。

## 目标

gramtree 当前是一个纯前端 Next.js 应用，核心体验分为两条线：

- 首页句子卡片展示：展示随机经典英文句子、词性、音标、中文释义和整句翻译。
- 练习模式：用户在首页选择 `听读` 或 `听写`，进入对应的练习流程。

另有一个内部音频检测页，用来检查当前浏览器是否支持标准发音播放、麦克风录音、语音识别和录音回放。

## 技术栈

- `Next.js 16` + App Router：页面入口在 `app/`。
- `React 19`：主要交互逻辑集中在客户端组件。
- `TypeScript`：类型定义与业务状态均在组件内声明。
- `compromise`：用于 `lib/grammar.ts` 的英语分词、词性标签和句型启发式分析。
- 浏览器 Web APIs：
  - `speechSynthesis`：播放标准英文发音。
  - `getUserMedia`：获取麦克风音频流。
  - `MediaRecorder`：录制用户跟读音频。
  - `SpeechRecognition` / `webkitSpeechRecognition`：浏览器原生 STT。
  - `AudioContext`：生成键盘音效、成功音效和麦克风音量动画。

## 目录结构

```text
app/
  layout.tsx                    # 应用 metadata 和根布局
  page.tsx                      # 首页、听读/听写练习、结果弹窗
  globals.css                   # 全局样式、首页、练习页、音频检测页样式
  internal/
    page.tsx                    # 内部语法图页面
    audio-check/page.tsx        # 音频能力检测页
    asr-check/page.tsx          # 纯前端 Whisper STT 检测页
lib/
  grammar.ts                    # compromise 驱动的句法分析模块
  stt/                          # STT provider 抽象与浏览器端 ASR spike
docs/
  arch/overview.md              # 当前文档
```

## 页面与模块边界

### `app/page.tsx`

主页面是当前应用的核心。它承担了以下职责：

- 随机选择一句经典英文句子。
- 生成展示用 token 元数据，包括词性、音标、中文释义和颜色 token。
- 渲染首页句子卡片与 `听读` / `听写` 两个模式入口。
- 管理练习状态、阶段推进、计分、结果弹窗。
- 管理听读模式中的录音、STT、音量动画、录音回放。
- 管理听写模式中的键盘输入、提交、显示答案和快捷键。

当前该页面是一个较大的客户端组件，业务逻辑和 UI 渲染耦合在同一文件中。

### `lib/grammar.ts`

语法分析模块与练习模式相对独立，当前主要供内部语法图页面使用。它提供：

- `parseSentenceAnalysis(sentence)`：返回完整句型、置信度、词级分析和树结构。
- `parseWordAnalysis(sentence)`：返回词级分析。
- `parseComponentTree(sentence)`：返回根节点包装后的句法树。

该模块依赖 `compromise`，使用启发式规则识别主谓宾表补结构。

### `app/internal/audio-check/page.tsx`

音频检测页是一个独立客户端页面，用于检查浏览器环境：

- 第一步：用 `speechSynthesis` 播放 `practice` 的标准发音。
- 第二步：用 `getUserMedia` + `MediaRecorder` 录音，并用 `SpeechRecognition` 做识别。
- 第三步：汇总测试结果，并可返回首页进入 `听读` 模式。

注意：主练习页的听读按钮当前是“按下开始、再次按下停止”的切换交互；音频检测页当前仍是“按住录音、松开停止”的检测交互。

### `app/internal/asr-check/page.tsx`

纯前端 ASR 检测页，用于验证 `TransformersWhisperProvider` 是否能在当前静态部署模型下工作：

- 检测 `TransformersWhisperProvider` 是否可用。
- 显示 `SpeechRecognitionProvider` 的可用性，并标记其为 deprecated fallback。
- 录制一段用户音频后，调用浏览器端 Whisper tiny provider 进行 STT。
- 展示 transcript、耗时和单词级评分结果。

该页面是新方案的 spike 入口，不替换当前主听读流程。

### `lib/stt`

STT provider 抽象层：

- `types.ts`：定义 `SttProvider`、`SttTranscript`、`SttWord` 等共享类型。
- `speechRecognitionProvider.ts`：封装旧 `SpeechRecognition` 方案，标记为 deprecated。
- `transformersWhisperProvider.ts`：封装 `@huggingface/transformers` 的 Whisper tiny 浏览器端 ASR。
- `scoring.ts`：提供 `scoreReadAttempt()` 和文本归一化逻辑。

## 首页与练习模式

首页渲染由 `Home` 组件控制：

```text
Home
  ├─ TokenBuilder：展示当前句子
  ├─ 听读入口：enterReadPractice()
  ├─ 听写入口：enterDictationPractice()
  └─ 麦克风检测弹窗：showMicPrompt
```

模式由 `practiceMode` 显式管理：

```ts
type PracticeMode = "read" | "dictation";
```

- `read`：听读。显示 token 卡片、麦克风按钮、识别结果、录音回放和读音控制按钮。
- `dictation`：听写。显示中文提示、单词输入槽、键盘输入和快捷按钮。

设备判断 `isMobile` 只用于少量展示文案，不再决定进入哪个练习模式。

## 练习阶段模型

句子会被拆成若干阶段：

```text
每个单词一个阶段
最后再追加整句阶段
```

阶段结构：

```ts
type Stage = {
  answer: string;
  chinese: string;
  tokenIndexes: number[];
};
```

生成逻辑：

- `createTokens(sentence)`：把句子拆成 token，并推断展示元数据。
- `createStages(tokens, sentence)`：
  - 每个 token 生成一个单词阶段。
  - 最后生成一个整句阶段。

听读和听写共用同一套 `stages`、`stageIndex`、`stats`、`score` 和结果弹窗逻辑。

## 听读模式数据流

听读模式复用 `readPracticeStage` UI 和录音逻辑，桌面端和移动端一致。

```text
用户按下麦克风按钮
  → toggleReadRecording()
  → startReadRecording()
  → getUserMedia({ audio: true })
  → MediaRecorder.start()
  → SpeechRecognition.start()
  → onresult 更新 recognizedText

用户再次按下麦克风按钮
  → stopReadRecording()
  → finishReadRecording({ evaluate: true })
  → recognition.stop()
  → recorder.stop()
  → onend compareSpeechToTarget()
  → applyReadResult()
  → 更新 status / stats / score
```

主要状态：

- `isRecording`：控制按钮视觉状态。
- `recognizedText`：当前 STT 识别出来的文本。
- `readResult`：`recognized`、`try-again` 或 `not-matched`。
- `recordingUrls`：每个阶段保存一个录音回放 URL。
- `voiceBand`：根据麦克风音量更新按钮内的信号条动画。
- `recordingSessionIdRef`：避免旧异步录音/识别回调污染当前阶段。

匹配逻辑在 `compareSpeechToTarget()`：

- 先归一化 transcript 和 target。
- 完全一致则 `recognized`。
- 单词阶段只要 transcript 包含目标词，也算 `recognized`。
- 整句阶段只要有部分目标词匹配，则 `try-again`。
- 完全无匹配则 `not-matched`。

当前 STT 依赖浏览器原生 `SpeechRecognition`，因此会受到浏览器兼容性和近音词识别偏差影响。

代码层已经新增 `lib/stt` provider 抽象和 `/internal/asr-check` spike 页面，但主听读流程尚未切换到新 provider，以避免影响现有功能。

## 听写模式数据流

听写模式保留键盘输入体验：

```text
用户进入听写
  → startPractice("dictation")
  → 自动播放当前阶段答案
  → 用户键盘输入
  → Enter 提交
  → submitStage()
  → normalizeInput(submittedAnswer) 与 normalizeInput(stage.answer) 比较
```

主要交互：

- 字母键和 `'`：写入当前输入槽。
- `Backspace`：删除当前输入槽末尾字符。
- `Tab`：移动到下一个单词输入槽。
- `Enter`：提交；成功状态下继续下一阶段。
- `Ctrl/Cmd + '`：播放标准发音。
- `Ctrl/Cmd + ;`：显示答案。

听写模式成功时会更新分数和 streak；错误时清空当前阶段输入并重试。

## 计分与统计

练习统计由 `PracticeStats` 管理：

```ts
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
```

关键规则：

- 第一次答对且没有显示答案：`perfect`，加 `1000` 分。
- 答对但非完美：`good`，加 `720` 分。
- 听读跳过或听写显示答案会增加 `skipped` 并清空 streak。
- 错误会增加 `mistakes`，并增加当前阶段尝试次数。
- 最后一阶段完成后调用 `openResultModal()` 展示结果。

## 音频能力边界

当前实现完全在浏览器端完成音频处理：

- 标准发音来自 `speechSynthesis`。
- 用户音频来自 `getUserMedia`。
- 录音文件由 `MediaRecorder` 生成，并通过 `URL.createObjectURL()` 在本地回放。
- STT 来自 `SpeechRecognition` / `webkitSpeechRecognition`。

没有后端，也没有外部 STT API。优点是部署简单、无服务端成本；缺点是：

- `SpeechRecognition` 浏览器兼容性有限。
- 识别质量由浏览器厂商决定。
- 近音词如 `then` / `than` 容易被语言模型猜错。
- 无法拿到稳定的词级或音素级发音评分。

如果后续要提升听读准确度，应将听读从普通 STT 迁移到后端发音评测或强制对齐服务。

## 语法分析模块

`lib/grammar.ts` 的数据流：

```text
sentence
  → compromise tokenize/POS tags
  → findMainVerb()
  → findSubjectRange()
  → splitPostVerb()
  → classifyPattern()
  → componentFor() / roleFor()
  → SyntaxNode tree
```

句型分类支持：

- `SV`
- `SVO`
- `SVP`
- `SVOO`
- `SVOC`

当前 `SVOO` 的 `secondObject` 仍为空数组，因此实际完整支持度有限。`SVOC` / `SVOO` 的置信度会降为 `low`。

## 部署模型

项目使用静态导出：

```ts
output: "export";
basePath: isDev ? undefined : "/gramtree";
images: {
  unoptimized: true;
}
```

部署命令：

```bash
npm run deploy
```

该命令执行：

```text
npm run export
  → next build
gh-pages -d out --dotfiles
  → 发布 out/ 到 gh-pages 分支
```

因此线上运行环境没有 Node.js 服务端，所有功能都必须能在浏览器静态页面内运行。

## 已知架构约束

- `app/page.tsx` 文件较大，首页、练习模式、音频逻辑、计分逻辑和结果弹窗都在同一组件内。
- 听读与听写已用 `practiceMode` 拆分，但 UI 组件还未进一步模块化。
- 音频检测页和主听读页的录音交互不完全一致。
- STT 依赖浏览器原生 API，兼容性和准确性不可控。
- 练习句库、词义、音标和词性推断均为前端静态数据，扩展需要改代码。

## 后续演进建议

优先级从高到低：

1. 将听读 UI、录音控制、STT 适配、计分逻辑拆成独立 hook 和组件。
2. 统一主听读页和音频检测页的录音交互。
3. 抽象 STT provider，先保留浏览器 STT，再接入后端 STT 或发音评测。
4. 为听读模式引入 reference-text pronunciation assessment，解决近音词判定问题。
5. 将句库、词义、音标数据移到结构化数据文件，降低 `app/page.tsx` 体积。
6. 为 `compareSpeechToTarget()`、`createStages()` 和 `parseSentenceAnalysis()` 增加单元测试。
