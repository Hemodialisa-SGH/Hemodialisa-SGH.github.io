/* =========================================================
   Unit Hemodialisa — RS Sedayu General Hospital
   Isi bagian KONFIG di bawah, sisanya tidak perlu diubah.
   ========================================================= */

const KONFIG = {
  // Google Sheet harus dipublikasikan: File > Share > Publish to web.
  // Kosongkan SHEET_ID bila ingin memakai data contoh.
  SHEET_ID: '',
  NAMA_TAB_JADWAL: 'Jadwal',   // kolom: Hari | Shift | Mesin | Inisial | Akses | Keterangan
  NAMA_TAB_REKAP: 'Rekap',     // kolom: Bulan | Jumlah tindakan
  PIN_STAF: '1906',
  MESIN: ['HD-1','HD-2','HD-3','HD-4','HD-5','HD-6','HD-7','HD-8'],
  MESIN_ISOLASI: 'HD-8',       // mesin khusus pasien HBsAg reaktif
  SHIFT: [
    { nama: 'Shift 1', jam: '06.30–11.00', mulai: 6.5,  selesai: 11 },
    { nama: 'Shift 2', jam: '11.30–16.00', mulai: 11.5, selesai: 16 },
    { nama: 'Shift 3', jam: '16.30–21.00', mulai: 16.5, selesai: 21 },
  ],
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
      'Mesin isolasi dipakai hanya untuk pasien HBsAg reaktif',
    ]},
  ],
};

/* ---------------- util ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const hariIni = new Date();
const namaHariIni = HARI[hariIni.getDay()];

function tanggalPanjang(d) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function shiftBerjalan(d) {
  const jam = d.getHours() + d.getMinutes() / 60;
  const s = KONFIG.SHIFT.find(x => jam >= x.mulai && jam < x.selesai);
  if (s) return `${s.nama} berjalan · ${s.jam}`;
  const berikut = KONFIG.SHIFT.find(x => jam < x.mulai);
  return berikut ? `${berikut.nama} mulai ${berikut.jam.split('–')[0]}` : 'Di luar jam layanan';
}

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
      const kolom = res.table.cols.map(c => (c.label || '').trim());
      const baris = res.table.rows.map(r => (r.c || []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.v).trim() : ''));
      selesai({ kolom, baris });
    };

    el.onerror = () => { bersihkan(); gagal(new Error('Sheet tidak dapat dihubungi')); };
    el.src = `https://docs.google.com/spreadsheets/d/${KONFIG.SHEET_ID}/gviz/tq`
           + `?tqx=out:json;responseHandler:${cb}&sheet=${encodeURIComponent(namaTab)}`;
    document.body.appendChild(el);
  });
}

/* ---------------- data contoh (dipakai bila Sheet belum disambungkan) --------------- */

const CONTOH = (() => {
  const inisial = ['S.M','A.R','T.W','B.S','N.H','K.P','R.D','W.A','Y.S','D.K','M.F','L.A','P.N','H.T','G.R','E.S'];
  const akses = ['Fistula','Fistula','Kateter','Fistula'];
  const baris = [];
  let i = 0;
  [['Senin','Rabu','Jumat'], ['Selasa','Kamis','Sabtu']].forEach(kelompok => {
    kelompok.forEach(hari => {
      KONFIG.SHIFT.forEach((s, si) => {
        const jml = si === 2 ? 4 : 6;
        KONFIG.MESIN.slice(0, jml).forEach(m => {
          baris.push([hari, s.nama, m, inisial[i % inisial.length], akses[i % akses.length], '']);
          i++;
        });
      });
    });
  });
  return baris;
})();

const CONTOH_REKAP = [
  ['April', '312'], ['Mei', '328'], ['Juni', '341'],
  ['Juli', '336'], ['Agustus', '352'], ['September', '164'],
];

/* ---------------- papan jadwal ---------------- */

let DATA_JADWAL = [];
let DATA_REKAP = [];
let PAKAI_CONTOH = true;

function barisHari(hari) {
  return DATA_JADWAL.filter(r => (r[0] || '').toLowerCase() === hari.toLowerCase());
}

function gambarPapan(target, hari, tampilkanInisial) {
  const rows = barisHari(hari);
  target.innerHTML = '';

  if (!rows.length) {
    target.innerHTML = `<p class="note">Belum ada jadwal tercatat untuk hari ${hari}.</p>`;
    return;
  }

  KONFIG.SHIFT.forEach(s => {
    const isi = rows.filter(r => (r[1] || '').toLowerCase() === s.nama.toLowerCase());
    const div = document.createElement('div');
    div.className = 'shiftrow';

    const kiri = document.createElement('div');
    kiri.innerHTML = `<span class="shiftname">${s.nama}</span><span class="shifttime">${s.jam}</span>`;

    const beds = document.createElement('div');
    beds.className = 'beds';
    KONFIG.MESIN.forEach(m => {
      const p = isi.find(r => (r[2] || '').toUpperCase() === m.toUpperCase());
      const el = document.createElement('div');
      const isolasi = m === KONFIG.MESIN_ISOLASI;
      el.className = 'bed' + (p ? (isolasi ? ' isolasi' : ' terisi') : '');
      const label = p ? (tampilkanInisial ? (p[3] || 'terisi') : 'terisi') : 'kosong';
      el.innerHTML = `<b>${m}</b>${label}`;
      if (p && p[4]) el.title = `${m} · ${p[4]}${p[5] ? ' · ' + p[5] : ''}`;
      beds.appendChild(el);
    });

    div.append(kiri, beds);
    target.appendChild(div);
  });
}

function hitungStatistik() {
  const rows = barisHari(namaHariIni);
  const mesinTerpakai = new Set(rows.map(r => (r[2] || '').toUpperCase())).size;
  $('#stat-pasien').textContent = rows.length || '0';
  $('#stat-mesin').textContent = mesinTerpakai || '0';
  $('#stat-mesin-total').textContent = KONFIG.MESIN.length;
  const bulanIni = BULAN[hariIni.getMonth()];
  const rekap = DATA_REKAP.find(r => (r[0] || '').toLowerCase() === bulanIni.toLowerCase());
  $('#stat-bulan').textContent = rekap ? rekap[1] : '—';
}

function gambarRekap() {
  const wrap = $('#rekap-bar');
  if (!wrap) return;
  wrap.innerHTML = '';
  const data = DATA_REKAP.slice(-6);
  if (!data.length) { wrap.innerHTML = '<p class="note">Belum ada data rekap.</p>'; return; }
  const maks = Math.max(...data.map(d => Number(d[1]) || 0)) || 1;
  data.forEach(d => {
    const b = document.createElement('div');
    b.className = 'bar';
    const lebar = Math.round((Number(d[1]) || 0) / maks * 100);
    b.innerHTML = `<span>${d[0]}</span><i style="width:${lebar}%"></i><b>${d[1]}</b>`;
    wrap.appendChild(b);
  });
  $('#rekap-ket').textContent = PAKAI_CONTOH
    ? 'Angka contoh. Sambungkan Google Sheet untuk menampilkan rekap sebenarnya.'
    : 'Jumlah tindakan hemodialisis per bulan, sesuai tab Rekap pada Google Sheet.';
}

function tandaiSumberData(pesan, demo) {
  const el = $('#papan-status');
  el.textContent = pesan;
  el.classList.toggle('demo', !!demo);
}

async function muatData() {
  $('#papan-sub').textContent = tanggalPanjang(hariIni);
  try {
    const jadwal = await ambilSheet(KONFIG.NAMA_TAB_JADWAL);
    DATA_JADWAL = jadwal.baris.filter(r => r[0]);
    PAKAI_CONTOH = false;
    tandaiSumberData('Tersambung ke Google Sheets unit.', false);
    try {
      const rekap = await ambilSheet(KONFIG.NAMA_TAB_REKAP);
      DATA_REKAP = rekap.baris.filter(r => r[0]);
    } catch (e) { DATA_REKAP = []; }
  } catch (e) {
    DATA_JADWAL = CONTOH;
    DATA_REKAP = CONTOH_REKAP;
    PAKAI_CONTOH = true;
    tandaiSumberData(
      KONFIG.SHEET_ID
        ? `Data contoh ditampilkan. ${e.message}. Periksa apakah Sheet sudah dipublikasikan dan nama tab sesuai.`
        : 'Data contoh ditampilkan. Isi SHEET_ID pada assets/js/app.js untuk menyambungkan jadwal sebenarnya.',
      true
    );
  }

  gambarPapan($('#papan-isi'), namaHariIni, staffTerbuka());
  hitungStatistik();
  gambarRekap();
  pasangPilihHari();
}

function pasangPilihHari() {
  const wrap = $('#pilih-hari');
  wrap.innerHTML = '';
  ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].forEach(h => {
    const b = document.createElement('button');
    b.className = 'day' + (h === namaHariIni ? ' is-on' : '');
    b.textContent = h;
    b.addEventListener('click', () => {
      $$('.day', wrap).forEach(x => x.classList.remove('is-on'));
      b.classList.add('is-on');
      gambarPapan($('#jadwal-isi'), h, staffTerbuka());
    });
    wrap.appendChild(b);
  });
  gambarPapan($('#jadwal-isi'), namaHariIni, staffTerbuka());
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
  gambarPapan($('#papan-isi'), namaHariIni, true);
  gambarPapan($('#jadwal-isi'), $('.day.is-on')?.textContent || namaHariIni, true);
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
  gambarPapan($('#papan-isi'), namaHariIni, false);
  gambarPapan($('#jadwal-isi'), $('.day.is-on')?.textContent || namaHariIni, false);
});

function gambarSPO() {
  const ul = $('#daftar-spo');
  ul.innerHTML = '';
  KONFIG.SPO.forEach(d => {
    const li = document.createElement('li');
    const tautan = d.url
      ? `<a href="${d.url}" target="_blank" rel="noopener">Buka dokumen</a>`
      : '<span class="note">belum diunggah</span>';
    li.innerHTML = `<span>${d.judul}<br><span class="kode">${d.kode}</span></span>${tautan}`;
    ul.appendChild(li);
  });
}

/* ceklis harian — disimpan di perangkat, per tanggal */

const kunciCeklis = () => 'hd_ceklis_' + hariIni.toISOString().slice(0, 10);

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
  const baris = [`Ceklis Unit Hemodialisa — ${tanggalPanjang(hariIni)}`];
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

$('#tanggal-hari-ini').textContent = tanggalPanjang(hariIni);
$('#shift-berjalan').textContent = shiftBerjalan(hariIni);
if (staffTerbuka()) bukaStaf();
muatData();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
