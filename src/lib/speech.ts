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
  private gotFinalResult = false;
  private speechEndTimer: ReturnType<typeof setTimeout> | null = null;
  private recognitionRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
    const canadianVoice = this.voices.find((voice) => voice.lang.toLowerCase() === "en-ca");
    if (canadianVoice) return canadianVoice;

    const preferred = [
      "Google Canadian English",
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
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
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
      this.speechEndTimer = null;
      onEnd?.();
    };
    utterance.onerror = () => {
      this.speaking = false;
      this.speechEndTimer = null;
      onEnd?.();
    };
    this.synth.speak(utterance);
    // Some browsers do not fire onend reliably when speech is interrupted.
    this.speechEndTimer = setTimeout(() => {
      this.speaking = false;
      this.speechEndTimer = null;
      onEnd?.();
    }, Math.max(2500, text.length * 35));
  }

  stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
      this.speaking = false;
    }
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  startListening(callbacks: RecognitionCallbacks, retryCount = 0) {
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
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "";
    this.recognition.lang = browserLanguage.toLowerCase().startsWith("en")
      ? browserLanguage
      : "en-US";

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
      this.listening = false;
      this.recognition = null;
      let msg = "Sorry, I didn't catch that. Could you try again?";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        msg = "Microphone access was blocked. Please allow microphone access in your browser settings and try again, or type your message below.";
      } else if (event.error === "no-speech") {
        msg = "I didn't hear anything. Please try speaking again, or type your message below.";
      } else if (event.error === "audio-capture") {
        msg = "No microphone was found. Please connect a microphone or type your message below.";
      } else if (event.error === "network") {
        if (retryCount === 0) {
          this.gotFinalResult = true;
          this.recognitionRetryTimer = setTimeout(() => {
            this.recognitionRetryTimer = null;
            this.startListening(callbacks, 1);
          }, 350);
          return;
        }
        msg = "Your browser's speech service is unavailable right now. Check your connection, then try again, or type your message.";
      }
      callbacks.onError(msg);
    };

    this.recognition.onend = () => {
      this.listening = false;
      this.recognition = null;
      if (!this.gotFinalResult) {
        callbacks.onEnd();
      }
    };
    this.recognition.onstart = () => {
      callbacks.onStart?.();
    };

    try {
      this.recognition.start();
    } catch (err: any) {
      // If it's already started, that's fine; otherwise report the error
      if (err?.name !== "InvalidStateError") {
        this.listening = false;
        callbacks.onError("Could not start voice input. Please try again or type your message.");
      }
    }
  }

  stopListening(finalize = true) {
    if (this.recognitionRetryTimer) {
      clearTimeout(this.recognitionRetryTimer);
      this.recognitionRetryTimer = null;
    }
    if (this.recognition) {
      try {
        if (finalize) {
          this.recognition.stop();
        } else {
          this.recognition.onend = null;
          this.recognition.abort();
        }
      } catch {
        // ignore
      }
      if (!finalize) this.recognition = null;
    }
    if (!finalize) this.listening = false;
  }

  get isListening(): boolean {
    return this.listening;
  }
}

export const speechController = new SpeechController();
