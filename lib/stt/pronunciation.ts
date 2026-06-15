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
  weak: ["W IY K"],
  week: ["W IY K"],
  whole: ["HH OW L"],
  hole: ["HH OW L"],
  wood: ["W UH D"],
  would: ["W UH D"],
  your: ["Y AO R", "Y UH R"],
  yin: ["Y IH N"],
  "you're": ["Y AO R", "Y UH R"],
};

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
