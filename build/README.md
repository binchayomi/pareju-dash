# Dashboard Pareju — bahan pembuat

Dashboard BCP Parepare & BCP Mamuju (GT, MT, MDS). `index.html` di root repo adalah file yang tayang di GitHub Pages: satu file mandiri berisi data + kode.

## Isi folder `build/`
| File | Fungsi |
|---|---|
| `template.html` | Kerangka halaman + CSS (gaya Modern Clean versi ringkas). Berisi penanda `/*__PJ_DATA__*/` dan `/*__PJ_APP__*/`. |
| `app.js` | Seluruh mesin hitung, tampilan, dan mesin PDF (tanpa library luar). |
| `assemble.py` | Merakit `index.html` dari `data.json` + `template.html` + `app.js`. |
| `extract.py` | Mengambil `data.json` dari `index.html` yang sedang tayang. |
| `remap_sales.py` | Atribusi salesman (lihat aturan di bawah). Dijalankan ke data mentah sebelum dirakit. |

```
python3 build/extract.py index.html data.json          # data yang tayang sekarang
python3 build/assemble.py data.json index.html         # rakit ulang
```
`extract` lalu `assemble` tanpa perubahan menghasilkan file yang identik byte per byte.

## Alur update bulanan
1. Pengguna mengirim file penjualan (Sales/MDS) bulan baru lewat chat atau folder yang terhubung.
2. Cocokkan total per cabang (omzet gross, retur, net, EA) dengan angka kontrol di file sumber; laporkan selisih sebelum lanjut.
3. Gabungkan ke "Database Penjualan Pareju" (artifact Claude, CSV transaksi + manifest.json), tanpa duplikasi.
4. Bentuk ulang `data.json` (skema di bawah), jalankan `remap_sales.py`, lalu `assemble.py`.
5. Uji semua halaman dan semua tombol PDF di browser, lalu commit `index.html` + perubahan `build/`.

## Aturan data yang sudah diputuskan pengguna
- **Salesman (9 Nov 2026):** hanya 7 salesman aktif closing Okt 2026 — Parepare: Ahmad Zulhijjah, Andika Saputra, Chandra Ruspian, Nengsi Warsi, Retno Saputra; Mamuju: Muh Ansar, Rezki Akbar.
  **Semua** transaksi (termasuk antar salesman aktif) diatribusikan ke pemilik outlet saat ini menurut master FJP. AWALUDDIN di FJP = ANDIKA SAPUTRA. Outlet di luar FJP → salesman aktif dengan omzet terbesar di outlet itu 12 bulan terakhir, lalu sepanjang histori, lalu terbesar di kabupaten/cabang. `gtDaily` dibagi proporsional per salesman asal × bulan × merek.
- Filter cabang memakai cabang outlet. GT/MT mengikuti channel item. Omzet distributor = DPP net; MDS = Value valid. KPI aktivitas memakai Valid_Aktivitas = 1.
- EC/day YTD = ΣEC ÷ Σhari; Line/EA YTD = rata-rata rasio bulanan. HiLo target varian: Parepare ≥5, Mamuju ≥3. Nutrisari target ≥10 varian.
- NS Tea = 6 SKU (dikonfirmasi 9 Nov 2026): NS LEMON / PEACH / LYCHEE / ORANGE / BLACKCURRANT / APPLE TEA PLS 4PX40SX11G (flag `tea` di `items`). Refill 400G dan Mix 4 Rasa tidak termasuk.
- Retail Modern = 35 outlet; item fokus MT 20 & GT 11; stockist 13 nama: 14 nama dashboard lama dikurangi TK.MULYA/PASAR LAKESSI (bukan stockist lagi, 9 Nov 2026).

## PDF (9 Nov 2026)
Semua tombol PDF mengikuti filter cabang & salesman di atas halaman (tidak ada filter tambahan di panel).
- Tabel daftar toko (A4 landscape, dikelompokkan per salesman): DPI — belum transaksi kuartal (Semua/NS/HiLo); Outlet — growth AVG positif/negatif, growth negatif NS/HiLo (Top 100 total cabang / Top 20 salesman), F3=0; Area — ringkasan area, growth negatif, F3=0, belum transaksi kuartal.
- Form per toko berwarna (A4 portrait): Nutrisari 5–9 varian (semua SKU NS GT aktif 12 bulan + SKU yang pernah dibeli toko), Retail Modern (fokus MT + fokus GT + histori toko), Misi Pasaraya (135 SKU master + barcode).
  Merah = belum pernah order; Kuning = pernah order, belum order kuartal berjalan; Putih = sudah order kuartal berjalan. Kolom Stok/Order kosong, catatan, tanggal kunjungan, paraf outlet.
- Tidak dibuat (permintaan pengguna): Executive PDF, PDF data penduduk, PDF ringkasan stockist.

## Skema `data.json`
Indeks bulan `ym` = (tahun − 2023) × 12 + (bulan − 1); hari = jumlah hari sejak 2023-01-01.
| Kunci | Isi |
|---|---|
| `meta` | closing, closingYm, generated, salesRule, jumlah baris |
| `cabs`, `brands` | daftar cabang dan merek |
| `sales` | `[nama, cabang]` — indeks dipakai di baris transaksi |
| `items` | `[channel GT/MT, nama item, merek, id varian, NS Tea, HiLo School, flag]` |
| `outlets` | `[Outlet_Key, cabang, nama, [ShipTo...], kabupaten, kecamatan]` |
| `gt`, `mt` | `[sales, outlet, item, ym, net, retur, mask hari aktivitas valid (bit = tanggal)]` |
| `gtDaily` | `[sales, merek, hari, net, cabang]` — untuk grafik omzet mingguan |
| `rekon` | angka kontrol closing per cabang |
| `fjp` | master FJP: `{k ShipTo, cab, n, sr salesman, f, vd hari kunjungan, o outlet, noo}` |
| `retail`, `focusMT`, `focusGT`, `stockist` | master Retail Modern, item fokus, stockist |
| `misi`, `misiShip`, `misiTx` | master 135 SKU Misi, ShipTo Misi, transaksi Misi per barcode |
| `mds`, `mdsDim` | transaksi MDS dan dimensinya |

Catatan: skrip pembentuk `data.json` dari file sumber dibuat di sesi lama dan belum ada di repo. Saat closing November, skrip itu dibuat ulang mengikuti skema di atas lalu ditambahkan ke `build/`.
