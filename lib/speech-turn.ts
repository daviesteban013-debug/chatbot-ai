import { spokenText } from "./jarvis-personalization";

export const SPEECH_DETAILS_NOTICE = "Te dejo los detalles en pantalla.";

/** A bounded spoken introduction. The full answer is always retained in chat. */
export function createSpeechTurn(player: { speak: (text: string) => Promise<boolean>; stop: () => void; busy: (value: boolean) => void }) {
  let generation = 0;
  let accepting = false;
  let finished = false;
  let buffer = "";
  let received = false;
  let spoken = "";
  let sentences = 0;
  let omitted = false;
  let queue: string[] = [];
  let running = false;

  const drain = async (current: number) => {
    if (running || current !== generation) return;
    running = true;
    try {
      while (queue.length && current === generation) {
        if (!await player.speak(queue.shift()!)) {
          if (current === generation) { accepting = false; queue = []; finished = true; }
          break;
        }
      }
    } finally {
      if (current === generation) {
        running = false;
        player.busy(queue.length > 0 || !finished);
      }
    }
  };
  const enqueue = (text: string) => {
    queue.push(text);
    player.busy(true);
    void drain(generation);
  };
  const offer = (text: string) => {
    const clean = spokenText(text).replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (sentences >= 2 || spoken.length + clean.length > 360 || /```|^\s*[-*]\s|^\s*\d+[.)](?:\s|$)|\|/.test(text)) {
      omitted = true;
      sentences = 2;
      return;
    }
    spoken += clean;
    sentences++;
    enqueue(clean);
  };
  const consume = (flush: boolean) => {
    // Only speak whole sentences; a decimal or abbreviation is not a boundary.
    const boundary = /[.!?](?:[»”"'])*(?=\s|$)|\n/g;
    let match: RegExpExecArray | null;
    let start = 0;
    while ((match = boundary.exec(buffer))) {
      const end = match.index + match[0].length;
      if (!flush && end === buffer.length && match[0] !== "\n") break;
      const part = buffer.slice(start, end);
      if (/\b(?:Sr|Sra|Dr|Dra|Ud|aprox|etc)\.$/i.test(part.trim())) continue;
      offer(part);
      start = end;
    }
    buffer = buffer.slice(start);
    if (flush && buffer.trim()) { offer(buffer); buffer = ""; }
    // Do not accumulate an unbounded sentence/code block while streaming.
    if (buffer.length > 1000) { omitted = true; buffer = ""; sentences = 2; }
  };
  const stop = () => {
    generation++;
    accepting = false; finished = true; running = false;
    queue = []; buffer = ""; received = false; spoken = ""; sentences = 0; omitted = false;
    player.stop(); player.busy(false);
  };
  return {
    setPlayer(next: typeof player) { player = next; },
    stop,
    begin() { stop(); accepting = true; finished = false; },
    push(delta: string) {
      if (!accepting || finished) return;
      received = true; buffer += delta; consume(false);
    },
    finish(finalText: string) {
      if (!accepting || finished) return;
      // Memory replies have no deltas; never replay already streamed text.
      if (!received) buffer = finalText;
      consume(true);
      if (omitted) enqueue(SPEECH_DETAILS_NOTICE);
      finished = true;
      if (!running && !queue.length) player.busy(false);
    },
  };
}
