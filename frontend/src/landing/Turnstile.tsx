import { useEffect, useRef } from 'react';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
    };
  }
}

/** Cloudflare bot check. Draws nothing and loads nothing unless VITE_TURNSTILE_SITE_KEY is set. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    const draw = () => {
      if (box.current && window.turnstile && !box.current.hasChildNodes()) {
        window.turnstile.render(box.current, { sitekey: siteKey, callback: onToken });
      }
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = 'true';
      document.head.appendChild(script);
    }
    if (window.turnstile) draw();
    else script.addEventListener('load', draw);
    return () => script?.removeEventListener('load', draw);
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={box} className="l-turnstile" />;
}
