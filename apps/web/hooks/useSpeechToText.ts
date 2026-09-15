'use client';

// Thin wrapper around the browser's Web Speech API (SpeechRecognition), for
// dictating free-text clinical fields. Chrome, Edge and Safari implement it;
// Firefox does not, so callers must hide their mic UI when `supported` is false.
//
// The hook owns one long-lived recognition object. Final transcript chunks are
// pushed to `onResult` as they are settled; interim (still-changing) text is
// exposed as `interim` for a live preview but never sent to `onResult`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { claimDictation, releaseDictation } from '@/lib/activeDictation';

// --- minimal typings (the DOM lib does not ship these everywhere) ------------

interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechToTextOptions {
  /** Called with each finalised chunk of transcript, trimmed and non-empty. */
  onResult: (text: string) => void;
  /** BCP-47 language tag. Defaults to Indian English. */
  lang?: string;
  /** Surface a recognition error to the caller (permission denied, no mic…). */
  onError?: (error: string) => void;
}

export interface UseSpeechToText {
  /** False when the browser has no SpeechRecognition — hide the mic UI. */
  supported: boolean;
  listening: boolean;
  /** Best-guess text for the phrase currently being spoken; '' when idle. */
  interim: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechToText({ onResult, lang = 'en-IN', onError }: UseSpeechToTextOptions): UseSpeechToText {
  // Starts false so server and first client render agree; the effect below
  // flips it once we know the browser has the API.
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Stable identity for the cross-field mutex — one per hook instance, for
  // the lifetime of the component (never per-render).
  const idRef = useRef<symbol>(Symbol('dictation'));
  // Latest callbacks, so the long-lived recognition handlers never close over
  // a stale render.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  // Distinguishes a user stop from the engine ending on its own (silence): on
  // the latter we restart so dictation survives a pause.
  const wantListeningRef = useRef(false);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setSupported(true);

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pendingInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onResultRef.current(trimmed);
        } else {
          pendingInterim += text;
        }
      }
      setInterim(pendingInterim.trim());
    };

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are routine (a pause, a manual stop); only
      // report the ones the user can act on.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        wantListeningRef.current = false;
        setListening(false);
        onErrorRef.current?.(event.error);
      }
    };

    recognition.onend = () => {
      setInterim('');
      if (wantListeningRef.current) {
        // Ended on silence while the user still wants to dictate — resume.
        try {
          recognition.start();
        } catch {
          wantListeningRef.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantListeningRef.current = false;
      releaseDictation(idRef.current);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    };
  }, [lang]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    wantListeningRef.current = false;
    setListening(false);
    setInterim('');
    releaseDictation(idRef.current);
    try { recognition?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || wantListeningRef.current) return;
    // Only one SpeechRecognition session may run at a time — cleanly stop
    // whichever field currently holds the mic before claiming it here.
    // Without this, a second concurrent start() corrupts both sessions.
    claimDictation(idRef.current, stop);
    wantListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      // start() actually failed (not just "already running", which the
      // guard above already excludes) — don't leave the UI stuck listening.
      wantListeningRef.current = false;
      setListening(false);
      releaseDictation(idRef.current);
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
