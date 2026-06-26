import React, { useEffect, useRef } from "react";

/**
 * Renders the official Telegram Login Widget.
 * Telegram calls window[callbackName] with the auth payload.
 */
export default function TelegramLoginButton({ botUsername, onAuth, size = "large" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !botUsername) return;
    const callbackName = `tgAuth_${Math.random().toString(36).slice(2)}`;
    window[callbackName] = (data) => onAuth(data);

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", size);
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    containerRef.current.appendChild(script);

    return () => {
      try { delete window[callbackName]; } catch { /* noop */ }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [botUsername, onAuth, size]);

  return <div ref={containerRef} data-testid="telegram-login-widget" />;
}
