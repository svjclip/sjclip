import React from "react";
import { Zap, Send } from "lucide-react";

export default function Footer({ streamerName }) {
  return (
    <footer className="border-t border-white/5 mt-32 py-12 px-6 lg:px-8 relative z-10" data-testid="site-footer">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#53FC18]" />
          <span className="font-display font-black tracking-tighter">
            {streamerName}<span className="text-[#53FC18]">.</span>CLIPS
          </span>
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          Topluluk için yapıldı. Haftalık kazananlar. Bot yok, saçmalık yok.
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Send className="w-3.5 h-3.5" />
          <span>Telegram doğrulaması • Faz 2</span>
        </div>
      </div>
    </footer>
  );
}
