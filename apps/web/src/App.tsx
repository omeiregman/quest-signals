import { useState } from 'react';
import { AppShell, type ViewId } from './components/AppShell';
import { OpportunitiesView } from './features/opportunities/OpportunitiesView';
import { SettlementView } from './features/settlement/SettlementView';
import { StatsView } from './features/stats/StatsView';

export function App() {
  const [view, setView] = useState<ViewId>('opportunities');
  return (
    <AppShell view={view} onView={setView}>
      {view === 'opportunities' && <OpportunitiesView />}
      {view === 'settlement' && <SettlementView />}
      {view === 'stats' && <StatsView />}
    </AppShell>
  );
}
