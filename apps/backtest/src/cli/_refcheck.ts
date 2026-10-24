import { readFileSync } from 'node:fs';
import { overround } from '@quest/core';
import { parseFootballDataCsv } from '../football-data';
const dir = process.argv[2]!;
const leagues = ['E0','E1','E2','E3','EC','SC0','SC1','SC2','SC3','D1','D2','I1','I2','SP1','SP2','F1','F2','N1','B1','P1','T1','G1'];
const q = (xs: number[], p: number) => { const s = [...xs].sort((a,b)=>a-b); return s[Math.floor(p*(s.length-1))] ?? NaN; };
for (const season of ['2526','2627']) {
  console.log(`== ${season}: league  n  BFE-1x2 overround p10/p50/p90  | PS p50 | B365 p50 | BW p50 | BFE-ou p50 | B365-ou p50`);
  for (const L of leagues) {
    const ms = parseFootballDataCsv(readFileSync(`${dir}/${L}_${season}.csv`,'utf8'), L, season);
    const o = (b: string, mk: '1x2'|'ou25') => ms.flatMap(m => m.prematch[b]?.[mk] ? [overround(m.prematch[b]![mk]!)] : []);
    const bfe = o('BFE','1x2');
    const f = (xs: number[]) => xs.length ? (q(xs,0.5)*100).toFixed(1).padStart(5) : '  n/a';
    console.log(`${L.padEnd(4)} ${String(ms.length).padStart(4)}  ${(q(bfe,0.1)*100).toFixed(1).padStart(5)} ${(q(bfe,0.5)*100).toFixed(1).padStart(5)} ${(q(bfe,0.9)*100).toFixed(1).padStart(5)}  | ${f(o('PS','1x2'))} | ${f(o('B365','1x2'))} | ${f(o('BW','1x2'))} | ${f(o('BFE','ou25'))} | ${f(o('B365','ou25'))}`);
  }
}
