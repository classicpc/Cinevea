export type VoicePhase =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "error";
export interface VoiceSnapshot {
  phase: VoicePhase;
  transcript: string;
  message: string;
}
interface RecognitionCallbacks {
  onStart?: () => void;
  onResult: (r: { transcript: string; isFinal: boolean }) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}
interface VoicePort {
  startListening: (c: RecognitionCallbacks) => void;
  stopListening: (finalize?: boolean) => void;
  stopSpeaking: () => void;
}
interface ConversationOptions {
  speech: VoicePort;
  send: (text: string) => Promise<void>;
  busy: () => boolean;
  speaking: () => boolean;
  update: (s: VoiceSnapshot) => void;
  pauseMs?: number;
  maxIdleMs?: number;
}
// One owner for the microphone. Every session and pending callback is cancellable.
export class VoiceConversation {
  private enabled = false;
  private epoch = 0;
  private final = "";
  private interim = "";
  private idleStarts = 0;
  private processing = false;
  private silence: ReturnType<typeof setTimeout> | null = null;
  private loop: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  constructor(private options: ConversationOptions) {}
  private update(phase: VoicePhase, message: string, transcript = this.text()) {
    this.options.update({ phase, message, transcript });
  }
  private text() {
    return `${this.final} ${this.interim}`.trim();
  }
  private clear() {
    for (const timer of [this.silence, this.loop, this.idle])
      if (timer) clearTimeout(timer);
    this.silence = this.loop = this.idle = null;
  }
  start() {
    this.stop(false);
    this.enabled = true;
    this.idleStarts = 0;
    const epoch = this.epoch;
    this.loop = setTimeout(() => {
      if (this.enabled && this.epoch === epoch) this.listen();
    }, 150);
  }
  stop(announce = true) {
    this.enabled = false;
    ++this.epoch;
    this.clear();
    this.options.speech.stopListening(false);
    this.options.speech.stopSpeaking();
    this.processing = false;
    if (announce)
      this.update(
        "paused",
        "Voice conversation paused. The microphone is off.",
      );
  }
  private listen() {
    if (!this.enabled) return;
    if (this.options.busy() || this.options.speaking()) {
      this.wait();
      return;
    }
    const epoch = ++this.epoch;
    this.final = "";
    this.interim = "";
    this.processing = false;
    this.update(
      "listening",
      "Listening. Speak naturally; pause when you’re finished.",
    );
    this.idle = setTimeout(() => {
      if (this.epoch === epoch) this.stop();
    }, this.options.maxIdleMs ?? 60000);
    this.options.speech.startListening({
      onStart: () => {
        if (this.enabled && this.epoch === epoch)
          this.update(
            "listening",
            "Listening. Speak naturally; pause when you’re finished.",
          );
      },
      onResult: (r) => {
        if (!this.enabled || this.epoch !== epoch || this.processing) return;
        this.idleStarts = 0;
        if (r.isFinal) {
          this.final = `${this.final} ${r.transcript}`.trim();
          this.interim = "";
        } else this.interim = r.transcript;
        this.update("listening", "I’m listening…");
        if (this.silence) clearTimeout(this.silence);
        this.silence = setTimeout(
          () => void this.commit(epoch),
          this.options.pauseMs ?? 1600,
        );
      },
      onEnd: () => {
        if (!this.enabled || this.epoch !== epoch || this.processing) return;
        if (this.text()) {
          if (!this.silence)
            this.silence = setTimeout(
              () => void this.commit(epoch),
              this.options.pauseMs ?? 1600,
            );
        } else {
          this.clear();
          if (++this.idleStarts >= 3) this.stop();
          else this.loop = setTimeout(() => this.listen(), 500);
        }
      },
      onError: (message) => {
        if (!this.enabled || this.epoch !== epoch) return;
        this.stop(false);
        this.update(
          "error",
          `${message} Voice conversation is paused. Your existing booking is unchanged.`,
        );
      },
    });
  }
  private async commit(epoch: number) {
    if (!this.enabled || epoch !== this.epoch || this.processing) return;
    const text = this.text();
    if (!text) return;
    this.processing = true;
    this.clear();
    this.options.speech.stopListening(false);
    if (
      /^(?:please )?(?:stop listening|pause voice|pause conversation|stop voice|end conversation|stop)[.!?]?$/i.test(
        text,
      )
    ) {
      this.stop();
      return;
    }
    this.update("processing", "Sending your message…", text);
    try {
      await this.options.send(text);
    } catch {
      if (this.enabled && epoch === this.epoch) {
        this.stop(false);
        this.update(
          "error",
          "The message could not be sent. Voice conversation is paused.",
          text,
        );
      }
      return;
    }
    if (this.enabled && epoch === this.epoch) this.wait();
  }
  private wait(started = Date.now()) {
    if (!this.enabled) return;
    if (Date.now() - started > 90000) {
      this.stop(false);
      this.update(
        "error",
        "The reply is taking too long. Voice conversation is paused.",
      );
      return;
    }
    const talking = this.options.speaking();
    this.update(
      talking ? "speaking" : "processing",
      talking
        ? "Your guide is speaking. Listening resumes after the reply."
        : "Preparing your next step…",
    );
    this.loop = setTimeout(() => {
      if (!this.enabled) return;
      if (this.options.busy() || this.options.speaking()) this.wait(started);
      else this.loop = setTimeout(() => this.listen(), 350);
    }, 200);
  }
}
