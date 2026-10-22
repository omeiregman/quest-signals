import type {
  Meta,
  Opportunity,
  OpportunityQuery,
  PollResult,
  RecheckResult,
  SettlementBody,
  Stats,
  StatusBody,
} from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

function buildQuery(q: OpportunityQuery): string {
  const params = new URLSearchParams();
  if (q.status) params.set('status', q.status);
  if (q.type) params.set('type', q.type);
  if (q.sport) params.set('sport', q.sport);
  if (q.region) params.set('region', q.region);
  if (q.minMargin !== undefined) params.set('minMargin', String(q.minMargin));
  if (q.sort) params.set('sort', q.sort);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = {
  listOpportunities: (q: OpportunityQuery = {}) =>
    req<Opportunity[]>(`/api/opportunities${buildQuery(q)}`),
  getOpportunity: (id: number) => req<Opportunity>(`/api/opportunities/${id}`),
  setStatus: (id: number, body: StatusBody) =>
    req<{ ok: true }>(`/api/opportunities/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  settle: (id: number, body: SettlementBody) =>
    req<{ ok: true }>(`/api/opportunities/${id}/settlement`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recheck: (id: number) =>
    req<RecheckResult>(`/api/opportunities/${id}/recheck`, { method: 'POST' }),
  stats: () => req<Stats>('/api/stats'),
  meta: () => req<Meta>('/api/meta'),
  sports: () => req<string[]>('/api/sports'),
  poll: () => req<PollResult>('/api/poll', { method: 'POST' }),
};
