import nlp from "compromise";

export type SentencePattern = "SV" | "SVO" | "SVP" | "SVOO" | "SVOC";
export type ParseConfidence = "high" | "medium" | "low";

export type SyntaxNode = {
  id: string;
  label: string;
  role?: string;
  text?: string;
  children?: SyntaxNode[];
};

export type WordAnalysis = {
  id: string;
  text: string;
  normal: string;
  partOfSpeech: string;
  sentenceComponent: string;
  role: string;
  chunk?: string;
  tags: string[];
};

export type SentenceParse = {
  original: string;
  pattern: SentencePattern;
  confidence: ParseConfidence;
  tokens: WordAnalysis[];
  subject?: string;
  predicate: {
    verb?: string;
    object?: string;
    secondObject?: string;
    complement?: string;
    objectComplement?: string;
  };
  tree: SyntaxNode;
};

type CompromiseTerm = {
  text: string;
  normal?: string;
  post?: string;
  tags?: string[];
  chunk?: string;
};

type Token = {
  id: string;
  text: string;
  normal: string;
  index: number;
  tags: Set<string>;
  chunk?: string;
};

const linkingVerbs = new Set(["be", "am", "is", "are", "was", "were", "been", "being", "become", "becomes", "became", "seem", "seems", "feel", "feels", "look", "looks", "sound", "sounds"]);

const idFor = (label: string, index: number) => `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;

const hasTag = (token: Token, tag: string) => token.tags.has(tag);

function tokenize(sentence: string): Token[] {
  const terms = (nlp(sentence).json()[0]?.terms ?? []) as CompromiseTerm[];
  const tokens: Token[] = [];

  terms.forEach((term, index) => {
    const normal = term.normal ?? term.text.toLowerCase();
    tokens.push({
      id: idFor(`token-${normal}`, index),
      text: term.text,
      normal,
      index,
      tags: new Set(term.tags ?? []),
      chunk: term.chunk,
    });
  });

  return tokens;
}

function partOfSpeech(token: Token) {
  if (hasTag(token, "Determiner")) return "Determiner";
  if (hasTag(token, "Possessive")) return "Possessive Determiner";
  if (hasTag(token, "Pronoun")) return "Pronoun";
  if (hasTag(token, "Copula")) return "Linking Verb";
  if (hasTag(token, "Modal")) return "Modal Auxiliary";
  if (hasTag(token, "Auxiliary")) return "Auxiliary Verb";
  if (hasTag(token, "Verb")) return "Verb";
  if (hasTag(token, "Preposition")) return "Preposition";
  if (hasTag(token, "Conjunction")) return "Conjunction";
  if (hasTag(token, "Adverb")) return "Adverb";
  if (hasTag(token, "Adjective")) return "Adjective";
  if (hasTag(token, "Noun")) return "Noun";
  if (hasTag(token, "Value")) return "Value";
  return "Word";
}

function isVerbToken(token: Token) {
  return hasTag(token, "Verb") || hasTag(token, "Auxiliary") || hasTag(token, "Modal");
}

function isNounLike(token: Token) {
  return hasTag(token, "Noun") || hasTag(token, "Pronoun");
}

function isModifierBeforeNoun(token: Token) {
  return hasTag(token, "Determiner") || hasTag(token, "Possessive") || hasTag(token, "Adjective") || hasTag(token, "Value");
}

function isLinkingVerb(token?: Token) {
  return Boolean(token && (hasTag(token, "Copula") || linkingVerbs.has(token.normal)));
}

function textOf(tokens: Token[]) {
  return tokens.map((token) => token.text).join(" ");
}

function findMainVerb(tokens: Token[]) {
  const verbIndex = tokens.findIndex((token) => isVerbToken(token) && !hasTag(token, "Auxiliary") && !hasTag(token, "Modal"));
  if (verbIndex !== -1) return verbIndex;
  return tokens.findIndex(isVerbToken);
}

function findSubjectRange(tokens: Token[], verbIndex: number) {
  if (verbIndex <= 0) return [] as Token[];
  const beforeVerb = tokens.slice(0, verbIndex);
  const headIndex = beforeVerb.map(isNounLike).lastIndexOf(true);
  if (headIndex === -1) return beforeVerb;

  let start = headIndex;
  while (start > 0 && isModifierBeforeNoun(beforeVerb[start - 1])) {
    start -= 1;
  }
  return beforeVerb.slice(start);
}

function splitPostVerb(tokens: Token[], verbIndex: number) {
  const verb = tokens[verbIndex];
  const afterVerb = tokens.slice(verbIndex + 1);

  if (isLinkingVerb(verb)) {
    return {
      object: [] as Token[],
      complement: afterVerb,
    };
  }

  const object = afterVerb.filter((token) => !hasTag(token, "Adjective"));
  const objectTokenIds = new Set(object.map((t) => t.id));
  const objectComplement = afterVerb.filter((token) => !objectTokenIds.has(token.id) && (hasTag(token, "Adjective") || isNounLike(token)));

  return {
    object,
    complement: [] as Token[],
    objectComplement,
  };
}

function classifyPattern(input: {
  verb?: Token;
  object: Token[];
  secondObject: Token[];
  complement: Token[];
  objectComplement: Token[];
}): SentencePattern {
  if (isLinkingVerb(input.verb) && input.complement.length) return "SVP";
  if (input.object.length && input.secondObject.length) return "SVOO";
  if (input.object.length && input.objectComplement.length) return "SVOC";
  if (input.object.length) return "SVO";
  return "SV";
}

function componentFor(token: Token, parseParts: {
  subject: Token[];
  verb?: Token;
  object: Token[];
  complement: Token[];
  objectComplement: Token[];
}) {
  if (parseParts.subject.some((candidate) => candidate.id === token.id)) return "Subject";
  if (parseParts.verb?.id === token.id) return "Verb";
  if (parseParts.object.some((candidate) => candidate.id === token.id)) return "Object";
  if (parseParts.complement.some((candidate) => candidate.id === token.id)) {
    if (parseParts.verb && isLinkingVerb(parseParts.verb)) return "Predicate";
    return "Complement";
  }
  if (parseParts.objectComplement.some((candidate) => candidate.id === token.id)) return "Object Complement";
  return "Predicate";
}

function roleFor(token: Token, component: string) {
  if (component === "Subject" && isNounLike(token)) return "Head noun of the subject";
  if (component === "Subject" && isModifierBeforeNoun(token)) return "Modifier inside the subject";
  if (component === "Verb" && isLinkingVerb(token)) return "Links subject and complement";
  if (component === "Verb") return "Main finite verb";
  if (component === "Object" && isNounLike(token)) return "Object noun";
  if (component === "Predicate") return "Subject predicative";
  if (component === "Complement") return "Subject complement";
  if (component === "Object Complement") return "Describes or renames the object";
  return "Predicate token";
}

function terminalNode(token: Token, component: string): SyntaxNode {
  return {
    id: idFor(`${partOfSpeech(token)}-${token.text}`, token.index),
    label: partOfSpeech(token),
    role: component,
    text: token.text,
    children: [
      {
        id: idFor(`terminal-${token.text}`, token.index),
        label: "Terminal",
        text: token.text,
      },
    ],
  };
}

function phraseNode(label: string, role: string, tokens: Token[]): SyntaxNode {
  return {
    id: idFor(`${label}-${role}`, tokens[0]?.index ?? 0),
    label,
    role,
    text: textOf(tokens),
    children: tokens.map((token) => terminalNode(token, role)),
  };
}

function confidenceFor(tokens: Token[], verbIndex: number, pattern: SentencePattern): ParseConfidence {
  if (!tokens.length || verbIndex === -1) return "low";
  if (pattern === "SVOC" || pattern === "SVOO") return "low";
  if (tokens.length > 10) return "medium";
  return "high";
}

export function parseSentenceAnalysis(sentence: string): SentenceParse {
  const tokens = tokenize(sentence);
  const verbIndex = findMainVerb(tokens);
  const verb = verbIndex >= 0 ? tokens[verbIndex] : undefined;
  const subject = verbIndex >= 0 ? findSubjectRange(tokens, verbIndex) : tokens.filter(isNounLike);
  const predicateParts = verbIndex >= 0 ? splitPostVerb(tokens, verbIndex) : { object: [], complement: [], objectComplement: [] };
  const secondObject: Token[] = [];
  const pattern = classifyPattern({
    verb,
    object: predicateParts.object,
    secondObject,
    complement: predicateParts.complement,
    objectComplement: predicateParts.objectComplement ?? [],
  });
  const confidence = confidenceFor(tokens, verbIndex, pattern);
  const parseParts = {
    subject,
    verb,
    object: predicateParts.object,
    complement: predicateParts.complement,
    objectComplement: predicateParts.objectComplement ?? [],
  };

  const analyzedTokens = tokens.map((token) => {
    const component = componentFor(token, parseParts);
    return {
      id: token.id,
      text: token.text,
      normal: token.normal,
      partOfSpeech: partOfSpeech(token),
      sentenceComponent: component,
      role: roleFor(token, component),
      chunk: token.chunk,
      tags: Array.from(token.tags),
    };
  });

  const children: SyntaxNode[] = [];
  if (subject.length) children.push(phraseNode("Subject", "Subject", subject));
  if (verb) children.push(phraseNode("Verb", "Verb", [verb]));
  if (predicateParts.object.length) children.push(phraseNode("Object", "Object", predicateParts.object));
  if (predicateParts.complement.length) children.push(phraseNode("Predicate", "Predicate", predicateParts.complement));
  if (predicateParts.objectComplement?.length) children.push(phraseNode("Object Complement", "Object Complement", predicateParts.objectComplement));

  return {
    original: sentence,
    pattern,
    confidence,
    tokens: analyzedTokens,
    subject: textOf(subject) || undefined,
    predicate: {
      verb: verb?.text,
      object: textOf(predicateParts.object) || undefined,
      secondObject: textOf(secondObject) || undefined,
      complement: textOf(predicateParts.complement) || undefined,
      objectComplement: textOf(predicateParts.objectComplement ?? []) || undefined,
    },
    tree: {
      id: "root",
      label: "Sentence",
      role: pattern,
      text: sentence,
      children,
    },
  };
}

export function parseWordAnalysis(sentence: string): WordAnalysis[] {
  return parseSentenceAnalysis(sentence).tokens;
}

export function parseComponentTree(sentence: string): SyntaxNode {
  return {
    id: "component-root",
    label: "Root",
    children: [parseSentenceAnalysis(sentence).tree],
  };
}
