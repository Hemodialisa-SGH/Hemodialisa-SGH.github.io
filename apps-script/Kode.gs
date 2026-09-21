/**
 * API jadwal reservasi — Unit Hemodialisis RS Sedayu General Hospital
 *
 * Cara pasang:
 * 1. Buat Google Sheet baru, lalu Ekstensi → Apps Script. Hapus isi Kode.gs, tempel seluruh file ini.
 * 2. Pilih fungsi `setup` di toolbar, klik Jalankan, dan izinkan akses.
 * 3. Terapkan → Deployment baru → jenis "Aplikasi web".
 *    Jalankan sebagai: Saya. Yang memiliki akses: Siapa saja.
 * 4. Salin URL aplikasi web (berakhiran /exec) dan tempel ke KONFIG.API_URL di assets/js/app.js.
 *
 * PIN staf disimpan di Setelan project → Properti skrip → PIN_STAF.
 * Pengunjung umum hanya menerima jam dan bed yang terisi; inisial, akses,
 * dan keterangan hanya dikirim bila PIN yang dikirim cocok.
 */

const NAMA_TAB = 'Jadwal';
const KOLOM = ['Tanggal', 'Mulai', 'Selesai', 'Bed', 'Inisial', 'Akses', 'Keterangan', 'ID', 'Dibuat'];
const BED = ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4'];
const TZ = 'Asia/Jakarta';
const HARI_KE_DEPAN = 30;

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(NAMA_TAB) || ss.insertSheet(NAMA_TAB);
  sh.getRange(1, 1, 1, KOLOM.length).setValues([KOLOM]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A:C').setNumberFormat('@');   // simpan tanggal dan jam sebagai teks
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIN_STAF')) props.setProperty('PIN_STAF', '1209');
}

/* ---------------- baca ---------------- */

function doGet(e) {
  try {
    const staf = pinCocok((e.parameter || {}).pin);
    const hariIni = teksTanggal(new Date());
    const batasAwal = teksTanggal(tambahHari(new Date(), -1));
    const batasAkhir = teksTanggal(tambahHari(new Date(), HARI_KE_DEPAN));
    const semua = bacaSemua();

    const jadwal = semua
      .filter(r => r.tanggal >= batasAwal && r.tanggal <= batasAkhir)
      .map(r => staf ? r : { tanggal: r.tanggal, mulai: r.mulai, selesai: r.selesai, bed: r.bed });

    return json({ ok: true, staf, jadwal, rekap: hitungRekap(semua, hariIni) });
  } catch (err) {
    return json({ ok: false, pesan: String(err.message || err) });
  }
}

/* ---------------- tulis (khusus staf) ---------------- */

function doPost(e) {
  const kunci = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (!pinCocok(body.pin)) return json({ ok: false, pesan: 'PIN tidak cocok.' });
    kunci.waitLock(10000);

    if (body.aksi === 'tambah') return json(tambah(body.data || {}));
    if (body.aksi === 'hapus') return json(hapus(String(body.id || '')));
    return json({ ok: false, pesan: 'Aksi tidak dikenal.' });
  } catch (err) {
    return json({ ok: false, pesan: String(err.message || err) });
  } finally {
    try { kunci.releaseLock(); } catch (x) {}
  }
}

function tambah(d) {
  const tanggal = String(d.tanggal || '');
  const mulai = String(d.mulai || '');
  const selesai = String(d.selesai || '');
  const bed = String(d.bed || '');
  const inisial = String(d.inisial || '').trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: false, pesan: 'Tanggal belum diisi.' };
  if (!/^\d{2}:\d{2}$/.test(mulai) || !/^\d{2}:\d{2}$/.test(selesai)) return { ok: false, pesan: 'Jam mulai dan selesai belum diisi.' };
  if (menit(selesai) <= menit(mulai)) return { ok: false, pesan: 'Jam selesai harus setelah jam mulai.' };
  if (BED.indexOf(bed) < 0) return { ok: false, pesan: 'Pilih bed.' };
  if (!inisial) return { ok: false, pesan: 'Inisial pasien belum diisi.' };
  if (inisial.split(' ').length > 3 || inisial.length > 8) return { ok: false, pesan: 'Isi inisial saja, bukan nama lengkap.' };

  const bentrok = bacaSemua().find(r => r.tanggal === tanggal && r.bed === bed
    && menit(mulai) < menit(r.selesai) && menit(r.mulai) < menit(selesai));
  if (bentrok) {
    return { ok: false, pesan: `${bed} sudah terisi ${bentrok.mulai}–${bentrok.selesai} pada tanggal itu.` };
  }

  const id = Utilities.getUuid().slice(0, 8);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAMA_TAB).appendRow([
    tanggal, mulai, selesai, bed, inisial,
    String(d.akses || '').slice(0, 20), String(d.ket || '').slice(0, 80),
    id, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
  ]);
  return { ok: true, id };
}

function hapus(id) {
  if (!id) return { ok: false, pesan: 'ID reservasi kosong.' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAMA_TAB);
  const ids = sh.getRange(2, 8, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { ok: false, pesan: 'Reservasi tidak ditemukan. Mungkin sudah dihapus.' };
}

/* ---------------- util ---------------- */

function bacaSemua() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAMA_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.length).getValues()
    .map(v => ({
      tanggal: teksTanggal(v[0]),
      mulai: teksJam(v[1]),
      selesai: teksJam(v[2]),
      bed: normBed(v[3]),
      inisial: String(v[4] || ''),
      akses: String(v[5] || ''),
      ket: String(v[6] || ''),
      id: String(v[7] || ''),
    }))
    .filter(r => r.tanggal && r.mulai && r.selesai && r.bed);
}

function hitungRekap(semua, hariIni) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const hasil = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const awalan = Utilities.formatDate(x, TZ, 'yyyy-MM');
    const n = semua.filter(r => r.tanggal.indexOf(awalan) === 0 && r.tanggal <= hariIni).length;
    hasil.push([bulan[x.getMonth()], n]);
  }
  return hasil;
}

function teksTanggal(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}`;
  m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}`;
  return '';
}

function teksJam(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${('0' + m[1]).slice(-2)}:${m[2]}` : '';
}

function normBed(v) {
  const m = String(v || '').match(/(\d+)/);
  return m ? 'Bed ' + m[1] : '';
}

const menit = j => { const p = String(j).split(':'); return +p[0] * 60 + +p[1]; };
const tambahHari = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pinCocok = pin => !!pin && String(pin) === PropertiesService.getScriptProperties().getProperty('PIN_STAF');
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
