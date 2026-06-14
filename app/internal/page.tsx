"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { parseSentenceAnalysis, type SentenceParse, type SyntaxNode, type WordAnalysis } from "@/lib/grammar";

type PositionedSyntaxNode = Omit<SyntaxNode, "children"> & {
  x: number;
  y: number;
  width: number;
  left: number;
  children?: PositionedSyntaxNode[];
};

const boxWidth = 104;
const boxHeight = 44;
const wordBoxHeight = 44;
const levelHeight = 84;
const siblingGap = 34;

function syntaxCode(node: SyntaxNode) {
  const map: Record<string, string> = {
    ROOT: "Root",
    Sentence: "Sentence",
    "Noun Phrase": "Noun Phrase",
    "Verb Phrase": "Verb Phrase",
    "Prepositional Phrase": "Prepositional Phrase",
    "Adjective Phrase": "Adjective Phrase",
    Determiner: "Determiner",
    "Possessive Determiner": "Possessive Determiner",
    Pronoun: "Pronoun",
    Noun: "Noun",
    Word: "Word",
    Adjective: "Adjective",
    Adverb: "Adverb",
    Preposition: "Preposition",
    "Modal Auxiliary": "Modal Auxiliary",
    "Auxiliary Verb": "Auxiliary Verb",
    "Main Verb": "Verb",
    "Linking Verb": "Linking Verb",
    Conjunction: "Conjunction",
    Punctuation: "Punctuation",
    Value: "Value",
  };

  return map[node.label] ?? node.label;
}

function nodeLabel(node: SyntaxNode) {
  return node.children?.length ? syntaxCode(node) : node.text ?? "";
}

function nodeBoxWidth(node: SyntaxNode) {
  const label = nodeLabel(node);
  return Math.max(boxWidth, label.length * 10 + 38, (node.role?.length ?? 0) * 8 + 36);
}

function layoutSyntaxTree(node: SyntaxNode, depth = 0): PositionedSyntaxNode {
  const children = node.children?.map((child) => layoutSyntaxTree(child, depth + 1)) ?? [];
  const ownWidth = nodeBoxWidth(node);
  const childWidth = children.length
    ? children.reduce((sum, child) => sum + child.width, 0) + siblingGap * (children.length - 1)
    : 0;
  const width = Math.max(ownWidth, childWidth);
  let cursor = (width - childWidth) / 2;
  const positionedChildren = children.map((child) => {
    const positioned = { ...child, left: cursor };
    cursor += child.width + siblingGap;
    return positioned;
  });

  return {
    ...node,
    x: width / 2,
    y: 36 + depth * levelHeight,
    width,
    left: 0,
    children: positionedChildren,
  };
}

function maxSyntaxDepth(node: PositionedSyntaxNode): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map(maxSyntaxDepth));
}

function renderSyntaxNode(node: PositionedSyntaxNode, offsetX = 0): ReactNode[] {
  const absoluteX = offsetX + node.x;
  const isLeaf = !node.children?.length;
  const label = nodeLabel(node);
  const nodeWidth = nodeBoxWidth(node);
  const nodeClass = isLeaf ? "constituencyWordNode" : "constituencyPhraseNode";
  const children =
    node.children?.flatMap((child) => renderSyntaxNode(child, offsetX + child.left)) ?? [];
  const edges =
    node.children?.map((child) => {
      const childOffsetX = offsetX + child.left;
      const childX = childOffsetX + child.x;
      return (
        <line
          key={`${node.id}-${child.id}-edge`}
          className="constituencyEdge"
          x1={absoluteX}
          y1={node.y + boxHeight / 2}
          x2={childX}
          y2={child.y - boxHeight / 2}
        />
      );
    }) ?? [];

  return [
    ...edges,
    ...children,
    <g key={node.id} transform={`translate(${absoluteX - nodeWidth / 2} ${node.y - boxHeight / 2})`}>
      <rect className={nodeClass} width={nodeWidth} height={isLeaf ? wordBoxHeight : boxHeight} rx="8" />
      <text className="constituencyText" x={nodeWidth / 2} y={node.role && !isLeaf ? 21 : 28} textAnchor="middle">
        {label}
      </text>
      {node.role && !isLeaf ? (
        <text className="constituencyRoleText" x={nodeWidth / 2} y="35" textAnchor="middle">
          {node.role}
        </text>
      ) : null}
    </g>,
  ];
}

function ConstituencyDiagram({ tree: syntaxTree }: { tree: SyntaxNode }) {
  const tree = useMemo(() => layoutSyntaxTree(syntaxTree), [syntaxTree]);
  const width = Math.max(760, tree.width + 96);
  const height = Math.max(560, maxSyntaxDepth(tree) * levelHeight + 72);

  return (
    <div className="constituencyShell" aria-label="Constituency parse tree">
      <div className="constituencyHeader">
        <div>
          <p className="eyebrow">Constituency Parse</p>
          <h2>Phrase structure tree</h2>
        </div>
      </div>
      <div className="constituencyCanvas">
        <svg className="constituencySvg" viewBox={`0 0 ${width} ${height}`} role="img">
          <title>Constituency parse tree</title>
          <g transform="translate(48 0)">{renderSyntaxNode(tree)}</g>
        </svg>
      </div>
    </div>
  );
}

function posTone(partOfSpeech: string) {
  if (partOfSpeech === "Determiner") return "toneDeterminer";
  if (partOfSpeech === "Noun") return "toneNoun";
  if (partOfSpeech === "Linking Verb" || partOfSpeech === "Verb") return "toneVerb";
  if (partOfSpeech === "Preposition") return "tonePreposition";
  if (partOfSpeech === "Adjective" || partOfSpeech === "Adverb") return "toneModifier";
  return "toneDefault";
}

function componentTone(component: string) {
  if (component === "Subject") return "componentSubject";
  if (component === "Verb") return "componentVerb";
  if (component === "Adverbial") return "componentPreposition";
  if (component === "Object") return "componentPredicate";
  if (component === "Complement") return "componentComplement";
  return "componentDefault";
}

function groupWords(words: WordAnalysis[]) {
  return words.reduce<WordAnalysis[][]>((groups, word) => {
    const lastGroup = groups[groups.length - 1];
    const lastWord = lastGroup?.[lastGroup.length - 1];
    if (!lastGroup || lastWord?.sentenceComponent !== word.sentenceComponent) {
      groups.push([word]);
    } else {
      lastGroup.push(word);
    }
    return groups;
  }, []);
}

function WordInspector({ words }: { words: WordAnalysis[] }) {
  const groups = groupWords(words);

  return (
    <section className="legacyWordInspector" aria-label="Word-level part of speech inspector">
      <div className="legacyWordInspectorHeader">
        <p className="eyebrow">Sentence Component Inspector</p>
        <span>Hover a word to inspect POS</span>
      </div>
      <div className="wordStrip">
        {groups.map((group) => (
          <div className={`componentGroup ${componentTone(group[0].sentenceComponent)}`} key={`${group[0].sentenceComponent}-${group[0].id}`}>
            <div className="phoneticRow">
              {group.map((word) => (
                <span key={`${word.id}-sound`}>/{word.text.toLowerCase()}/</span>
              ))}
            </div>
            <div className="componentWords">
              {group.map((word) => (
                <button className={`wordChip ${posTone(word.partOfSpeech)}`} key={word.id} type="button">
                  <span className="legacyWordText">{word.text}</span>
                  <span className="wordTooltip" role="tooltip">
                    <strong>{word.text}</strong>
                    <span>Part of speech: {word.partOfSpeech}</span>
                    <span>Sentence component: {word.sentenceComponent}</span>
                    <span>Role: {word.role}</span>
                    {word.chunk ? <span>Phrase chunk: {word.chunk}</span> : null}
                    {word.tags.length ? <span>Compromise tags: {word.tags.join(", ")}</span> : null}
                  </span>
                </button>
              ))}
            </div>
            <div className="posRow">
              {group.map((word) => (
                <span className={posTone(word.partOfSpeech)} key={`${word.id}-pos`}>
                  {word.partOfSpeech}
                </span>
              ))}
            </div>
            <div className="componentLabel">{group[0].sentenceComponent}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const examples = [
  "This note is about the lesson",
  "The curious student quickly reads a grammar book.",
  "She is happy in the classroom.",
  "My teacher will explain the visual tree.",
];

export default function Home() {
  const [sentence, setSentence] = useState(examples[0]);
  const analysis = useMemo<SentenceParse>(() => parseSentenceAnalysis(sentence), [sentence]);
  const words = analysis.tokens;
  const phraseLabels = Array.from(new Set(words.map((word) => word.sentenceComponent))).slice(0, 4);
  const wordCount = sentence.trim().split(/\s+/).filter(Boolean).length;

  return (
    <main className="pageShell">
      <a
        href="https://github.com/ZangaiFamily/gramtree"
        target="_blank"
        rel="noopener noreferrer"
        className="githubCorner"
        aria-label="View source on GitHub"
      >
        <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
      <nav className="internalToolMenu" aria-label="Internal tools">
        <Link href="/internal/audio-check">Audio check</Link>
        <Link href="/internal/asr-check">ASR check</Link>
      </nav>
      <section className="inputPane" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Syntax Studio</p>
          <h1 id="app-title">Sentence map</h1>
          <p className="intro">
            Type a simple English sentence and watch the grammar tree redraw as the subject, predicate, modifiers, and complements change.
          </p>
        </div>

        <label className="sentenceLabel" htmlFor="sentence">
          English sentence
        </label>
        <textarea
          id="sentence"
          value={sentence}
          onChange={(event) => setSentence(event.target.value)}
          rows={4}
          spellCheck
          placeholder="Type an English sentence..."
        />

        <div className="exampleRow" aria-label="Example sentences">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setSentence(example)}>
              {example}
            </button>
          ))}
        </div>
      </section>

      <section className="diagramPane" aria-label="Syntax tree result">
        <div className="diagramHeader">
          <div>
            <p className="eyebrow">Live Grammar Diagram</p>
            <h2>Constituency view</h2>
          </div>
          <span>{wordCount} words</span>
        </div>
        <div className="structureBar" aria-label="Detected grammar structures">
          <strong>Phrases:</strong>
          {phraseLabels.length ? (
            phraseLabels.map((label) => <span key={label}>{label}</span>)
          ) : (
            <span>Awaiting sentence</span>
          )}
          <strong>Pattern:</strong>
          <span>{analysis.pattern}</span>
          <strong>Confidence:</strong>
          <span>{analysis.confidence}</span>
        </div>
        <WordInspector words={words} />
        <ConstituencyDiagram tree={analysis.tree} />
      </section>
    </main>
  );
}
