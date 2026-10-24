import glob, os, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')
sys.argv = sys.argv
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
df = df[df.FTR.isin(list('HDA')) & df.season.isin(['1920','2021','2122','2223','2324','2425','2526'])]
num = lambda c: df[c].apply(pd.to_numeric, errors='coerce').values
Pp = num(['PSH','PSD','PSA']); Pc = num(['PSCH','PSCD','PSCA'])
ok = np.isfinite(Pp).all(1) & np.isfinite(Pc).all(1) & (Pp>1).all(1) & (Pc>1).all(1)
df = df[ok]; Pp = Pp[ok]; Pc = Pc[ok]
S = np.stack([df[[f'{b}{k}' for b in ['B365','BW','BV','BFD'] if f'{b}{k}' in df]].apply(pd.to_numeric, errors='coerce').max(1).values for k in 'HDA'], 1)
def add(O):
    pi = 1/O; p = pi - (pi.sum(1, keepdims=True)-1)/3; return p/p.sum(1, keepdims=True)
fp = 1/add(Pp); fc = 1/add(Pc)
ev = S/fp - 1; clv = np.log(S/fc)
evm = np.where(np.isfinite(ev) & (ev > 0.02), ev, -np.inf)
b = evm.argmax(1); has = evm.max(1) > -np.inf
i = np.where(has)[0]
c = clv[i, b[i]]; o = S[i, b[i]]
print('n', len(c), 'mean log-CLV %.4f sd %.4f' % (c.mean(), c.std()))
z = 1.96
print('bets for CLV mean to be 2 SE from 0: %.0f' % ((z*c.std()/c.mean())**2))
for lo, hi in [(1,4),(4,10)]:
    m = (o>=lo)&(o<hi)
    print(f'odds [{lo},{hi}) n={m.sum()} mean {c[m].mean():.4f} sd {c[m].std():.4f} -> n_needed {(z*c[m].std()/max(c[m].mean(),1e-9))**2:.0f}')
# weekly fill: one pick per match, add>2%, how many picks/week & coverage
df2 = df.iloc[i].copy(); df2['o'] = o; df2['Date'] = pd.to_datetime(df2['Date'], dayfirst=True, errors='coerce')
wk = df2.groupby(df2['Date'].dt.to_period('W'))
cov = wk['o'].apply(lambda x: (1/x).sum())
print('weeks with >=1 flagged pick:', len(cov), ' median picks/week', wk.size().median(), ' median sum(1/o) of ALL flagged picks/week %.2f' % cov.median())
