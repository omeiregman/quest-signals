import glob, os, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')
D = sys.argv[1]
fr = []
for f in sorted(glob.glob(os.path.join(D, '*.csv'))):
    s = os.path.basename(f).split('_')[0]
    try:
        d = pd.read_csv(f, encoding='utf-8-sig', on_bad_lines='skip', low_memory=False)
    except Exception:
        d = pd.read_csv(f, encoding='latin-1', on_bad_lines='skip', low_memory=False)
    if 'FTR' in d.columns:
        d['season'] = s; fr.append(d)
df = pd.concat(fr, ignore_index=True)
df = df[df.FTR.isin(list('HDA'))]
g = pd.to_numeric(df.FTHG, errors='coerce') + pd.to_numeric(df.FTAG, errors='coerce')
over = (g > 2.5).astype(float).values
for lab, oc, uc in [('Pinnacle close', 'PC>2.5', 'PC<2.5'), ('BFE close', 'BFEC>2.5', 'BFEC<2.5'), ('bet365 close', 'B365C>2.5', 'B365C<2.5'), ('Avg close', 'AvgC>2.5', 'AvgC<2.5')]:
    if oc not in df: continue
    O = pd.to_numeric(df[oc], errors='coerce').values; U = pd.to_numeric(df[uc], errors='coerce').values
    ok = np.isfinite(O) & np.isfinite(U) & (O > 1) & (U > 1)
    o, u, y = O[ok], U[ok], over[ok]
    print(f'{lab}: n={ok.sum()} overround {(1/o+1/u).mean():.4f}  ROI over {100*(y*o).mean()-100:+.2f}%  ROI under {100*((1-y)*u).mean()-100:+.2f}%')
    odds = np.concatenate([o, u]); win = np.concatenate([y, 1 - y])
    out = []
    for lo, hi in [(1, 1.6), (1.6, 2.0), (2.0, 2.5), (2.5, 3.5), (3.5, 20)]:
        m = (odds >= lo) & (odds < hi)
        if m.sum() > 100:
            r = win[m] * odds[m]
            out.append(f'[{lo},{hi}) {100*r.mean()-100:+.1f}%±{100*r.std()/np.sqrt(m.sum()):.1f} n={m.sum()}')
    print('    by odds band:', '; '.join(out))
