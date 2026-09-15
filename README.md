# Unit Hemodialisa — RS Sedayu General Hospital

Situs statis untuk GitHub Pages. Satu halaman dengan lima tab: Beranda, Jadwal, Alur & persiapan, Edukasi, dan Ruang staf (terkunci PIN). Jadwal dan rekap tindakan dapat disinkronkan dari Google Sheets.

## Isi repositori

```
index.html
manifest.json
sw.js
assets/
  css/style.css
  js/app.js        <- semua konfigurasi ada di sini
  img/logo.png
```

## Menayangkan di GitHub Pages

1. Buat repositori baru, misalnya `hd-rssgh`, lalu unggah seluruh isi folder ini ke branch `main`.
2. Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Folder: `/ (root)`, lalu Save.
3. Situs terbit di `https://<akun>.github.io/hd-rssgh/` dalam 1–2 menit.
4. Untuk domain sendiri, tambahkan file `CNAME` berisi nama domain dan arahkan DNS ke GitHub Pages.

## Konfigurasi

Semua yang perlu diubah ada di blok `KONFIG` pada `assets/js/app.js`:

| Kunci | Keterangan |
|---|---|
| `SHEET_ID` | ID Google Sheet. Kosongkan untuk memakai data contoh. |
| `NAMA_TAB_JADWAL` | Nama tab jadwal, bawaan `Jadwal`. |
| `NAMA_TAB_REKAP` | Nama tab rekap bulanan, bawaan `Rekap`. |
| `PIN_STAF` | PIN pembuka Ruang staf. |
| `MESIN`, `MESIN_ISOLASI` | Daftar mesin dan mesin khusus pasien HBsAg reaktif. |
| `SHIFT` | Nama, jam, dan rentang waktu tiap shift. |
| `SPO` | Daftar SPO unit beserta tautan dokumennya. |
| `CEKLIS` | Butir ceklis harian troli emergensi dan mesin. |

## Menyambungkan Google Sheets

Sheet dibaca lewat Google Visualization API dengan JSONP, jadi tidak terbentur masalah CORS di GitHub Pages dan tidak memerlukan API key.

1. Buat Google Sheet, lalu **File → Share → Publish to web**.
2. Salin ID dari URL: `docs.google.com/spreadsheets/d/`**`ID_INI`**`/edit`, tempel ke `SHEET_ID`.

Tab **Jadwal**, satu baris untuk satu pasien per hari per shift, baris pertama adalah judul kolom:

| Hari | Shift | Mesin | Inisial | Akses | Keterangan |
|---|---|---|---|---|---|
| Senin | Shift 1 | HD-1 | S.M | Fistula | |
| Senin | Shift 1 | HD-2 | A.R | Kateter | pasien rujukan |

Tab **Rekap**, untuk grafik jumlah tindakan:

| Bulan | Jumlah |
|---|---|
| Agustus | 352 |
| September | 164 |

Nilai `Shift` dan `Mesin` harus persis sama dengan yang ada di `KONFIG`.

## Catatan privasi

Situs GitHub Pages bersifat publik dan Google Sheet yang dipublikasikan dapat diakses siapa pun yang tahu tautannya.

- Gunakan **inisial saja**, jangan nama lengkap, nomor rekam medis, alamat, nomor telepon, diagnosis, atau hasil laboratorium.
- PIN Ruang staf hanya menyembunyikan tampilan di sisi peramban, bukan pengamanan data. Siapa pun yang membuka kode sumber dapat melihatnya.
- Kolom identitas pasien yang sebenarnya tetap disimpan di SIMRS atau rekam medis elektronik, bukan di sini.

Tanpa nama pasien, halaman ini tetap berfungsi: pengunjung melihat pemakaian mesin per shift, staf melihat inisial setelah membuka PIN.

## Ceklis harian

Ceklis disimpan di `localStorage` peramban masing-masing perangkat, terpisah per tanggal, dan tidak terkirim ke mana pun. Tombol **Salin rekap ceklis** menyalin hasilnya sebagai teks untuk ditempel ke buku ceklis unit atau grup pesan.

## Mode luring

`sw.js` menyimpan halaman, gaya, dan skrip agar tetap terbuka saat jaringan mati. Data dari Google Sheets sengaja tidak di-cache agar jadwal yang tampil selalu yang terbaru. Setiap kali mengubah isi situs, naikkan versi cache pada baris `const CACHE = 'hd-rssgh-v1'` menjadi `v2`, `v3`, dan seterusnya agar perubahan langsung terlihat di perangkat pengguna.
