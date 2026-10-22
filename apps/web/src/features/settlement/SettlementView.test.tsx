import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Opportunity } from '@/lib/types';
import { SettlementView } from './SettlementView';

vi.mock('@/lib/api', () => ({
  api: {
    listOpportunities: vi.fn(),
    settle: vi.fn(),
  },
}));

import { api } from '@/lib/api';

const opp: Opportunity = {
  id: 42,
  type: 'arb',
  sportKey: 'soccer_epl',
  eventId: 'evt-1',
  eventName: 'Arsenal vs Chelsea',
  commenceTime: new Date(Date.now() + 3_600_000).toISOString(),
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: 0.03,
  edge: null,
  referenceBook: null,
  defaultBankrollProfit: 4.21,
  status: 'bet_placed',
  detectedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  legs: [
    { id: 1, outcome: 'Arsenal', book: 'pinnacle', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
    { id: 2, outcome: 'Chelsea', book: 'bet365', odds: 2.2, impliedProb: 0.454, recommendedStake: 48 },
  ],
};

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettlementView />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettlementView', () => {
  it('renders the placed bet and submits a settlement with the chosen winning selection', async () => {
    vi.mocked(api.listOpportunities).mockResolvedValue([opp]);
    vi.mocked(api.settle).mockResolvedValue({ ok: true });

    renderView();

    // Event renders once data resolves.
    expect(await screen.findByText('Arsenal vs Chelsea')).toBeInTheDocument();

    // Predicted gross is shown for comparison.
    expect(screen.getByText('€4.21')).toBeInTheDocument();

    // Choose a winning selection.
    const select = screen.getByLabelText('Winning selection') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Chelsea' } });

    // Fill realized profit + notes.
    fireEvent.change(screen.getByLabelText('Realized profit'), { target: { value: '5.5' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'all good' } });

    fireEvent.click(screen.getByRole('button', { name: /record outcome/i }));

    await waitFor(() => expect(api.settle).toHaveBeenCalledTimes(1));

    expect(api.settle).toHaveBeenCalledWith(42, {
      winningSelection: 'Chelsea',
      realizedProfit: 5.5,
      notes: 'all good',
      autoFilled: false,
      legs: [
        { outcome: 'Arsenal', result: 'settled' },
        { outcome: 'Chelsea', result: 'settled' },
      ],
    });
  });

  it('shows the empty state when there are no placed bets', async () => {
    vi.mocked(api.listOpportunities).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText('No placed bets to settle')).toBeInTheDocument();
  });
});
