/* =========================================================
   Aplikasi petugas Unit Hemodialisis RS Sedayu General Hospital.
   Satu halaman berisi empat pekerjaan: reservasi, daftar tunggu,
   register pasien, dan tindakan harian. Semua data mengalir lewat
   Apps Script yang sama dengan situs, dan PIN diperiksa di server
   sehingga penggantian PIN langsung berlaku di sini maupun di
   Ruang staf pada situs.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const SHIFT = { P: ['06:00', '11:00'], S: ['13:30', '19:00'] };
const MENIT_SHIFT = { P: 6 * 60, S: 13 * 60 + 30 };
const BED_TUNGGU = 'Daftar tunggu';
const KUNCI_TUNGGU = 'tunggu';

const dua = n => String(n).padStart(2, '0');
const isoHariIni = (() => { const d = new Date(); return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`; })();
const jamIso = m => `${dua(Math.floor(m / 60))}:${dua(m % 60)}`;
const formatJam = m => (m == null ? '—' : `${dua(Math.floor(m / 60))}.${dua(m % 60)}`);
const parseJam = v => {
  const m = String(v || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const normBed = s => {
  const t = String(s || '').toLowerCase().replace(/\s+/g, '');
  if (t.indexOf('tunggu') >= 0 || t.indexOf('waiting') >= 0) return KUNCI_TUNGGU;
  if (t.indexOf('xtra') === 0 || t.indexOf('ekstra') === 0) return 'xtra';
  const m = t.match(/(\d+)/);
  return m ? 'bed' + m[1] : t;
};
const samarkan = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const SEMUA_BED = () => KONFIG.BED.concat(KONFIG.BED_TAMBAHAN || []);

let DATA_JADWAL = [];
let DATA_PASIEN = [];
let EDIT_ID = '';

/* ---------------- sambungan ke Apps Script ---------------- */

const pinStaf = () => { try { return sessionStorage.getItem('hd_staf') || ''; } catch (e) { return ''; } };

function alamatApi(param) {
  const dasar = KONFIG.API_URL;
  return dasar + (dasar.includes('?') ? '&' : '?') + param + '&pin='
    + encodeURIComponent(pinStaf()) + '&t=' + Date.now();
}

async function ambilApi() {
  const res = await fetch(alamatApi('aksi=jadwal'));
  if (!res.ok) throw new Error('Server jadwal tidak merespons');
  const d = await res.json();
  if (!d.ok) throw new Error(d.pesan || 'Server menolak permintaan');
  return (d.jadwal || []).map(r => ({
    tanggal: String(r.tanggal || '').slice(0, 10), mulai: parseJam(r.mulai), selesai: parseJam(r.selesai),
    bed: normBed(r.bed), inisial: r.inisial || '', nama: r.nama || '', status: r.status || '',
    rs: r.rs || '', alamat: r.alamat || '', ket: r.ket || '', id: r.id || '',
  })).filter(r => r.tanggal && r.bed);
}

async function kirimApi(isi) {
  const res = await fetch(KONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...isi, pin: pinStaf() }),
  });
  const d = await res.json();
  if (!d.ok) throw new Error(d.pesan || 'Gagal menyimpan');
  return d;
}

function pesan(sel, teks, jenis, tetap) {
  const el = $(sel);
  if (!el) return;
  el.textContent = teks;
  el.className = jenis || '';
  clearTimeout(pesan[sel]);
  if (!tetap) pesan[sel] = setTimeout(() => { el.textContent = ''; }, 8000);
}

/* ---------------- gerbang PIN ---------------- */

async function periksaPin(pin) {
  const dasar = KONFIG.API_URL;
  const url = dasar + (dasar.includes('?') ? '&' : '?') + 'pin=' + encodeURIComponent(pin) + '&t=' + Date.now();
  const res = await fetch(url);
  const d = await res.json();
  return { ok: !!(d.ok && d.staf), pesan: d.pesan || '' };
}

$('#buka').addEventListener('click', async () => {
  const pin = $('#pin').value.trim();
  const salah = 'PIN belum cocok. Tanyakan kepada penanggung jawab unit.';
  if (!pin) { pesan('#pin-pesan', salah, 'err', true); return; }
  if (!KONFIG.API_URL) { pesan('#pin-pesan', 'Aplikasi belum tersambung ke Apps Script.', 'err', true); return; }
  const tombol = $('#buka');
  tombol.disabled = true;
  pesan('#pin-pesan', 'Memeriksa PIN…', '', true);
  try {
    const hasil = await periksaPin(pin);
    if (!hasil.ok) { pesan('#pin-pesan', hasil.pesan || salah, 'err', true); return; }
    try { sessionStorage.setItem('hd_staf', pin); } catch (e) {}
    $('#pin').value = '';
    pesan('#pin-pesan', '', '');
    masuk();
  } catch (e) {
    pesan('#pin-pesan', 'Tidak bisa memeriksa PIN. Periksa sambungan internet, lalu coba lagi.', 'err', true);
  } finally {
    tombol.disabled = false;
  }
});
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#buka').click(); });

$('#kunci').addEventListener('click', () => {
  try { sessionStorage.removeItem('hd_staf'); } catch (e) {}
  DATA_JADWAL = []; DATA_PASIEN = [];
  keLayar('gerbang');
});

function masuk() {
  keLayar('menu');
  muatSemua();
}

/* ---------------- perpindahan layar ---------------- */

const JUDUL = {
  gerbang: 'Petugas Unit Hemodialisis',
  menu: 'Petugas Unit Hemodialisis',
  reservasi: 'Reservasi',
  tunggu: 'Waiting list',
  register: 'Register pasien dialisis',
  tindakan: 'Tindakan harian HD',
};

function keLayar(nama) {
  $$('.layar').forEach(l => { l.hidden = l.id !== 'layar-' + nama; });
  $('#judul-layar').textContent = JUDUL[nama] || JUDUL.menu;
  $('#kembali').hidden = (nama === 'menu' || nama === 'gerbang');
  $('#kunci').hidden = (nama === 'gerbang');
  if (location.hash !== '#' + nama) history.replaceState(null, '', '#' + nama);
  scrollTo({ top: 0, behavior: 'auto' });
}

$$('.petak').forEach(b => b.addEventListener('click', () => {
  const nama = b.dataset.layar;
  keLayar(nama);
  if (nama === 'reservasi') { perbaruiPilihanBed(false); gambarDaftarRes(); }
  if (nama === 'tunggu') gambarTunggu();
}));
$('#kembali').addEventListener('click', () => keLayar('menu'));

/* ---------------- memuat data ---------------- */

async function muatSemua() {
  if (!KONFIG.API_URL) { pesan('#menu-status', 'Belum tersambung ke Apps Script.', 'err', true); return; }
  try {
    DATA_JADWAL = await ambilApi();
    pesan('#menu-status', 'Data terbaru dari jadwal unit.', '', true);
  } catch (e) {
    pesan('#menu-status', 'Jadwal gagal dimuat: ' + e.message, 'err', true);
  }
  muatPasien();
  perbaruiAngka();
  perbaruiPilihanBed(false);
  gambarDaftarRes();
  gambarTunggu();
}

async function muatPasien() {
  try {
    const res = await fetch(alamatApi('aksi=pasien'));
    const d = await res.json();
    if (!d.ok || !d.pasien) return;
    DATA_PASIEN = d.pasien;
    $$('select[data-pasien]').forEach(el => isiPilihanPasien(el, el.value));
    const dl = $('#rs-rujukan');
    if (dl && !dl.children.length) {
      (KONFIG.RS_RUJUKAN || []).forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        dl.appendChild(o);
      });
    }
  } catch (e) { /* daftar pasien hanya pelengkap */ }
}

function perbaruiAngka() {
  const hariIni = DATA_JADWAL.filter(r => r.tanggal === isoHariIni && r.bed !== KUNCI_TUNGGU).length;
  const tunggu = DATA_JADWAL.filter(r => r.bed === KUNCI_TUNGGU && r.tanggal >= isoHariIni).length;
  $('#angka-reservasi').textContent = hariIni ? hariIni + ' hari ini' : '';
  $('#angka-tunggu').textContent = tunggu ? tunggu + ' menunggu' : '';
  $('#angka-tunggu').classList.toggle('perlu', tunggu > 0);
}

/* ---------------- reservasi ---------------- */

function pemakaiBed() {
  const tanggal = $('#res-tanggal').value;
  const mulai = MENIT_SHIFT[$('#res-shift').value] ?? MENIT_SHIFT.P;
  const peta = {};
  DATA_JADWAL.filter(r => r.tanggal === tanggal && r.mulai === mulai && r.id !== EDIT_ID)
    .forEach(r => { (peta[r.bed] = peta[r.bed] || []).push(r.inisial || r.nama || '—'); });
  return peta;
}

function perbaruiPilihanBed(pertahankan) {
  const sel = $('#res-bed');
  if (!$('#res-tanggal').value) $('#res-tanggal').value = isoHariIni;
  const terpakai = pemakaiBed();
  const lama = pertahankan === false ? '' : sel.value;
  sel.innerHTML = '';
  SEMUA_BED().forEach(b => {
    const isi = terpakai[normBed(b)];
    const o = new Option(isi ? `${b} · terisi ${isi[0]}` : b, b);
    o.disabled = !!isi;
    sel.add(o);
  });
  const menunggu = (terpakai[KUNCI_TUNGGU] || []).length;
  sel.add(new Option(menunggu ? `${BED_TUNGGU} (${menunggu})` : BED_TUNGGU, BED_TUNGGU));
  const masih = [...sel.options].find(o => o.value === lama && !o.disabled);
  sel.value = masih ? lama : (([...sel.options].find(o => !o.disabled) || {}).value || BED_TUNGGU);

  const wadah = $('#status-bed-app');
  wadah.innerHTML = '';
  SEMUA_BED().forEach(b => {
    const isi = terpakai[normBed(b)];
    if (!isi) return;
    const el = document.createElement('span');
    el.className = 'chip-bed isi';
    el.textContent = `${b} · terisi ${isi[0]}`;
    wadah.appendChild(el);
  });
  if (menunggu) {
    const el = document.createElement('span');
    el.className = 'chip-bed tunggu';
    el.textContent = `Daftar tunggu: ${menunggu}`;
    wadah.appendChild(el);
  }
}

['#res-tanggal', '#res-shift'].forEach(s => $(s).addEventListener('change', () => {
  perbaruiPilihanBed(false);
  gambarDaftarRes();
}));

function kosongkanForm() {
  EDIT_ID = '';
  ['#res-nama', '#res-rs', '#res-alamat', '#res-ket'].forEach(x => { $(x).value = ''; });
  $('#simpan-res').textContent = 'Simpan reservasi';
  $('#batal-res').hidden = true;
}

function isiForm(r) {
  EDIT_ID = r.id;
  $('#res-tanggal').value = r.tanggal;
  $('#res-shift').value = (r.mulai ?? 0) >= 12 * 60 ? 'S' : 'P';
  perbaruiPilihanBed(false);
  $('#res-bed').value = r.bed === KUNCI_TUNGGU
    ? BED_TUNGGU : (SEMUA_BED().find(b => normBed(b) === r.bed) || 'Bed 1');
  $('#res-nama').value = r.nama;
  $('#res-status').value = r.status || 'Pasien Rutin';
  $('#res-rs').value = r.rs; $('#res-alamat').value = r.alamat; $('#res-ket').value = r.ket;
  $('#simpan-res').textContent = 'Simpan perubahan';
  $('#batal-res').hidden = false;
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('#batal-res').addEventListener('click', () => { kosongkanForm(); perbaruiPilihanBed(false); });

$('#simpan-res').addEventListener('click', async () => {
  const jam = SHIFT[$('#res-shift').value] || SHIFT.P;
  const data = {
    tanggal: $('#res-tanggal').value, bed: $('#res-bed').value,
    mulai: jam[0], selesai: jam[1],
    nama: $('#res-nama').value.trim(), status: $('#res-status').value,
    rs: $('#res-rs').value.trim(), alamat: $('#res-alamat').value.trim(),
    ket: $('#res-ket').value.trim(), petugas: $('#res-petugas').value.trim(),
  };
  if (!data.tanggal) return pesan('#res-pesan', 'Isi tanggal lebih dahulu.', 'err');
  if (!data.nama) return pesan('#res-pesan', 'Isi nama pasien.', 'err');
  const tombol = $('#simpan-res'), teksLama = tombol.textContent;
  tombol.disabled = true; tombol.textContent = 'Menyimpan…';
  try {
    const balas = await kirimApi(EDIT_ID ? { aksi: 'ubah', id: EDIT_ID, data } : { aksi: 'tambah', data });
    if (balas.catatan) pesan('#res-pesan', balas.catatan, 'err', true);
    else pesan('#res-pesan', `Tersimpan: ${data.bed}, ${data.mulai.replace(':', '.')}–${data.selesai.replace(':', '.')}.`, 'ok');
    isiDariReservasi(data);
    kosongkanForm();
    await muatSemua();
    keLayar('reservasi');
  } catch (e) {
    pesan('#res-pesan', e.message, 'err', true);
  } finally {
    tombol.disabled = false; tombol.textContent = teksLama;
  }
});

function kartuReservasi(r, i, menunggu) {
  const [y, m, d] = r.tanggal.split('-').map(Number);
  const tgl = new Date(y, m - 1, d);
  const li = document.createElement('li');
  li.className = 'res-item' + (menunggu ? ' res-tunggu' : '');
  const namaBed = menunggu ? 'Daftar tunggu' : (SEMUA_BED().find(b => normBed(b) === r.bed) || r.bed);
  const label = [r.status, r.rs].filter(Boolean).map(v => `<span class="res-label">${esc(v)}</span>`).join('');
  const utama = document.createElement('div');
  utama.className = 'res-utama';
  utama.innerHTML = `<p class="res-kepala"><b>${HARI[tgl.getDay()].slice(0, 3)}, ${d} ${BULAN[m - 1].slice(0, 3)}</b>`
    + `<span class="res-jam">${formatJam(r.mulai)}–${formatJam(r.selesai)}</span>`
    + `<span class="res-bed${menunggu ? ' res-bed-tunggu' : ''}">${esc(namaBed)}</span></p>`
    + `<p class="res-pasien"><span class="res-nama">${esc(r.inisial || r.nama)}</span>${label}</p>`;
  if (r.ket) {
    const ket = document.createElement('p');
    ket.className = 'res-ket';
    ket.textContent = r.ket;
    ket.addEventListener('click', () => ket.classList.toggle('terbuka'));
    utama.appendChild(ket);
  }
  li.appendChild(utama);
  return li;
}

function tombolBaris(r, li, ulang) {
  const aksi = document.createElement('span');
  aksi.className = 'res-aksi';
  if (r.bed === KUNCI_TUNGGU) {
    const p = document.createElement('button');
    p.className = 'pindah';
    p.textContent = 'Pindahkan';
    p.addEventListener('click', () => bukaPindah(r, aksi, ulang));
    aksi.appendChild(p);
  }
  const salin = document.createElement('button');
  salin.className = 'ubah';
  salin.textContent = 'Pakai data';
  salin.addEventListener('click', () => {
    isiDariReservasi(r);
    keLayar('tindakan');
    pesan('#tindakan-pesan', `${r.inisial || r.nama}: data disalin dari reservasi.`, 'ok');
  });
  const u = document.createElement('button');
  u.className = 'ubah';
  u.textContent = 'Ubah';
  u.addEventListener('click', () => { keLayar('reservasi'); isiForm(r); });
  const h = document.createElement('button');
  h.className = 'hapus';
  h.textContent = 'Hapus';
  h.addEventListener('click', async () => {
    if (!confirm(`Hapus reservasi ${r.inisial || r.nama}?`)) return;
    h.disabled = true; h.textContent = 'Menghapus…';
    try { await kirimApi({ aksi: 'hapus', id: r.id }); await muatSemua(); }
    catch (e) { alert(e.message); h.disabled = false; h.textContent = 'Hapus'; }
  });
  aksi.append(salin, u, h);
  li.appendChild(aksi);
}

function gambarDaftarRes() {
  const ul = $('#daftar-res');
  ul.innerHTML = '';
  const rows = DATA_JADWAL
    .filter(r => r.tanggal >= isoHariIni)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.mulai ?? 0) - (b.mulai ?? 0));
  if (!rows.length) { ul.innerHTML = '<li class="note">Belum ada reservasi mendatang.</li>'; return; }
  rows.forEach((r, i) => {
    const li = kartuReservasi(r, i, r.bed === KUNCI_TUNGGU);
    if (r.id) tombolBaris(r, li, gambarDaftarRes);
    ul.appendChild(li);
  });
}

/* ---------------- daftar tunggu ---------------- */

function bedKosongUntuk(tanggal, mulai, kecualiId) {
  const dipakai = {};
  DATA_JADWAL.filter(x => x.tanggal === tanggal && x.mulai === mulai && x.id !== kecualiId)
    .forEach(x => { dipakai[x.bed] = true; });
  return SEMUA_BED().filter(b => !dipakai[normBed(b)]);
}

function bukaPindah(r, aksi, ulang) {
  const kosong = bedKosongUntuk(r.tanggal, r.mulai, r.id);
  if (!kosong.length) { alert('Belum ada bed kosong pada jam itu, termasuk bed Xtra.'); return; }
  aksi.innerHTML = '';
  const sel = document.createElement('select');
  sel.className = 'pilih-pindah';
  kosong.forEach(b => sel.add(new Option(b, b)));
  const ok = document.createElement('button');
  ok.className = 'ubah';
  ok.textContent = 'Pindahkan';
  const batal = document.createElement('button');
  batal.className = 'hapus';
  batal.textContent = 'Batal';
  batal.addEventListener('click', () => ulang());
  ok.addEventListener('click', async () => {
    ok.disabled = batal.disabled = true;
    ok.textContent = 'Memindahkan…';
    try {
      await kirimApi({ aksi: 'ubah', id: r.id, data: {
        tanggal: r.tanggal, mulai: jamIso(r.mulai), selesai: jamIso(r.selesai), bed: sel.value,
        nama: r.nama, status: r.status, rs: r.rs, alamat: r.alamat, ket: r.ket,
      } });
      await muatSemua();
    } catch (e) { alert(e.message); ulang(); }
  });
  aksi.append(sel, ok, batal);
}

function gambarTunggu() {
  const ul = $('#daftar-tunggu');
  const isian = $('#tunggu-tanggal');
  if (!isian.value) isian.value = isoHariIni;
  ul.innerHTML = '';
  const rows = DATA_JADWAL.filter(r => r.bed === KUNCI_TUNGGU && r.tanggal === isian.value)
    .sort((a, b) => (a.mulai ?? 0) - (b.mulai ?? 0));
  if (!rows.length) { ul.innerHTML = '<li class="note">Belum ada pasien menunggu pada tanggal ini.</li>'; return; }
  rows.forEach(r => {
    const li = kartuReservasi(r, 0, true);
    if (r.id) tombolBaris(r, li, gambarTunggu);
    ul.appendChild(li);
  });
}
$('#tunggu-tanggal').addEventListener('change', gambarTunggu);

/* ---------------- isian register dan tindakan ---------------- */

function isiPilihanPasien(el, pilihan) {
  el.innerHTML = '';
  el.add(new Option('— pilih pasien —', ''));
  DATA_PASIEN.forEach(p => el.add(new Option(p.nama, p.nama)));
  el.dataset.bawaan = '';
  if (pilihan) {
    if (![...el.options].some(o => o.value === pilihan)) el.add(new Option(pilihan, pilihan));
    el.value = pilihan;
  }
}

function gambarForm(wadah, bidang) {
  wadah.innerHTML = '';
  bidang.forEach(f => {
    const lab = document.createElement('label');
    if (f.lebar === 2) lab.className = 'span2';
    lab.appendChild(document.createTextNode(f.l));
    let el;
    if (f.t === 'pasien') {
      el = document.createElement('select');
      el.dataset.pasien = '1';
      isiPilihanPasien(el);
    } else if (f.t === 'select') {
      el = document.createElement('select');
      const pilihan = typeof f.o === 'string' ? (KONFIG[f.o] || []) : (f.o || []);
      pilihan.forEach(o => el.add(new Option(o, o)));
    } else {
      el = document.createElement('input');
      el.type = f.t || 'text';
      el.autocomplete = 'off';
      if (f.ph) el.placeholder = f.ph;
      if (f.d) el.setAttribute('list', f.d);
      if (f.v === 'hariini') el.value = isoHariIni;
      else if (f.v) el.value = f.v;
    }
    el.dataset.kunci = f.k;
    el.dataset.bawaan = el.value;
    lab.appendChild(el);
    wadah.appendChild(lab);
  });
}

const bacaForm = wadah => {
  const d = {};
  $$('[data-kunci]', wadah).forEach(el => { d[el.dataset.kunci] = String(el.value || '').trim(); });
  return d;
};

function isiSatu(el, nilai, timpa) {
  if (!el || !nilai) return;
  if (!timpa && el.value && el.value !== el.dataset.bawaan) return;
  if (el.tagName === 'SELECT') {
    const cari = samarkan(nilai);
    const cocok = [...el.options].find(o => samarkan(o.value) === cari)
      || [...el.options].find(o => cari && (samarkan(o.value).indexOf(cari) === 0 || cari.indexOf(samarkan(o.value)) === 0));
    if (cocok) el.value = cocok.value;
  } else {
    el.value = nilai;
  }
}

function isiBidang(wadahSel, data, timpa) {
  const wadah = $(wadahSel);
  if (!wadah) return;
  Object.keys(data).forEach(k => {
    const el = wadah.querySelector(`[data-kunci="${k}"]`);
    if (el && el.dataset.pasien && data[k] && ![...el.options].some(o => o.value === data[k])) {
      el.add(new Option(data[k], data[k]));
    }
    isiSatu(el, data[k], timpa);
  });
}

function lengkapiDariRegister(nama, timpa) {
  const p = DATA_PASIEN.find(x => samarkan(x.nama) === samarkan(nama));
  if (!p) return false;
  isiBidang('#form-register', {
    'Tanggal Lahir': p.lahir, 'No. RM': p.rm, 'Alamat': p.alamat, 'No. Handphone': p.hp,
    'DPJP': p.dpjp, 'Diagnosis': p.diagnosis, 'Penyebab': p.penyebab, 'Penyerta': p.penyerta,
    'Akses Vaskuler': p.akses, 'Lokasi Akses': p.lokasi, 'Tindakan': p.tindakan,
    'Unit Asal': p.unitAsal, 'Unit Tujuan': p.unitTujuan, 'Penanggung Jawab': p.penjamin,
    'Status Pasien': p.status, 'Antrean BPJS': p.bpjs,
  }, timpa);
  const jenis = /travel/i.test(p.tindakan) ? 'Traveling' : /ekstra/i.test(p.tindakan) ? 'Ekstra'
    : /rutin/i.test(p.tindakan) ? 'Rutin' : '';
  isiBidang('#form-tindakan', {
    'Tanggal Lahir': p.lahir, 'DPJP': p.dpjp, 'Penjamin': p.penjamin,
    'Akses': /cdl/i.test(p.akses) ? 'CDL (Catheter Double Lumen)' : p.akses,
    'Jenis Tindakan': jenis,
  }, timpa);
  return true;
}

function isiDariReservasi(r) {
  const rutin = /rutin/i.test(r.status || '');
  const selesai = typeof r.selesai === 'number' ? jamIso(r.selesai) : (r.selesai || '');
  isiBidang('#form-register', {
    'Nama Pasien': r.nama, 'Tanggal Registrasi': r.tanggal, 'Alamat': r.alamat,
    'Unit Asal': r.rs, 'Tindakan': rutin ? 'HD Rutin' : '', 'Status Pasien': rutin ? 'Rutin' : '',
  }, true);
  isiBidang('#form-tindakan', {
    'Nama Pasien': r.nama, 'Tanggal HD': r.tanggal, 'Jam selesai': selesai,
    'Jenis Tindakan': rutin ? 'Rutin' : '', 'keterangan': r.ket,
  }, true);
  lengkapiDariRegister(r.nama);
}

function pasangForm(opsi) {
  const wadah = $(opsi.wadah);
  const tombol = $(opsi.tombol);
  gambarForm(wadah, KONFIG[opsi.bidang]);
  wadah.addEventListener('change', e => {
    if (e.target.dataset.kunci === 'Nama Pasien') lengkapiDariRegister(e.target.value);
  });
  tombol.addEventListener('click', async () => {
    const data = bacaForm(wadah);
    if (!data['Nama Pasien']) return pesan(opsi.pesan, 'Isi nama pasien lebih dahulu.', 'err');
    const teksLama = tombol.textContent;
    tombol.disabled = true; tombol.textContent = 'Menyimpan…';
    try {
      const balas = await kirimApi({ aksi: opsi.aksi, data });
      pesan(opsi.pesan, balas.catatan || opsi.sukses, balas.catatan ? 'err' : 'ok', !!balas.catatan);
      gambarForm(wadah, KONFIG[opsi.bidang]);
      if (opsi.aksi === 'register') muatPasien();
    } catch (e) {
      pesan(opsi.pesan, e.message, 'err', true);
    } finally {
      tombol.disabled = false; tombol.textContent = teksLama;
    }
  });
}

pasangForm({ wadah: '#form-register', tombol: '#simpan-register', pesan: '#register-pesan',
  bidang: 'FORM_REGISTER', aksi: 'register', sukses: 'Pasien tersimpan di register dialisis.' });
pasangForm({ wadah: '#form-tindakan', tombol: '#simpan-tindakan', pesan: '#tindakan-pesan',
  bidang: 'FORM_TINDAKAN', aksi: 'tindakan', sukses: 'Tindakan tersimpan di tab bulan berjalan.' });

(function pasangSalinPasien() {
  const sel = $('#pilih-pasien-register');
  sel.dataset.pasien = '1';
  isiPilihanPasien(sel);
  $('#pakai-pasien-register').addEventListener('click', () => {
    const nama = sel.value;
    if (!nama) return pesan('#register-pesan', 'Pilih nama pasien lebih dahulu.', 'err');
    isiBidang('#form-register', { 'Nama Pasien': nama }, true);
    lengkapiDariRegister(nama, true);
    pesan('#register-pesan', `Data ${nama} disalin. Ubah seperlunya sebelum disimpan.`, 'ok');
  });
})();

/* ---------------- mulai ---------------- */

$('#res-tanggal').value = isoHariIni;
$('#tunggu-tanggal').value = isoHariIni;
if (pinStaf()) masuk(); else keLayar('gerbang');

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
