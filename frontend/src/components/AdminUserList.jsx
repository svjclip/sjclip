import React, { useEffect, useState, useCallback } from "react";
import { Users, Search, ChevronLeft, ChevronRight, ShieldCheck, Send } from "lucide-react";
import { api } from "../lib/api";
import { Input } from "./ui/input";
import AdminUserDetailDialog from "./AdminUserDetailDialog";

const PAGE_SIZE = 30;

/**
 * Paginated user table for the admin panel. Each row is clickable and opens
 * a full-detail dialog (telegram username, clips, votes, recent activity).
 */
export default function AdminUserList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(
    async (p = page, q = search) => {
      setLoading(true);
      try {
        const r = await api.get("/admin/users", {
          params: { page: p, page_size: PAGE_SIZE, search: q },
        });
        setItems(r.data.items || []);
        setTotal(r.data.total || 0);
      } finally {
        setLoading(false);
      }
    },
    [page, search]
  );

  useEffect(() => {
    load(page, search);
  }, [page, load, search]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(1, search);
    }, 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("tr-TR") : "—");

  return (
    <section
      className="border border-white/10 bg-black p-6 rounded-none mb-10"
      data-testid="admin-user-list"
    >
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-[#53FC18]" />
          <h2 className="font-display font-black text-2xl tracking-tighter">Kullanıcılar</h2>
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
            {total} kayıt
          </span>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="kullanıcı adı / e-posta / telegram"
            className="pl-9 bg-black border-white/10 focus:border-[#53FC18] text-white h-10 rounded-none"
            data-testid="admin-user-search"
          />
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 border-b border-white/10">
              <th className="px-2 py-2">Kullanıcı</th>
              <th className="px-2 py-2 hidden sm:table-cell">E-posta</th>
              <th className="px-2 py-2 hidden md:table-cell">Telegram</th>
              <th className="px-2 py-2 text-right">Klip</th>
              <th className="px-2 py-2 text-right">Oy</th>
              <th className="px-2 py-2 hidden lg:table-cell">Katıldı</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-zinc-500">
                  Yükleniyor...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-zinc-500">
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className="border-b border-white/5 hover:bg-[#53FC18]/[0.04] cursor-pointer transition-colors"
                data-testid={`admin-user-row-${u.id}`}
              >
                <td className="px-2 py-3 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-white">{u.username}</span>
                    {u.is_admin && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFD166]/15 border border-[#FFD166]/30 text-[9px] uppercase tracking-wider text-[#FFD166]"
                        title="Admin"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-3 text-zinc-400 hidden sm:table-cell truncate max-w-[220px]">
                  {u.email || "—"}
                </td>
                <td className="px-2 py-3 hidden md:table-cell">
                  {u.has_telegram ? (
                    <span className="inline-flex items-center gap-1 text-[#5EBEEA]">
                      <Send className="w-3.5 h-3.5" />
                      {u.telegram_username ? `@${u.telegram_username}` : "Bağlı"}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-2 py-3 text-right font-mono">{u.clips_count}</td>
                <td className="px-2 py-3 text-right font-mono">{u.votes_count}</td>
                <td className="px-2 py-3 text-zinc-500 hidden lg:table-cell font-mono text-xs">
                  {fmtDate(u.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-5 text-sm">
          <span className="text-zinc-500 font-mono">
            Sayfa {page} / {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-2 border border-white/10 hover:border-[#53FC18]/50 hover:text-[#53FC18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="admin-user-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              className="p-2 border border-white/10 hover:border-[#53FC18]/50 hover:text-[#53FC18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="admin-user-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AdminUserDetailDialog
        userId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
