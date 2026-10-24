import math

import numpy as np
from math import comb

class binom:
    @staticmethod
    def pmf(k, n, p):
        return np.array([comb(n, int(i)) * p ** int(i) * (1 - p) ** (n - int(i)) for i in k])

print('### Bets needed to detect an edge from P/L (level stakes)')
print('odds  edge  sd/bet  n(z=1.96, 2-sided 5%)  n(80% power, 1-sided 5%)')
for o in [2, 3, 4, 5, 6, 8]:
    for e in [0.02, 0.03, 0.05]:
        p = (1 + e) / o
        sd = o * math.sqrt(p * (1 - p))
        n1 = (1.96 * sd / e) ** 2
        n2 = ((1.645 + 0.842) * sd / e) ** 2
        print(f'{o:4} {e:5.0%} {sd:6.2f} {n1:10,.0f} {n2:10,.0f}')

print('\n### Weekly slate: N picks at odds N (equal-return => any winner returns the week stake F)')
print('Growth-optimal weekly stake F* (fraction of bankroll) and growth at F, 2F*, 3F*')
for N in [3, 4, 5, 6, 8]:
    for e in [0.0, 0.02, 0.03, 0.05]:
        p = (1 + e) / N
        k = np.arange(N + 1)
        pk = binom.pmf(k, N, p)
        Fs = np.linspace(0.0005, 0.5, 5000)
        g = np.array([np.sum(pk * np.log(np.maximum(1 + (k - 1) * F, 1e-300))) for F in Fs])
        i = g.argmax()
        Fst = Fs[i] if g[i] > 0 else 0.0
        p0 = pk[0]
        if Fst > 0:
            g2 = np.sum(pk * np.log(1 + (k - 1) * 2 * Fst))
            print(f'N={N} odds={N} edge={e:.0%}: P(no winner)={p0:.1%}  F*={Fst:.2%}/week  growth/week={g[i]*100:.3f}%  at 2F*: {g2*100:.3f}%')
        else:
            print(f'N={N} odds={N} edge={e:.0%}: P(no winner)={p0:.1%}  F*=0 (no edge)')

print('\n### Monte Carlo: 38 weeks x 3 seasons, N=5 at odds 5, flat weekly stake as % of starting bank')
rng = np.random.default_rng(1)
for e in [0.0, 0.02, 0.04]:
    for f in [0.05, 0.10, 0.20]:
        sims = 20000
        weeks = 114
        p = (1 + e) / 5
        K = rng.binomial(5, p, size=(sims, weeks))
        pl = (K - 1) * f  # in units of starting bankroll
        path = 1 + np.cumsum(pl, axis=1)
        ruin = (path <= 0).any(axis=1).mean()
        half = (path <= 0.5).any(axis=1).mean()
        dd = (np.maximum.accumulate(np.concatenate([np.ones((sims, 1)), path], 1), axis=1)[:, 1:] - path).max(axis=1)
        season1_loss = (path[:, 37] < 1).mean()
        print(f'edge {e:.0%} weekly stake {f:.0%}: P(bank<=0 within 3 seasons)={ruin:.1%}  P(touch 50%)={half:.1%}  '
              f'P(down after season 1)={season1_loss:.1%}  median max drawdown={np.median(dd):.0%} of start  median final={np.median(path[:,-1]):.2f}')
