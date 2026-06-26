import React, { useState } from "react";
import { Share2, Send, MessageCircle, Link as LinkIcon, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";

/**
 * Inline share menu for a clip card. Opens a small popover with:
 *  - Telegram share (https://t.me/share/url)
 *  - WhatsApp share (https://wa.me)
 *  - Copy link to clipboard
 *
 * The shared URL is the SVJ.CLIPS clip detail page so visitors land on the
 * site (good for vote conversion) rather than directly on Kick.
 */
export default function ShareClipMenu({ clipId, title }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/clip/${clipId}` : "";
  const shareText = title ? `${title} — SVJ.CLIPS` : "SVJ.CLIPS klibine göz at";

  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(
    shareUrl
  )}&text=${encodeURIComponent(shareText)}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `${shareText} ${shareUrl}`
  )}`;

  const copyLink = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link kopyalandı");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            // Radix Popover'ın toggle'ını manuel tetikliyoruz çünkü ClipCard
            // içindeki <Link> parent'a olayın yayılmamasını da istiyoruz.
            e.stopPropagation();
            e.preventDefault();
            setOpen((o) => !o);
          }}
          className="text-zinc-500 hover:text-[#53FC18] transition-colors flex-shrink-0"
          aria-label="Klibi paylaş"
          data-testid={`share-clip-btn-${clipId}`}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-52 p-2 bg-[#0A0A0A] border border-[#53FC18]/25 rounded-md shadow-[0_0_30px_rgba(83,252,24,0.12)]"
        data-testid={`share-menu-${clipId}`}
      >
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-bold px-2 pt-1 pb-2">
          Paylaş
        </div>
        <a
          href={tgHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2.5 px-2 py-2 rounded text-sm text-zinc-200 hover:bg-[#229ED9]/15 hover:text-[#5EBEEA] transition-colors"
          data-testid={`share-telegram-${clipId}`}
        >
          <Send className="w-4 h-4 text-[#229ED9]" />
          Telegram
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2.5 px-2 py-2 rounded text-sm text-zinc-200 hover:bg-[#25D366]/15 hover:text-[#5BE38E] transition-colors"
          data-testid={`share-whatsapp-${clipId}`}
        >
          <MessageCircle className="w-4 h-4 text-[#25D366]" />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded text-sm text-zinc-200 hover:bg-[#53FC18]/10 hover:text-[#53FC18] transition-colors"
          data-testid={`share-copy-${clipId}`}
        >
          {copied ? (
            <Check className="w-4 h-4 text-[#53FC18]" strokeWidth={3} />
          ) : (
            <LinkIcon className="w-4 h-4" />
          )}
          {copied ? "Kopyalandı" : "Linki kopyala"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
