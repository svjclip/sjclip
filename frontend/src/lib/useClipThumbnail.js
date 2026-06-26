import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// Module-level cache so thumbnails persist across re-renders, list refreshes,
// and route changes. Memory-only — page refresh re-captures. clips.kick.com
// already has aggressive CDN caching so the video segment HEAD is cheap.
const thumbCache = new Map();

/**
 * Lazily captures the first frame of a Kick clip's HLS stream as a data URL,
 * to be used as a poster image on the clip card before the user hits play.
 *
 *  - Defers work until the card enters the viewport (IntersectionObserver).
 *  - Loads the HLS manifest via hls.js into a hidden <video>, seeks to ~0.4s
 *    (to skip black frames at exactly t=0), draws to <canvas>, encodes JPEG.
 *  - clips.kick.com responds with `access-control-allow-origin: *` so the
 *    canvas is not tainted and `toDataURL` works.
 *
 *  Caller usage:
 *    const { ref, thumbnailUrl } = useClipThumbnail(clip);
 *    <div ref={ref} ...>
 *      {thumbnailUrl && <img src={thumbnailUrl} ... />}
 *    </div>
 */
export default function useClipThumbnail(clip) {
  const ref = useRef(null);
  const [thumbnailUrl, setThumbnailUrl] = useState(
    () => thumbCache.get(clip?.id) || null
  );

  useEffect(() => {
    if (!clip || thumbnailUrl) return;
    if (!clip.kick_shard || !clip.kick_clip_id) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let cancelled = false;
    let hls = null;
    let video = null;

    const capture = async () => {
      try {
        video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        // Off-screen but still loadable
        video.style.position = "fixed";
        video.style.left = "-9999px";
        video.style.width = "320px";
        video.style.height = "180px";
        document.body.appendChild(video);

        const url = `https://clips.kick.com/clips/${clip.kick_shard}/${clip.kick_clip_id}/playlist.m3u8`;

        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hls.loadSource(url);
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
        } else {
          throw new Error("HLS not supported");
        }

        await new Promise((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = (e) => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onErr);
            reject(e);
          };
          video.addEventListener("loadeddata", onLoaded);
          video.addEventListener("error", onErr);
        });

        await new Promise((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          try {
            video.currentTime = 0.4;
          } catch {
            resolve();
          }
        });

        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        if (!cancelled) {
          thumbCache.set(clip.id, dataUrl);
          setThumbnailUrl(dataUrl);
        }
      } catch {
        // Silent — card falls back to its default gradient.
      } finally {
        if (hls) {
          try { hls.destroy(); } catch { /* noop */ }
        }
        if (video && video.parentNode) {
          try { video.src = ""; } catch { /* noop */ }
          video.parentNode.removeChild(video);
        }
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            io.disconnect();
            capture();
            return;
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
      if (hls) {
        try { hls.destroy(); } catch { /* noop */ }
      }
      if (video && video.parentNode) {
        try { video.src = ""; } catch { /* noop */ }
        video.parentNode.removeChild(video);
      }
    };
  }, [clip, thumbnailUrl]);

  return { ref, thumbnailUrl };
}
