export function normalizeSttText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/%/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// SpeechRecognition frequently collapses spoken word pairs into a contraction
// (e.g. "I am" -> "I'm"), which would never match the separate target tokens.
// Expanding them back into individual words keeps read-aloud matching robust.
const contractionExpansions: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "i've": ["i", "have"],
  "i'll": ["i", "will"],
  "i'd": ["i", "would"],
  "you're": ["you", "are"],
  "you've": ["you", "have"],
  "you'll": ["you", "will"],
  "you'd": ["you", "would"],
  "we're": ["we", "are"],
  "we've": ["we", "have"],
  "we'll": ["we", "will"],
  "we'd": ["we", "would"],
  "they're": ["they", "are"],
  "they've": ["they", "have"],
  "they'll": ["they", "will"],
  "they'd": ["they", "would"],
  "he's": ["he", "is"],
  "he'll": ["he", "will"],
  "he'd": ["he", "would"],
  "she's": ["she", "is"],
  "she'll": ["she", "will"],
  "she'd": ["she", "would"],
  "it's": ["it", "is"],
  "it'll": ["it", "will"],
  "that's": ["that", "is"],
  "there's": ["there", "is"],
  "here's": ["here", "is"],
  "what's": ["what", "is"],
  "who's": ["who", "is"],
  "where's": ["where", "is"],
  "let's": ["let", "us"],
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "weren't": ["were", "not"],
  "haven't": ["have", "not"],
  "hasn't": ["has", "not"],
  "hadn't": ["had", "not"],
  "won't": ["will", "not"],
  "wouldn't": ["would", "not"],
  "couldn't": ["could", "not"],
  "shouldn't": ["should", "not"],
  "can't": ["can", "not"],
  "cannot": ["can", "not"],
  "mustn't": ["must", "not"],
};

export function expandSpeechContractions(words: string[]) {
  return words.flatMap((word) => contractionExpansions[word] ?? [word]);
}

export function extractSpeechWords(value: string) {
  const normalized = normalizeSttText(value);
  if (!normalized) return [];
  return expandSpeechContractions(normalized.split(" "));
}

const cmuPronunciations: Record<string, string[]> = {
  be: ["B IY"],
  bee: ["B IY"],
  by: ["B AY"],
  buy: ["B AY"],
  bye: ["B AY"],
  for: ["F AO R", "F ER"],
  four: ["F AO R"],
  hear: ["HH IY R"],
  here: ["HH IY R"],
  i: ["AY"],
  in: ["IH N"],
  eye: ["AY"],
  know: ["N OW"],
  no: ["N OW"],
  knew: ["N UW"],
  new: ["N UW"],
  made: ["M EY D"],
  maid: ["M EY D"],
  one: ["W AH N"],
  won: ["W AH N"],
  our: ["AW ER", "AA R"],
  hour: ["AW ER"],
  peace: ["P IY S"],
  piece: ["P IY S"],
  right: ["R AY T"],
  write: ["R AY T"],
  road: ["R OW D"],
  rode: ["R OW D"],
  sea: ["S IY"],
  see: ["S IY"],
  sing: ["S IH NG"],
  son: ["S AH N"],
  sun: ["S AH N"],
  their: ["DH EH R"],
  there: ["DH EH R"],
  "they're": ["DH EH R"],
  to: ["T UW", "T AH"],
  too: ["T UW"],
  two: ["T UW"],
  waze: ["W EY Z"],
  weak: ["W IY K"],
  week: ["W IY K"],
  wheese: ["W IY Z"],
  wheeze: ["W IY Z"],
  whole: ["HH OW L"],
  hole: ["HH OW L"],
  with: ["W IH DH", "W IH TH", "W IY Z", "W EY Z"],
  wood: ["W UH D"],
  would: ["W UH D"],
  your: ["Y AO R", "Y UH R"],
  yin: ["Y IH N"],
  "you're": ["Y AO R", "Y UH R"],
};

const numberTermAliases: Record<string, string[]> = {
  "0": ["zero", "oh"],
  "1": ["one"],
  "2": ["two", "to", "too"],
  "3": ["three"],
  "4": ["four", "for"],
  "5": ["five"],
  "6": ["six"],
  "7": ["seven"],
  "8": ["eight", "ate"],
  "9": ["nine"],
  "10": ["ten"],
  "11": ["eleven"],
  "12": ["twelve"],
  "13": ["thirteen"],
  "14": ["fourteen"],
  "15": ["fifteen"],
  "16": ["sixteen"],
  "17": ["seventeen"],
  "18": ["eighteen"],
  "19": ["nineteen"],
  "20": ["twenty"],
  "30": ["thirty"],
  "40": ["forty"],
  "50": ["fifty"],
  "60": ["sixty"],
  "70": ["seventy"],
  "80": ["eighty"],
  "90": ["ninety"],
  "100": ["hundred"],
};

const numberTermCanonical = Object.entries(numberTermAliases).reduce<Record<string, string>>(
  (next, [number, aliases]) => {
    next[number] = number;
    aliases.forEach((alias) => {
      next[alias] = number;
    });
    return next;
  },
  {},
);

function areEquivalentNumberTerms(left: string, right: string) {
  const leftNumber = numberTermCanonical[left];
  const rightNumber = numberTermCanonical[right];
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber);
}

function normalizeCmuPhones(value: string) {
  return value.replace(/[0-2]/g, "").replace(/\s+/g, " ").trim();
}

function phoneTokens(value: string) {
  return normalizeCmuPhones(value).split(" ").filter(Boolean);
}

function normalizeFinalNasal(tokens: string[]) {
  if (!tokens.length) return tokens;
  const next = [...tokens];
  if (next[next.length - 1] === "NG") next[next.length - 1] = "N";
  return next;
}

function endsWithPhones(candidate: string[], target: string[]) {
  if (!target.length || candidate.length < target.length) return false;
  return target.every((phone, index) => candidate[candidate.length - target.length + index] === phone);
}

export function getPronunciationKeys(word: string) {
  return (cmuPronunciations[word] ?? []).map(normalizeCmuPhones);
}

export function samePronunciation(left: string, right: string) {
  if (left === right) return true;
  if (areEquivalentNumberTerms(left, right)) return true;

  const leftKeys = getPronunciationKeys(left);
  const rightKeys = getPronunciationKeys(right);
  if (!leftKeys.length || !rightKeys.length) return false;

  if (leftKeys.some((leftKey) => rightKeys.includes(leftKey))) return true;

  return leftKeys.some((leftKey) => {
    const leftPhones = normalizeFinalNasal(phoneTokens(leftKey));
    return rightKeys.some((rightKey) => {
      const rightPhones = normalizeFinalNasal(phoneTokens(rightKey));
      if (rightPhones.length > 2) return false;
      return endsWithPhones(leftPhones, rightPhones);
    });
  });
}
