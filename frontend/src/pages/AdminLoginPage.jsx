import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, ArrowRight, Terminal } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

/**
 * Standalone admin login page intentionally NOT linked from anywhere in the
 * public navigation. Admins access it directly via URL (/yonetim/giris).
 *
 * Distinct from LoginDialog:
 *   - Different visual identity (control-panel / terminal aesthetic) so admins
 *     never confuse it with the public auth flow.
 *   - Verifies `is_admin` after authentication; non-admin accounts are rejected
 *     immediately with a clear error and the session is purged.
 *   - On success, hard-redirects to /admin.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.is_admin) navigate("/admin", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/login", { username: username.trim(), password });
      const me = await refreshUser();
      if (!me?.is_admin) {
        await logout();
        setError("Bu hesap admin yetkisine sahip değil.");
        toast.error("Erişim reddedildi");
        return;
      }
      toast.success("Yönetici girişi başarılı");
      navigate("/admin", { replace: true });
    } catch (err) {
      const msg = formatApiError(err?.response?.data?.detail, "Giriş başarısız");
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex items-center justify-center px-4">
      {/* grid background */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(83,252,24,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(83,252,24,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(83,252,24,0.12),_transparent_60%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* top label */}
        <div className="flex items-center gap-2 mb-6 text-[10px] font-mono uppercase tracking-[0.3em] text-[#53FC18]">
          <Terminal className="w-3 h-3" />
          <span>Yönetim Konsolu</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#53FC18]/40 to-transparent" />
        </div>

        <div className="border border-[#53FC18]/30 bg-black/80 backdrop-blur-xl shadow-[0_0_60px_rgba(83,252,24,0.08)]">
          <div className="border-b border-[#53FC18]/20 p-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-none border border-[#53FC18]/40 bg-[#53FC18]/5 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#53FC18]" />
            </div>
            <div>
              <h1 className="font-display font-black text-2xl tracking-tighter leading-none">
                Admin Girişi
              </h1>
              <p className="text-xs text-zinc-500 mt-1">Yalnızca yetkili personel.</p>
            </div>
          </div>

          <form onSubmit={submit} className="p-6 space-y-5" data-testid="admin-login-form">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2 block">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full bg-black border border-white/10 focus:border-[#53FC18] focus:outline-none text-white px-3 py-2.5 font-mono text-sm rounded-none"
                data-testid="admin-login-username"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2 block">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-black border border-white/10 focus:border-[#53FC18] focus:outline-none text-white pl-10 pr-3 py-2.5 font-mono text-sm rounded-none"
                  data-testid="admin-login-password"
                />
              </div>
            </div>

            {error && (
              <div
                className="text-xs text-red-400 border border-red-500/30 bg-red-500/5 p-2.5 font-mono"
                data-testid="admin-login-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-[#53FC18] text-black font-bold uppercase tracking-wider py-3 hover:bg-[#42cc13] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              data-testid="admin-login-submit"
            >
              {busy ? "Doğrulanıyor..." : (<>Giriş Yap <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          <div className="border-t border-white/5 px-6 py-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600 flex items-center justify-between">
            <span>SVJ.CLIPS / ADMIN</span>
            <span className="text-[#53FC18]/60">● online</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
