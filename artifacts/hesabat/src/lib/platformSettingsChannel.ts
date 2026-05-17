/**
 * Cross-tab synchronisation for platform settings.
 *
 * When a super admin saves settings in one browser tab, all other open tabs
 * on the same origin are notified via the BroadcastChannel API and refetch
 * the relevant settings from the server.
 *
 * Usage:
 *   postSettingsUpdate('branding')        // call after a successful save
 *   onSettingsUpdate('branding', refetch) // call in a useEffect to subscribe
 *   returns an unsubscribe function — call it in the useEffect cleanup
 */

const CHANNEL_NAME = 'hesabat-platform-settings';

export type SettingsKey = 'branding' | 'landing_content' | 'tracking';

interface SettingsMessage {
  key: SettingsKey;
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function postSettingsUpdate(key: SettingsKey): void {
  getChannel()?.postMessage({ key } satisfies SettingsMessage);
}

export function onSettingsUpdate(key: SettingsKey, handler: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (e: MessageEvent<SettingsMessage>) => {
    if (e.data?.key === key) handler();
  };

  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}
