import glob
import os
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
warnings.filterwarnings('ignore')
D = sys.argv[1]
frames = []
for f in sorted(glob.glob(os.path.join(D, '*.csv'))):
    season = os.path.basename(f).split('_')[0]
    try:
        d = pd.read_csv(f, encoding='utf-8-sig', on_bad_lines='skip', low_memory=False)
    except Exception:
        d = pd.read_csv(f, encoding='latin-1', on_bad_lines='skip', low_memory=False)
    if 'FTR' not in d.columns:
        continue
    d['season'] = season
    frames.append(d)
df = pd.concat(frames, ignore_index=True)
df = df[df['FTR'].isin(['H', 'D', 'A'])]
df = df[df.season.isin(['2425', '2526'])].copy()
TOP = {'E0', 'D1', 'I1', 'SP1', 'F1'}
cols = {'PS_pre': ['PSH', 'PSD', 'PSA'], 'PS_close': ['PSCH', 'PSCD', 'PSCA'],
        'BFE_pre': ['BFEH', 'BFED', 'BFEA'], 'BFE_close': ['BFECH', 'BFECD', 'BFECA'],
        'B365_pre': ['B365H', 'B365D', 'B365A'], 'Avg_pre': ['AvgH', 'AvgD', 'AvgA']}
M = {k: df[v].apply(pd.to_numeric, errors='coerce').values for k, v in cols.items()}
ok = np.ones(len(df), bool)
for v in M.values():
    ok &= np.isfinite(v).all(1) & (v > 1).all(1)
Y = np.stack([(df.FTR == k).values for k in 'HDA'], 1).astype(float)
print('common matches 2024/25-2025/26 with all six price sets:', ok.sum())


def ll(O, y):
    P = (1 / O) / (1 / O).sum(1, keepdims=True)
    return -np.mean(np.log((P * y).sum(1)))


for tier, mask in [('all', ok), ('top-5 leagues', ok & df.Div.isin(TOP).values),
                   ('other 17 divisions', ok & ~df.Div.isin(TOP).values),
                   ('EC,E3,SC1-3,G1,T1', ok & df.Div.isin(['EC', 'E3', 'SC1', 'SC2', 'SC3', 'G1', 'T1']).values)]:
    print(f'\n{tier}: n={mask.sum()}  (multiplicative-normalised log-loss; lower = more accurate)')
    for k, v in M.items():
        print(f'   {k:10s} {ll(v[mask], Y[mask]):.5f}   mean overround {(1/v[mask]).sum(1).mean():.4f}')

# BFE pre-closing reliability by its own overround
O = M['BFE_pre']
okb = np.isfinite(O).all(1) & (O > 1).all(1) & np.isfinite(M['PS_close']).all(1) & (M['PS_close'] > 1).all(1)
over = (1 / O).sum(1)
print('\nBFE pre-closing: share of matches by overround bucket and MAD vs Pinnacle-close fair (pp)')
Pc = (1 / M['PS_close']) / (1 / M['PS_close']).sum(1, keepdims=True)
for lo, hi in [(0, 1.02), (1.02, 1.05), (1.05, 1.10), (1.10, 9)]:
    s = okb & (over >= lo) & (over < hi)
    Pb = (1 / O[s]) / (1 / O[s]).sum(1, keepdims=True)
    print(f'  overround [{lo},{hi}): {100*s.sum()/okb.sum():.0f}% of matches, MAD vs PS close {100*np.abs(Pb-Pc[s]).mean():.2f}pp')
