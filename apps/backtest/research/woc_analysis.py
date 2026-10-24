import sys
import math
import pandas as pd

path = sys.argv[1]
df = pd.read_excel(path, sheet_name=0)
df = df[['Div', 'Date', 'Selection', 'Odds', 'Value', 'Result', 'Profit', 'Bookmaker']].dropna(subset=['Odds', 'Profit'])
df = df[df['Result'].isin(['Won', 'Lost'])]
df['Date'] = pd.to_datetime(df['Date'])
df['season'] = df['Date'].apply(lambda d: f"{d.year}/{d.year+1}" if d.month >= 7 else f"{d.year-1}/{d.year}")
df['side'] = df['Selection'].str.split().str[-1]
df['won'] = (df['Result'] == 'Won').astype(int)


def summ(g):
    n = len(g)
    y = g['Profit'].sum() / n
    ev = g['Value'].mean()
    sd = g['Profit'].std(ddof=1)
    z = y / (sd / math.sqrt(n)) if n > 1 and sd > 0 else float('nan')
    # z vs expected
    zexp = (y - ev) / (sd / math.sqrt(n)) if n > 1 and sd > 0 else float('nan')
    return pd.Series({'bets': n, 'avg_odds': g['Odds'].mean(), 'win%': g['won'].mean() * 100,
                      'yield%': y * 100, 'exp%': ev * 100, 'z_vs0': z, 'z_vs_exp': zexp})


pd.set_option('display.width', 200)
pd.set_option('display.float_format', lambda x: f"{x:,.2f}")
print('ALL')
print(summ(df))
print('\nDate range', df['Date'].min(), df['Date'].max())
print('\nBY SEASON')
print(df.groupby('season').apply(summ))
bands = [1, 2, 3, 4, 6, 10, 100]
df['oband'] = pd.cut(df['Odds'], bands, right=False)
print('\nBY ODDS BAND')
print(df.groupby('oband', observed=True).apply(summ))
vb = [0.02, 0.03, 0.05, 0.08, 0.12, 10]
df['vband'] = pd.cut(df['Value'], vb, right=False)
print('\nBY VALUE BAND')
print(df.groupby('vband', observed=True).apply(summ))
print('\nBY SIDE')
print(df.groupby('side').apply(summ))
print('\nBY DIV')
print(df.groupby('Div').apply(summ).sort_values('bets', ascending=False))
print('\nTOP BOOKMAKERS')
print(df.groupby('Bookmaker').apply(summ).sort_values('bets', ascending=False).head(15))
# odds 4-10 and value bands
sub = df[(df['Odds'] >= 4) & (df['Odds'] < 10)]
print('\nODDS 4-10 BY VALUE BAND')
print(sub.groupby('vband', observed=True).apply(summ))
# bets per week
df['week'] = df['Date'].dt.isocalendar().week.astype(str) + '-' + df['Date'].dt.isocalendar().year.astype(str)
print('\nbets per active week: mean', df.groupby('week').size().mean(), 'median', df.groupby('week').size().median())
# max drawdown on level stakes
cum = df.sort_values('Date')['Profit'].cumsum()
dd = (cum - cum.cummax()).min()
print('max drawdown (units, level 1u stakes):', dd, 'final profit', cum.iloc[-1])
