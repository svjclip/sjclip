import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Send, ArrowRight, KeyRound, UserPlus, LogIn, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function LoginDialog({ open, onOpenChange, defaultTab = "login" }) {
  const { passwordLogin, register, forgotPassword, resetPassword } = useAuth();
  const [botUsername, setBotUsername] = useState("");
  const [tab, setTab] = useState(defaultTab);
  const [busy, setBusy] = useState(false);
  // forgot password sub-flow
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotMsg, setForgotMsg] = useState("");

  // login
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  // register
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  // forgot
  const [forgotUsername, setForgotUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPwd, setResetPwd] = useState("");

  useEffect(() => {
    api.get("/config").then((r) => setBotUsername(r.data.telegram_bot_username || "")).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setForgotMode(false);
      setForgotStep(1);
    }
  }, [open, defaultTab]);

  // If the post-register Telegram link dialog needs to open: just close login —
  // GlobalTelegramGate in App.js will detect missing telegram_id / channels and open the dialog.
  const closeAfterAuth = () => onOpenChange(false);

  const submitLogin = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const data = await passwordLogin(loginUsername.trim(), loginPassword);
      toast.success(`Tekrar hoş geldin, ${data.user.username}`);
      closeAfterAuth();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Giriş başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const data = await register({
        username: regUsername.trim(),
        password: regPassword,
        email: regEmail.trim(),
        phone: regPhone.trim(),
      });
      toast.success(`Hoş geldin, ${data.user.username}! Şimdi Telegram bağla.`);
      closeAfterAuth();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Kayıt başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const submitForgotStep1 = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const data = await forgotPassword(forgotUsername.trim());
      setForgotMsg(data.instructions || "Telegram bota /reset gönder.");
      setForgotStep(2);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const submitForgotStep2 = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const data = await resetPassword(resetCode.trim().toUpperCase(), resetPwd);
      toast.success("Şifre güncellendi, giriş yapıldı.");
      onOpenChange(false);
      setForgotMode(false);
      setForgotStep(1);
      setResetCode("");
      setResetPwd("");
      if (data.user?.missing_channels?.length) {
        // GlobalTelegramGate will handle the channel step
      }
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Sıfırlama başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-bold";
  const inputCls =
    "bg-black border-white/10 focus:border-[#53FC18] focus:ring-1 focus:ring-[#53FC18] text-white h-11 rounded-none";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="bg-[#0A0A0A] border border-[#53FC18]/30 text-white sm:max-w-md rounded-none shadow-[0_0_40px_rgba(83,252,24,0.08)]"
          data-testid="login-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight uppercase">
              {forgotMode ? (
                <span><span className="text-[#53FC18]">Şifre</span> Sıfırla</span>
              ) : (
                <span><span className="text-[#53FC18]">Arena</span>ya gir</span>
              )}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {forgotMode
                ? "Telegram bot üzerinden 6 haneli sıfırlama kodu al."
                : "Kullanıcı adı + parola ile gir veya yeni hesap aç."}
            </DialogDescription>
          </DialogHeader>

          {!forgotMode && (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList
                className="grid grid-cols-2 bg-black border border-white/10 rounded-none p-0 h-auto"
                data-testid="auth-tabs"
              >
                <TabsTrigger
                  value="login"
                  className="rounded-none data-[state=active]:bg-[#53FC18] data-[state=active]:text-black font-bold uppercase text-xs tracking-wider py-3"
                  data-testid="tab-login"
                >
                  <LogIn className="w-3.5 h-3.5 mr-1" /> Giriş Yap
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="rounded-none data-[state=active]:bg-[#53FC18] data-[state=active]:text-black font-bold uppercase text-xs tracking-wider py-3"
                  data-testid="tab-register"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Kayıt Ol
                </TabsTrigger>
              </TabsList>

              {/* LOGIN */}
              <TabsContent value="login" className="mt-4">
                <form onSubmit={submitLogin} className="space-y-3">
                  <div>
                    <label className={labelCls}>Kullanıcı Adı</label>
                    <Input
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="kullaniciadi"
                      autoComplete="username"
                      className={inputCls + " mt-1"}
                      data-testid="login-username-input"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Şifre</label>
                    <Input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••"
                      autoComplete="current-password"
                      className={inputCls + " mt-1"}
                      data-testid="login-password-input"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13] shadow-[0_0_20px_rgba(83,252,24,0.3)]"
                    data-testid="login-submit-btn"
                  >
                    {busy ? "..." : (<>Giriş Yap <ArrowRight className="w-4 h-4 ml-1.5" /></>)}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setForgotStep(1);
                      setForgotUsername(loginUsername);
                    }}
                    className="text-xs text-zinc-400 hover:text-[#53FC18] transition-colors block mx-auto mt-2"
                    data-testid="forgot-password-link"
                  >
                    <KeyRound className="w-3 h-3 inline mr-1" /> Şifremi Unuttum
                  </button>
                </form>
              </TabsContent>

              {/* REGISTER */}
              <TabsContent value="register" className="mt-4">
                <form onSubmit={submitRegister} className="space-y-3">
                  <div>
                    <label className={labelCls}>Kullanıcı Adı</label>
                    <Input
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="3-30 karakter, harf/rakam/_"
                      className={inputCls + " mt-1"}
                      data-testid="register-username-input"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Şifre</label>
                    <Input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="en az 6 karakter"
                      className={inputCls + " mt-1"}
                      data-testid="register-password-input"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>E-posta <span className="text-zinc-600 normal-case tracking-normal">(sadece veri)</span></label>
                    <Input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="ornek@mail.com"
                      className={inputCls + " mt-1"}
                      data-testid="register-email-input"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Telefon <span className="text-zinc-600 normal-case tracking-normal">(sadece veri)</span></label>
                    <Input
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+90 555 123 4567"
                      className={inputCls + " mt-1"}
                      data-testid="register-phone-input"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13] shadow-[0_0_20px_rgba(83,252,24,0.3)]"
                    data-testid="register-submit-btn"
                  >
                    {busy ? "..." : (<>Hesap Oluştur <ArrowRight className="w-4 h-4 ml-1.5" /></>)}
                  </Button>
                  <p className="text-[11px] text-zinc-600 text-center mt-2 leading-relaxed">
                    Kayıt sonrası Telegram bağlama adımı zorunlu olarak açılacak.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {forgotMode && (
            <div className="space-y-4 mt-2">
              {forgotStep === 1 ? (
                <form onSubmit={submitForgotStep1} className="space-y-3">
                  <div>
                    <label className={labelCls}>Kullanıcı Adı</label>
                    <Input
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      placeholder="kullaniciadi"
                      className={inputCls + " mt-1"}
                      data-testid="forgot-username-input"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13]"
                    data-testid="forgot-submit-btn"
                  >
                    {busy ? "..." : "Sıfırlama Talimatlarını Göster"}
                  </Button>
                </form>
              ) : (
                <>
                  <div className="border border-[#53FC18]/30 bg-[#53FC18]/5 p-3 text-xs text-zinc-300 rounded-none whitespace-pre-line" data-testid="forgot-instructions">
                    {forgotMsg}
                  </div>
                  <a
                    href={botUsername ? `https://t.me/${botUsername}` : "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 w-full justify-center px-4 py-3 bg-[#229ED9] hover:bg-[#1d8bc0] text-white font-bold transition-all"
                    data-testid="forgot-open-bot-btn"
                  >
                    <Send className="w-4 h-4" /> Bota git → /reset yaz
                  </a>
                  <form onSubmit={submitForgotStep2} className="space-y-3">
                    <div>
                      <label className={labelCls}>Sıfırlama Kodu (6 haneli)</label>
                      <Input
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                        placeholder="ABC123"
                        maxLength={6}
                        className={inputCls + " mt-1 font-mono text-center text-lg tracking-[0.4em] uppercase"}
                        data-testid="password-reset-code-input"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Yeni Şifre</label>
                      <Input
                        type="password"
                        value={resetPwd}
                        onChange={(e) => setResetPwd(e.target.value)}
                        placeholder="en az 6 karakter"
                        className={inputCls + " mt-1"}
                        data-testid="password-reset-new-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13]"
                      data-testid="password-reset-submit-btn"
                    >
                      {busy ? "..." : "Şifreyi Yenile ve Gir"}
                    </Button>
                  </form>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setForgotStep(1);
                }}
                className="text-xs text-zinc-400 hover:text-[#53FC18] transition-colors flex items-center gap-1 mx-auto"
                data-testid="forgot-back-btn"
              >
                <ArrowLeft className="w-3 h-3" /> Geri dön
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
