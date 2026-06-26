import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Forced first-time setup dialog for legacy Telegram-only users.
 * Cannot be dismissed until the user chooses a username + password.
 */
export default function SetPasswordDialog({ open }) {
  const { user, setPasswordForLegacy } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.username) setUsername(user.username);
    if (user?.email) setEmail(user.email);
    if (user?.phone) setPhone(user.phone);
  }, [user]);

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await setPasswordForLegacy({
        username: username.trim(),
        password,
        email: email.trim(),
        phone: phone.trim(),
      });
      toast.success("Hesabın güncellendi. Artık her yerden giriş yapabilirsin.");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Güncelleme başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-bold";
  const inputCls =
    "bg-black border-white/10 focus:border-[#53FC18] focus:ring-1 focus:ring-[#53FC18] text-white h-11 rounded-none";

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissible */ }}>
      <DialogContent
        className="bg-[#0A0A0A] border border-[#53FC18]/30 text-white sm:max-w-md rounded-none shadow-[0_0_40px_rgba(83,252,24,0.1)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="set-password-dialog"
        hideClose
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight uppercase">
            <span className="text-[#53FC18]">Hesabını</span> Tamamla
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Telegram ile giriş yaptın. Devam edebilmek için kullanıcı adı + şifre belirlemelisin. Bu seçimler kalıcıdır.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-[#53FC18]/20 bg-[#53FC18]/5 p-3 flex gap-2 text-xs text-zinc-300 rounded-none">
          <ShieldCheck className="w-4 h-4 text-[#53FC18] flex-shrink-0 mt-0.5" />
          <span>E-posta ve telefon sadece kayıt amacıyla toplanır, giriş için kullanılmaz.</span>
        </div>

        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <label className={labelCls}>Kullanıcı Adı</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kullaniciadi"
              className={inputCls + " mt-1"}
              data-testid="setpw-username-input"
            />
          </div>
          <div>
            <label className={labelCls}>Şifre</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="en az 6 karakter"
              className={inputCls + " mt-1"}
              data-testid="setpw-password-input"
            />
          </div>
          <div>
            <label className={labelCls}>E-posta <span className="text-zinc-600 normal-case tracking-normal">(sadece veri)</span></label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
              className={inputCls + " mt-1"}
              data-testid="setpw-email-input"
            />
          </div>
          <div>
            <label className={labelCls}>Telefon <span className="text-zinc-600 normal-case tracking-normal">(sadece veri)</span></label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+90 555 123 4567"
              className={inputCls + " mt-1"}
              data-testid="setpw-phone-input"
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13] shadow-[0_0_20px_rgba(83,252,24,0.3)]"
            data-testid="setpw-submit-btn"
          >
            {busy ? "..." : (<>Tamamla <ArrowRight className="w-4 h-4 ml-1.5" /></>)}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
