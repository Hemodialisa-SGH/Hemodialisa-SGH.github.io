/* =========================================================
   Unit Hemodialisis — RS Sedayu General Hospital
   Isi bagian KONFIG di bawah, sisanya tidak perlu diubah.
   ========================================================= */

const KONFIG = {
  // Google Sheet harus dipublikasikan: File > Share > Publish to web.
  // Selama SHEET_ID kosong, papan jadwal menampilkan pesan "belum tersambung".
  // Untuk pratinjau dengan data contoh, buka situs dengan akhiran ?contoh=1
  // URL aplikasi web Apps Script (berakhiran /exec). Lihat apps-script/Kode.gs.
  // Bila diisi, jadwal dibaca dan ditulis lewat API ini dan SHEET_ID diabaikan.
  API_URL: '',
  SHEET_ID: '',
  NAMA_TAB_JADWAL: 'Jadwal',   // kolom: Tanggal | Mulai | Selesai | Bed | Inisial | Akses | Keterangan
  NAMA_TAB_REKAP: 'Rekap',     // kolom: Bulan | Jumlah tindakan
  PIN_STAF: '1209',
  BED: ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4'],
  BED_TAMBAHAN: ['Xtra'],       // bed cadangan: bisa dipilih di form, tidak dijadikan kartu
  HARI_DITAMPILKAN: 7,         // jumlah tanggal ke depan pada tab Jadwal
  // Kartu promo di Beranda otomatis hilang setelah tanggal BATAS. Kosongkan URL untuk menyembunyikan.
  PROMO: { URL: 'https://sedayugeneralhospital.com/promo/promo-hemodialisis-8eO6U', BATAS: '2026-09-30' },
  INTERKOM_CODE_BLUE: '906',   // hanya tampil di Ruang staf. Pastikan sesuai nomor RS.
  SPO: [
    { kode: '016/HD/RSSGH/2026', judul: 'Pelaksanaan resusitasi code blue di Unit Hemodialisis', url: '' },
    { kode: '……/HD/RSSGH/2026', judul: 'Persiapan mesin dan priming dializer', url: '' },
    { kode: '……/HD/RSSGH/2026', judul: 'Pemasangan dan perawatan akses vaskuler', url: '' },
    { kode: '……/HD/RSSGH/2026', judul: 'Penanganan hipotensi intradialitik', url: '' },
    { kode: '……/HD/RSSGH/2026', judul: 'Terminasi hemodialisis dan observasi pasca-dialisis', url: '' },
    { kode: '……/HD/RSSGH/2026', judul: 'Desinfeksi mesin dan pengelolaan limbah dialisis', url: '' },
  ],
  CEKLIS: [
    { judul: 'Troli emergensi', butir: [
      'Segel troli utuh dan nomor segel sesuai catatan',
      'Obat emergensi lengkap dan belum kedaluwarsa',
      'Defibrilator/AED menyala dan baterai terisi penuh',
      'Bag valve mask, OPA, dan set suction siap pakai',
      'Tabung oksigen terisi dan regulator berfungsi',
    ]},
    { judul: 'Mesin dan ruangan', butir: [
      'Desinfeksi mesin terdokumentasi untuk semua mesin',
      'Tes konduktivitas dan suhu dialisat dalam rentang',
      'Uji kebocoran dializer dan alarm mesin berfungsi',
      'Kualitas air RO dicatat sesuai jadwal pemantauan',
    ]},
  ],
};

/* ---------------- util ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------- dua bahasa ----------------
   Teks Indonesia tetap tertulis di index.html. Saat halaman dimuat, isi tiap
   elemen ber-data-t dicatat sebagai versi Indonesia, lalu versi Inggris
   diambil dari assets/js/en.js. Berpindah bahasa hanya menukar potongan teks,
   sehingga ikon, tautan, dan struktur halaman tidak tersentuh. */

let BHS = 'id';
const ASLI = new Map();          // kunci data-t -> daftar potongan teks Indonesia
const SIMPUL = new Map();        // kunci data-t -> daftar simpul teksnya

function potonganTeks(el) {
  const jalan = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const keluar = [];
  for (let n = jalan.nextNode(); n; n = jalan.nextNode()) keluar.push(n);
  return keluar;
}

function catatBahasaAsli() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const k = el.dataset.t;
    const simpul = potonganTeks(el);
    SIMPUL.set(k, simpul);
    ASLI.set(k, simpul.map(n => n.nodeValue));
  });
}

function terapkanBahasa(b) {
  BHS = b;
  const kamus = (b === 'en' && window.EN) ? window.EN : null;
  // teks bayangan pada isian tidak berupa simpul teks, jadi ditukar terpisah
  document.querySelectorAll('[data-ph]').forEach(el => {
    if (!el.dataset.phAsli) el.dataset.phAsli = el.placeholder;
    const en = kamus && kamus[el.dataset.ph];
    el.placeholder = (en && en[0]) || el.dataset.phAsli;
  });
  SIMPUL.forEach((simpul, k) => {
    const asli = ASLI.get(k);
    const terjemah = kamus && kamus[k];
    simpul.forEach((n, i) => {
      const baru = terjemah && terjemah[i] != null ? terjemah[i] : asli[i];
      if (n.nodeValue !== baru) n.nodeValue = baru;
    });
  });
  document.documentElement.lang = b;
  $$('.bhs').forEach(t => {
    const aktif = t.dataset.bhs === b;
    t.classList.toggle('is-on', aktif);
    t.setAttribute('aria-pressed', aktif ? 'true' : 'false');
  });
  try { localStorage.setItem('hd_bahasa', b); } catch (e) {}
}

/* Teks yang dibuat oleh skrip (papan bed, tanggal, pesan) diterjemahkan lewat t(). */
const t = s => (BHS === 'en' && window.EN && window.EN.dinamis[s]) || s;

const HARI_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const pilihDaftar = (idArr, kunci) => new Proxy(idArr, {
  get: (o, sifat) => ((BHS === 'en' && window.EN) ? window.EN.dinamis[kunci] : o)[sifat],
});
const HARI = pilihDaftar(HARI_ID, 'hari');
const BULAN = pilihDaftar(BULAN_ID, 'bulan');
/* potongan pendek: cukup sebut kedua versinya di tempat */
const T = (id, en) => (BHS === 'en' ? en : id);
let sekarang = new Date();
const MODE_CONTOH = new URLSearchParams(location.search).has('contoh');

const pad = n => String(n).padStart(2, '0');
const isoLokal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tambahHari = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
let isoHariIni = isoLokal(sekarang);
let menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes();

function perbaruiWaktu() {
  sekarang = new Date();
  isoHariIni = isoLokal(sekarang);
  menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes();
}

function tanggalPanjang(d) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Terima "Date(2026,8,21)", "2026-09-21", atau "21/09/2026" → "2026-09-21"
function parseTanggal(v) {
  v = String(v || '').trim();
  let m = v.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return isoLokal(new Date(+m[1], +m[2], +m[3]));
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return '';
}

// Terima "7:00", "07.30", "Date(1899,11,30,7,30,0)" → menit sejak 00.00
function parseJam(v) {
  v = String(v || '').trim();
  let m = v.match(/^Date\(\d+,\d+,\d+,(\d+),(\d+)/);
  if (m) return +m[1] * 60 + +m[2];
  m = v.match(/^(\d{1,2})[:.](\d{2})/);
  if (m) return +m[1] * 60 + +m[2];
  return null;
}
const formatJam = mnt => mnt === null ? '?' : `${pad(Math.floor(mnt / 60))}.${pad(mnt % 60)}`;

const normBed = s => {
  s = String(s || '').toLowerCase().replace(/\s+/g, '');
  return /^\d+$/.test(s) ? 'bed' + s : s;
};

/* ------------- ambil data Google Sheets (JSONP, aman dari CORS) ------------- */

function ambilSheet(namaTab) {
  return new Promise((selesai, gagal) => {
    if (!KONFIG.SHEET_ID) return gagal(new Error('SHEET_ID belum diisi'));
    const cb = 'hdcb_' + Math.random().toString(36).slice(2);
    const el = document.createElement('script');
    const batas = setTimeout(() => { bersihkan(); gagal(new Error('Permintaan data melebihi batas waktu')); }, 12000);

    function bersihkan() { clearTimeout(batas); delete window[cb]; el.remove(); }

    window[cb] = (res) => {
      bersihkan();
      if (!res || res.status === 'error') return gagal(new Error('Sheet tidak dapat dibaca'));
      const baris = res.table.rows.map(r => (r.c || []).map(c => {
        if (!c || c.v === null || c.v === undefined) return '';
        if (Array.isArray(c.v)) return `${c.v[0]}:${pad(c.v[1] || 0)}`;   // kolom jam (timeofday)
        return String(c.v).trim();
      }));
      selesai({ baris });
    };

    el.onerror = () => { bersihkan(); gagal(new Error('Sheet tidak dapat dihubungi')); };
    el.src = `https://docs.google.com/spreadsheets/d/${KONFIG.SHEET_ID}/gviz/tq`
           + `?tqx=out:json;responseHandler:${cb}&headers=1&sheet=${encodeURIComponent(namaTab)}`;
    document.body.appendChild(el);
  });
}

async function ambilApi() {
  const url = KONFIG.API_URL + (KONFIG.API_URL.includes('?') ? '&' : '?')
    + 'pin=' + encodeURIComponent(pinStaf()) + '&t=' + Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error('Server jadwal tidak merespons');
  const d = await res.json();
  if (!d.ok) throw new Error(d.pesan || 'Server jadwal menolak permintaan');
  return {
    jadwal: (d.jadwal || []).map(r => ({
      tanggal: parseTanggal(r.tanggal), mulai: parseJam(r.mulai), selesai: parseJam(r.selesai),
      bed: normBed(r.bed), inisial: r.inisial || '', nama: r.nama || '', status: r.status || '',
      rs: r.rs || '', alamat: r.alamat || '', ket: r.ket || '', id: r.id || '',
    })).filter(r => r.tanggal && r.bed),
    rekap: (d.rekap || []).map(x => [String(x[0]), String(x[1])]),
  };
}

async function kirimApi(isi) {
  const res = await fetch(KONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // hindari preflight CORS
    body: JSON.stringify({ ...isi, pin: pinStaf() }),
  });
  const d = await res.json();
  if (!d.ok) throw new Error(d.pesan || 'Gagal menyimpan');
  return d;
}

function barisKeReservasi(r) {
  return {
    tanggal: parseTanggal(r[0]),
    mulai: parseJam(r[1]),
    selesai: parseJam(r[2]),
    bed: normBed(r[3]),
    inisial: r[4] || '',
    akses: r[5] || '',
    ket: r[6] || '',
  };
}

/* ---------------- data contoh (hanya untuk pratinjau ?contoh=1) --------------- */

function buatContoh() {
  const inisial = ['S.M','A.R','T.W','B.S','N.H','K.P','R.D','W.A','Y.S','D.K'];
  const akses = ['Fistula','Fistula','Kateter','Fistula'];
  const pola = [[420, 690], [750, 1020]];   // 07.00–11.30 dan 12.30–17.00
  const hasil = [];
  let i = 0;
  for (let h = 0; h < KONFIG.HARI_DITAMPILKAN; h++) {
    const tgl = isoLokal(tambahHari(sekarang, h));
    KONFIG.BED.forEach((b, bi) => {
      pola.forEach((p, pi) => {
        if ((h + bi + pi) % 3 === 2) return;   // sisakan slot kosong
        hasil.push({ tanggal: tgl, mulai: p[0], selesai: p[1], bed: normBed(b),
          inisial: inisial[i % inisial.length], akses: akses[i % akses.length], ket: '' });
        i++;
      });
    });
  }
  return hasil;
}

const CONTOH_REKAP = [['Juni','98'], ['Juli','104'], ['Agustus','112'], ['September','61']];

/* ---------------- papan jadwal ---------------- */

let DATA_JADWAL = [];
let DATA_REKAP = [];
let STATUS_DATA = 'memuat';   // memuat | tersambung | contoh | kosong | gagal

const reservasiTanggal = iso => DATA_JADWAL
  .filter(r => r.tanggal === iso)
  .sort((a, b) => (a.mulai ?? 0) - (b.mulai ?? 0));

const sedangBerjalan = (r, iso) => iso === isoHariIni && r.mulai !== null && r.selesai !== null
  && menitSekarang >= r.mulai && menitSekarang < r.selesai;

/* Kemajuan sesi dialisis yang sedang berjalan — dipakai bar progres pada kartu bed. */
function persenSesi(r) {
  const total = r.selesai - r.mulai;
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((menitSekarang - r.mulai) / total * 100)));
}

function sisaTeks(r) {
  const sisa = Math.max(0, r.selesai - menitSekarang);
  const j = Math.floor(sisa / 60), m = sisa % 60;
  const jamT = T('jam', 'h'), menitT = T('menit', 'min');
  const lama = j ? `${j} ${jamT}${m ? ' ' + m + ' ' + menitT : ''}` : `${m} ${menitT}`;
  return BHS === 'en' ? `${persenSesi(r)}% done · ${lama} left` : `${persenSesi(r)}% berjalan · sisa ${lama}`;
}

/* Kerangka sementara selagi jadwal dimuat, agar papan tidak tampak kosong. */
function gambarKerangka(target) {
  target.innerHTML = '<div class="bedgrid">'
    + KONFIG.BED.map(b => `<article class="bedcard rangka"><header><h3>${esc(b)}</h3>`
      + '<span class="pill kilau">&nbsp;</span></header><p class="baris kilau"></p></article>').join('')
    + '</div>';
}

/* Perbarui bar progres tanpa menggambar ulang kartu, agar sorotan mouse tidak terputus. */
function perbaruiProgres() {
  perbaruiWaktu();
  let adaPerubahan = false;
  $$('.bedcard[data-mulai]').forEach(k => {
    const r = { mulai: Number(k.dataset.mulai), selesai: Number(k.dataset.selesai) };
    if (menitSekarang >= r.selesai || menitSekarang < r.mulai) { adaPerubahan = true; return; }
    const bar = $('.maju i', k);
    if (bar) bar.style.setProperty('--p', persenSesi(r) + '%');
    const maju = $('.maju', k);
    if (maju) maju.setAttribute('aria-valuenow', persenSesi(r));
    const sisa = $('.bed-sisa', k);
    if (sisa) sisa.textContent = sisaTeks(r);
  });
  // Sesi baru dimulai atau sesi lama berakhir: gambar ulang papan sepenuhnya.
  const seharusnya = reservasiTanggal(isoHariIni).filter(r => sedangBerjalan(r, isoHariIni)).length;
  const terpasang = $$('#papan-isi .bedcard[data-mulai]').length;
  if (adaPerubahan || seharusnya !== terpasang) {
    gambarPapan($('#papan-isi'), isoHariIni, staffTerbuka());
    hitungStatistik();
    if (tanggalTerpilih() === isoHariIni) gambarPapan($('#jadwal-isi'), isoHariIni, staffTerbuka());
  }
}

// Satu kartu per bed. Hari ini: status Terisi/Kosong mengikuti jam sekarang.
// Tanggal lain: Kosong bila tanpa reservasi, selain itu jumlah reservasinya.
function gambarPapan(target, iso, tampilkanInisial) {
  target.innerHTML = '';
  const rows = reservasiTanggal(iso);
  const grid = document.createElement('div');
  grid.className = 'bedgrid';
  if (!target.dataset.tampil) { grid.classList.add('urut'); target.dataset.tampil = '1'; }

  KONFIG.BED.forEach(b => {
    const isi = rows.filter(r => r.bed === normBed(b));
    const aktif = isi.find(r => sedangBerjalan(r, iso));
    let status, kelas;
    if (STATUS_DATA === 'gagal') { status = T('Belum terbaca', 'Not loaded'); kelas = 'gagal'; }
    else if (aktif) { status = T('Terisi', 'Occupied'); kelas = 'terisi'; }
    else if (iso !== isoHariIni && isi.length) {
      status = `${isi.length} ` + T('reservasi', isi.length > 1 ? 'bookings' : 'booking');
      kelas = 'dipesan';
    } else { status = T('Kosong', 'Free'); kelas = 'kosong'; }

    const kartu = document.createElement('article');
    kartu.className = 'bedcard is-' + kelas;
    kartu.style.setProperty('--i', grid.children.length);
    kartu.innerHTML = `<header><h3>${esc(b)}</h3><span class="pill">${status}</span></header>`;

    if (aktif) {
      const siapa = tampilkanInisial && aktif.inisial ? ` · ${esc(aktif.inisial)}` : '';
      kartu.insertAdjacentHTML('beforeend',
        `<p class="bed-now">${T('Dialisis berjalan sampai', 'Dialysis running until')} ${formatJam(aktif.selesai)}${siapa}</p>`
        + `<div class="maju" role="progressbar" aria-label="Kemajuan sesi dialisis"`
        + ` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${persenSesi(aktif)}">`
        + `<i style="--p:${persenSesi(aktif)}%"></i></div>`
        + `<p class="bed-sisa">${sisaTeks(aktif)}</p>`);
      kartu.dataset.mulai = aktif.mulai;
      kartu.dataset.selesai = aktif.selesai;
    }

    const lainnya = isi.filter(r => r !== aktif);
    if (lainnya.length) {
      const ul = document.createElement('ul');
      ul.className = 'slots';
      lainnya.forEach(r => {
        const lewat = iso === isoHariIni && r.selesai !== null && r.selesai <= menitSekarang;
        const siapa = tampilkanInisial ? (r.inisial ? ' · ' + esc(r.inisial) : '') : '';
        const detail = tampilkanInisial && (r.status || r.rs)
          ? `<small>${esc([r.status, r.rs].filter(Boolean).join(' · '))}</small>` : '';
        ul.insertAdjacentHTML('beforeend',
          `<li${lewat ? ' class="lewat"' : ''}><b>${formatJam(r.mulai)}–${formatJam(r.selesai)}</b>${siapa}${lewat ? T(' (selesai)', ' (finished)') : ''}${detail}</li>`);
      });
      kartu.appendChild(ul);
    } else if (!aktif && STATUS_DATA !== 'gagal') {
      kartu.insertAdjacentHTML('beforeend',
        `<p class="bed-kosong">${T('Belum ada reservasi', 'No bookings')}${iso === isoHariIni ? T(' hari ini', ' today') : ''}</p>`);
    }
    grid.appendChild(kartu);
  });
  target.appendChild(grid);
}

// Angka statistik menghitung naik dari 0 saat pertama tampil
const GERAK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
function hitungNaik(el, nilai) {
  const n = Number(nilai);
  if (!GERAK || !Number.isFinite(n) || el.dataset.dihitung) { el.textContent = nilai; return; }
  el.dataset.dihitung = '1';
  const mulai = performance.now(), durasi = 1000;
  (function langkah(t) {
    const p = Math.min((t - mulai) / durasi, 1);
    el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(langkah);
  })(mulai);
}

function hitungStatistik() {
  const adaData = STATUS_DATA === 'tersambung' || STATUS_DATA === 'contoh';
  const rows = reservasiTanggal(isoHariIni);
  const bedDipakai = new Set(rows.map(r => r.bed)).size;
  const berjalan = new Set(rows.filter(r => r.mulai !== null && r.selesai !== null
    && menitSekarang >= r.mulai && menitSekarang < r.selesai).map(r => r.bed)).size;

  $('.stats').hidden = !adaData;
  hitungNaik($('#stat-pasien'), adaData ? rows.length : '—');
  hitungNaik($('#stat-mesin'), adaData ? bedDipakai : '—');
  $('#stat-mesin-total').textContent = KONFIG.BED.length;
  const bulanIni = BULAN_ID[sekarang.getMonth()];
  const rekap = DATA_REKAP.find(r => (r[0] || '').toLowerCase() === bulanIni.toLowerCase());
  hitungNaik($('#stat-bulan'), rekap ? rekap[1] : '—');
  $('#status-bed').textContent = adaData
    ? (BHS === 'en' ? `${berjalan} of ${KONFIG.BED.length} beds in use`
                    : `${berjalan} dari ${KONFIG.BED.length} bed sedang dipakai`) : '';
}

function gambarRekap() {
  const wrap = $('#rekap-bar');
  if (!wrap) return;
  wrap.innerHTML = '';
  const data = DATA_REKAP.slice(-6);
  if (!data.length) {
    wrap.innerHTML = '<p class="note">Belum ada data rekap. Isi tab Rekap pada Google Sheet unit.</p>';
    $('#rekap-ket').textContent = '';
    return;
  }
  const maks = Math.max(...data.map(d => Number(d[1]) || 0)) || 1;
  data.forEach(d => {
    const b = document.createElement('div');
    b.className = 'bar';
    const lebar = Math.round((Number(d[1]) || 0) / maks * 100);
    b.innerHTML = `<span>${esc(d[0])}</span><i style="width:${lebar}%"></i><b>${esc(d[1])}</b>`;
    wrap.appendChild(b);
  });
  $('#rekap-ket').textContent = STATUS_DATA === 'contoh'
    ? 'Angka contoh untuk pratinjau.'
    : 'Jumlah tindakan hemodialisis per bulan, sesuai tab Rekap pada Google Sheet.';
}

function tandaiSumberData(pesan, peringatan) {
  ['#papan-status', '#jadwal-status'].forEach(sel => {
    const el = $(sel);
    el.textContent = pesan;
    el.classList.toggle('demo', !!peringatan);
  });
}

async function muatData() {
  perbaruiWaktu();
  $('#papan-sub').textContent = tanggalPanjang(sekarang);
  $('#tanggal-hari-ini').textContent = tanggalPanjang(sekarang);
  if (STATUS_DATA === 'memuat') gambarKerangka($('#papan-isi'));

  if (MODE_CONTOH) {
    DATA_JADWAL = buatContoh();
    DATA_REKAP = CONTOH_REKAP;
    STATUS_DATA = 'contoh';
    tandaiSumberData(t('Mode pratinjau: data contoh, bukan jadwal sebenarnya.'), true);
  } else if (KONFIG.API_URL) {
    try {
      const d = await ambilApi();
      DATA_JADWAL = d.jadwal;
      DATA_REKAP = d.rekap;
      STATUS_DATA = 'tersambung';
      tandaiSumberData(t('Diperbarui langsung dari jadwal reservasi unit.'), false);
    } catch (e) {
      STATUS_DATA = 'gagal';
      tandaiSumberData(`Jadwal gagal dimuat: ${e.message}. Hubungi petugas unit untuk informasi slot.`, true);
    }
  } else if (!KONFIG.SHEET_ID) {
    STATUS_DATA = 'kosong';
    tandaiSumberData(t('Hubungi petugas unit untuk menanyakan slot atau membuat reservasi.'), false);
  } else {
    try {
      const jadwal = await ambilSheet(KONFIG.NAMA_TAB_JADWAL);
      DATA_JADWAL = jadwal.baris.map(barisKeReservasi).filter(r => r.tanggal && r.bed);
      STATUS_DATA = 'tersambung';
      tandaiSumberData(t('Diperbarui langsung dari jadwal reservasi unit.'), false);
      try {
        const rekap = await ambilSheet(KONFIG.NAMA_TAB_REKAP);
        DATA_REKAP = rekap.baris.filter(r => r[0]);
      } catch (e) { DATA_REKAP = []; }
    } catch (e) {
      STATUS_DATA = 'gagal';
      tandaiSumberData(`Jadwal gagal dimuat: ${e.message}.`, true);
      console.warn('Periksa apakah Sheet sudah dipublikasikan dan nama tab sesuai.', e);
    }
  }

  gambarPapan($('#papan-isi'), isoHariIni, staffTerbuka());
  hitungStatistik();
  gambarRekap();
  pasangPilihTanggal();
  gambarDaftarRes();
}

function tanggalTerpilih() {
  return $('#pilih-hari [aria-pressed="true"]')?.dataset.iso || isoHariIni;
}

function pasangPilihTanggal() {
  const wrap = $('#pilih-hari');
  const terpilih = $('[aria-pressed="true"]', wrap)?.dataset.iso || isoHariIni;
  wrap.innerHTML = '';
  for (let h = 0; h < KONFIG.HARI_DITAMPILKAN; h++) {
    const d = tambahHari(sekarang, h);
    const b = document.createElement('button');
    b.className = 'day';
    b.dataset.iso = isoLokal(d);
    b.setAttribute('aria-pressed', b.dataset.iso === terpilih ? 'true' : 'false');
    b.textContent = h === 0 ? `${T('Hari ini', 'Today')}, ${d.getDate()}` : `${HARI[d.getDay()].slice(0, 3)} ${d.getDate()}`;
    b.addEventListener('click', () => {
      $$('.day', wrap).forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      gambarPapan($('#jadwal-isi'), b.dataset.iso, staffTerbuka());
    });
    wrap.appendChild(b);
  }
  if (!$('[aria-pressed="true"]', wrap)) wrap.firstChild.setAttribute('aria-pressed', 'true');
  gambarPapan($('#jadwal-isi'), tanggalTerpilih(), staffTerbuka());
}

/* ---------------- kontak ---------------- */


/* ---------------- navigasi tab ---------------- */

const URUT_TAB = $$('.tab').map(t => t.dataset.panel);
let tabSekarang = 0;

/* Tombol di hero yang membuka tab lain, misalnya "Lihat jadwal bed". */
$$('[data-ke]').forEach(b => {
  b.addEventListener('click', () => {
    const tab = $$('.tab').find(t => t.dataset.panel === b.dataset.ke);
    if (tab) tab.click();
  });
});

$$('.tab').forEach(t => {
  t.addEventListener('click', () => {
    const tujuan = URUT_TAB.indexOf(t.dataset.panel);
    if (tujuan === tabSekarang) return;
    const arah = tujuan > tabSekarang ? 'kanan' : 'kiri';
    tabSekarang = tujuan;

    $$('.tab').forEach(x => x.classList.remove('is-on'));
    t.classList.add('is-on');
    $$('.panel').forEach(p => { p.hidden = true; p.classList.remove('dari-kanan', 'dari-kiri'); });

    const panel = $('#panel-' + t.dataset.panel);
    panel.hidden = false;
    // Paksa hitung ulang agar animasi terpicu meski tab yang sama dibuka lagi.
    void panel.offsetWidth;
    panel.classList.add('dari-' + arah);
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
});

/* Masthead memadat saat halaman digulir, agar menu tetap terjangkau.
   Memadat memendekkan masthead, dan karena masthead ikut menempati ruang
   halaman, isi di bawahnya naik sehingga posisi gulir bergeser. Dengan satu
   ambang, pergeseran itu melewati ambang lagi dan header berkedip naik-turun.
   Karena itu ambang memadat dan ambang mengembang dibuat berjauhan. */
(function mastheadMemadat() {
  const el = $('.masthead');
  if (!el) return;
  const AMBANG_PADAT = 120, AMBANG_LEBAR = 50;
  let padat = false, menunggu = false;
  addEventListener('scroll', () => {
    if (menunggu) return;
    menunggu = true;
    requestAnimationFrame(() => {
      menunggu = false;
      if (!padat && scrollY > AMBANG_PADAT) { padat = true; el.classList.add('ringkas'); }
      else if (padat && scrollY < AMBANG_LEBAR) { padat = false; el.classList.remove('ringkas'); }
    });
  }, { passive: true });
})();

/* ---------------- ruang staf ---------------- */

const pinStaf = () => { try { return sessionStorage.getItem('hd_staf') || ''; } catch (e) { return ''; } };
const staffTerbuka = () => !!pinStaf();

function bukaStaf() {
  $('#gerbang-staf').hidden = true;
  $('#isi-staf').hidden = false;
  gambarSPO();
  gambarCeklis();
  gambarRekap();
  siapkanFormRes();
  gambarDaftarRes();
  $('#info-codeblue').innerHTML = KONFIG.INTERKOM_CODE_BLUE
    ? `Kegawatdaruratan di dalam rumah sakit: interkom <strong>${esc(KONFIG.INTERKOM_CODE_BLUE)}</strong> (aktivasi <em>code blue</em>).`
    : '';
  if (STATUS_DATA !== 'memuat') {
    gambarPapan($('#papan-isi'), isoHariIni, true);
    gambarPapan($('#jadwal-isi'), tanggalTerpilih(), true);
  }
}

$('#buka-staf').addEventListener('click', () => {
  if ($('#pin').value === KONFIG.PIN_STAF) {
    try { sessionStorage.setItem('hd_staf', $('#pin').value); } catch (e) {}
    $('#pin-pesan').textContent = '';
    $('#pin').value = '';
    bukaStaf();
    if (KONFIG.API_URL) muatData();   // muat ulang agar inisial ikut terkirim
  } else {
    $('#pin-pesan').textContent = 'PIN belum cocok. Tanyakan kepada penanggung jawab unit.';
  }
});
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#buka-staf').click(); });

$('#kunci-staf').addEventListener('click', () => {
  try { sessionStorage.removeItem('hd_staf'); } catch (e) {}
  $('#isi-staf').hidden = true;
  $('#gerbang-staf').hidden = false;
  gambarPapan($('#papan-isi'), isoHariIni, false);
  gambarPapan($('#jadwal-isi'), tanggalTerpilih(), false);
});

/* reservasi (staf) */

let EDIT_ID = '';
const SEMUA_BED = () => KONFIG.BED.concat(KONFIG.BED_TAMBAHAN || []);

function siapkanFormRes() {
  const sel = $('#res-bed');
  if (!sel.options.length) SEMUA_BED().forEach(b => sel.add(new Option(b, b)));
  if (!$('#res-tanggal').value) $('#res-tanggal').value = isoHariIni;
  const aktif = !!KONFIG.API_URL;
  $$('#form-reservasi input, #form-reservasi select, #simpan-res').forEach(el => { el.disabled = !aktif; });
  if (!aktif) pesanRes('Form aktif setelah API_URL Apps Script diisi pada assets/js/app.js.', 'err', true);
}

function pesanRes(t, jenis, tetap) {
  const el = $('#res-pesan');
  el.textContent = t;
  el.className = jenis || '';
  clearTimeout(pesanRes.t);
  if (!tetap) pesanRes.t = setTimeout(() => { el.textContent = ''; }, 6000);
}

function kosongkanForm() {
  EDIT_ID = '';
  ['#res-nama', '#res-rs', '#res-alamat', '#res-ket'].forEach(x => { $(x).value = ''; });
  $('#judul-form').textContent = 'Tambah reservasi';
  $('#simpan-res').textContent = 'Simpan reservasi';
  $('#batal-res').hidden = true;
}

function isiForm(r) {
  EDIT_ID = r.id;
  $('#res-tanggal').value = r.tanggal;
  $('#res-bed').value = SEMUA_BED().find(b => normBed(b) === r.bed) || 'Bed 1';
  $('#res-mulai').value = formatJam(r.mulai).replace('.', ':');
  $('#res-selesai').value = formatJam(r.selesai).replace('.', ':');
  $('#res-nama').value = r.nama;
  $('#res-status').value = r.status || 'Pasien Rutin';
  $('#res-rs').value = r.rs; $('#res-alamat').value = r.alamat; $('#res-ket').value = r.ket;
  $('#judul-form').textContent = 'Ubah reservasi';
  $('#simpan-res').textContent = 'Simpan perubahan';
  $('#batal-res').hidden = false;
  $('#form-reservasi').scrollIntoView({ behavior: GERAK ? 'smooth' : 'auto', block: 'center' });
}

$('#batal-res').addEventListener('click', () => { kosongkanForm(); pesanRes('Perubahan dibatalkan.', ''); });

$('#simpan-res').addEventListener('click', async () => {
  const data = {
    tanggal: $('#res-tanggal').value, bed: $('#res-bed').value,
    mulai: $('#res-mulai').value, selesai: $('#res-selesai').value,
    nama: $('#res-nama').value.trim(), status: $('#res-status').value,
    rs: $('#res-rs').value.trim(), alamat: $('#res-alamat').value.trim(),
    ket: $('#res-ket').value.trim(), petugas: $('#res-petugas').value.trim(),
  };
  if (!data.tanggal || !data.mulai || !data.selesai) return pesanRes('Isi tanggal, jam mulai, dan jam selesai.', 'err');
  if (data.selesai <= data.mulai) return pesanRes('Jam selesai harus setelah jam mulai.', 'err');
  if (!data.nama) return pesanRes('Isi nama pasien.', 'err');
  const btn = $('#simpan-res'), teksLama = btn.textContent;
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try {
    await kirimApi(EDIT_ID ? { aksi: 'ubah', id: EDIT_ID, data } : { aksi: 'tambah', data });
    pesanRes(`${EDIT_ID ? 'Perubahan' : 'Reservasi'} ${data.bed} ${data.mulai.replace(':', '.')}–${data.selesai.replace(':', '.')} tersimpan.`, 'ok');
    kosongkanForm();
    await muatData();
  } catch (e) {
    pesanRes(e.message, 'err');
    btn.textContent = teksLama;
  } finally {
    btn.disabled = false;
  }
});

function gambarDaftarRes() {
  const ul = $('#daftar-res');
  if (!ul || !staffTerbuka()) return;
  ul.innerHTML = '';
  if (!KONFIG.API_URL) { ul.innerHTML = '<li class="note">' + t('Belum tersambung ke Apps Script.') + '</li>'; return; }
  const rows = DATA_JADWAL
    .filter(r => r.tanggal > isoHariIni || (r.tanggal === isoHariIni && (r.selesai ?? 0) > menitSekarang))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.mulai ?? 0) - (b.mulai ?? 0));
  if (!rows.length) { ul.innerHTML = '<li class="note">' + t('Belum ada reservasi mendatang.') + '</li>'; return; }
  rows.forEach(r => {
    const [y, m, d] = r.tanggal.split('-').map(Number);
    const tgl = new Date(y, m - 1, d);
    const li = document.createElement('li');
    li.innerHTML = `<span><b>${HARI[tgl.getDay()].slice(0, 3)} ${d} ${BULAN[m - 1].slice(0, 3)}</b>, `
      + `${formatJam(r.mulai)}–${formatJam(r.selesai)}, ${esc(SEMUA_BED().find(b => normBed(b) === r.bed) || r.bed)}`
      + `<br><span class="kode">${esc(r.inisial || r.nama)}${r.status ? ', ' + esc(r.status) : ''}`
      + `${r.rs ? ', ' + esc(r.rs) : ''}${r.ket ? ', ' + esc(r.ket) : ''}</span></span>`;
    if (r.id) {
      const aksi = document.createElement('span');
      aksi.className = 'res-aksi';
      const u = document.createElement('button');
      u.className = 'ubah';
      u.textContent = T('Ubah', 'Edit');
      u.addEventListener('click', () => isiForm(r));
      const b = document.createElement('button');
      b.className = 'hapus';
      b.textContent = T('Hapus', 'Delete');
      b.addEventListener('click', async () => {
        if (!confirm(`Hapus reservasi ${r.inisial || r.nama} pada ${d} ${BULAN[m - 1]}, ${formatJam(r.mulai)}?`)) return;
        b.disabled = true; b.textContent = 'Menghapus…';
        try { await kirimApi({ aksi: 'hapus', id: r.id }); pesanRes('Reservasi dihapus.', 'ok'); await muatData(); }
        catch (e) { pesanRes(e.message, 'err'); b.disabled = false; b.textContent = 'Hapus'; }
      });
      aksi.append(u, b);
      li.appendChild(aksi);
    }
    ul.appendChild(li);
  });
}

function gambarSPO() {
  const ul = $('#daftar-spo');
  ul.innerHTML = '';
  KONFIG.SPO.forEach(d => {
    const li = document.createElement('li');
    const tautan = d.url
      ? `<a href="${d.url}" target="_blank" rel="noopener">Buka dokumen</a>`
      : '<span class="note">belum diunggah</span>';
    li.innerHTML = `<span>${esc(d.judul)}<br><span class="kode">${esc(d.kode)}</span></span>${tautan}`;
    ul.appendChild(li);
  });
}

/* ceklis harian — disimpan di perangkat, per tanggal */

const kunciCeklis = () => 'hd_ceklis_' + isoHariIni;

function bacaCeklis() {
  try { return JSON.parse(localStorage.getItem(kunciCeklis())) || {}; }
  catch (e) { return {}; }
}

function simpanCeklis(data) {
  try { localStorage.setItem(kunciCeklis(), JSON.stringify(data)); } catch (e) { /* mode privat */ }
}

function gambarCeklis() {
  const wrap = $('#ceklis');
  const tersimpan = bacaCeklis();
  wrap.innerHTML = '';
  KONFIG.CEKLIS.forEach((grup, gi) => {
    const card = document.createElement('div');
    card.className = 'ceklis-card';
    card.innerHTML = `<h4>${grup.judul}</h4>`;
    grup.butir.forEach((b, bi) => {
      const id = `c${gi}_${bi}`;
      const lab = document.createElement('label');
      lab.innerHTML = `<input type="checkbox" id="${id}"${tersimpan[id] ? ' checked' : ''}><span>${b}</span>`;
      lab.querySelector('input').addEventListener('change', e => {
        const d = bacaCeklis();
        d[id] = e.target.checked;
        simpanCeklis(d);
      });
      card.appendChild(lab);
    });
    wrap.appendChild(card);
  });
}

$('#salin-ceklis').addEventListener('click', async () => {
  const d = bacaCeklis();
  const baris = [`Ceklis Unit Hemodialisis — ${tanggalPanjang(sekarang)}`];
  KONFIG.CEKLIS.forEach((g, gi) => {
    baris.push('', g.judul);
    g.butir.forEach((b, bi) => baris.push(`${d['c' + gi + '_' + bi] ? '[v]' : '[ ]'} ${b}`));
  });
  const teks = baris.join('\n');
  try {
    await navigator.clipboard.writeText(teks);
    pesanCeklis('Rekap tersalin. Tempel ke buku ceklis atau grup unit.');
  } catch (e) {
    pesanCeklis('Salin otomatis tidak didukung peramban ini. Tandai manual di buku ceklis.');
  }
});

$('#reset-ceklis').addEventListener('click', () => {
  simpanCeklis({});
  gambarCeklis();
  pesanCeklis('Ceklis hari ini dikosongkan.');
});

function pesanCeklis(t) {
  const el = $('#ceklis-pesan');
  el.textContent = t;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

/* ---------------- promo ---------------- */

(function tampilkanPromo() {
  const p = KONFIG.PROMO || {};
  const el = $('#promo-hd');
  if (!el || !p.URL || (p.BATAS && isoHariIni > p.BATAS)) return;
  el.href = p.URL;
  if (p.BATAS) {
    const [y, m, d] = p.BATAS.split('-').map(Number);
    $('#promo-batas').textContent = `Berlaku sampai ${d} ${BULAN[m - 1]} ${y}`;
  }
  el.hidden = false;
})();

/* ---------------- animasi muncul saat digulir ---------------- */

if (GERAK && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('anim');
  // Satu saat masuk yang tertata: isi hero naik berurutan saat halaman dibuka,
  // lalu hanya urutan langkah dan kartu edukasi yang muncul saat digulir.
  // Memunculkan setiap blok dengan gerakan sama membuat halaman terasa templat.
  const target = '.hero-teks > *, .flow li, .edu, .warn';
  const io = new IntersectionObserver(entri => {
    entri.forEach(e => { if (e.isIntersecting) { e.target.classList.add('tampil'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$(target).forEach(el => {
    const saudara = Array.from(el.parentElement.children).filter(x => x.matches(target));
    el.style.setProperty('--d', Math.min(saudara.indexOf(el), 4) * 0.055 + 's');
    el.classList.add('reveal');
    io.observe(el);
  });
}

/* ---------------- testimoni pasien ----------------
   Hanya menampilkan pesan yang pengirimnya mencentang izin tampil. Tidak ada
   testimoni contoh: kutipan buatan yang ditampilkan seolah dari pasien adalah
   kebohongan, sekecil apa pun maksudnya. Selama belum ada yang masuk, bagian
   ini mengatakan apa adanya. */

const BINTANG_PENUH = '★', BINTANG_KOSONG = '☆';

function gambarTestimoni(daftar) {
  const wadah = $('#testi-isi'), catatan = $('#testi-catatan');
  if (!wadah) return;
  wadah.innerHTML = '';
  if (!daftar || !daftar.length) {
    wadah.innerHTML = `<p class="testi-kosong">${
      T('Belum ada testimoni yang ditampilkan. Masukan yang Anda kirim di bawah akan tampil di sini bila Anda mengizinkannya.',
        'No testimonials are shown yet. Feedback you send below will appear here if you allow it.')}</p>`;
    catatan.textContent = '';
    return;
  }
  daftar.slice(0, 6).forEach(r => {
    const nilai = Math.max(0, Math.min(5, Number(r.nilai) || 0));
    const nama = (r.nama || '').trim() || T('Pasien', 'Patient');
    const el = document.createElement('article');
    el.className = 'testi-kartu';
    el.innerHTML = `<span class="petik" aria-hidden="true">&rdquo;</span>`
      + (nilai ? `<p class="bintang-tampil" aria-label="${nilai} ${T('dari', 'of')} 5">`
          + BINTANG_PENUH.repeat(nilai) + BINTANG_KOSONG.repeat(5 - nilai) + '</p>' : '')
      + `<p class="testi-kata">&ldquo;${esc(r.pesan || '')}&rdquo;</p>`
      + `<div class="testi-orang"><span class="testi-awal" aria-hidden="true">${esc(nama[0].toUpperCase())}</span>`
      + `<span class="testi-nama"><b>${esc(nama)}</b><small>${esc(r.kategori || T('Masukan', 'Feedback'))}</small></span></div>`;
    wadah.appendChild(el);
  });
  catatan.textContent = T('Ditampilkan atas izin pengirimnya.', 'Shown with the sender’s permission.');
}

async function muatTestimoni() {
  if (!KONFIG.API_URL) { gambarTestimoni([]); return; }
  try {
    const res = await fetch(KONFIG.API_URL + (KONFIG.API_URL.includes('?') ? '&' : '?')
      + 'aksi=testimoni&t=' + Date.now());
    const d = await res.json();
    gambarTestimoni(d.ok ? d.testimoni : []);
  } catch (e) { gambarTestimoni([]); }
}

/* ---------------- kotak saran ---------------- */

(function kotakSaran() {
  const form = $('#form-saran');
  if (!form) return;
  let nilai = 0;

  const kotakBintang = $('#sr-bintang');
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.nilai = i;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">`
      + `<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>`;
    b.addEventListener('click', () => {
      nilai = i;
      $$('button', kotakBintang).forEach((x, n) => {
        x.classList.toggle('aktif', n < i);
        x.setAttribute('aria-checked', n === i - 1 ? 'true' : 'false');
      });
    });
    kotakBintang.appendChild(b);
  }

  const pesan = $('#sr-pesan'), sisa = $('#sr-sisa');
  pesan.addEventListener('input', () => { sisa.textContent = 600 - pesan.value.length; });

  function status(teks, jenis) {
    const el = $('#sr-status');
    el.textContent = teks;
    el.className = 'sr-pesan ' + (jenis || '');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isi = pesan.value.trim();
    if (isi.length < 10) {
      status(T('Tuliskan pesan Anda lebih dahulu, minimal 10 huruf.',
               'Please write your message first, at least 10 characters.'), 'err');
      pesan.focus();
      return;
    }
    const data = {
      nama: $('#sr-nama').value.trim(),
      kategori: $('#sr-kategori').value,
      pesan: isi,
      nilai: nilai,
      izin: $('#sr-izin').checked,
    };

    if (!KONFIG.API_URL) {
      // Tanpa Apps Script, pesan tidak bisa dikirim diam-diam. Dialihkan ke
      // WhatsApp, dan dikatakan terus terang bahwa jalur itu tidak anonim.
      status(T('Pengiriman lewat situs belum aktif. Pesan Anda dibuka di WhatsApp — jalur ini tidak anonim, nomor Anda akan terlihat petugas.',
               'Sending from the site is not active yet. Your message will open in WhatsApp — that route is not anonymous; staff will see your number.'), 'err');
      const teks = `${data.kategori}${data.nama ? ' dari ' + data.nama : ''}:\n${data.pesan}`
        + (nilai ? `\n\nPenilaian: ${nilai}/5` : '');
      setTimeout(() => window.open('https://wa.me/6285725251288?text=' + encodeURIComponent(teks), '_blank', 'noopener'), 1400);
      return;
    }

    const tombol = $('#sr-kirim'), teksLama = tombol.textContent;
    tombol.disabled = true;
    tombol.textContent = T('Mengirim…', 'Sending…');
    try {
      const res = await fetch(KONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ aksi: 'saran', data }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.pesan || 'Gagal mengirim');
      form.reset();
      nilai = 0;
      $$('button', kotakBintang).forEach(x => { x.classList.remove('aktif'); x.setAttribute('aria-checked', 'false'); });
      sisa.textContent = '600';
      status(T('Terima kasih. Masukan Anda sudah kami terima.',
               'Thank you. We have received your feedback.'), 'ok');
      if (data.izin) muatTestimoni();
    } catch (err) {
      status(T('Pesan gagal dikirim: ', 'Could not send your message: ') + err.message, 'err');
    } finally {
      tombol.disabled = false;
      tombol.textContent = teksLama;
    }
  });
})();

/* ---------------- pemilih bahasa ---------------- */

catatBahasaAsli();
$$('.bhs').forEach(tombol => {
  tombol.addEventListener('click', () => {
    if (tombol.dataset.bhs === BHS) return;
    terapkanBahasa(tombol.dataset.bhs);
    // papan dan daftar berisi teks buatan skrip, jadi digambar ulang
    $('#papan-isi').dataset.tampil = '1';
    $('#papan-sub').textContent = tanggalPanjang(sekarang);
    $('#tanggal-hari-ini').textContent = tanggalPanjang(sekarang);
    gambarPapan($('#papan-isi'), isoHariIni, staffTerbuka());
    hitungStatistik();
    pasangPilihTanggal();
    gambarDaftarRes();
    muatTestimoni();
  });
});

(function bahasaAwal() {
  let pilih = '';
  try { pilih = localStorage.getItem('hd_bahasa') || ''; } catch (e) {}
  if (!pilih && !navigator.language.toLowerCase().startsWith('id')) pilih = 'en';
  terapkanBahasa(pilih === 'en' ? 'en' : 'id');
})();

/* ---------------- jalan ---------------- */

$('#tanggal-hari-ini').textContent = tanggalPanjang(sekarang);
if (staffTerbuka()) bukaStaf();
muatData();
muatTestimoni();
if (KONFIG.API_URL) setInterval(() => { if (!document.hidden) muatData(); }, 120000);   // segarkan tiap 2 menit
setInterval(() => { if (!document.hidden) perbaruiProgres(); }, 30000);                 // bar progres tiap 30 detik
addEventListener('visibilitychange', () => { if (!document.hidden) perbaruiProgres(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
