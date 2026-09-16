// Per-viewer convenience only (which reports this browser looked at recently) —
// never read back by the server, safe to lose silently if storage is
// unavailable (private window, cleared site data, etc.).
export interface RecentReport { id: string; title: string; viewedAt: number }

const STORAGE_KEY = 'hesabat.recentReports';
const MAX_RECENT = 6;

export function getRecentReports(): RecentReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecentReport(id: string, title: string): void {
  try {
    const existing = getRecentReports().filter((r) => r.id !== id);
    const next = [{ id, title, viewedAt: Date.now() }, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — private window / storage disabled / quota exceeded
  }
}
