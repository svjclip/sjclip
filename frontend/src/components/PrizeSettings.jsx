import React, { useEffect, useState } from "react";
import { Trophy, Save } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/**
 * Admin-only prize settings editor. Persists to MongoDB via
 * PUT /api/admin/settings and is shown publicly via /api/config →
 * <PrizeReveal /> on the homepage.
 */
export default function PrizeSettings() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/admin/settings")
      .then((r) => {
        setAmount(r.data.prize_amount || "");
        setDescription(r.data.prize_description || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/settings", {
        prize_amount: amount,
        prize_description: description,
      });
      toast.success("Ödül bilgileri kaydedildi");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Kaydedilemedi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="border border-[#53FC18]/20 bg-[#53FC18]/[0.03] p-6 rounded-none mb-10"
      data-testid="admin-prize-settings"
    >
      <div className="flex items-center gap-3 mb-1">
        <Trophy className="w-5 h-5 text-[#53FC18]" />
        <h2 className="font-display font-black text-2xl tracking-tighter">Ödül Yönetimi</h2>
      </div>
      <p className="text-zinc-500 text-sm mb-5">
        Ana sayfadaki &quot;Bu Haftanın Ödülü&quot; bölümünde gösterilir. Her hafta güncelleyebilirsin.
      </p>

      <div className="grid gap-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400 mb-1.5 block">
            Ödül Miktarı (kısa)
          </label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="örn: 10.000 ₺ veya 5.000 TL + Bonus"
            maxLength={60}
            className="bg-black border-white/10 focus:border-[#53FC18] text-white h-11 rounded-none"
            data-testid="admin-prize-amount-input"
            disabled={loading}
          />
          <div className="text-[10px] text-zinc-600 mt-1 font-mono">{amount.length}/60</div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400 mb-1.5 block">
            Açıklama (opsiyonel)
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="örn: Haftanın en çok oy alan klibinin sahibi nakit ödülü Telegram'dan teslim alır."
            maxLength={240}
            rows={3}
            className="bg-black border-white/10 focus:border-[#53FC18] text-white rounded-none resize-none"
            data-testid="admin-prize-description-input"
            disabled={loading}
          />
          <div className="text-[10px] text-zinc-600 mt-1 font-mono">{description.length}/240</div>
        </div>

        <Button
          onClick={save}
          disabled={saving || loading}
          className="self-start h-11 px-5 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13]"
          data-testid="admin-prize-save-btn"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
    </section>
  );
}
