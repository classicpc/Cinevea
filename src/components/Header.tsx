import { useState } from "react";
import { Film, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const email = user?.email || "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 py-3 border-b border-rose-500/15 bg-[#0a0c14]/90 backdrop-blur-2xl relative shadow-lg shadow-black/20">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
          <Film className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight leading-none bg-gradient-to-r from-white via-rose-100 to-pink-200 bg-clip-text text-transparent">
            Cinevea
          </h1>
          <p className="text-[11px] text-rose-300/80 leading-none mt-0.5 font-medium">
            Voice-Interactive Booking
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-xs font-bold text-white shadow-md shadow-rose-500/20">
              {initials}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900/95 rounded-xl border border-rose-500/20 shadow-2xl z-20 overflow-hidden animate-fade-in backdrop-blur-xl">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs text-rose-300/80">Signed in as</p>
                  <p className="text-sm text-white truncate font-medium">{email}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-rose-500/10 transition-all"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
