"""Quick evidence checks on football-data.co.uk CSVs (22 main leagues).

Usage: python3 -I fd_analysis.py <dir-with-csvs>
"""
import glob
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')
D = sys.argv[1]
frames = []
for f in sorted(glob.glob(os.path.join(D, '*.csv'))):
    season = os.path.basename(f).split('_')[0]
    try:
        df = pd.read_csv(f, encoding='utf-8-sig', on_bad_lines='skip', low_memory=False)
    except Exception:
        df = pd.read_csv(f, encoding='latin-1', on_bad_lines='skip', low_memory=False)
    if 'FTR' not in df.columns:
        continue
    df['season'] = season
    frames.append(df)
df = pd.concat(frames, ignore_index=True)
df = df[df['FTR'].isin(['H', 'D', 'A'])].copy()
print('matches', len(df), 'seasons', sorted(df.season.unique()))
Y = np.stack([(df.FTR == 'H').values, (df.FTR == 'D').values, (df.FTR == 'A').values], axis=1).astype(float)


def odds(prefix_cols):
    return df[prefix_cols].apply(pd.to_numeric, errors='coerce').values


def bisect(f, lo, hi, n=80):
    lo = np.full(f.shape if False else lo.shape, 0.0) + lo
    hi = np.full(lo.shape, 0.0) + hi
    for _ in range(n):
        mid = (lo + hi) / 2
        v = f(mid)
        # v is sum(p)-1, decreasing in parameter for our parametrisations
        lo = np.where(v > 0, mid, lo)
        hi = np.where(v > 0, hi, mid)
    return (lo + hi) / 2


def devig(O, method):
    pi = 1.0 / O
    S = pi.sum(axis=1, keepdims=True)
    n = O.shape[1]
    if method == 'mult':
        return pi / S
    if method == 'add':  # identical to Buchdahl's margin-proportional-to-odds
        p = pi - (S - 1) / n
        return np.clip(p, 1e-6, None) / np.clip(p, 1e-6, None).sum(axis=1, keepdims=True)
    if method == 'power':
        k = bisect(lambda k: (pi ** k[:, None]).sum(axis=1) - 1, np.ones(len(O)), np.full(len(O), 3.0))
        return pi ** k[:, None]
    if method == 'or':
        def g(c):
            c = c[:, None]
            return (pi / (c + pi - c * pi)).sum(axis=1) - 1
        c = bisect(g, np.ones(len(O)), np.full(len(O), 5.0))[:, None]
        return pi / (c + pi - c * pi)
    if method == 'shin':
        beta = S

        def p_of(z):
            z = z[:, None]
            return (np.sqrt(z ** 2 + 4 * (1 - z) * pi ** 2 / beta) - z) / (2 * (1 - z))

        z = bisect(lambda z: p_of(z).sum(axis=1) - 1, np.zeros(len(O)), np.full(len(O), 0.5))
        return p_of(z)
    raise ValueError(method)


METHODS = ['mult', 'add', 'power', 'shin', 'or']
BANDS = [1, 2, 3, 4, 6, 10, 1000]


def calib_table(cols, label, seasons=None):
    O = odds(cols)
    m = np.isfinite(O).all(axis=1) & (O > 1.0).all(axis=1)
    if seasons is not None:
        m &= df.season.isin(seasons).values
    O = O[m]
    y = Y[m]
    over = (1 / O).sum(axis=1)
    print(f'\n=== {label}: {m.sum()} matches, mean overround {over.mean():.4f} (median {np.median(over):.4f})')
    rows = []
    for meth in METHODS:
        P = devig(O, meth)
        ll = -np.mean(np.log(np.clip((P * y).sum(axis=1), 1e-12, None)))
        brier = np.mean(((P - y) ** 2).sum(axis=1))
        # return at fair odds by fair-odds band: positive => fair prob too low (fair odds too long)
        F = 1 / P
        r = {'method': meth, 'logloss': ll, 'brier': brier}
        for lo, hi in zip(BANDS[:-1], BANDS[1:]):
            sel = (F >= lo) & (F < hi)
            if sel.sum() > 0:
                ret = (y[sel] * F[sel]).mean() - 1
                r[f'[{lo},{hi})'] = ret * 100
                r[f'n[{lo},{hi})'] = int(sel.sum())
        rows.append(r)
    t = pd.DataFrame(rows).set_index('method')
    cols_ret = [c for c in t.columns if c.startswith('[')]
    print(t[['logloss', 'brier'] + cols_ret].round(4).to_string())
    print('n per band (mult):', {c: int(t.loc['mult', 'n' + c]) for c in cols_ret})
    return t


def raw_flb(cols, label, seasons=None):
    O = odds(cols)
    m = np.isfinite(O).all(axis=1) & (O > 1.0).all(axis=1)
    if seasons is not None:
        m &= df.season.isin(seasons).values
    O = O[m]
    y = Y[m]
    out = {}
    for lo, hi in zip(BANDS[:-1], BANDS[1:]):
        sel = (O >= lo) & (O < hi)
        if sel.sum():
            ret = (y[sel] * O[sel]).mean() - 1
            se = (y[sel] * O[sel]).std() / np.sqrt(sel.sum())
            out[f'[{lo},{hi})'] = f'{ret*100:+.1f}% (se {se*100:.1f}, n={sel.sum()})'
    print(f'{label}: level-stakes return on raw odds by odds band ->', out)


seasons_ps = ['1920', '2021', '2122', '2223', '2324', '2425', '2526']
print('\n##### A. De-vig calibration (return at fair odds by band; 0 = perfectly calibrated)')
calib_table(['PSCH', 'PSCD', 'PSCA'], 'Pinnacle CLOSING 2019/20-2025/26', seasons_ps)
calib_table(['PSH', 'PSD', 'PSA'], 'Pinnacle PRE-CLOSING (Fri/Tue) 2019/20-2025/26', seasons_ps)
calib_table(['BFECH', 'BFECD', 'BFECA'], 'Betfair Exchange CLOSING all seasons')
calib_table(['BFEH', 'BFED', 'BFEA'], 'Betfair Exchange PRE-CLOSING all seasons')
calib_table(['B365CH', 'B365CD', 'B365CA'], 'bet365 CLOSING all seasons')

print('\n##### B. Raw-odds favourite-longshot bias by season group')
for lab, ss in [('2019/20-2021/22', ['1920', '2021', '2122']), ('2022/23-2025/26', ['2223', '2324', '2425', '2526'])]:
    raw_flb(['PSCH', 'PSCD', 'PSCA'], f'Pinnacle closing {lab}', ss)
    raw_flb(['B365CH', 'B365CD', 'B365CA'], f'bet365 closing {lab}', ss)
    raw_flb(['BFECH', 'BFECD', 'BFECA'], f'BFE closing {lab}', ss)
    raw_flb(['AvgCH', 'AvgCD', 'AvgCA'], f'Market avg closing {lab}', ss)

print('\n##### C. Betfair Exchange overround & availability by league (liquidity proxy)')
rows = []
for div, g in df.groupby('Div'):
    r = {'Div': div, 'matches': len(g)}
    for lab, cols in [('BFE_pre', ['BFEH', 'BFED', 'BFEA']), ('BFE_close', ['BFECH', 'BFECD', 'BFECA']),
                      ('PS_pre', ['PSH', 'PSD', 'PSA']), ('PS_close', ['PSCH', 'PSCD', 'PSCA']),
                      ('B365_pre', ['B365H', 'B365D', 'B365A'])]:
        if not set(cols).issubset(g.columns):
            continue
        O = g[cols].apply(pd.to_numeric, errors='coerce').values
        ok = np.isfinite(O).all(axis=1) & (O > 1).all(axis=1)
        r[lab + '_avail%'] = 100 * ok.mean()
        if ok.sum():
            r[lab + '_overround'] = (1 / O[ok]).sum(axis=1).mean()
    # disagreement BFE vs PS fair probs (pre-closing)
    if set(['BFEH', 'PSH']).issubset(g.columns):
        A = g[['BFEH', 'BFED', 'BFEA']].apply(pd.to_numeric, errors='coerce').values
        B = g[['PSH', 'PSD', 'PSA']].apply(pd.to_numeric, errors='coerce').values
        ok = np.isfinite(A).all(1) & np.isfinite(B).all(1) & (A > 1).all(1) & (B > 1).all(1)
        if ok.sum() > 50:
            pa = devig(A[ok], 'mult')
            pb = devig(B[ok], 'mult')
            r['BFEvsPS_pre_MAD_pp'] = 100 * np.abs(pa - pb).mean()
    rows.append(r)
t = pd.DataFrame(rows).set_index('Div')
pd.set_option('display.width', 250)
print(t.round(3).to_string())

print('\n##### C2. BFE overround by season (pre / close)')
for s, g in df.groupby('season'):
    out = []
    for cols in (['BFEH', 'BFED', 'BFEA'], ['BFECH', 'BFECD', 'BFECA']):
        if set(cols).issubset(g.columns):
            O = g[cols].apply(pd.to_numeric, errors='coerce').values
            ok = np.isfinite(O).all(1) & (O > 1).all(1)
            out.append(f'{(1/O[ok]).sum(1).mean():.4f} (avail {100*ok.mean():.0f}%)' if ok.sum() else 'na')
    print(s, out)

print('\n##### D. Friday->close: value at soft-book max (B365,BW,BV,BFD pre-closing) vs Pinnacle fair')
soft_pre = {'H': ['B365H', 'BWH', 'BVH', 'BFDH'], 'D': ['B365D', 'BWD', 'BVD', 'BFDD'], 'A': ['B365A', 'BWA', 'BVA', 'BFDA']}
sub = df[df.season.isin(seasons_ps)].copy()
Ppre = sub[['PSH', 'PSD', 'PSA']].apply(pd.to_numeric, errors='coerce').values
Pcl = sub[['PSCH', 'PSCD', 'PSCA']].apply(pd.to_numeric, errors='coerce').values
ok = np.isfinite(Ppre).all(1) & np.isfinite(Pcl).all(1) & (Ppre > 1).all(1) & (Pcl > 1).all(1)
sub = sub[ok]
Ppre, Pcl = Ppre[ok], Pcl[ok]
Ysub = np.stack([(sub.FTR == k).values for k in 'HDA'], 1).astype(float)
S = np.stack([sub[[c for c in soft_pre[k] if c in sub.columns]].apply(pd.to_numeric, errors='coerce').max(axis=1).values for k in 'HDA'], 1)
for meth in ['mult', 'add', 'power']:
    fpre = 1 / devig(Ppre, meth)
    fcl = 1 / devig(Pcl, meth)
    ev = S / fpre - 1
    clv = S / fcl - 1
    print(f'-- de-vig {meth}')
    for thr in [0.02, 0.03, 0.05]:
        sel = np.isfinite(ev) & (ev > thr)
        # one pick per match: best EV outcome
        evm = np.where(sel, ev, -np.inf)
        best = evm.argmax(1)
        has = np.isfinite(evm.max(1)) & (evm.max(1) > -np.inf)
        idx = np.where(has)[0]
        o = S[idx, best[idx]]
        e = ev[idx, best[idx]]
        c = clv[idx, best[idx]]
        w = Ysub[idx, best[idx]]
        pl = w * o - 1
        res = []
        for lo, hi in zip(BANDS[:-1], BANDS[1:]):
            b = (o >= lo) & (o < hi)
            if b.sum() >= 30:
                res.append(f'[{lo},{hi}) n={b.sum()} EV={100*e[b].mean():.1f}% CLV={100*c[b].mean():.1f}% '
                           f'keep>0={100*(c[b]>0).mean():.0f}% ROI={100*pl[b].mean():+.1f}%±{100*pl[b].std()/np.sqrt(b.sum()):.1f}')
        print(f'  thr>{thr:.0%}: n={len(idx)} avgodds={o.mean():.2f} EV={100*e.mean():.2f}% CLV={100*c.mean():.2f}% '
              f'CLV>0 {100*(c>0).mean():.0f}% ROI={100*pl.mean():+.2f}% (se {100*pl.std()/np.sqrt(len(pl)):.2f})')
        for line in res:
            print('     ', line)

print('\n##### E. Soft-book price movement Friday->close (bet365 vs its own close)')
for k in 'HDA':
    a = pd.to_numeric(sub[f'B365{k}'], errors='coerce').values
    b = pd.to_numeric(sub[f'B365C{k}'], errors='coerce').values
    okk = np.isfinite(a) & np.isfinite(b)
    r = b[okk] / a[okk] - 1
    print(k, f'median |move| {100*np.median(np.abs(r)):.1f}%, share moved >5%: {100*(np.abs(r)>0.05).mean():.0f}%, share shortened: {100*(r<0).mean():.0f}%')
