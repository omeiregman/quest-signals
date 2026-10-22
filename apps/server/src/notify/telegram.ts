export interface NotifiableLeg {
  outcome: string;
  book: string;
  odds: number;
  recommendedStake?: number | null;
  deepLink?: string | null;
  priceUpdatedAt?: string | null; // feed timestamp of the price; shown as age so stale lines are obvious
}

/** Compact "3h" / "2d 4h" age of an ISO timestamp relative to `now`; '' when unknown. */
export function priceAge(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${mins}m`;
}

export interface NotifiableOpportunity {
  type: 'arb' | 'value';
  eventName: string | null;
  sportKey: string;
  commenceTime: string;
  margin?: number | null;
  edge?: number | null;
  defaultBankrollProfit?: number | null;
  legs: NotifiableLeg[];
}

export interface Notifier {
  enabled: boolean;
  /** Push for opportunities INSERTED this run. Never throws — a dead bot can't break polling. */
  notifyNew(opps: NotifiableOpportunity[]): Promise<void>;
  /** Plain-text operational message (e.g. a fundable book's feed went dark). Never throws. */
  notifyText(text: string): Promise<void>;
}

export interface NotifierConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyMinValueEdge: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const MAX_MESSAGES_PER_RUN = 10; // spam guard (e.g. first poll on a fresh db)

export function formatOpportunityMessage(o: NotifiableOpportunity, now: number = Date.now()): string {
  const head =
    o.type === 'arb'
      ? `ARB ${o.margin != null ? pct(o.margin) : ''}`.trim()
      : `VALUE ${o.edge != null ? pct(o.edge) : ''}`.trim();
  const lines = [
    `${head} — ${o.eventName ?? 'unknown event'} (${o.sportKey})`,
    `kickoff ${o.commenceTime}`,
    ...o.legs.map((l) => {
      const stake = l.recommendedStake != null ? `  stake ${l.recommendedStake}` : '';
      const age = priceAge(l.priceUpdatedAt, now);
      const ageNote = age ? `  (price ${age} old)` : '';
      const link = l.deepLink ? `\n  ${l.deepLink}` : '';
      return `${l.book}: ${l.outcome} @ ${l.odds}${stake}${ageNote}${link}`;
    }),
    'Re-check in the app before placing.',
  ];
  if (o.type === 'arb' && o.defaultBankrollProfit != null) {
    lines.push(`profit @ default bankroll: ${o.defaultBankrollProfit.toFixed(2)}`);
  }
  return lines.join('\n');
}

export function createNotifier(
  cfg: NotifierConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): Notifier {
  const { telegramBotToken: token, telegramChatId: chatId } = cfg;
  if (!token || !chatId) {
    return { enabled: false, notifyNew: async () => {}, notifyText: async () => {} };
  }
  const send = async (text: string): Promise<void> => {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!res.ok) console.warn(`[quest] telegram sendMessage failed: HTTP ${res.status}`);
    } catch (err) {
      console.warn(
        `[quest] telegram sendMessage error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  return {
    enabled: true,
    async notifyNew(opps) {
      const wanted = opps
        .filter((o) => o.type === 'arb' || (o.edge ?? 0) >= cfg.notifyMinValueEdge)
        .slice(0, MAX_MESSAGES_PER_RUN);
      for (const o of wanted) await send(formatOpportunityMessage(o));
    },
    notifyText: send,
  };
}
