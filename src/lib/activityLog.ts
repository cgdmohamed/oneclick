/**
 * Lightweight system-wide activity log.
 * Stores entries in localStorage so they persist across reloads in the
 * preview/mock environment. When a backend is wired up later, swap the
 * storage layer here without touching call sites.
 */
import { useEffect, useState } from 'react';

export type ActivityModule = 'product' | 'category' | 'invoice' | 'payment' | 'client' | 'system';
export type ActivityAction = 'create' | 'update' | 'delete' | 'pay' | 'login' | 'logout';

export interface ActivityEntry {
  id: string;
  date: string; // ISO
  module: ActivityModule;
  action: ActivityAction;
  description: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

const KEY = 'activity-log';
const MAX = 500;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

const read = (): ActivityEntry[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    return [];
  }
};

const write = (entries: ActivityEntry[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch { /* ignore */ }
  notify();
};

export const logActivity = (entry: Omit<ActivityEntry, 'id' | 'date'> & { date?: string }) => {
  const next: ActivityEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: entry.date ?? new Date().toISOString(),
    ...entry,
  };
  write([next, ...read()]);
};

export const clearActivity = () => write([]);

export const useActivityLog = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => read());
  useEffect(() => {
    const sync = () => setEntries(read());
    listeners.add(sync);
    window.addEventListener('storage', sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return entries;
};
