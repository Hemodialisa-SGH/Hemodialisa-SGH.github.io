/* =========================================================
   Unit Hemodialisa — RS Sedayu General Hospital
   Isi bagian KONFIG di bawah, sisanya tidak perlu diubah.
   ========================================================= */

const KONFIG = {
  // Google Sheet harus dipublikasikan: File > Share > Publish to web.
  // Selama SHEET_ID kosong, papan jadwal menampilkan pesan "belum tersambung".
  // Untuk pratinjau dengan data contoh, buka situs dengan akhiran ?contoh=1
  SHEET_ID: '',
  NAMA_TAB_JADWAL: 'Jadwal',   // kolom: Tanggal | Mulai | Selesai | Bed | Inisial | Akses | Keterangan
  NAMA_TAB_REKAP: 'Rekap',     // kolom: Bulan | Jumlah tindakan
  PIN_STAF: '1906',
  BED: ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4'],
  HARI_DITAMPILKAN: 7,         // jumlah tanggal ke depan pada tab Jadwal
  TELEPON_UNIT: '',            // contoh: '(0274) 123-4567 ext. 210'. Kosongkan bila belum ada.
  INTERKOM_CODE_BLUE: '906',   // hanya tampil di Ruang staf. Pastikan sesuai nomor RS.
  SPO: [
    { kode: '016/HD/RSSGH/2026', judul: 'Pelaksanaan resusitasi code blue di Unit Hemodialisa', url: '' },
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
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const sekarang = new Date();
const MODE_CONTOH = new URLSearchParams(location.search).has('contoh');

const pad = n => String(n).padStart(2, '0');
const isoLokal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tambahHari = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isoHariIni = isoLokal(sekarang);
const menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes();

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

function gambarPapan(target, iso, tampilkanInisial) {
  target.innerHTML = '';
  if (STATUS_DATA === 'kosong' || STATUS_DATA === 'gagal') {
    target.innerHTML = '<p class="note">Jadwal daring belum tersedia. Untuk menanyakan slot kosong atau membuat reservasi, hubungi petugas unit.</p>';
    return;
  }
  const rows = reservasiTanggal(iso);
  const grid = document.createElement('div');
  grid.className = 'bedgrid';

  KONFIG.BED.forEach(b => {
    const isi = rows.filter(r => r.bed === normBed(b));
    const col = document.createElement('div');
    col.className = 'bedcol';
    col.innerHTML = `<h3>${esc(b)}<span>${isi.length ? isi.length + ' sesi' : ''}</span></h3>`;
    if (!isi.length) {
      col.insertAdjacentHTML('beforeend', '<p class="kosong">Belum ada reservasi</p>');
    }
    isi.forEach(r => {
      const berjalan = iso === isoHariIni && r.mulai !== null && r.selesai !== null
        && menitSekarang >= r.mulai && menitSekarang < r.selesai;
      const el = document.createElement('div');
      el.className = 'slot' + (berjalan ? ' now' : '');
      const siapa = tampilkanInisial ? esc(r.inisial || 'terisi') : 'terisi';
      const detail = tampilkanInisial && (r.akses || r.ket)
        ? `<small>${esc([r.akses, r.ket].filter(Boolean).join(' · '))}</small>` : '';
      el.innerHTML = `<b>${formatJam(r.mulai)}–${formatJam(r.selesai)}</b> ${siapa}${berjalan ? ' (berjalan)' : ''}${detail}`;
      col.appendChild(el);
    });
    grid.appendChild(col);
  });
  target.appendChild(grid);
}

function hitungStatistik() {
  const adaData = STATUS_DATA === 'tersambung' || STATUS_DATA === 'contoh';
  const rows = reservasiTanggal(isoHariIni);
  const bedDipakai = new Set(rows.map(r => r.bed)).size;
  const berjalan = new Set(rows.filter(r => r.mulai !== null && r.selesai !== null
    && menitSekarang >= r.mulai && menitSekarang < r.selesai).map(r => r.bed)).size;

  $('.stats').hidden = !adaData;
  $('#stat-pasien').textContent = adaData ? rows.length : '—';
  $('#stat-mesin').textContent = adaData ? bedDipakai : '—';
  $('#stat-mesin-total').textContent = KONFIG.BED.length;
  const bulanIni = BULAN[sekarang.getMonth()];
  const rekap = DATA_REKAP.find(r => (r[0] || '').toLowerCase() === bulanIni.toLowerCase());
  $('#stat-bulan').textContent = rekap ? rekap[1] : '—';
  $('#status-bed').textContent = adaData ? `${berjalan} dari ${KONFIG.BED.length} bed sedang dipakai` : '';
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
  $('#papan-sub').textContent = tanggalPanjang(sekarang);

  if (MODE_CONTOH) {
    DATA_JADWAL = buatContoh();
    DATA_REKAP = CONTOH_REKAP;
    STATUS_DATA = 'contoh';
    tandaiSumberData('Mode pratinjau: data contoh, bukan jadwal sebenarnya.', true);
  } else if (!KONFIG.SHEET_ID) {
    STATUS_DATA = 'kosong';
    tandaiSumberData('', false);
  } else {
    try {
      const jadwal = await ambilSheet(KONFIG.NAMA_TAB_JADWAL);
      DATA_JADWAL = jadwal.baris.map(barisKeReservasi).filter(r => r.tanggal && r.bed);
      STATUS_DATA = 'tersambung';
      tandaiSumberData('Diperbarui langsung dari jadwal reservasi unit.', false);
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
}

function tanggalTerpilih() {
  return $('#pilih-hari [aria-pressed="true"]')?.dataset.iso || isoHariIni;
}

function pasangPilihTanggal() {
  const wrap = $('#pilih-hari');
  wrap.innerHTML = '';
  for (let h = 0; h < KONFIG.HARI_DITAMPILKAN; h++) {
    const d = tambahHari(sekarang, h);
    const b = document.createElement('button');
    b.className = 'day';
    b.dataset.iso = isoLokal(d);
    b.setAttribute('aria-pressed', h === 0 ? 'true' : 'false');
    b.textContent = h === 0 ? `Hari ini, ${d.getDate()}` : `${HARI[d.getDay()].slice(0, 3)} ${d.getDate()}`;
    b.addEventListener('click', () => {
      $$('.day', wrap).forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      gambarPapan($('#jadwal-isi'), b.dataset.iso, staffTerbuka());
    });
    wrap.appendChild(b);
  }
  gambarPapan($('#jadwal-isi'), isoHariIni, staffTerbuka());
}

/* ---------------- kontak ---------------- */

if (KONFIG.TELEPON_UNIT) {
  $('#kontak-unit').innerHTML = `Telepon unit: <strong>${esc(KONFIG.TELEPON_UNIT)}</strong>`;
}

/* ---------------- navigasi tab ---------------- */

$$('.tab').forEach(t => {
  t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('is-on'));
    t.classList.add('is-on');
    $$('.panel').forEach(p => { p.hidden = true; });
    $('#panel-' + t.dataset.panel).hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
});

/* ---------------- ruang staf ---------------- */

const staffTerbuka = () => sessionStorage.getItem('hd_staf') === '1';

function bukaStaf() {
  $('#gerbang-staf').hidden = true;
  $('#isi-staf').hidden = false;
  gambarSPO();
  gambarCeklis();
  gambarRekap();
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
    sessionStorage.setItem('hd_staf', '1');
    $('#pin-pesan').textContent = '';
    $('#pin').value = '';
    bukaStaf();
  } else {
    $('#pin-pesan').textContent = 'PIN belum cocok. Tanyakan kepada penanggung jawab unit.';
  }
});
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#buka-staf').click(); });

$('#kunci-staf').addEventListener('click', () => {
  sessionStorage.removeItem('hd_staf');
  $('#isi-staf').hidden = true;
  $('#gerbang-staf').hidden = false;
  gambarPapan($('#papan-isi'), isoHariIni, false);
  gambarPapan($('#jadwal-isi'), tanggalTerpilih(), false);
});

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
  const baris = [`Ceklis Unit Hemodialisa — ${tanggalPanjang(sekarang)}`];
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

/* ---------------- jalan ---------------- */

$('#tanggal-hari-ini').textContent = tanggalPanjang(sekarang);
if (staffTerbuka()) bukaStaf();
muatData();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
