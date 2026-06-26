import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Crown } from "lucide-react";
import { api } from "../lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useAuth } from "../lib/auth";

/**
 * Bell icon in the navbar that polls /api/notifications/me every 60s while
 * a user is logged in. Opens a popover with the last 50 notifications, a
 * "tümünü okundu işaretle" action, and tap-to-navigate for each item.
 */
export default function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const pollRef = useRef(null);

  const load = async () => {
    if (!user) return;
    try {
      const r = await api.get("/notifications/me");
      setItems(r.data.items || []);
      setUnread(r.data.unread || 0);
    } catch {
      /* silent — non-critical */
    }
  };

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    load();
    pollRef.current = setInterval(load, 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user?.id]);

  const markAllRead = async () => {
    try {
      await api.post("/notifications/me/read-all");
      setItems((arr) => arr.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* noop */
    }
  };

  const handleClick = async (n) => {
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        /* ignore */
      }
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 text-zinc-400 hover:text-[#53FC18] transition-colors"
          data-testid="notifications-bell"
          aria-label="Bildirimler"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#53FC18] text-black text-[9px] font-bold leading-[16px] text-center"
              data-testid="notifications-unread-count"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 bg-black border border-[#53FC18]/25 rounded-md max-h-[480px] flex flex-col"
        data-testid="notifications-panel"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400">
            Bildirimler
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[10px] uppercase tracking-wider text-[#53FC18] hover:text-white inline-flex items-center gap-1"
              data-testid="notifications-read-all"
            >
              <CheckCheck className="w-3 h-3" />
              Tümünü Okundu
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-zinc-500 text-sm">
              Henüz bildirim yok.
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                to={n.link || "#"}
                onClick={() => handleClick(n)}
                className={`block px-3 py-3 border-b border-white/5 hover:bg-[#53FC18]/[0.04] transition-colors ${
                  n.read ? "opacity-60" : ""
                }`}
                data-testid={`notification-${n.id}`}
              >
                <div className="flex items-start gap-2.5">
                  {n.type === "winner_announced" ? (
                    <Crown className="w-4 h-4 text-[#FFD166] flex-shrink-0 mt-0.5" />
                  ) : (
                    <Bell className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">
                      {n.title}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600 mt-1">
                      {new Date(n.created_at).toLocaleString("tr-TR")}
                    </div>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-[#53FC18] flex-shrink-0 mt-1.5" />
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
