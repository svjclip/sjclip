import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  Plus,
  Save,
  Trash2,
  Trophy,
  Crown,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/**
 * Admin contest manager:
 *   - List existing contests with start/end + winner badge
 *   - Create new contest (name + datetime-local start + end)
 *   - For each contest: edit times, delete, view top-voted clips, mark winner
 *   - When a winner is marked, the backend broadcasts a notification to every
 *     registered user.
 */
export default function ContestManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeContestId, setActiveContestId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/contests");
      const data = r.data.items || [];
      setItems(data);
      // Auto-expand the latest contest so the "Kazanan Seç" UI is visible
      // without an extra click.
      if (data.length > 0 && activeContestId === null) {
        setActiveContestId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeContestId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section
      className="border border-[#FFD166]/25 bg-[#FFD166]/[0.03] p-6 rounded-none mb-10"
      data-testid="admin-contest-manager"
    >
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-[#FFD166]" />
          <h2 className="font-display font-black text-2xl tracking-tighter">Etkinlik Yönetimi</h2>
        </div>
        <Button
          onClick={() => setCreating((v) => !v)}
          className="h-10 px-4 bg-[#FFD166] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#e6bb5c]"
          data-testid="admin-new-contest-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Etkinlik
        </Button>
      </div>
      <p className="text-zinc-500 text-sm mb-5">
        Oylama dönemi tanımla. Etkinlik kapalıyken kullanıcılar oy veremez. Bittiğinde en çok oy alan klibi kazanan olarak işaretleyebilirsin.
      </p>

      {creating && (
        <NewContestForm
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="space-y-3">
        {loading && items.length === 0 && (
          <div className="text-sm text-zinc-500 font-mono py-6">Yükleniyor...</div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-sm text-zinc-500 font-mono py-6">Henüz etkinlik yok.</div>
        )}
        {items.map((c) => (
          <ContestRow
            key={c.id}
            contest={c}
            expanded={activeContestId === c.id}
            onToggle={() => setActiveContestId(activeContestId === c.id ? null : c.id)}
            onChanged={refresh}
          />
        ))}
      </div>
    </section>
  );
}

// --- New contest form -------------------------------------------------------
function NewContestForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [starts, setStarts] = useState(() => toLocalInput(new Date()));
  const [ends, setEnds] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/admin/contests", {
        name: name.trim(),
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
      });
      toast.success("Etkinlik oluşturuldu");
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Oluşturulamadı"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-white/10 bg-black/40 p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <FieldLabel>İsim</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hafta 26 — Haziran 2026"
            className="bg-black border-white/10 focus:border-[#FFD166] text-white h-10 rounded-none"
            data-testid="admin-contest-name"
          />
        </div>
        <div>
          <FieldLabel>Başlangıç</FieldLabel>
          <Input
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            className="bg-black border-white/10 focus:border-[#FFD166] text-white h-10 rounded-none"
            data-testid="admin-contest-starts"
          />
        </div>
        <div>
          <FieldLabel>Bitiş</FieldLabel>
          <Input
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            className="bg-black border-white/10 focus:border-[#FFD166] text-white h-10 rounded-none"
            data-testid="admin-contest-ends"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button
          onClick={create}
          disabled={busy || !name.trim()}
          className="h-10 px-4 bg-[#FFD166] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#e6bb5c]"
          data-testid="admin-contest-create-btn"
        >
          <Save className="w-4 h-4 mr-2" />
          {busy ? "Kaydediliyor..." : "Oluştur"}
        </Button>
        <Button
          onClick={onCancel}
          variant="ghost"
          className="h-10 px-4 text-zinc-400 hover:text-white rounded-none"
        >
          İptal
        </Button>
      </div>
    </div>
  );
}

// --- Single contest row ------------------------------------------------------
function ContestRow({ contest, expanded, onToggle, onChanged }) {
  const now = new Date();
  const startsAt = new Date(contest.starts_at);
  const endsAt = new Date(contest.ends_at);
  const status =
    now < startsAt ? "scheduled" : now < endsAt ? "active" : "ended";
  const fmt = (d) => d.toLocaleString("tr-TR");

  return (
    <div
      className={`border ${
        status === "active" ? "border-[#FFD166]/40" : "border-white/10"
      } bg-black/40`}
      data-testid={`admin-contest-row-${contest.id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={status} />
          <div className="min-w-0">
            <div className="font-display font-bold text-lg tracking-tight truncate flex items-center gap-2">
              {contest.name}
              {contest.winner_clip_id && (
                <Crown className="w-4 h-4 text-[#FFD166]" />
              )}
            </div>
            <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
              {fmt(startsAt)} → {fmt(endsAt)}
            </div>
          </div>
        </div>
        <Calendar className="w-4 h-4 text-zinc-500 flex-shrink-0" />
      </button>

      {expanded && (
        <ContestDetail contest={contest} onChanged={onChanged} />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: { color: "text-[#53FC18]", bg: "bg-[#53FC18]/10", border: "border-[#53FC18]/30", label: "Aktif", icon: CheckCircle2 },
    scheduled: { color: "text-[#5EBEEA]", bg: "bg-[#5EBEEA]/10", border: "border-[#5EBEEA]/30", label: "Planlandı", icon: Clock },
    ended: { color: "text-zinc-500", bg: "bg-zinc-700/20", border: "border-white/10", label: "Bitti", icon: Clock },
  };
  const s = map[status] || map.ended;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${s.border} ${s.bg} ${s.color} text-[10px] font-mono uppercase tracking-wider flex-shrink-0`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function ContestDetail({ contest, onChanged }) {
  const [topClips, setTopClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingWinner, setSettingWinner] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/admin/contests/${contest.id}/top-clips?limit=20`)
      .then((r) => setTopClips(r.data.items || []))
      .finally(() => setLoading(false));
  }, [contest.id]);

  const pickWinner = async (clipId) => {
    if (!window.confirm("Bu klibi kazanan olarak ilan etmek istediğine emin misin?")) return;
    setSettingWinner(clipId);
    try {
      await api.post(`/admin/contests/${contest.id}/winner`, { clip_id: clipId });
      toast.success("Kazanan açıklandı — tüm kullanıcılara bildirim gönderildi");
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "İşlem başarısız"));
    } finally {
      setSettingWinner(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("Etkinliği silmek istediğine emin misin? Bu işlem geri alınamaz.")) return;
    try {
      await api.delete(`/admin/contests/${contest.id}`);
      toast.success("Etkinlik silindi");
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Silinemedi"));
    }
  };

  return (
    <div className="border-t border-white/10 p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#FFD166]">
            🏆 Kazanan Klibi Seç (en çok oy alanlar)
          </h4>
          <button
            type="button"
            onClick={remove}
            className="text-[11px] uppercase tracking-wider text-red-400 hover:text-red-300 inline-flex items-center gap-1.5"
            data-testid={`admin-contest-delete-${contest.id}`}
          >
            <Trash2 className="w-3 h-3" />
            Etkinliği Sil
          </button>
        </div>
        {loading && <p className="text-sm text-zinc-500">Yükleniyor...</p>}
        {!loading && topClips.length === 0 && (
          <p className="text-sm text-zinc-500">Henüz klip yok.</p>
        )}
        <ul className="space-y-1.5">
          {topClips.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center gap-3 p-2.5 border ${
                contest.winner_clip_id === c.id
                  ? "border-[#FFD166]/40 bg-[#FFD166]/5"
                  : "border-white/5 hover:border-white/15"
              } transition-colors`}
            >
              <span className="font-mono text-xs text-zinc-500 w-6 flex-shrink-0">
                #{i + 1}
              </span>
              <span className="text-sm text-zinc-200 truncate flex-1">{c.title}</span>
              <span className="text-xs font-mono text-zinc-500 flex-shrink-0">
                {c.votes_count} oy
              </span>
              {contest.winner_clip_id === c.id ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFD166]/20 border border-[#FFD166]/40 text-[10px] uppercase tracking-wider text-[#FFD166] font-bold">
                  <Crown className="w-3 h-3" />
                  Kazanan
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => pickWinner(c.id)}
                  disabled={settingWinner === c.id}
                  className="text-[10px] uppercase tracking-wider px-2 py-1 border border-[#FFD166]/40 text-[#FFD166] hover:bg-[#FFD166]/10 disabled:opacity-40"
                  data-testid={`admin-contest-pick-winner-${c.id}`}
                >
                  {settingWinner === c.id ? "..." : "Kazanan Yap"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-1.5 block">
      {children}
    </label>
  );
}

function toLocalInput(date) {
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
