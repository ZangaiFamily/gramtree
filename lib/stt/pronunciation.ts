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
  "you're": ["Y AO R", "Y UH R"],
};

function normalizeCmuPhones(value: string) {
  return value.replace(/[0-2]/g, "").replace(/\s+/g, " ").trim();
}

export function getPronunciationKeys(word: string) {
  return (cmuPronunciations[word] ?? []).map(normalizeCmuPhones);
}

export function samePronunciation(left: string, right: string) {
  if (left === right) return true;

  const leftKeys = getPronunciationKeys(left);
  const rightKeys = getPronunciationKeys(right);
  if (!leftKeys.length || !rightKeys.length) return false;

  return leftKeys.some((leftKey) => rightKeys.includes(leftKey));
}
