import type {
  ModeratorViewModel, PublicViewModel, CatalogViewModel, RuleVariants,
  FinalSummary, GameEvent, ImpactSummary
} from '../types.ts';

/** Server errors already carry a Thai message written for the moderator. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
  /** A stale screen sent an old version — reload rather than shout at the user. */
  get isConflict(): boolean { return this.status === 409; }
  get isAuth(): boolean { return this.status === 401; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) }
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: string }).error)
      : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export interface Bootstrap {
  appName: string;
  appVersion: string;
  catalog: CatalogViewModel;
  defaults: RuleVariants;
}

/** Games this device has opened before, remembered locally rather than served. */
export interface RecentGame { gameId: string; title: string; at: number }

export const getBootstrap = () => request<Bootstrap>('/api/bootstrap');

export const createGame = (playerNames: string[], title: string) =>
  request<ModeratorViewModel>('/api/games', {
    method: 'POST', body: JSON.stringify({ playerNames, title })
  });

export const login = (gameId: string, pin: string) =>
  request<ModeratorViewModel>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ gameId, pin })
  });

export const logout = () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });

export const getGame = (gameId: string) =>
  request<ModeratorViewModel>('/api/game/' + encodeURIComponent(gameId));

export const getPublic = (gameId: string) =>
  request<PublicViewModel>('/api/public/' + encodeURIComponent(gameId));

export const getSummary = (gameId: string) =>
  request<FinalSummary>('/api/game/' + encodeURIComponent(gameId) + '/summary');

export const getEvents = (gameId: string, limit = 120) =>
  request<GameEvent[]>('/api/game/' + encodeURIComponent(gameId) + '/events?limit=' + limit);

export const validateSelection = (gameId: string, selectedRoles: { roleId: string; count: number }[]) =>
  request<{ problems: string[]; warnings: string[]; totalCards: number; wolves: number; impact: ImpactSummary }>(
    '/api/game/' + encodeURIComponent(gameId) + '/validate',
    { method: 'POST', body: JSON.stringify({ selectedRoles }) });

/** Every command carries the version it was built from plus a retry-safe key. */
export function newIdempotencyKey(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return rand + '-' + Date.now();
}

export const sendCommand = (payload: Record<string, unknown>) =>
  request<ModeratorViewModel>('/api/command', {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), ...payload })
  });
