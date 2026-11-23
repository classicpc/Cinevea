import { AccessibilitySettings } from "@/components/AccessibilitySettings";
import { useState, type FormEvent } from "react";
import { Film, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const changeMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
    setNotice("");
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result =
        mode === "login"
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password);
      if (result.error) setError(result.error);
      else if ("needsConfirmation" in result && result.needsConfirmation) {
        setNotice("Check your email to confirm your address, then sign in.");
        setMode("login");
        setPassword("");
      }
    } catch {
      setError(
        "We could not connect. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-display">
        <AccessibilitySettings />
      </div>
      <div className="auth-brand brand">
        <span className="brand-mark">
          <Film size={24} aria-hidden="true" />
        </span>
        <span>
          Cinevea<span className="brand-caption">MAKE ROOM FOR A MOVIE.</span>
        </span>
      </div>
      <div className="auth-layout">
        <section className="auth-story" aria-label="About Cinevea">
          <p className="eyebrow">LESS PLANNING. MORE MOVIE.</p>
          <h1>
            Your next <br />
            great night <br />
            <em>starts here.</em>
          </h1>
          <p>
            Find a film. Choose your seats.
            <br />
            Let us guide the rest.
          </p>
          <ul>
            <li>
              <Check size={18} aria-hidden="true" />
              One clear step at a time
            </li>
            <li>
              <Check size={18} aria-hidden="true" />
              Speak, type or click
            </li>
            <li>
              <Check size={18} aria-hidden="true" />
              Your choices, always editable
            </li>
          </ul>
          <div className="film-decoration" aria-hidden="true">
            <span>01</span>
            <span>02</span>
            <span>03</span>
            <span>04</span>
          </div>
        </section>
        <section className="auth-card" aria-labelledby="auth-heading">
          <p className="eyebrow">YOUR SEAT IS WAITING</p>
          <h2 id="auth-heading">
            {mode === "login" ? "Welcome back." : "Join the movie night."}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Sign in to start your booking."
              : "Create an account to save your bookings."}
          </p>
          <form onSubmit={submit} aria-busy={loading}>
            <fieldset disabled={loading}>
              <legend className="sr-only">
                {mode === "login" ? "Sign in" : "Create account"}
              </legend>
              <label className="field-label" htmlFor="auth-email">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-error" : undefined}
              />
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              <div className="password-field">
                <input
                  id="auth-password"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "signup" ? 6 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={
                    mode === "signup" ? "password-hint" : undefined
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {mode === "signup" && (
                <p id="password-hint" className="small-note">
                  Use at least 6 characters.
                </p>
              )}
              {error && (
                <p id="auth-error" role="alert" className="notice notice-error">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              <button className="primary-button auth-submit" type="submit">
                {loading
                  ? "Connecting…"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New to Cinevea?" : "Already have an account?"}{" "}
            <button
              className="text-button"
              disabled={loading}
              onClick={changeMode}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <p className="small-note">
            University project prototype. No real tickets or payments.
          </p>
        </section>
      </div>
      <footer className="app-footer">
        <span>Cinevea · SOFE 4850U</span>
        <span>A simpler way to get to the movies.</span>
      </footer>
    </main>
  );
}
