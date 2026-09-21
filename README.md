# Unit Hemodialisis — RS Sedayu General Hospital

Situs statis untuk GitHub Pages. Satu halaman dengan lima tab: Beranda, Jadwal, Alur & persiapan, Edukasi, dan Ruang staf (terkunci PIN). Unit memiliki 4 bed dengan jadwal berbasis reservasi; jadwal dan rekap tindakan dapat disinkronkan dari Google Sheets.

## Isi repositori

```
index.html
manifest.json
sw.js
assets/
  css/style.css
  js/app.js        <- semua konfigurasi ada di sini
  img/logo.png
apps-script/
  Kode.gs          <- API jadwal reservasi (ditempel ke Apps Script)
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
| `API_URL` | URL aplikasi web Apps Script untuk jadwal reservasi (disarankan). Bila diisi, `SHEET_ID` diabaikan. |
| `SHEET_ID` | Alternatif lama: ID Google Sheet yang dipublikasikan. Selama kosong, papan jadwal menampilkan pesan agar pasien menghubungi petugas unit. |
| `NAMA_TAB_JADWAL` | Nama tab jadwal, bawaan `Jadwal`. |
| `NAMA_TAB_REKAP` | Nama tab rekap bulanan, bawaan `Rekap`. |
| `PIN_STAF` | PIN pembuka Ruang staf. |
| `BED` | Daftar bed, bawaan `Bed 1` sampai `Bed 4`. |
| `HARI_DITAMPILKAN` | Jumlah tanggal ke depan yang bisa dipilih di tab Jadwal. |
| `INTERKOM_CODE_BLUE` | Nomor interkom code blue, hanya tampil di Ruang staf. |
| `SPO` | Daftar SPO unit beserta tautan dokumennya. |
| `CEKLIS` | Butir ceklis harian troli emergensi dan mesin. |

Untuk melihat tampilan dengan data contoh, buka situs dengan akhiran `?contoh=1`. Pengunjung biasa tidak pernah melihat data contoh.

## Jadwal reservasi lewat Apps Script (disarankan)

Dengan cara ini staf menambah dan menghapus reservasi langsung dari Ruang staf, tanpa membuka Sheet. Pengunjung umum hanya menerima jam dan bed yang terisi; inisial, akses, dan keterangan hanya dikirim bila PIN cocok, dan PIN diperiksa di server untuk setiap penyimpanan.

1. Buat Google Sheet baru (tidak perlu dipublikasikan), lalu **Ekstensi → Apps Script**.
2. Hapus isi `Kode.gs`, tempel isi `apps-script/Kode.gs` dari repositori ini, lalu simpan.
3. Pilih fungsi `setup` di toolbar, klik **Jalankan**, dan izinkan akses. Tab `Jadwal` dibuat otomatis dan PIN server diatur ke `1209`.
4. **Terapkan → Deployment baru → Aplikasi web**. Jalankan sebagai: *Saya*. Yang memiliki akses: *Siapa saja*.
5. Salin URL yang berakhiran `/exec`, tempel ke `API_URL`.

PIN server ada di **Setelan project → Properti skrip → PIN_STAF** dan harus sama dengan `PIN_STAF` di `app.js`. Server menolak reservasi yang bentrok jam pada bed yang sama. Situs menyegarkan jadwal otomatis setiap 2 menit.

Bila mengubah `Kode.gs`, terapkan ulang lewat **Terapkan → Kelola deployment → Edit → Versi baru** agar URL tetap sama.

## Alternatif: membaca Google Sheet yang dipublikasikan

Sheet dibaca lewat Google Visualization API dengan JSONP, jadi tidak terbentur masalah CORS di GitHub Pages dan tidak memerlukan API key.

1. Buat Google Sheet, lalu **File → Share → Publish to web**.
2. Salin ID dari URL: `docs.google.com/spreadsheets/d/`**`ID_INI`**`/edit`, tempel ke `SHEET_ID`.

Tab **Jadwal**, satu baris untuk satu reservasi, baris pertama adalah judul kolom:

| Tanggal | Mulai | Selesai | Bed | Inisial | Akses | Keterangan |
|---|---|---|---|---|---|---|
| 21/09/2026 | 07:00 | 11:30 | Bed 1 | S.M | Fistula | |
| 21/09/2026 | 12:30 | 17:00 | Bed 1 | A.R | Kateter | pasien rujukan |

- `Tanggal` boleh berformat tanggal Sheets, `21/09/2026`, atau `2026-09-21`.
- `Mulai` dan `Selesai` boleh berformat jam Sheets, `07:00`, atau `07.00`.
- `Bed` ditulis `Bed 1` sampai `Bed 4`, atau cukup angkanya.

Tab **Rekap**, untuk grafik jumlah tindakan:

| Bulan | Jumlah |
|---|---|
| Agustus | 112 |
| September | 61 |

## Catatan privasi

Situs GitHub Pages bersifat publik dan Google Sheet yang dipublikasikan dapat diakses siapa pun yang tahu tautannya.

- Gunakan **inisial saja**, jangan nama lengkap, nomor rekam medis, alamat, nomor telepon, diagnosis, atau hasil laboratorium.
- PIN Ruang staf hanya menyembunyikan tampilan di sisi peramban, bukan pengamanan data. Siapa pun yang membuka kode sumber dapat melihatnya.
- Kolom identitas pasien yang sebenarnya tetap disimpan di SIMRS atau rekam medis elektronik, bukan di sini.

Tanpa nama pasien, halaman ini tetap berfungsi: pengunjung melihat slot bed yang terisi per tanggal, staf melihat inisial setelah membuka PIN.

## Ceklis harian

Ceklis disimpan di `localStorage` peramban masing-masing perangkat, terpisah per tanggal, dan tidak terkirim ke mana pun. Tombol **Salin rekap ceklis** menyalin hasilnya sebagai teks untuk ditempel ke buku ceklis unit atau grup pesan.

## Mode luring

`sw.js` menyimpan halaman, gaya, dan skrip agar tetap terbuka saat jaringan mati. Data dari Google Sheets sengaja tidak di-cache agar jadwal yang tampil selalu yang terbaru. Setiap kali mengubah isi situs, naikkan versi cache pada baris `const CACHE = 'hd-rssgh-v7'` menjadi `v8`, `v9`, dan seterusnya agar perubahan langsung terlihat di perangkat pengguna.
