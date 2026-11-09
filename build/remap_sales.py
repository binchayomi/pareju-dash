"""Aturan 9 Nov 2026: hanya 7 salesman aktif (closing Okt 2026).
SEMUA transaksi (termasuk antar salesman aktif) diatribusikan ke pemilik outlet saat ini:
master FJP (AWALUDDIN = ANDIKA SAPUTRA); outlet di luar FJP -> salesman aktif dengan omzet terbesar
di outlet itu 12 bulan terakhir, lalu sepanjang histori, lalu terbesar di kabupaten/cabang.
gtDaily (tanpa outlet) dibagi proporsional per salesman asal x bulan x merek."""
import json, sys
from collections import Counter, defaultdict
src, dst = sys.argv[1], sys.argv[2]
D = json.load(open(src))
ACTIVE = ['AHMAD ZULHIJJAH', 'ANDIKA SAPUTRA', 'CHANDRA RUSPIAN', 'NENGSI WARSI', 'RETNO SAPUTRA', 'MUH ANSAR', 'REZKI AKBAR']
ALIAS = {'AWALUDDIN': 'ANDIKA SAPUTRA'}
old = [s[0] for s in D['sales']]; cabOf = {s[0]: s[1] for s in D['sales']}
for r in D['fjp']: r['sr'] = ALIAS.get(r['sr'], r['sr'])
for r in D['retail']: r['sales'] = ALIAS.get(r['sales'], r['sales'])
OUTCAB = [o[1] for o in D['outlets']]; OUTKAB = [o[4] for o in D['outlets']]
fown = {}
for r in D['fjp']:
    if r['o'] >= 0 and r['sr'] in ACTIVE and r['o'] not in fown: fown[r['o']] = r['sr']
# omzet salesman aktif per outlet & per kabupaten (cadangan)
actO12 = defaultdict(Counter); actO = defaultdict(Counter); actK = defaultdict(Counter); actC = defaultdict(Counter)
for t in ('gt', 'mt'):
    for r in D[t]:
        n = old[r[0]]
        if n in ACTIVE:
            v = abs(r[4]); actO[r[1]][n] += v
            if r[3] >= D['meta']['closingYm'] - 11: actO12[r[1]][n] += v
            actK[(OUTCAB[r[1]], OUTKAB[r[1]])][n] += v; actC[OUTCAB[r[1]]][n] += v
def owner(o):
    if o in fown: return fown[o], 'fjp'
    if actO12[o]: return actO12[o].most_common(1)[0][0], 'outlet12'
    if actO[o]: return actO[o].most_common(1)[0][0], 'outlet'
    k = (OUTCAB[o], OUTKAB[o])
    if actK[k]: return actK[k].most_common(1)[0][0], 'kab'
    return actC[OUTCAB[o]].most_common(1)[0][0], 'cab'
idx = {n: i for i, n in enumerate(ACTIVE)}
how = Counter(); flow = defaultdict(Counter); split = defaultdict(Counter)
BR = {b: i for i, b in enumerate(D['brands'])}
for t in ('gt', 'mt'):
    for r in D[t]:
        n = old[r[0]]; new, why = owner(r[1]); how[why] += abs(r[4])
        if new != n: flow[n][new] += abs(r[4])
        if t == 'gt': split[(r[0], r[3], BR.get(D['items'][r[2]][2], -1), OUTCAB[r[1]])][new] += abs(r[4])
        r[0] = idx[new]
import datetime
base = datetime.date(2023, 1, 1); nd = []
for r in D['gtDaily']:
    dt = base + datetime.timedelta(days=r[2]); ym = (dt.year - 2023) * 12 + dt.month - 1
    c = split.get((r[0], ym, r[1], D['cabs'][r[4]]))
    if not c:
        n = old[r[0]]; tgt = n if n in ACTIVE else actC[D['cabs'][r[4]]].most_common(1)[0][0]; nd.append([idx[tgt]] + r[1:]); continue
    tot = sum(c.values())
    for new, v in c.items(): nd.append([idx[new], r[1], r[2], round(r[3] * v / tot, 2), r[4]])
D['gtDaily'] = nd
D['sales'] = [[n, cabOf[n]] for n in ACTIVE]
D['meta']['salesRule'] = 'Salesman aktif closing Okt 2026; semua transaksi diatribusikan ke pemilik outlet saat ini (FJP, 9 Nov 2026)'
json.dump(D, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print('basis pemindahan (Rp jt):', {k: round(v / 1e6) for k, v in how.items()})
for n, c in sorted(flow.items(), key=lambda x: -sum(x[1].values())):
    print(f'{n:26s} ->', ', '.join(f'{k} {round(v/1e6)}' for k, v in c.most_common()))
