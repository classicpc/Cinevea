import { rankVoices } from "@/lib/voicePreferences";
// Browser Speech Recognition + Synthesis wrapper
// Uses the Web Speech API where available, with graceful fallbacks.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

type RecognitionCallbacks = {
  onResult: (result: SpeechRecognitionResult) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  onStart?: () => void;
};

// Lazily detect the browser's SpeechRecognition constructor once
function getSpeechRecognitionCtor(): any | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export class SpeechController {
  private recognition: any = null;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private speaking = false;
  private listening = false;
  private speechEndTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private finishSpeech: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    if (this.synth) {
      this.voices = this.synth.getVoices();
    }
  }

  get speechSupported(): boolean {
    return this.synth !== null;
  }

  get recognitionSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  availableVoices(): SpeechSynthesisVoice[] {
    this.loadVoices();
    return rankVoices(this.voices);
  }

  getVoiceSettings() {
    try {
      return {
        uri: localStorage.getItem("cinevea-voice-uri") || "",
        rate: Math.min(
          1.15,
          Math.max(
            0.75,
            Number(localStorage.getItem("cinevea-voice-rate")) || 0.94,
          ),
        ),
      };
    } catch {
      return { uri: "", rate: 0.94 };
    }
  }

  setVoiceSettings(uri: string, rate: number) {
    try {
      localStorage.setItem("cinevea-voice-uri", uri);
      localStorage.setItem("cinevea-voice-rate", String(rate));
    } catch {
      /* Private browsing may prevent saving preferences. */
    }
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = this.availableVoices();
    const saved = this.getVoiceSettings().uri;
    return voices.find((v) => v.voiceURI === saved) || voices[0] || null;
  }

  speak(text: string, onEnd?: () => void) {
    if (!this.synth) {
      onEnd?.();
      return;
    }
    const generation = ++this.generation;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ""));
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = this.getVoiceSettings().rate;
    utterance.pitch = 1.04;
    utterance.volume = 1;
    const finish = () => {
      if (generation !== this.generation) return;
      this.speaking = false;
      this.finishSpeech = null;
      onEnd?.();
    };
    this.finishSpeech = finish;
    utterance.onstart = () => {
      if (generation === this.generation) this.speaking = true;
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    this.synth.speak(utterance);
  }

  stopSpeaking() {
    const finish = this.finishSpeech;
    this.finishSpeech = null;
    finish?.();
    ++this.generation;
    this.synth?.cancel();
    this.speaking = false;
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  startListening(callbacks: RecognitionCallbacks) {
    this.stopListening(false);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError(
        "Voice input is unavailable in this browser. Please type your message instead.",
      );
      return;
    }
    this.stopSpeaking();
    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    const lang = typeof navigator !== "undefined" ? navigator.language : "";
    recognition.lang = lang.toLowerCase().startsWith("en") ? lang : "en-US";
    recognition.maxAlternatives = 1;
    let failed = false;
    recognition.onstart = () => {
      if (this.recognition !== recognition) return;
      this.listening = true;
      callbacks.onStart?.();
    };
    recognition.onresult = (event: any) => {
      if (this.recognition !== recognition) return;
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript + " ";
        else interim += result[0].transcript + " ";
      }
      if (final.trim())
        callbacks.onResult({ transcript: final.trim(), isFinal: true });
      if (interim.trim())
        callbacks.onResult({ transcript: interim.trim(), isFinal: false });
    };
    recognition.onerror = (event: any) => {
      if (this.recognition !== recognition || event.error === "aborted") return;
      failed = true;
      this.listening = false;
      const messages: Record<string, string> = {
        "not-allowed":
          "Microphone access was blocked. Allow it in your browser settings, or type your message.",
        "service-not-allowed":
          "Your browser’s speech service is blocked. You can still type or use the booking buttons.",
        "no-speech":
          "No speech was detected. Select Speak to try again, or type your message.",
        "audio-capture":
          "No microphone was found. Connect a microphone or type your message.",
        network:
          "The browser’s speech service could not connect. Check your connection or type your message.",
      };
      callbacks.onError(
        messages[event.error] ||
          "We could not capture your voice. Please try again or type your message.",
      );
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.listening = false;
      this.recognition = null;
      if (!failed) callbacks.onEnd();
    };
    try {
      recognition.start();
    } catch {
      this.stopListening(false);
      callbacks.onError(
        "The microphone could not start. Please try again or type your message.",
      );
    }
  }

  stopListening(finalize = true) {
    const recognition = this.recognition;
    if (!recognition) return;
    try {
      if (finalize) recognition.stop();
      else {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onstart = null;
        recognition.abort();
        this.recognition = null;
        this.listening = false;
      }
    } catch {
      this.recognition = null;
      this.listening = false;
    }
  }

  get isListening(): boolean {
    return this.listening;
  }
}

export const speechController = new SpeechController();
