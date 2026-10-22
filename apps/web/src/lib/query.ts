import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 20_000, // live-ish; the poller writes on its own cadence
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      retry: 1,
    },
  },
});

export const qk = {
  opportunities: (params: unknown) => ['opportunities', params] as const,
  opportunity: (id: number) => ['opportunity', id] as const,
  stats: () => ['stats'] as const,
  meta: () => ['meta'] as const,
  sports: () => ['sports'] as const,
};
