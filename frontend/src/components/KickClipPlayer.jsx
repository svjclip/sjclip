import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Play, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { api } from "../lib/api";

/**
 * In-page Kick clip player with two strategies:
 *   1) PRIMARY: Kick's official iframe embed
 *      https://player.kick.com/embed/clips/<clip_id>?parent=<host>
 *      Works on most user browsers — Kick honours the `parent` handshake.
 *   2) FALLBACK: Native HLS playback via hls.js using the CloudFront CDN
 *      https://clips.kick.com/clips/<shard>/<clip_id>/playlist.m3u8
 *      No iframe, no X-Frame-Options issues, no codec lock-in.
 *
 * If the iframe fails to emit a `load` event in time OR the user explicitly
 * clicks the "Yedek oynatıcı" link, we swap to HLS. The user never leaves the
 * page either way.
 */
export default function KickClipPlayer({ clip, autoPlay = false }) {
  const [active, setActive] = useState(autoPlay);
  // Strategy: 'iframe' (try Kick official first) → 'hls' (fallback)
  const [strategy, setStrategy] = useState("iframe");
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const cleanClipId = clip?.kick_clip_id?.startsWith("clip_")
    ? clip.kick_clip_id
    : `clip_${clip?.kick_clip_id || ""}`;
  const parentHost = typeof window !== "undefined" ? window.location.hostname : "";
  const iframeUrl = `https://player.kick.com/embed/clips/${cleanClipId}?parent=${encodeURIComponent(
    parentHost
  )}`;

  // If iframe doesn't load within ~5s, assume Kick blocked it and switch to HLS.
  useEffect(() => {
    if (!active || strategy !== "iframe") return;
    const t = setTimeout(() => {
      if (!iframeLoaded) setStrategy("hls");
    }, 5000);
    return () => clearTimeout(t);
  }, [active, strategy, iframeLoaded]);

  if (!active) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActive(true);
        }}
        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900 group/play"
        data-testid={`clip-play-${clip.id}`}
        aria-label="Klibi oynat"
      >
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_rgba(83,252,24,0.3),_transparent_60%)]" />
        <div className="relative w-16 h-16 rounded-full bg-[#53FC18] flex items-center justify-center transform transition-transform group-hover/play:scale-110 group-hover/play:shadow-[0_0_40px_rgba(83,252,24,0.6)]">
          <Play className="w-7 h-7 text-black ml-1" fill="black" />
        </div>
        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          Kick Klip
        </div>
      </button>
    );
  }

  if (strategy === "iframe") {
    return (
      <>
        <iframe
          src={iframeUrl}
          className="w-full h-full"
          title={clip.title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          onLoad={() => setIframeLoaded(true)}
          onError={() => setStrategy("hls")}
          data-testid={`clip-iframe-${clip.id}`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setStrategy("hls");
          }}
          className="absolute bottom-2 right-2 z-10 px-2 py-1 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:text-[#53FC18] border border-white/10 hover:border-[#53FC18]/40 inline-flex items-center gap-1"
          data-testid={`clip-switch-hls-${clip.id}`}
          aria-label="Yedek oynatıcıya geç"
        >
          <RotateCcw className="w-3 h-3" />
          Yedek
        </button>
      </>
    );
  }

  return <HlsPlayer clip={clip} />;
}

function HlsPlayer({ clip }) {
  const videoRef = useRef(null);
  const [shard, setShard] = useState(clip?.kick_shard || null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);

  const playlistUrl =
    shard && clip?.kick_clip_id
      ? `https://clips.kick.com/clips/${shard}/${clip.kick_clip_id}/playlist.m3u8`
      : null;

  // Lazy-resolve the shard if we don't have it cached.
  useEffect(() => {
    if (shard || resolving) return;
    let cancelled = false;
    setResolving(true);
    setError(null);
    api
      .post(`/clips/${clip.id}/resolve-shard`)
      .then((r) => {
        if (cancelled) return;
        if (r.data?.kick_shard) setShard(r.data.kick_shard);
        else setError("Klip kaynağı bulunamadı (Kick'te silinmiş olabilir).");
      })
      .catch(() => {
        if (!cancelled) setError("Klip yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clip.id, shard, resolving]);

  useEffect(() => {
    if (!playlistUrl) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      const onErr = () => setError("Video oynatılamadı.");
      video.addEventListener("error", onErr);
      return () => video.removeEventListener("error", onErr);
    }

    if (!Hls.isSupported()) {
      setError("Tarayıcınız HLS oynatmayı desteklemiyor.");
      return;
    }

    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error("[hls.js error]", data?.type, data?.details, data?.reason || data);
      if (data.fatal) {
        setError("Video kaynağı yüklenemedi.");
        hls.destroy();
      }
    });
    return () => {
      try {
        hls.destroy();
      } catch {
        /* noop */
      }
    };
  }, [playlistUrl]);

  if (resolving || !playlistUrl) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3 text-zinc-400"
        data-testid={`clip-loading-${clip.id}`}
      >
        <Loader2 className="w-7 h-7 animate-spin text-[#53FC18]" />
        <span className="text-xs font-mono uppercase tracking-[0.2em]">Yükleniyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-2 text-zinc-300 px-6 text-center"
        data-testid={`clip-error-${clip.id}`}
      >
        <AlertTriangle className="w-7 h-7 text-[#FFD166]" />
        <span className="text-sm">{error}</span>
        <a
          href={clip.kick_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#53FC18] underline mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          Kick&apos;te aç
        </a>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="w-full h-full bg-black"
      controls
      playsInline
      autoPlay
      data-testid={`clip-video-${clip.id}`}
    />
  );
}
