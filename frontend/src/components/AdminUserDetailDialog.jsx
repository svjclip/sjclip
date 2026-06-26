import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import {
  ShieldCheck,
  Send,
  Mail,
  Phone,
  Calendar,
  Film,
  ThumbsUp,
  Flag,
  AlertOctagon,
  ExternalLink,
  Ban,
  Trash2,
  UserX,
  UserCheck,
} from "lucide-react";

/**
 * Read-only detail view of a user shown when admin clicks a row in
 * AdminUserList. Surfaces telegram username/id, contact details, activity
 * counters and recent clips/events.
 */
export default function AdminUserDetailDialog({ userId, open, onClose, onUserChanged }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!userId) return;
    setLoading(true);
    setUser(null);
    return api
      .get(`/admin/users/${userId}`)
      .then((r) => setUser(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!userId || !open) return;
    load();
  }, [userId, open]);

  const ban = async () => {
    const reason = window.prompt("Yasaklama sebebi (opsiyonel):", "") || "";
    if (!window.confirm("Bu kullanıcıyı yasaklamak istediğine emin misin?")) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${user.id}/ban`, { reason });
      toast.success("Kullanıcı yasaklandı");
      await load();
      onUserChanged?.();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const unban = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${user.id}/unban`);
      toast.success("Yasak kaldırıldı");
      await load();
      onUserChanged?.();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    if (!window.confirm(
      `${user.username} kullanıcısını ve TÜM kliplerini/oylarını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.`
    )) return;
    setBusy(true);
    try {
      const r = await api.delete(`/admin/users/${user.id}`);
      toast.success(`Kullanıcı silindi (${r.data.deleted_clips || 0} klip dahil)`);
      onUserChanged?.();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Silme başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const deleteClip = async (clipId, title) => {
    if (!window.confirm(`"${title}" klibini silmek istediğine emin misin?`)) return;
    try {
      await api.delete(`/clips/${clipId}`);
      toast.success("Klip silindi");
      await load();
      onUserChanged?.();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Silinemedi"));
    }
  };

  const fmt = (s) => (s ? new Date(s).toLocaleString("tr-TR") : "—");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl bg-black border border-[#53FC18]/30 text-white rounded-none p-0 max-h-[90vh] overflow-y-auto"
        data-testid="admin-user-detail-dialog"
      >
        <DialogTitle className="sr-only">Kullanıcı Detayı</DialogTitle>

        {loading && (
          <div className="p-10 text-center text-zinc-500 font-mono">Yükleniyor...</div>
        )}

        {!loading && user && (
          <div>
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-gradient-to-br from-[#53FC18]/10 to-transparent">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-[#53FC18]/20 border border-[#53FC18]/40 flex items-center justify-center font-display font-black text-xl text-[#53FC18]">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="font-display font-black text-2xl tracking-tight truncate"
                      data-testid="admin-user-detail-username"
                    >
                      {user.username}
                    </h3>
                    {user.is_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFD166]/15 border border-[#FFD166]/30 text-[10px] uppercase tracking-wider text-[#FFD166]">
                        <ShieldCheck className="w-3 h-3" /> admin
                      </span>
                    )}
                    {user.banned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-[10px] uppercase tracking-wider text-red-400">
                        <Ban className="w-3 h-3" /> yasaklı
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-1 truncate">{user.id}</div>
                  {user.banned && user.banned_reason && (
                    <div className="text-xs text-red-400/80 mt-1.5 italic">
                      Sebep: {user.banned_reason}
                    </div>
                  )}
                </div>
              </div>

              {/* Admin actions */}
              {!user.is_admin && (
                <div className="flex flex-wrap items-center gap-2 mt-4" data-testid="admin-user-actions">
                  {user.banned ? (
                    <button
                      type="button"
                      onClick={unban}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider border border-[#53FC18]/40 text-[#53FC18] hover:bg-[#53FC18]/10 transition-colors disabled:opacity-50"
                      data-testid="admin-user-unban-btn"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Yasağı Kaldır
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={ban}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider border border-[#FFD166]/40 text-[#FFD166] hover:bg-[#FFD166]/10 transition-colors disabled:opacity-50"
                      data-testid="admin-user-ban-btn"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Yasakla
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={removeUser}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 ml-auto"
                    data-testid="admin-user-delete-btn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Kullanıcıyı Sil
                  </button>
                </div>
              )}
            </div>

            {/* Contact + Telegram */}
            <div className="grid sm:grid-cols-2 gap-4 p-6 border-b border-white/10">
              <DetailRow icon={Mail} label="E-posta" value={user.email || "—"} />
              <DetailRow icon={Phone} label="Telefon" value={user.phone || "—"} />
              <DetailRow
                icon={Send}
                label="Telegram"
                value={
                  user.telegram_username ? (
                    <a
                      href={`https://t.me/${user.telegram_username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#5EBEEA] inline-flex items-center gap-1 hover:underline"
                    >
                      @{user.telegram_username}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : user.has_telegram ? (
                    <span className="text-[#5EBEEA]">Bağlı (kullanıcı adı yok)</span>
                  ) : (
                    "—"
                  )
                }
                testId="admin-user-detail-telegram"
              />
              <DetailRow
                icon={Send}
                label="Telegram ID"
                value={user.telegram_id || "—"}
                mono
              />
              <DetailRow icon={Calendar} label="Kayıt Tarihi" value={fmt(user.created_at)} />
            </div>

            {/* Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 border-b border-white/10">
              <StatCell icon={Film} label="Klip" value={user.clips_count} />
              <StatCell icon={ThumbsUp} label="Oy" value={user.votes_count} />
              <StatCell icon={Flag} label="Şikayet Etti" value={user.reports_by} />
              <StatCell
                icon={AlertOctagon}
                label="Şikayet Edildi"
                value={user.reports_against}
              />
            </div>

            {/* Recent clips */}
            <div className="p-6 border-b border-white/10">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-3">
                Son Klipler ({user.recent_clips?.length || 0})
              </h4>
              {user.recent_clips?.length ? (
                <ul className="space-y-2">
                  {user.recent_clips.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-2 border border-white/5 hover:border-[#53FC18]/30 transition-colors text-sm"
                    >
                      <a
                        href={`/clip/${c.id}`}
                        className="truncate text-zinc-300 hover:text-[#53FC18] flex-1"
                      >
                        {c.title}
                      </a>
                      <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">
                        {fmt(c.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteClip(c.id, c.title)}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Klibi sil"
                        data-testid={`admin-delete-clip-${c.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">Henüz klip yok.</p>
              )}
            </div>

            {/* Recent events */}
            <div className="p-6">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-3">
                Son Aktiviteler ({user.recent_events?.length || 0})
              </h4>
              {user.recent_events?.length ? (
                <ul className="space-y-1.5">
                  {user.recent_events.map((e) => (
                    <li
                      key={e.id || `${e.created_at}-${e.action}`}
                      className="flex items-center justify-between gap-3 text-xs font-mono"
                    >
                      <span className="text-zinc-400">{e.action}</span>
                      <span className="text-zinc-300 truncate flex-1 ml-3">{e.target_title || ""}</span>
                      <span className="text-zinc-600 flex-shrink-0">{fmt(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">Aktivite kaydı yok.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ icon: Icon, label, value, mono, testId }) {
  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`text-sm text-zinc-200 ${mono ? "font-mono break-all" : ""}`}>{value}</div>
    </div>
  );
}

function StatCell({ icon: Icon, label, value }) {
  return (
    <div className="bg-black p-4 flex items-center gap-3">
      <Icon className="w-4 h-4 text-zinc-500" />
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </div>
        <div className="text-xl font-display font-bold">{value ?? 0}</div>
      </div>
    </div>
  );
}
