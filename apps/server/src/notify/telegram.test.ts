import { describe, expect, it, vi } from 'vitest';
import { createNotifier, formatOpportunityMessage, type NotifiableOpportunity } from './telegram';

const arb: NotifiableOpportunity = {
  type: 'arb',
  eventName: 'A vs B',
  sportKey: 'soccer',
  commenceTime: '2026-07-10T18:00:00Z',
  margin: 0.015,
  defaultBankrollProfit: 1.42,
  legs: [
    { outcome: 'A', book: '7bet.lt', odds: 2.28, recommendedStake: 48.2, deepLink: 'https://7bet.lt/e/1' },
    { outcome: 'B', book: 'betsson', odds: 2.82, recommendedStake: 51.8 },
  ],
};

const smallValue: NotifiableOpportunity = {
  type: 'value',
  eventName: 'C vs D',
  sportKey: 'soccer',
  commenceTime: '2026-07-11T18:00:00Z',
  edge: 0.021,
  legs: [{ outcome: 'C', book: 'betsson', odds: 2.3 }],
};

describe('telegram notifier', () => {
  it('formats an arb message with legs, stakes and links', () => {
    const msg = formatOpportunityMessage(arb);
    expect(msg).toContain('ARB 1.5%');
    expect(msg).toContain('A vs B');
    expect(msg).toContain('7bet.lt: A @ 2.28');
    expect(msg).toContain('https://7bet.lt/e/1');
    expect(msg).toContain('profit @ default bankroll: 1.42');
    expect(msg).toContain('Re-check in the app before placing.');
  });

  it('shows how old each price is so stale lines are obvious', () => {
    const now = Date.parse('2026-09-20T12:00:00Z');
    const msg = formatOpportunityMessage(
      {
        ...smallValue,
        legs: [{ outcome: 'C', book: 'betsson', odds: 2.3, priceUpdatedAt: '2026-09-18T09:00:00Z' }],
      },
      now,
    );
    expect(msg).toContain('(price 2d 3h old)');
  });

  it('is disabled without token/chat id and sends nothing', async () => {
    const fetchSpy = vi.fn();
    const n = createNotifier({ notifyMinValueEdge: 0.03 }, fetchSpy as unknown as typeof fetch);
    expect(n.enabled).toBe(false);
    await n.notifyNew([arb]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends arbs always, values only at/above the edge threshold', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    const n = createNotifier(
      { telegramBotToken: 't', telegramChatId: 'c', notifyMinValueEdge: 0.03 },
      fetchSpy as unknown as typeof fetch,
    );
    await n.notifyNew([arb, smallValue]);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // smallValue (2.1%) filtered out
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('api.telegram.org/bott/sendMessage');
    expect(JSON.parse(init.body as string).chat_id).toBe('c');
  });

  it('notifyText sends a plain operational message when enabled, nothing when disabled', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    const on = createNotifier(
      { telegramBotToken: 't', telegramChatId: 'c', notifyMinValueEdge: 0.03 },
      fetchSpy as unknown as typeof fetch,
    );
    await on.notifyText('FEED WARNING — betsson dark');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).text).toContain('FEED WARNING');

    const off = createNotifier({ notifyMinValueEdge: 0.03 }, fetchSpy as unknown as typeof fetch);
    await off.notifyText('x');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows send failures', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('net down');
    });
    const n = createNotifier(
      { telegramBotToken: 't', telegramChatId: 'c', notifyMinValueEdge: 0.03 },
      fetchSpy as unknown as typeof fetch,
    );
    await expect(n.notifyNew([arb])).resolves.toBeUndefined();
  });
});
