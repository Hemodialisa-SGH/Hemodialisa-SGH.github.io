/**
 * Jadwal Unit Hemodialisis RS Sedayu General Hospital
 * Dipasang di Google Sheet jadwal HD (Ekstensi → Apps Script).
 *
 * Tab yang dipakai skrip ini:
 *   Database  — satu baris per reservasi. Sumber data untuk situs.
 *   Tampilan  — dibuat otomatis dari Database, formatnya seperti tab bulanan yang biasa dipakai.
 * Tab bulanan lama tidak diubah dan tetap menjadi arsip.
 *
 * Urutan pemasangan:
 *   1. siapkan()                  → membuat tab Database dan Tampilan, serta PIN awal.
 *   2. imporTabBulan('September') → memindahkan isi tab bulan berjalan ke Database (sekali saja).
 *   3. bangunTampilan()           → menyusun tab Tampilan dari Database.
 *   4. Terapkan → Deployment baru → Aplikasi web.
 *      Jalankan sebagai: Saya. Yang memiliki akses: Siapa saja.
 *      Salin URL yang berakhiran /exec untuk dipasang di situs.
 *
 * PIN staf ada di Setelan project → Properti skrip → PIN_STAF, dan harus sama
 * dengan PIN_STAF di assets/js/app.js. Gunakan minimal 6 karakter.
 */

const TAB_DB = 'Database';
const TAB_TAMPIL = 'Tampilan';
const KOLOM = ['Tanggal', 'Mulai', 'Selesai', 'Bed', 'Status', 'RS perujuk', 'Alamat', 'Pasien', 'Keterangan', 'ID', 'Dicatat', 'Petugas'];
const BED = ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4', 'Xtra'];
const SESI = { PAGI: ['06:00', '11:00'], SIANG: ['13:30', '19:00'] };
const TZ = 'Asia/Jakarta';
const HARI_KE_DEPAN = 60;
const MAKS_SALAH = 5;          // percobaan PIN sebelum diblokir
const BLOKIR_MENIT = 15;

/* ==================== pemasangan ==================== */

function siapkan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB_DB);
  if (!sh) {
    sh = ss.insertSheet(TAB_DB);
    sh.getRange(1, 1, 1, KOLOM.length).setValues([KOLOM]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:C').setNumberFormat('@');
    sh.setColumnWidths(1, KOLOM.length, 110);
  }
  if (!ss.getSheetByName(TAB_TAMPIL)) ss.insertSheet(TAB_TAMPIL);
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
  const asal = ss.getSheetByName(namaTab);
  if (!asal) throw new Error('Tab ' + namaTab + ' tidak ditemukan.');
  const nilai = asal.getDataRange().getValues();
  if (nilai.length < 3) throw new Error('Tab ' + namaTab + ' kosong.');

  const judul = nilai[0].map(v => String(v).trim().toLowerCase());
  const sub = nilai[1].map(v => String(v).trim().toLowerCase());
  const kolomBed = [];
  judul.forEach((v, i) => {
    const m = v.match(/^bed\s*(\d+)$/);
    if (m) kolomBed.push({ bed: 'Bed ' + m[1], awal: i });
    else if (v === 'xtra') kolomBed.push({ bed: 'Xtra', awal: i });
  });
  if (!kolomBed.length) throw new Error('Kolom BED tidak ditemukan di baris judul.');

  const cari = (awal, akhir, kunci) => {
    for (let i = awal; i < akhir; i++) if (sub[i] && sub[i].indexOf(kunci) === 0) return i;
    return -1;
  };

  const adaDb = {};
  bacaDb().forEach(r => { adaDb[[r.tanggal, r.mulai, r.bed, r.nama.toLowerCase()].join('|')] = true; });
  const baris = [];
  let tanggal = '', shift = '', jam = '';

  for (let r = 2; r < nilai.length; r++) {
    const b = nilai[r];
    tanggal = teksTanggal(b[1]) || tanggal;
    const shiftBaru = String(b[2] || '').trim().toUpperCase();
    if (shiftBaru) shift = shiftBaru;
    const jamBaru = String(b[3] || '').trim();
    if (jamBaru) jam = jamBaru;
    if (!tanggal) continue;

    let rentang = rentangJam(jam);
    if (!rentang[0] && SESI[shift]) rentang = SESI[shift];
    if (!rentang[0]) continue;

    kolomBed.forEach(function (k, idx) {
      const akhir = idx + 1 < kolomBed.length ? kolomBed[idx + 1].awal : judul.length;
      const cNama = cari(k.awal, akhir, 'pasien');
      if (cNama < 0) return;
      const nama = String(b[cNama] || '').trim();
      if (!nama) return;
      const kunci = [tanggal, rentang[0], k.bed, nama.toLowerCase()].join('|');
      if (adaDb[kunci]) return;
      adaDb[kunci] = true;
      const ambil = function (kata) { const c = cari(k.awal, akhir, kata); return c < 0 ? '' : String(b[c] || '').trim(); };
      baris.push([tanggal, rentang[0], rentang[1], k.bed, ambil('status'), ambil('rs'), ambil('alamat'),
        nama, ambil('keterangan'), Utilities.getUuid().slice(0, 8),
        Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), 'impor ' + namaTab]);
    });
  }

  if (baris.length) {
    const db = ss.getSheetByName(TAB_DB);
    db.getRange(db.getLastRow() + 1, 1, baris.length, KOLOM.length).setValues(baris);
  }
  SpreadsheetApp.getActive().toast(baris.length + ' reservasi dipindahkan dari tab ' + namaTab + '.');
  return baris.length;
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
  if (BED.indexOf(bed) < 0) return { ok: false, pesan: 'Bed tidak dikenal.' };
  if (!nama) return { ok: false, pesan: 'Nama pasien belum diisi.' };

  const bentrok = bacaDb().filter(r => r.id !== idLama && r.tanggal === tanggal && r.bed === bed
    && menit(mulai) < menit(r.selesai) && menit(r.mulai) < menit(selesai))[0];
  if (bentrok) return { ok: false, pesan: bed + ' sudah terisi ' + bentrok.mulai + '–' + bentrok.selesai + ' pada tanggal itu.' };

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_DB);
  const petugas = String(d.petugas || '').trim().slice(0, 30);
  const stempel = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const isi = [tanggal, mulai, selesai, bed, String(d.status || '').slice(0, 20), String(d.rs || '').slice(0, 40),
    String(d.alamat || '').slice(0, 60), nama, String(d.ket || '').slice(0, 200)];

  if (idLama) {
    const baris = cariBaris(sh, idLama);
    if (baris < 0) return { ok: false, pesan: 'Reservasi tidak ditemukan.' };
    sh.getRange(baris, 1, 1, isi.length).setValues([isi]);
    sh.getRange(baris, 11, 1, 2).setValues([[stempel, petugas || 'web']]);
    return { ok: true, id: idLama };
  }
  const id = Utilities.getUuid().slice(0, 8);
  sh.appendRow(isi.concat([id, stempel, petugas || 'web']));
  return { ok: true, id: id };
}

function hapus(id) {
  if (!id) return { ok: false, pesan: 'ID reservasi kosong.' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_DB);
  const baris = cariBaris(sh, id);
  if (baris < 0) return { ok: false, pesan: 'Reservasi tidak ditemukan. Mungkin sudah dihapus.' };
  sh.deleteRow(baris);
  return { ok: true };
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
  if (s.indexOf('xtra') === 0 || s.indexOf('ekstra') === 0) return 'Xtra';
  const m = s.match(/(\d+)/);
  return m ? 'Bed ' + m[1] : '';
}

const dua = n => ('0' + n).slice(-2);
const menit = j => { const p = String(j).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
const hariIniIso = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const geser = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); };
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
