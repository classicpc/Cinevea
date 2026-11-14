import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Film, Mail, Lock, User, Loader2, AlertCircle } from "lucide-react";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = mode === "login" ? await signIn(email, password) : await signUp(email, password);

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === "signup") {
      setError("Account created! You're now signed in.");
      setMode("login");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30 mb-3">
            <Film className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cinevea</h1>
          <p className="text-sm text-slate-400 mt-1">Voice-Interactive Movie Booking</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl p-6">
          {/* Tabs */}
          <div className="flex gap-2 mb-5 p-1 bg-slate-800/50 rounded-xl">
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === "login" ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === "signup" ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </>
              ) : (
                <>
                  <User className="w-4 h-4" />
                  {mode === "login" ? "Sign In" : "Create Account"}
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Cinevea — SOFE 4850U UX Design Final Project
        </p>
      </div>
    </div>
  );
}
