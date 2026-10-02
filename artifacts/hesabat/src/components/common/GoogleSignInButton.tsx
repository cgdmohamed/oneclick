import { useEffect, useRef } from 'react';

const GOOGLE_CLIENT_ID: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '';

/** True when the frontend has a Google client id configured — lets pages hide the button/divider entirely otherwise. */
export const isGoogleSignInConfigured = () => Boolean(GOOGLE_CLIENT_ID);

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;
function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * Renders Google's own "Sign in with Google" button via Google Identity
 * Services. Nothing renders if VITE_GOOGLE_CLIENT_ID isn't set — callers
 * should check isGoogleSignInConfigured() before showing a divider/label
 * around it too, so an unconfigured deployment shows no trace of the feature.
 */
export const GoogleSignInButton = ({ onCredential }: { onCredential: (idToken: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !containerRef.current) return;
    let cancelled = false;
    loadGsiScript().then(() => {
      if (cancelled || !containerRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => onCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline', size: 'large', width: 360, text: 'continue_with', locale: 'ar',
      });
    }).catch(() => { /* Google script failed to load — button area stays empty */ });
    return () => { cancelled = true; };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={containerRef} className="flex justify-center" />;
};
