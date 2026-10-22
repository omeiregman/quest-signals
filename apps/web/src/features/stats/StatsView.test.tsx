import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from '@/lib/types';
import { StatsView } from './StatsView';

vi.mock('@/lib/api', () => ({
  api: {
    stats: vi.fn(),
  },
}));

import { api } from '@/lib/api';

const fixture: Stats = {
  totalOpportunities: 42,
  avgMargin: 0.035,
  avgSurvivalSeconds: 125,
  bySport: [
    { sportKey: 'soccer_epl', count: 30, avgMargin: 0.04, avgSurvivalSeconds: 140 },
    { sportKey: 'tennis_atp', count: 12, avgMargin: 0.02, avgSurvivalSeconds: 90 },
  ],
  clv: { trackedLegs: 0, avgClv: null },
};

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StatsView />
    </QueryClientProvider>,
  );
}

describe('StatsView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the total opportunities and a sport label', async () => {
    vi.mocked(api.stats).mockResolvedValue(fixture);
    renderView();

    expect(await screen.findByText('42')).toBeInTheDocument();
    // Sport label appears in both bar charts; getAllByText handles the duplicate.
    expect((await screen.findAllByText('soccer_epl')).length).toBeGreaterThan(0);
  });

  it('renders an empty state when there are no opportunities', async () => {
    vi.mocked(api.stats).mockResolvedValue({
      totalOpportunities: 0,
      avgMargin: null,
      avgSurvivalSeconds: 0,
      bySport: [],
      clv: { trackedLegs: 0, avgClv: null },
    });
    renderView();

    expect(await screen.findByText(/No opportunities detected yet/i)).toBeInTheDocument();
  });

  it('shows the average CLV when tracked legs exist', async () => {
    vi.mocked(api.stats).mockResolvedValue({
      ...fixture,
      clv: { trackedLegs: 4, avgClv: 0.021 },
    });
    renderView();

    expect(await screen.findByText('Avg CLV')).toBeInTheDocument();
    expect(screen.getByText('+2.1%')).toBeInTheDocument();
    expect(screen.getByText(/4 tracked bets/i)).toBeInTheDocument();
  });
});
