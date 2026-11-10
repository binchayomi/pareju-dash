"""Tambahkan / ganti satu bulan data Sales distributor (GT+MT) dari Excel "DATABASE SO" ke data.json.

python3 build/update_sales.py <file.xlsx> data.json data_baru.json <out_rows.csv> [--fjp FJP_Parepare.csv FJP_Mamuju.csv] [--final]

- Bulan yang ada di file menggantikan bulan yang sama di data.json (gt, mt, gtDaily, misiTx); bulan lain dipertahankan.
- Baris valid (sama dengan aturan sheet DATABASE): Status SALES/RETUR, NamaSales bukan UMUM, Bonus = 0,
  Group1Barang TRADITIONAL/MODERN. Tanggal_Efektif: SALES = TglSO, RETUR = Tgl. Omzet = DPP (retur negatif).
  Valid_Aktivitas = 1 hanya untuk SALES.
- Item dipetakan lewat (channel, Item NFI). Item baru yang belum ada di mapping NFI ditambahkan lewat NEW_ITEMS.
- Outlet = cabang|PERUSAHAAN (huruf besar), dicocokkan dulu lewat ShipTo.
- Salesman: NamaSales (AWALUDDIN = ANDIKA SAPUTRA); setelah itu jalankan remap_sales.py.
- out_rows.csv: baris dengan kolom "Database Penjualan Pareju" (kolom_sales di manifest).
- Tanpa --final: update belum closing (meta.partial = true).
"""
import sys, json, hashlib, datetime, collections
import pandas as pd

args = sys.argv[1:]
final = '--final' in args; args = [a for a in args if a != '--final']
fjp_files = []
if '--fjp' in args:
    i = args.index('--fjp'); fjp_files = args[i + 1:i + 3]; args = args[:i] + args[i + 3:]
src, dj, out, rows_csv = args

ALIAS = {'AWALUDDIN': 'ANDIKA SAPUTRA'}
# Item baru yang Item NFI-nya belum ada di mapping distributor (XLOOKUP -> ITEM NON DISTRIBUTOR/BONUS)
NEW_ITEMS = {'17/010102610C': ('GT', 'NS MILKY MANGO PLS 4PX40SX11G', 'NUTRISARI')}
BRAND = {'HI LO': 'HILO', 'HILO': 'HILO', 'NUTRISARI': 'NUTRISARI', 'TS': 'TS', 'L-MEN': 'L-MEN'}
BASE = datetime.date(2023, 1, 1)

D = json.load(open(dj, encoding='utf8'))
x = pd.read_excel(src, sheet_name=0, dtype={'ShipTo': str, 'KodeBarang': str, 'KodeNota': str})
x['NamaSales'] = x['NamaSales'].astype(str).str.strip()
x['G1'] = x['Group1Barang'].astype(str).str.strip().str.upper()
v = x[x['Status'].isin(['SALES', 'RETUR']) & (x['NamaSales'] != 'UMUM') & (x['Bonus'] == 0) & x['G1'].isin(['TRADITIONAL', 'MODERN'])].copy()
dropped = x.drop(v.index)
v['Tanggal_Efektif'] = pd.to_datetime(v['TglSO'].where(v['Status'] == 'SALES', v['Tgl']))
assert v['Tanggal_Efektif'].notna().all(), 'Tanggal_Efektif kosong'
v['ch'] = v['G1'].map({'TRADITIONAL': 'GT', 'MODERN': 'MT'})
v['Item NFI'] = v['Item NFI'].astype(str).str.strip()
for k, (ch, nm, br) in NEW_ITEMS.items():
    m = v['KodeBarang'].eq(k) & v['Item NFI'].str.startswith('ITEM NON DISTRIBUTOR'); v.loc[m, 'Item NFI'] = nm
bad = v[v['Item NFI'].str.startswith('ITEM NON DISTRIBUTOR')]
assert bad.empty, 'Item belum termapping:\n' + bad[['KodeBarang', 'NamaBarang']].drop_duplicates().to_string()

# ---------- item ----------
items = {(i[0], i[1]): n for n, i in enumerate(D['items'])}
vid = max(i[3] for i in D['items'])
added_items = []
for (ch, nm), g in v.groupby(['ch', 'Item NFI']):
    if (ch, nm) in items: continue
    br = next((b for k, (c2, n2, b) in NEW_ITEMS.items() if n2 == nm), None) or BRAND.get(str(g['Merek'].iloc[0]).strip())
    assert br, f'merek tidak dikenal untuk {nm}'
    vid += 1; D['items'].append([ch, nm, br, vid, 0, 0, 0]); items[(ch, nm)] = len(D['items']) - 1; added_items.append(nm)
v['it'] = [items[(c, n)] for c, n in zip(v['ch'], v['Item NFI'])]
v['Brand_Standar'] = [D['items'][i][2] for i in v['it']]

# ---------- FJP (kecamatan, salesman master) ----------
fjp = {}
for f in fjp_files:
    for r in pd.read_csv(f, dtype=str, keep_default_na=False).itertuples():
        fjp[r.Kunci.strip()] = r
# ---------- outlet ----------
s2o = {}; k2o = {}
for n, o in enumerate(D['outlets']):
    k2o[o[0]] = n
    for s in o[3]: s2o[s] = n
kab_of_kota = collections.defaultdict(collections.Counter)
for o in D['outlets']: pass
added_out = []
v['Perusahaan'] = v['Perusahaan'].astype(str).str.strip()
v['Outlet_Key'] = v['CABANG'].str.strip() + '|' + v['Perusahaan'].str.upper()
for r in v[['ShipTo', 'Outlet_Key', 'CABANG', 'Perusahaan', 'Kota']].drop_duplicates('ShipTo').itertuples():
    if r.ShipTo in s2o: continue
    if r.Outlet_Key in k2o:
        n = k2o[r.Outlet_Key]; D['outlets'][n][3].append(r.ShipTo)
    else:
        f = fjp.get(r.ShipTo)
        kota = (f.Kota if f is not None and f.Kota.strip() else str(r.Kota)).strip().upper()
        KAB = {'PARE-PARE': 'PAREPARE', 'PAERPARE': 'PAREPARE', 'SIDENRENG RAPPANG': 'SIDRAP', 'TANRU TEDONG SIDRAP': 'SIDRAP', 'POLMAN': 'POLEWALI MANDAR',
               'POLEWALI': 'POLEWALI MANDAR', 'P0LMAN': 'POLEWALI MANDAR', 'WONOMULYO POLMAN': 'POLEWALI MANDAR', 'MAMUJU UTARA': 'PASANGKAYU'}
        kab = KAB.get(kota, kota)
        kec = f.Kecamatan.strip() if f is not None else ''
        D['outlets'].append([r.Outlet_Key, r.CABANG.strip(), r.Perusahaan, [r.ShipTo], kab, kec]); n = len(D['outlets']) - 1
        k2o[r.Outlet_Key] = n; added_out.append((r.ShipTo, r.Perusahaan, kab))
    s2o[r.ShipTo] = n
v['ou'] = v['ShipTo'].map(s2o)
for r in D['fjp']:
    if r['o'] < 0 and r['k'] in s2o: r['o'] = s2o[r['k']]

# ---------- salesman ----------
v['Sales_Histori_Kesinambungan'] = v['NamaSales'].map(lambda s: ALIAS.get(s, s))
sidx = {s[0]: n for n, s in enumerate(D['sales'])}
miss = set(v['Sales_Histori_Kesinambungan']) - set(sidx)
assert not miss, f'salesman tidak aktif di dashboard: {miss}'
v['si'] = v['Sales_Histori_Kesinambungan'].map(sidx)

# ---------- ganti bulan ----------
v['ym'] = (v['Tanggal_Efektif'].dt.year - 2023) * 12 + v['Tanggal_Efektif'].dt.month - 1
v['dn'] = (v['Tanggal_Efektif'].dt.normalize() - pd.Timestamp(BASE)).dt.days
v['day'] = v['Tanggal_Efektif'].dt.day
v['val'] = v['DPP'].astype(float)
v['va'] = (v['Status'] == 'SALES').astype(int)
months = set(v['ym'])
ymd = lambda d: (lambda t: (t.year - 2023) * 12 + t.month - 1)(BASE + datetime.timedelta(days=d))
for t in ('gt', 'mt'): D[t] = [r for r in D[t] if r[3] not in months]
D['gtDaily'] = [r for r in D['gtDaily'] if ymd(r[2]) not in months]
D['misiTx'] = [r for r in D['misiTx'] if ymd(r[1]) not in months]
for ch, t in (('GT', 'gt'), ('MT', 'mt')):
    acc = {}
    for r in v[v['ch'] == ch].itertuples():
        k = (r.si, r.ou, r.it, r.ym); a = acc.setdefault(k, [0.0, 0.0, 0])
        a[0] += r.val
        if r.Status == 'RETUR': a[1] += r.val
        if r.va: a[2] |= 1 << (r.day - 1)
    D[t] += [[*k, round(a[0], 6), round(a[1], 6), a[2]] for k, a in acc.items()]
BR = {b: i for i, b in enumerate(D['brands'])}; CB = {c: i for i, c in enumerate(D['cabs'])}
gd = collections.defaultdict(float)
for r in v[v['ch'] == 'GT'].itertuples(): gd[(r.si, BR[r.Brand_Standar], r.dn, CB[D['outlets'][r.ou][1]])] += r.val
D['gtDaily'] += [[s, b, d, round(val, 2), c] for (s, b, d, c), val in gd.items()]
# Misi Pasaraya: per baris transaksi, barcode dari histori item / master 135 SKU
bc = {}
for r in D['misiTx']: bc.setdefault(r[2], r[3])
mname = {(m['Channel'], m['Nama Item']): m['Barcode'] for m in D['misi']}
for r in v[v['ShipTo'].isin(D['misiShip'])].itertuples():
    it = D['items'][r.it]
    D['misiTx'].append([r.ShipTo, int(r.dn), int(r.it), bc.get(r.it, mname.get((it[0], it[1]), '')), int(r.va), round(r.val, 2)])

# ---------- rekon & meta ----------
last = max(months)
rk = []
for cab in D['cabs']:
    c = v[(v['CABANG'].str.strip() == cab) & (v['ym'] == last)]; g = c[c['ch'] == 'GT']
    rk.append({'cab': cab, 'gross': round(g.loc[g.Status == 'SALES', 'val'].sum(), 2), 'retur': round(g.loc[g.Status == 'RETUR', 'val'].sum(), 2),
               'net': round(g['val'].sum(), 2), 'ea': int(g.loc[g.va == 1, 'ou'].nunique()), 'net_mt': round(c.loc[c.ch == 'MT', 'val'].sum(), 2),
               'rows': int(len(c)), 'sales_rows': int((c.Status == 'SALES').sum()), 'retur_rows': int((c.Status == 'RETUR').sum())})
D['rekon'] = rk
M = D['meta']
M['closingYm'] = int(last); M['closing'] = v['Tanggal_Efektif'].max().strftime('%Y-%m-%d'); M['partial'] = not final
M['generated'] = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M')
M['gtRows'] = M.get('gtRows', 0); M['sumber'] = [s for s in M['sumber'] if not s.endswith('.xlsx')] + [src.split('/')[-1].split('-', 1)[-1] if '/' in src else src]
json.dump(D, open(out, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))

# ---------- baris database ----------
def rid(r):
    return hashlib.sha1('|'.join(map(str, [r.KodeNota, r.ShipTo, r.KodeBarang, r.Status, r.Jml, r.DPP, r.NoUrut, r.Tgl])).encode()).hexdigest()[:24]
f2 = lambda s: fjp.get(s)
out_rows = pd.DataFrame({
    'Record_ID': [rid(r) for r in v.itertuples()],
    'Tanggal_Efektif': v['Tanggal_Efektif'].dt.strftime('%Y-%m-%d'),
    'TglSO': pd.to_datetime(v['TglSO']).dt.strftime('%Y-%m-%d').fillna(''),
    'Tgl': pd.to_datetime(v['Tgl']).dt.strftime('%Y-%m-%d'),
    'Status': v['Status'], 'Cabang_Standar': v['CABANG'].str.strip(), 'Channel_Standar': v['G1'], 'Outlet_Key': v['Outlet_Key'],
    'Perusahaan_Analisis': v['Perusahaan'], 'ShipTo': v['ShipTo'], 'Kota': v['Kota'], 'Kabupaten_FJP': v['Kota'],
    'Kecamatan_FJP': [f2(s).Kecamatan if f2(s) is not None else '' for s in v['ShipTo']],
    'NamaSales': v['NamaSales'], 'Sales_Histori_Kesinambungan': v['Sales_Histori_Kesinambungan'],
    'Sales_Master_FJP': [f2(s).NamaSR if f2(s) is not None else '' for s in v['ShipTo']],
    'Brand_Standar': v['Brand_Standar'], 'Item NFI': v['Item NFI'], 'KodeBarang': v['KodeBarang'], 'KodeNota': v['KodeNota'],
    'Jml': v['Jml'].astype(int).astype(str), 'DPP_Net_Analisis': v['val'].round(6).astype(str), 'Valid_Omzet': '1', 'Valid_Aktivitas': v['va'].astype(str)})
assert out_rows['Record_ID'].is_unique, 'Record_ID duplikat'
out_rows.to_csv(rows_csv, index=False)

print('baris file:', len(x), '| valid:', len(v), '| dikecualikan:', len(dropped), dict(collections.Counter(
    'UMUM' if r.NamaSales == 'UMUM' else 'BONUS/PBD' if r.Status == 'BONUS/PBD' else 'Bonus=1' if r.Bonus == 1 else 'channel ' + r.G1 for r in dropped.itertuples())))
print('bulan:', sorted(months), '| tanggal', v['Tanggal_Efektif'].min().date(), '-', v['Tanggal_Efektif'].max().date())
print('item baru:', added_items); print('outlet baru:', added_out)
for r in rk: print(r)
