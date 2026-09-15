/**
 * Cross-field mutex for dictation. A page can have many independent
 * useSpeechToText instances (one per FormField with `dictation`), but a
 * browser only ever runs one SpeechRecognition session at a time — starting
 * a second while another is live corrupts both rather than queuing. claim()
 * cleanly stops whichever instance currently holds the mic before the new
 * one starts, so only one field is ever listening at once.
 */

type StopFn = () => void;

let activeId: symbol | null = null;
let activeStop: StopFn | null = null;

export function claimDictation(id: symbol, stop: StopFn): void {
  if (activeId !== null && activeId !== id) {
    activeStop?.();
  }
  activeId = id;
  activeStop = stop;
}

export function releaseDictation(id: symbol): void {
  if (activeId === id) {
    activeId = null;
    activeStop = null;
  }
}
