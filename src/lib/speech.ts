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
  private gotFinalResult = false;

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

  private pickVoice(): SpeechSynthesisVoice | null {
    const preferred = [
      "Google US English",
      "Samantha",
      "Microsoft Aria",
      "Microsoft Zira",
      "Karen",
    ];
    for (const name of preferred) {
      const v = this.voices.find((vc) => vc.name === name);
      if (v) return v;
    }
    const enVoice = this.voices.find((vc) => vc.lang.startsWith("en"));
    return enVoice || this.voices[0] || null;
  }

  speak(text: string, onEnd?: () => void) {
    if (!this.synth) {
      onEnd?.();
      return;
    }
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.pickVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 1;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    utterance.onstart = () => {
      this.speaking = true;
    };
    utterance.onend = () => {
      this.speaking = false;
      onEnd?.();
    };
    utterance.onerror = () => {
      this.speaking = false;
      onEnd?.();
    };
    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
      this.speaking = false;
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  startListening(callbacks: RecognitionCallbacks) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError("Speech recognition is not supported in this browser. Please type your message instead.");
      return;
    }

    // Stop any ongoing TTS first — Chrome can't do recognition and TTS at the same time
    this.stopSpeaking();

    // If a previous recognition session exists, tear it down completely
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.recognition = null;
    }

    // Create a FRESH instance every time — reusing one causes
    // immediate onend in some browsers (especially after TTS)
    this.recognition = new Ctor();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.gotFinalResult = false;
    this.listening = true;

    this.recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        this.gotFinalResult = true;
        callbacks.onResult({ transcript: final.trim(), isFinal: true });
      } else if (interim) {
        callbacks.onResult({ transcript: interim.trim(), isFinal: false });
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === "aborted") {
        // User stopped manually, or we aborted — don't show an error
        return;
      }
      let msg = "Sorry, I didn't catch that. Could you try again?";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        msg = "Microphone access was blocked. Please allow microphone access in your browser settings and try again, or type your message below.";
      } else if (event.error === "no-speech") {
        msg = "I didn't hear anything. Please try speaking again, or type your message below.";
      } else if (event.error === "audio-capture") {
        msg = "No microphone was found. Please connect a microphone or type your message below.";
      } else if (event.error === "network") {
        msg = "There was a network problem with speech recognition. Please try again or type your message.";
      }
      callbacks.onError(msg);
    };

    this.recognition.onend = () => {
      this.listening = false;
      // Only call onEnd if we did NOT already get a final result
      // (onResult already handles the final case, calling onEnd there
      // would be redundant and could cause double state updates)
      if (!this.gotFinalResult) {
        callbacks.onEnd();
      }
    };

    // Small delay to let TTS cancel fully settle before starting recognition
    setTimeout(() => {
      try {
        this.recognition?.start();
      } catch (err: any) {
        // If it's already started, that's fine; otherwise report the error
        if (err?.name !== "InvalidStateError") {
          this.listening = false;
          callbacks.onError("Could not start voice input. Please try again or type your message.");
        }
      }
    }, 100);
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    this.listening = false;
  }

  get isListening(): boolean {
    return this.listening;
  }
}

export const speechController = new SpeechController();
