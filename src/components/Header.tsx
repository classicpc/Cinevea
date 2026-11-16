import { useState } from "react";
import { Film, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const email = user?.email || "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 bg-slate-900/80 backdrop-blur-xl relative shadow-lg shadow-black/10">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Film className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight leading-none">
            Cinevea
          </h1>
          <p className="text-[11px] text-slate-400 leading-none mt-0.5">
            Voice-Interactive Booking
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-20 overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-slate-700">
                  <p className="text-xs text-slate-500">Signed in as</p>
                  <p className="text-sm text-white truncate font-medium">{email}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all"
                >
                  <LogOut className="w-4 h-4" />
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
