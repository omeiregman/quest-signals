import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BankrollProvider } from '@/components/BankrollContext';
import type { Meta, Opportunity } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: {
    meta: vi.fn(),
    sports: vi.fn(),
    listOpportunities: vi.fn(),
    setStatus: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import { Calculator } from './Calculator';
import { OpportunitiesView } from './OpportunitiesView';

const meta: Meta = {
  lastPoll: null,
  config: {
    defaultBankroll: 100,
    taxRate: 0.2,
    stakeRounding: 1,
    regions: ['eu'],
    sports: ['soccer_epl'],
    oddsProvider: 'mock',
    supportsRecheck: false,
  },
  regionProfiles: {
    eu: { id: 'eu', apiRegions: ['eu'] },
  },
};

// Two even legs at 2.10 → margin ≈ 4.76%. Stake 100 → 50/50, return 105, gross profit 5.
const arbOpp: Opportunity = {
  id: 1,
  type: 'arb',
  sportKey: 'soccer_epl',
  eventId: 'evt-1',
  eventName: 'Arsenal vs Chelsea',
  commenceTime: '2026-06-20T12:00:00.000Z',
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: 0.0476,
  edge: null,
  referenceBook: null,
  defaultBankrollProfit: 5,
  status: 'new',
  detectedAt: '2026-06-14T10:00:00.000Z',
  lastSeenAt: '2026-06-14T10:00:00.000Z',
  legs: [
    { id: 10, outcome: 'Home', book: 'BookA', odds: 2.1, impliedProb: 0.47619, recommendedStake: 50 },
    { id: 11, outcome: 'Away', book: 'BookB', odds: 2.1, impliedProb: 0.47619, recommendedStake: 50 },
  ],
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BankrollProvider initial={100}>{node}</BankrollProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.meta).mockResolvedValue(meta);
  vi.mocked(api.sports).mockResolvedValue(['soccer_epl']);
  vi.mocked(api.listOpportunities).mockResolvedValue([arbOpp]);
});

describe('Calculator', () => {
  it('forward mode: shows per-leg stakes and gross profit', async () => {
    wrap(<Calculator opp={arbOpp} />);

    // meta must resolve (taxRate annotation depends on it)
    await screen.findByText(/after 20%/i);

    // Both books listed in the per-leg table.
    expect(screen.getByText('BookA')).toBeInTheDocument();
    expect(screen.getByText('BookB')).toBeInTheDocument();

    // Each leg stake = €50.00 (two of them).
    const fifties = screen.getAllByText('€50.00');
    expect(fifties.length).toBeGreaterThanOrEqual(2);

    // Gross profit headline = €5.00.
    expect(screen.getByText('€5.00')).toBeInTheDocument();
  });

  it('reverse mode: back-solves total stake from a target gross profit', async () => {
    wrap(<Calculator opp={arbOpp} />);
    await screen.findByText(/after 20%/i);

    // Switch to reverse (From target) mode.
    fireEvent.click(screen.getByText('From target'));

    const targetInput = await screen.findByLabelText(/Target gross profit/i);
    fireEvent.change(targetInput, { target: { value: '5' } });

    // Back-solving for €5 gross profit should reproduce the €100 total / €50 legs.
    await waitFor(() => {
      expect(screen.getAllByText('€50.00').length).toBeGreaterThanOrEqual(2);
    });
    // Total stake line shows €100.00.
    expect(screen.getByText('€100.00')).toBeInTheDocument();
  });
});

const valueOpp: Opportunity = {
  id: 2,
  type: 'value',
  sportKey: 'soccer_epl',
  eventId: 'evt-2',
  eventName: 'Leeds vs Derby',
  commenceTime: '2026-06-21T12:00:00.000Z',
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: null,
  edge: 0.05,
  referenceBook: 'Pinnacle',
  defaultBankrollProfit: null,
  status: 'new',
  detectedAt: '2026-06-14T10:00:00.000Z',
  lastSeenAt: '2026-06-14T10:00:00.000Z',
  legs: [
    {
      id: 20,
      outcome: 'Home',
      book: 'Betsson',
      odds: 2.3,
      impliedProb: null,
      recommendedStake: null,
      deepLink: 'https://betsson.example/e2',
    },
  ],
};

describe('ValueCalculator', () => {
  it('renders the soft book as a link when the leg has an http deep link', async () => {
    wrap(<Calculator opp={valueOpp} />);
    const link = await screen.findByRole('link', { name: 'Betsson' });
    expect(link).toHaveAttribute('href', 'https://betsson.example/e2');
  });

  it('suggests a 1% bankroll flat stake for value bets', async () => {
    wrap(<Calculator opp={valueOpp} />);
    expect(await screen.findByText(/Suggested stake \(1% bankroll\)/i)).toBeInTheDocument();
    // bankroll 100 → 1% = 1.00 (stakeRounding 1 from meta)
    await waitFor(() => {
      expect(screen.getByText('€1.00')).toBeInTheDocument();
    });
    // potential return = 1.00 × 2.30
    expect(screen.getByText('€2.30')).toBeInTheDocument();
  });
});

describe('OpportunitiesView', () => {
  it('renders an opportunity row from the api', async () => {
    wrap(<OpportunitiesView />);
    const cell = await screen.findByText('Arsenal vs Chelsea');
    expect(cell).toBeInTheDocument();
    // The row carries an arb badge.
    const row = cell.closest('tr')!;
    expect(within(row).getByText('arb')).toBeInTheDocument();
  });
});
