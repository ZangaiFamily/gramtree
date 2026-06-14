let speechRequestId = 0;

export type SpeakTextOptions = {
  onStart?: () => void;
  onError?: () => void;
};

export function cancelSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechRequestId += 1;
  window.speechSynthesis.cancel();
}

export function speakText(text: string, options: SpeakTextOptions = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options.onError?.();
    return false;
  }

  const requestId = ++speechRequestId;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  utterance.onstart = () => {
    if (requestId === speechRequestId) options.onStart?.();
  };
  utterance.onerror = () => {
    if (requestId === speechRequestId) options.onError?.();
  };

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return false;
    const usVoice = voices.find((voice) => /en-US/.test(voice.lang) && /(Google|Microsoft|Samantha)/.test(voice.name))
      ?? voices.find((voice) => /en-US/.test(voice.lang));
    if (usVoice) utterance.voice = usVoice;
    return true;
  };

  const speak = () => {
    if (requestId !== speechRequestId) return;
    window.speechSynthesis.cancel();
    requestAnimationFrame(() => {
      if (requestId !== speechRequestId) return;
      window.speechSynthesis.speak(utterance);
    });
  };

  if (!pickVoice()) {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      if (requestId !== speechRequestId) return;
      pickVoice();
      speak();
    }, { once: true });
  } else {
    speak();
  }

  return true;
}

