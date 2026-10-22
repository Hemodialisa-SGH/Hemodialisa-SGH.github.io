/**
 * Jadwal Unit Hemodialisis RS Sedayu General Hospital
 * Dipasang di Google Sheet jadwal HD (Ekstensi → Apps Script).
 *
 * Tab yang dipakai skrip ini:
 *   Database  — satu baris per reservasi. Sumber data untuk situs.
 *   Tampilan  — dibuat otomatis dari Database, formatnya seperti tab bulanan yang biasa dipakai.
 *
 * Reservasi yang disimpan lewat situs ditulis ke DUA tempat: tab Database, dan
 * tab bulanan berjalan (OKT 26, SEPT 26, dan seterusnya) pada baris tanggal dan
 * shift yang sesuai. Susunan tab bulanan tidak diubah — hanya sel Status, RS,
 * Alamat, Pasien, dan Ket yang diisi, dan sel yang sudah memuat nama pasien lain
 * tidak pernah ditimpa. Letak kolom dicari dari baris judul, jadi tab boleh
 * berbeda susunan asal masih memakai nama kolom yang sama.
 * Jalankan ujiPetaTab() untuk melihat kolom apa yang terbaca di tab bulan.
 *
 * Urutan pemasangan:
 *   1. siapkan()        → membuat tab Database, Tampilan, dan Saran, serta PIN awal.
 *   2. imporTabBulan()  → memindahkan isi tab bulan berjalan ke Database (sekali saja).
 *      Tombol Run tidak bisa mengirim argumen, jadi tanpa argumen skrip memakai
 *      tab yang namanya diawali nama bulan ini; kalau tidak ada, tab yang sedang dibuka.
 *      Jalankan daftarTab() dulu bila ingin melihat ejaan nama tab yang ada.
 *   3. bangunTampilan() → menyusun tab Tampilan dari Database.
 *   4. Terapkan → Deployment baru → Aplikasi web.
 *      Jalankan sebagai: Saya. Yang memiliki akses: Siapa saja.
 *      Salin URL yang berakhiran /exec untuk dipasang di situs.
 *
 * PIN staf ada di Setelan project → Properti skrip → PIN_STAF, dan harus sama
 * dengan PIN_STAF di assets/js/app.js. Gunakan minimal 6 karakter.
 */

const TAB_DB = 'Database';
const TAB_SARAN = 'Saran';
const KOLOM_SARAN = ['Waktu', 'Nama', 'Kategori', 'Nilai', 'Pesan', 'Izin tampil', 'Ditampilkan'];
const TAB_TAMPIL = 'Tampilan';
const KOLOM = ['Tanggal', 'Mulai', 'Selesai', 'Bed', 'Status', 'RS perujuk', 'Alamat', 'Pasien', 'Keterangan', 'ID', 'Dicatat', 'Petugas'];
const BED = ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4', 'Xtra'];
const TUNGGU = 'Tunggu';            // pasien yang menunggu bed kosong
const JUDUL_TUNGGU = 'WAITING LIST';
const SESI = { P: ['06:00', '11:00'], S: ['13:30', '19:00'] };   // shift di tab bulanan
const NAMA_SESI = { P: 'Pagi', S: 'Siang' };
const TZ = 'Asia/Jakarta';
const HARI_KE_DEPAN = 60;
const MAKS_SALAH = 5;          // percobaan PIN sebelum diblokir
const BLOKIR_MENIT = 15;

/* ==================== pemasangan ==================== */

function siapkan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB_DB);
  if (!sh) {
    sh = ss.insertSheet(TAB_DB, ss.getNumSheets());   // selalu di urutan paling akhir
    sh.getRange(1, 1, 1, KOLOM.length).setValues([KOLOM]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:C').setNumberFormat('@');
    sh.setColumnWidths(1, KOLOM.length, 110);
  }
  if (!ss.getSheetByName(TAB_TAMPIL)) ss.insertSheet(TAB_TAMPIL, ss.getNumSheets());
  let sr = ss.getSheetByName(TAB_SARAN);
  if (!sr) {
    sr = ss.insertSheet(TAB_SARAN, ss.getNumSheets());
    sr.getRange(1, 1, 1, KOLOM_SARAN.length).setValues([KOLOM_SARAN]).setFontWeight('bold');
    sr.setFrozenRows(1);
    sr.setColumnWidth(5, 420);
  }
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIN_STAF')) props.setProperty('PIN_STAF', '1209');
  SpreadsheetApp.getActive().toast('Tab Database dan Tampilan siap. Lanjutkan dengan imporTabBulan.');
}

/**
 * Memindahkan isi tab bulanan berformat lebar (Hari | Tanggal | Shift | Jam | blok per BED)
 * ke tab Database. Aman dijalankan berulang: baris yang sudah ada tidak diduplikasi.
 */
function imporTabBulan(namaTab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(TAB_DB)) siapkan();          // boleh dijalankan langsung
  if (!namaTab) namaTab = tebakTabBulan_(ss);         // tombol Run tidak mengirim argumen
  const asal = ss.getSheetByName(namaTab);
  if (!asal) {
    throw new Error('Tab "' + namaTab + '" tidak ditemukan. Tab yang ada: '
      + ss.getSheets().map(s => s.getName()).join(', '));
  }
  const peta = petaTabBulan_(asal);
  const info = bulanDariNamaTab_(namaTab);
  const nilai = asal.getRange(1, 1, Math.max(asal.getLastRow(), 3), peta.lebar).getValues();
  if (nilai.length < 3) throw new Error('Tab ' + namaTab + ' kosong.');

  const adaDb = {};
  bacaDb().forEach(r => { adaDb[[r.tanggal, r.mulai, r.bed, r.nama.toLowerCase()].join('|')] = true; });
  const baris = [];
  let tanggal = '';

  for (let r = 2; r < nilai.length; r++) {
    const b = nilai[r];
    const tglBaru = isoBaris_(b[peta.tanggal], info);
    if (tglBaru) tanggal = tglBaru;
    if (!tanggal) continue;

    const rentang = rentangBaris_(b, peta);
    if (!rentang[0]) continue;

    peta.bed.forEach(function (k) {
      const isi = String(b[k.pasien] || '').trim();
      if (!isi) return;
      // satu sel daftar tunggu bisa memuat beberapa nama, dipisah titik koma
      const daftar = k.bed === TUNGGU ? isi.split(/[;\n]+/) : [isi];
      daftar.forEach(function (teks) {
        const nama = teks.trim();
        if (!nama) return;
        const kunci = [tanggal, rentang[0], k.bed, nama.toLowerCase()].join('|');
        if (adaDb[kunci]) return;
        adaDb[kunci] = true;
        const ambil = c => (c >= 0 ? String(b[c] || '').trim() : '');
        baris.push([tanggal, rentang[0], rentang[1], k.bed, ambil(k.status), ambil(k.rs), ambil(k.alamat),
          nama, ambil(k.ket), Utilities.getUuid().slice(0, 8),
          Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), 'impor ' + namaTab]);
      });
    });
  }

  if (baris.length) {
    const db = ss.getSheetByName(TAB_DB);
    db.getRange(db.getLastRow() + 1, 1, baris.length, KOLOM.length).setValues(baris);
  }
  SpreadsheetApp.getActive().toast(baris.length + ' reservasi dipindahkan dari tab ' + namaTab + '.');
  return baris.length;
}

/* ============ membaca dan menulis langsung di tab bulanan ============ */

/**
 * Membaca dua baris judul tab bulanan dan mengembalikan letak setiap kolom:
 *   { tanggal, shift, jam, lebar, bed: [{bed, awal, akhir, status, rs, alamat, pasien, ket}] }
 * Semua dicari lewat nama kolom, bukan posisi tetap, supaya tab boleh digeser.
 */
function petaTabBulan_(sh) {
  const lebar = Math.max(sh.getLastColumn(), 1);
  const kepala = sh.getRange(1, 1, 2, lebar).getValues();
  const rapi = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const judul = kepala[0].map(rapi);
  const sub = kepala[1].map(rapi);

  const bed = [];
  judul.forEach((v, i) => {
    const m = v.match(/^bed\s*(\d+)/);
    if (m) bed.push({ bed: 'Bed ' + m[1], awal: i });
    else if (v.indexOf('xtra') === 0 || v.indexOf('ekstra') === 0) bed.push({ bed: 'Xtra', awal: i });
    else if (v.indexOf('waiting') >= 0 || v.indexOf('tunggu') >= 0) bed.push({ bed: TUNGGU, awal: i });
  });
  if (!bed.length) {
    throw new Error('Baris judul tab "' + sh.getName() + '" tidak memuat kolom BED 1 dan seterusnya.');
  }

  bed.forEach((k, i) => {
    k.akhir = i + 1 < bed.length ? bed[i + 1].awal : lebar;
    const cari = kata => {
      for (let c = k.awal; c < k.akhir; c++) if (sub[c].indexOf(kata) === 0) return c;
      return -1;
    };
    k.status = cari('status'); k.rs = cari('rs'); k.alamat = cari('alamat');
    k.pasien = cari('pasien'); k.ket = cari('ket');
  });
  const tanpaPasien = bed.filter(k => k.pasien < 0).map(k => k.bed);
  if (tanpaPasien.length) {
    throw new Error('Kolom "Pasien" tidak ditemukan untuk ' + tanpaPasien.join(', ')
      + ' di tab "' + sh.getName() + '".');
  }

  const cariKiri = daftar => {
    for (let c = 0; c < bed[0].awal; c++) {
      for (let i = 0; i < daftar.length; i++) {
        if (sub[c].indexOf(daftar[i]) === 0 || judul[c].indexOf(daftar[i]) === 0) return c;
      }
    }
    return -1;
  };
  const peta = {
    lebar: lebar, bed: bed,
    tanggal: cariKiri(['tgl', 'tanggal']),
    shift: cariKiri(['shift']),
    jam: cariKiri(['jam']),
  };
  if (peta.tanggal < 0) {
    throw new Error('Kolom TGL tidak ditemukan di tab "' + sh.getName() + '".');
  }
  return peta;
}

/**
 * Jam satu baris tab bulanan: ['06:00','11:00'] atau ['13:30','19:00'].
 * Baris harus punya nilai SHIFT atau JAM sendiri, supaya baris kosong dan
 * baris spanduk seperti "MINGGU, 18 OKTOBER 2026 — LIBUR" tidak ikut terbaca.
 */
function rentangBaris_(b, peta) {
  const shift = peta.shift >= 0 ? String(b[peta.shift] || '').trim().toUpperCase().charAt(0) : '';
  const jam = peta.jam >= 0 ? String(b[peta.jam] || '').trim() : '';
  if (!shift && !jam) return ['', ''];
  const rentang = rentangJam(jam);
  if (rentang[0]) return rentang;
  return SESI[shift] || ['', ''];
}

/** "OKT 26", "Oktober 2026", "SEPT 26" → { bulan: 0-11, tahun: 2026 }. */
function bulanDariNamaTab_(nama) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const n = String(nama || '').trim().toLowerCase();
  let indeks = -1;
  bulan.forEach((b, i) => { if (indeks < 0 && n.indexOf(b.slice(0, 3).toLowerCase()) === 0) indeks = i; });
  if (indeks < 0) return null;
  const th = n.match(/(\d{4}|\d{2})\s*$/);
  let tahun = new Date().getFullYear();
  if (th) tahun = th[1].length === 4 ? Number(th[1]) : 2000 + Number(th[1]);
  return { bulan: indeks, tahun: tahun };
}

/** Isi kolom TGL bisa berupa tanggal penuh atau sekadar angka hari (13, 14, …). */
function isoBaris_(nilai, info) {
  const penuh = teksTanggal(nilai);
  if (penuh) return penuh;
  const angka = Number(String(nilai == null ? '' : nilai).trim());
  if (!info || !angka || angka < 1 || angka > 31) return '';
  return info.tahun + '-' + dua(info.bulan + 1) + '-' + dua(angka);
}

/** Tab bulanan yang memuat tanggal tertentu, misal 2026-10-15 → tab "OKT 26". */
function cariTabBulan_(ss, iso) {
  const p = String(iso).split('-');
  const bulan = Number(p[1]) - 1, tahun = Number(p[0]);
  const cocok = ss.getSheets().filter(sh => {
    const info = bulanDariNamaTab_(sh.getName());
    return info && info.bulan === bulan && info.tahun === tahun;
  });
  return cocok[0] || null;
}

/** '06:00' → 'P', '13:30' → 'S'. Jam lain mengembalikan ''. */
function shiftDariJam_(mulai) {
  let hasil = '';
  Object.keys(SESI).forEach(s => { if (SESI[s][0] === mulai) hasil = s; });
  return hasil;
}

/** Nomor baris di tab bulanan untuk satu tanggal dan shift, atau 0 bila tidak ada. */
function cariBarisShift_(sh, peta, info, iso, shift) {
  const akhir = sh.getLastRow();
  if (akhir < 3) return 0;
  const nilai = sh.getRange(1, 1, akhir, peta.lebar).getValues();
  let tanggal = '';
  for (let r = 2; r < nilai.length; r++) {
    const b = nilai[r];
    const baru = isoBaris_(b[peta.tanggal], info);
    if (baru) tanggal = baru;
    if (tanggal !== iso) continue;
    if (rentangBaris_(b, peta)[0] === SESI[shift][0]) return r + 1;
  }
  return 0;
}

/**
 * Menambahkan blok kolom WAITING LIST di ujung kanan tab bulanan bila belum ada.
 * Kolom bed yang sudah ada tidak digeser maupun diubah isinya.
 */
function buatBlokTunggu_(sh) {
  const kolom = sh.getLastColumn() + 1;
  sh.getRange(1, kolom, 1, 2).merge().setValue(JUDUL_TUNGGU)
    .setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, kolom, 1, 2).setValues([['Pasien', 'Ket']])
    .setFontWeight('bold').setHorizontalAlignment('center');
  sh.setColumnWidth(kolom, 220);
  return petaTabBulan_(sh);
}

/**
 * Menulis ulang sel daftar tunggu untuk satu tanggal dan shift, diambil dari
 * tab Database. Semua nama yang menunggu digabung dalam satu sel, dipisah
 * titik koma, supaya satu baris shift bisa memuat lebih dari satu pasien.
 */
function tulisTungguKeTabBulan_(sh, peta, baris, iso, shift) {
  const k = peta.bed.filter(x => x.bed === TUNGGU)[0];
  if (!k) return 'Tersimpan di Database, tetapi kolom ' + JUDUL_TUNGGU + ' tidak ditemukan.';
  const daftar = bacaDb()
    .filter(r => r.bed === TUNGGU && r.tanggal === iso && r.mulai === SESI[shift][0])
    .map(r => r.nama)
    .filter(n => n);
  selTulis_(sh, baris, k.pasien + 1).setValue(daftar.join('; '));
  if (k.ket >= 0) selTulis_(sh, baris, k.ket + 1).setValue(daftar.length ? 'menunggu bed kosong' : '');
  return '';
}

/** Sel yang benar untuk ditulis bila baris itu bagian dari sel gabung. */
function selTulis_(sh, baris, kolom) {
  const sel = sh.getRange(baris, kolom);
  const gabung = sel.getMergedRanges();
  return gabung.length ? gabung[0].getCell(1, 1) : sel;
}

/**
 * Menyalin satu reservasi ke tab bulanan, di baris tanggal dan shift yang sesuai.
 * Mengembalikan '' bila berhasil, atau kalimat penjelas bila tidak bisa ditulis.
 * Sel yang sudah berisi nama pasien lain tidak pernah ditimpa.
 */
function tulisKeTabBulan_(d) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = cariTabBulan_(ss, d.tanggal);
    if (!sh) return 'Tersimpan di Database. Tab bulan untuk ' + d.tanggal + ' belum ada, jadi belum tertulis di sana.';
    const shift = shiftDariJam_(d.mulai);
    if (!shift) return 'Tersimpan di Database. Jamnya di luar shift Pagi dan Siang, jadi tidak ditulis ke tab ' + sh.getName() + '.';
    let peta = petaTabBulan_(sh);
    const info = bulanDariNamaTab_(sh.getName());
    const baris = cariBarisShift_(sh, peta, info, d.tanggal, shift);
    if (!baris) return 'Tersimpan di Database. Baris tanggal ' + d.tanggal + ' shift ' + NAMA_SESI[shift]
      + ' tidak ada di tab ' + sh.getName() + ', jadi belum tertulis di sana.';

    if (d.bed === TUNGGU) {
      if (!peta.bed.filter(x => x.bed === TUNGGU).length) peta = buatBlokTunggu_(sh);
      return tulisTungguKeTabBulan_(sh, peta, baris, d.tanggal, shift);
    }

    const k = peta.bed.filter(x => x.bed === d.bed)[0];
    if (!k) return 'Tersimpan di Database. Kolom ' + d.bed + ' tidak ada di tab ' + sh.getName() + '.';

    const selPasien = selTulis_(sh, baris, k.pasien + 1);
    const isi = String(selPasien.getValue() || '').trim();
    if (isi && isi.toLowerCase() !== String(d.nama).trim().toLowerCase()) {
      return 'Tersimpan di Database. Di tab ' + sh.getName() + ' ' + d.bed + ' pada jam itu sudah tertulis nama lain, jadi tidak ditimpa.';
    }
    selPasien.setValue(d.nama);
    if (k.status >= 0) selTulis_(sh, baris, k.status + 1).setValue(d.status || '');
    if (k.rs >= 0) selTulis_(sh, baris, k.rs + 1).setValue(d.rs || '');
    if (k.alamat >= 0) selTulis_(sh, baris, k.alamat + 1).setValue(d.alamat || '');
    if (k.ket >= 0 && d.ket) selTulis_(sh, baris, k.ket + 1).setValue(d.ket);
    return '';
  } catch (err) {
    return 'Tersimpan di Database, tetapi gagal menulis ke tab bulan: ' + (err.message || err);
  }
}

/** Mengosongkan kembali sel di tab bulanan saat reservasi dihapus lewat situs. */
function hapusDariTabBulan_(d) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = cariTabBulan_(ss, d.tanggal);
    if (!sh) return '';
    const shift = shiftDariJam_(d.mulai);
    if (!shift) return '';
    const peta = petaTabBulan_(sh);
    const baris = cariBarisShift_(sh, peta, bulanDariNamaTab_(sh.getName()), d.tanggal, shift);
    if (!baris) return '';
    if (d.bed === TUNGGU) {
      if (!peta.bed.filter(x => x.bed === TUNGGU).length) return '';
      return tulisTungguKeTabBulan_(sh, peta, baris, d.tanggal, shift);
    }
    const k = peta.bed.filter(x => x.bed === d.bed)[0];
    if (!k) return '';
    const selPasien = selTulis_(sh, baris, k.pasien + 1);
    if (String(selPasien.getValue() || '').trim().toLowerCase() !== String(d.nama).trim().toLowerCase()) {
      return 'Dihapus dari Database. Di tab ' + sh.getName() + ' isinya berbeda, jadi dibiarkan apa adanya.';
    }
    [k.pasien, k.status, k.rs, k.alamat, k.ket].forEach(c => {
      if (c >= 0) selTulis_(sh, baris, c + 1).clearContent();
    });
    return '';
  } catch (err) {
    return 'Dihapus dari Database, tetapi gagal membersihkan tab bulan: ' + (err.message || err);
  }
}

/**
 * Diagnostik. Menampilkan di Log kolom apa saja yang terbaca dan sepuluh baris
 * pertama yang dikenali. Nama pasien tidak ikut dicetak, hanya terisi atau kosong,
 * supaya hasilnya aman dibagikan saat meminta bantuan.
 */
function ujiPetaTab(namaTab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!namaTab) namaTab = tebakTabBulan_(ss);
  const sh = ss.getSheetByName(namaTab);
  if (!sh) throw new Error('Tab "' + namaTab + '" tidak ada.');
  const peta = petaTabBulan_(sh);
  const info = bulanDariNamaTab_(namaTab);
  const huruf = i => (i < 0 ? '-' : String.fromCharCode(65 + (i % 26)));
  const keluar = ['Tab: ' + namaTab + ' (bulan ' + (info ? info.bulan + 1 : '?') + '/' + (info ? info.tahun : '?') + ')',
    'Kolom TGL: ' + huruf(peta.tanggal) + ', SHIFT: ' + huruf(peta.shift) + ', JAM: ' + huruf(peta.jam)];
  peta.bed.forEach(k => {
    keluar.push(k.bed + ' → Status ' + huruf(k.status) + ', RS ' + huruf(k.rs) + ', Alamat ' + huruf(k.alamat)
      + ', Pasien ' + huruf(k.pasien) + ', Ket ' + huruf(k.ket));
  });

  const nilai = sh.getRange(1, 1, Math.max(sh.getLastRow(), 3), peta.lebar).getValues();
  let tanggal = '', dicetak = 0;
  for (let r = 2; r < nilai.length && dicetak < 10; r++) {
    const b = nilai[r];
    const baru = isoBaris_(b[peta.tanggal], info);
    if (baru) tanggal = baru;
    if (!tanggal) continue;
    const rentang = rentangBaris_(b, peta);
    if (!rentang[0]) continue;
    const terisi = peta.bed.map(k => k.bed + '=' + (String(b[k.pasien] || '').trim() ? 'terisi' : 'kosong'));
    keluar.push('baris ' + (r + 1) + ': ' + tanggal + ' ' + rentang[0] + '–' + rentang[1] + ' | ' + terisi.join(' '));
    dicetak++;
  }
  Logger.log(keluar.join('\n'));
  return keluar.join('\n');
}

/**
 * Menentukan tab mana yang diimpor bila imporTabBulan dijalankan lewat tombol Run
 * (tombol itu tidak bisa mengirim argumen). Urutan tebakan:
 *   1. tab yang namanya diawali nama bulan berjalan, disingkat maupun lengkap:
 *      "OKT 26", "Okt", "Oktober", "Oktober 2026" sama-sama dikenali.
 *      Bila ada beberapa, dipilih yang memuat angka tahun ini;
 *   2. tab yang sedang dibuka, asalkan bukan tab buatan skrip ini.
 */
function tebakTabBulan_(ss) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date();
  const awalan = bulan[d.getMonth()].slice(0, 3).toLowerCase();   // jan, feb, … okt, des
  const th4 = String(d.getFullYear()), th2 = th4.slice(-2);
  const nama = ss.getSheets().map(s => s.getName());
  const cocok = nama.filter(n => n.trim().toLowerCase().indexOf(awalan) === 0);
  if (cocok.length) {
    const berTahun = cocok.filter(n => n.indexOf(th4) >= 0 || n.indexOf(th2) >= 0);
    return berTahun[0] || cocok[0];
  }
  const aktif = ss.getActiveSheet().getName();
  if ([TAB_DB, TAB_TAMPIL, TAB_SARAN].indexOf(aktif) < 0) return aktif;
  throw new Error('Tab bulan tidak dikenali. Buka dulu tab bulan yang mau diimpor, '
    + 'lalu jalankan imporTabBulan lagi. Tab yang ada: ' + nama.join(', '));
}

/** Menampilkan nama semua tab di Log — untuk memastikan ejaan nama tab. */
function daftarTab() {
  const nama = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
  Logger.log(nama.join('\n'));
  return nama;
}

/** Menyusun ulang tab Tampilan dari Database, satu bulan penuh. */
function bangunTampilan(bulanIso) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TAB_TAMPIL) || ss.insertSheet(TAB_TAMPIL);
  const acuan = bulanIso ? new Date(bulanIso + '-01T00:00:00') : new Date();
  const awalan = Utilities.formatDate(acuan, TZ, 'yyyy-MM');
  const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bedTampil = BED.slice(0, 4);
  const data = bacaDb().filter(r => r.tanggal.indexOf(awalan) === 0);

  const judul1 = ['Hari', 'Tanggal', 'Jam'];
  const judul2 = ['', '', ''];
  bedTampil.forEach(b => {
    judul1.push(b.toUpperCase(), '', '', '');
    judul2.push('Status', 'RS perujuk', 'Pasien', 'Keterangan');
  });
  judul1.push('Jumlah'); judul2.push('');

  const isi = [judul1, judul2];
  const akhirBulan = new Date(acuan.getFullYear(), acuan.getMonth() + 1, 0).getDate();
  let total = 0;

  for (let d = 1; d <= akhirBulan; d++) {
    const tgl = new Date(acuan.getFullYear(), acuan.getMonth(), d);
    const iso = Utilities.formatDate(tgl, TZ, 'yyyy-MM-dd');
    const hariIni = data.filter(r => r.tanggal === iso);
    let jamDipakai = hariIni.map(r => r.mulai + ' - ' + r.selesai)
      .filter((v, i, a) => a.indexOf(v) === i).sort();
    if (!jamDipakai.length) jamDipakai = [''];
    jamDipakai.forEach((jam, i) => {
      const isiJam = hariIni.filter(r => r.mulai + ' - ' + r.selesai === jam);
      const baris = [i === 0 ? hariNama[tgl.getDay()] : '',
        i === 0 ? Utilities.formatDate(tgl, TZ, 'd MMMM yyyy') : '', jam];
      bedTampil.forEach(b => {
        const r = isiJam.filter(x => x.bed === b)[0];
        baris.push(r ? r.status : '', r ? r.rs : '', r ? r.nama : '', r ? r.ket : '');
      });
      baris.push(isiJam.length || '');
      total += isiJam.length;
      isi.push(baris);
    });
  }
  isi.push([]);
  isi.push(['', '', 'TOTAL TINDAKAN', total]);

  let lebar = 0;
  isi.forEach(b => { lebar = Math.max(lebar, b.length); });
  const rata = isi.map(b => b.concat(Array(lebar - b.length).fill('')));

  sh.clear();
  sh.getRange(1, 1, rata.length, lebar).setValues(rata);
  sh.getRange(1, 1, 2, lebar).setFontWeight('bold').setHorizontalAlignment('center');
  bedTampil.forEach((b, i) => sh.getRange(1, 4 + i * 4, 1, 4).merge());
  sh.setFrozenRows(2);
  SpreadsheetApp.getActive().toast('Tampilan bulan ' + awalan + ' disusun ulang. Total ' + total + ' tindakan.');
  return total;
}

/* ==================== API untuk situs ==================== */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.aksi === 'testimoni') return json({ ok: true, testimoni: ambilTestimoni() });
    const staf = cekPin(p.pin).ok;
    const hariIni = hariIniIso();
    const semua = bacaDb();
    const jadwal = semua
      .filter(r => r.tanggal >= geser(hariIni, -1) && r.tanggal <= geser(hariIni, HARI_KE_DEPAN))
      .map(r => staf
        ? { tanggal: r.tanggal, mulai: r.mulai, selesai: r.selesai, bed: r.bed, inisial: inisial(r.nama),
            nama: r.nama, status: r.status, rs: r.rs, alamat: r.alamat, ket: r.ket, id: r.id }
        : { tanggal: r.tanggal, mulai: r.mulai, selesai: r.selesai, bed: r.bed });
    return json({ ok: true, staf: staf, jadwal: jadwal, rekap: rekapBulanan(semua, hariIni) });
  } catch (err) {
    return json({ ok: false, pesan: String(err.message || err) });
  }
}

function doPost(e) {
  const kunci = LockService.getScriptLock();
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    // Saran dikirim oleh pasien, bukan staf, jadi tidak memerlukan PIN.
    if (body.aksi === 'saran') {
      kunci.waitLock(15000);
      return json(simpanSaran(body.data || {}));
    }
    const pin = cekPin(body.pin);
    if (!pin.ok) return json({ ok: false, pesan: pin.pesan });
    kunci.waitLock(15000);
    if (body.aksi === 'tambah') return json(simpan(body.data || {}, ''));
    if (body.aksi === 'ubah') return json(simpan(body.data || {}, String(body.id || '')));
    if (body.aksi === 'hapus') return json(hapus(String(body.id || '')));
    return json({ ok: false, pesan: 'Aksi tidak dikenal.' });
  } catch (err) {
    return json({ ok: false, pesan: String(err.message || err) });
  } finally {
    try { kunci.releaseLock(); } catch (x) {}
  }
}

function simpan(d, idLama) {
  const tanggal = teksTanggal(d.tanggal);
  const mulai = teksJam(d.mulai);
  const selesai = teksJam(d.selesai);
  const bed = normBed(d.bed);
  const nama = String(d.nama || '').trim().slice(0, 60);

  if (!tanggal) return { ok: false, pesan: 'Tanggal belum diisi.' };
  if (!mulai || !selesai) return { ok: false, pesan: 'Jam mulai dan selesai belum diisi.' };
  if (menit(selesai) <= menit(mulai)) return { ok: false, pesan: 'Jam selesai harus setelah jam mulai.' };
  if (BED.indexOf(bed) < 0 && bed !== TUNGGU) return { ok: false, pesan: 'Bed tidak dikenal.' };
  if (!nama) return { ok: false, pesan: 'Nama pasien belum diisi.' };

  // Hanya dua shift yang punya barisnya sendiri di tab bulanan, supaya setiap
  // reservasi dari situs selalu menemukan tempat di tab itu.
  const shift = shiftDariJam_(mulai);
  if (!shift) {
    return { ok: false, pesan: 'Jam mulai harus 06:00 untuk shift Pagi atau 13:30 untuk shift Siang.' };
  }

  // Daftar tunggu boleh diisi beberapa pasien sekaligus, jadi tidak dicek bentrok.
  if (bed !== TUNGGU) {
    const bentrok = bacaDb().filter(r => r.id !== idLama && r.tanggal === tanggal && r.bed === bed
      && menit(mulai) < menit(r.selesai) && menit(r.mulai) < menit(selesai))[0];
    if (bentrok) return { ok: false, pesan: bed + ' sudah terisi ' + bentrok.mulai + '–' + bentrok.selesai + ' pada tanggal itu.' };
  }

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_DB);
  const petugas = String(d.petugas || '').trim().slice(0, 30);
  const stempel = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const isi = [tanggal, mulai, selesai, bed, String(d.status || '').slice(0, 20), String(d.rs || '').slice(0, 40),
    String(d.alamat || '').slice(0, 60), nama, String(d.ket || '').slice(0, 200)];

  const keTab = {
    tanggal: tanggal, mulai: mulai, selesai: selesai, bed: bed, nama: nama,
    status: isi[4], rs: isi[5], alamat: isi[6], ket: isi[8],
  };

  if (idLama) {
    const baris = cariBaris(sh, idLama);
    if (baris < 0) return { ok: false, pesan: 'Reservasi tidak ditemukan.' };
    const lama = sh.getRange(baris, 1, 1, KOLOM.length).getValues()[0];
    sh.getRange(baris, 1, 1, isi.length).setValues([isi]);
    sh.getRange(baris, 11, 1, 2).setValues([[stempel, petugas || 'web']]);
    // bila tanggal, jam, atau bed berubah, bersihkan dulu tempat yang lama
    const pindah = teksTanggal(lama[0]) !== tanggal || teksJam(lama[1]) !== mulai || normBed(lama[3]) !== bed;
    if (pindah) {
      hapusDariTabBulan_({ tanggal: teksTanggal(lama[0]), mulai: teksJam(lama[1]),
        bed: normBed(lama[3]), nama: String(lama[7] || '') });
    }
    return { ok: true, id: idLama, catatan: tulisKeTabBulan_(keTab) };
  }
  const id = Utilities.getUuid().slice(0, 8);
  sh.appendRow(isi.concat([id, stempel, petugas || 'web']));
  return { ok: true, id: id, catatan: tulisKeTabBulan_(keTab) };
}

function hapus(id) {
  if (!id) return { ok: false, pesan: 'ID reservasi kosong.' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_DB);
  const baris = cariBaris(sh, id);
  if (baris < 0) return { ok: false, pesan: 'Reservasi tidak ditemukan. Mungkin sudah dihapus.' };
  const lama = sh.getRange(baris, 1, 1, KOLOM.length).getValues()[0];
  sh.deleteRow(baris);
  const catatan = hapusDariTabBulan_({ tanggal: teksTanggal(lama[0]), mulai: teksJam(lama[1]),
    bed: normBed(lama[3]), nama: String(lama[7] || '') });
  return { ok: true, catatan: catatan };
}

/* ==================== kotak saran ==================== */

/**
 * Menyimpan masukan dari pasien. Nama boleh kosong. Pesan hanya boleh tampil
 * sebagai testimoni bila pengirimnya mencentang izin DAN petugas menandai
 * kolom "Ditampilkan" dengan ya — jadi tidak ada pesan yang naik ke situs
 * tanpa dibaca manusia lebih dahulu.
 */
function simpanSaran(d) {
  const pesan = String(d.pesan || '').trim().slice(0, 600);
  if (pesan.length < 10) return { ok: false, pesan: 'Pesan terlalu pendek.' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TAB_SARAN);
  if (!sh) return { ok: false, pesan: 'Tab Saran belum dibuat. Jalankan siapkan() lebih dahulu.' };

  let nilai = Number(d.nilai);
  if (!(nilai >= 1 && nilai <= 5)) nilai = '';

  sh.appendRow([
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    String(d.nama || '').trim().slice(0, 40),
    String(d.kategori || 'Saran').slice(0, 20),
    nilai,
    pesan,
    d.izin ? 'ya' : 'tidak',
    '',
  ]);
  return { ok: true };
}

/** Hanya baris dengan izin = ya DAN Ditampilkan = ya yang dikirim ke situs. */
function ambilTestimoni() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_SARAN);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM_SARAN.length).getValues()
    .filter(v => String(v[5]).toLowerCase() === 'ya' && String(v[6]).toLowerCase() === 'ya')
    .map(v => ({ nama: String(v[1] || ''), kategori: String(v[2] || ''), nilai: v[3], pesan: String(v[4] || '') }))
    .reverse()
    .slice(0, 6);
}

/* ==================== util ==================== */

function bacaDb() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_DB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.length).getValues().map(v => ({
    tanggal: teksTanggal(v[0]), mulai: teksJam(v[1]), selesai: teksJam(v[2]), bed: normBed(v[3]),
    status: String(v[4] || ''), rs: String(v[5] || ''), alamat: String(v[6] || ''),
    nama: String(v[7] || ''), ket: String(v[8] || ''), id: String(v[9] || ''),
  })).filter(r => r.tanggal && r.mulai && r.bed);
}

function cariBaris(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 10, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function rekapBulanan(semua, hariIni) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date(), hasil = [];
  for (let i = 5; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const awalan = Utilities.formatDate(x, TZ, 'yyyy-MM');
    hasil.push([bulan[x.getMonth()], semua.filter(r => r.tanggal.indexOf(awalan) === 0 && r.tanggal <= hariIni).length]);
  }
  return hasil;
}

/** PIN dengan pembatasan percobaan: 5 kali salah → diblokir 15 menit. */
function cekPin(pin) {
  const benar = PropertiesService.getScriptProperties().getProperty('PIN_STAF');
  const cache = CacheService.getScriptCache();
  const salah = Number(cache.get('salah') || 0);
  if (salah >= MAKS_SALAH) return { ok: false, pesan: 'Terlalu banyak percobaan PIN. Coba lagi dalam ' + BLOKIR_MENIT + ' menit.' };
  if (pin && String(pin) === benar) { cache.remove('salah'); return { ok: true }; }
  if (pin) cache.put('salah', String(salah + 1), BLOKIR_MENIT * 60);
  return { ok: false, pesan: 'PIN tidak cocok.' };
}

function inisial(nama) {
  const bersih = String(nama || '').replace(/^(tn|ny|nn|sdr|sdri|an)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  if (!bersih.length) return '—';
  return bersih.slice(0, 2).map(k => k[0].toUpperCase()).join('.');
}

function teksTanggal(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + dua(m[2]) + '-' + dua(m[3]);
  m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return m[3] + '-' + dua(m[2]) + '-' + dua(m[1]);
  m = v.match(/^(\d{1,2})[\s\-]+([A-Za-z]+)[\s\-]+(\d{2,4})/);   // 15 September 2026 / 1 agust 26 / 11-Jul-26
  if (m) {
    const nama = ['jan', 'feb', 'mar', 'apr', 'mei|may', 'jun', 'jul', 'agu|aug', 'sep', 'okt|oct', 'nov', 'des|dec'];
    const b = m[2].toLowerCase().slice(0, 3);
    let idx = -1;
    nama.forEach((n, i) => { if (idx < 0 && n.split('|').some(x => b.indexOf(x) === 0)) idx = i; });
    if (idx < 0) return '';
    let th = Number(m[3]);
    if (th < 100) th += 2000;
    return th + '-' + dua(idx + 1) + '-' + dua(m[1]);
  }
  return '';
}

function teksJam(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? dua(m[1]) + ':' + m[2] : '';
}

function rentangJam(teks) {
  const m = String(teks || '').match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  return m ? [dua(m[1]) + ':' + m[2], dua(m[3]) + ':' + m[4]] : ['', ''];
}

function normBed(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.indexOf('tunggu') >= 0 || s.indexOf('waiting') >= 0) return TUNGGU;
  if (s.indexOf('xtra') === 0 || s.indexOf('ekstra') === 0) return 'Xtra';
  const m = s.match(/(\d+)/);
  return m ? 'Bed ' + m[1] : '';
}

const dua = n => ('0' + n).slice(-2);
const menit = j => { const p = String(j).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
const hariIniIso = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const geser = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); };
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
