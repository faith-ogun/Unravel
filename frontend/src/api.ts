// Thin client for the Unravel backend. In dev, Vite proxies /api to the
// FastAPI server on :8000 (see vite.config.ts). The shapes here match the
// stub in backend/server.py and the future real ADK loop response.

const BASE = '/api';

export interface Health {
  status: string;
  service: string;
}

export interface WatchResult {
  year: number;
  stage: string;
  variant: string;
  decision: string;
  review_status: string;
  narration: string;
  source: string;
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function runWatch(year: number): Promise<WatchResult> {
  const res = await fetch(`${BASE}/run-watch?year=${year}`, { method: 'POST' });
  if (!res.ok) throw new Error(`run-watch ${res.status}`);
  return res.json();
}
