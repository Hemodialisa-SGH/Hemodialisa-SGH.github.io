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
  API_URL: 'https://script.google.com/macros/s/AKfycbzmm4IrCQDF5og9NwjCq3lE_iupTcKoUMy7_og2hTGnSr4ZbaJnCwn2R6IYYRSivJjO/exec',
  SHEET_ID: '',
  NAMA_TAB_JADWAL: 'Jadwal',   // kolom: Tanggal | Mulai | Selesai | Bed | Inisial | Akses | Keterangan
  NAMA_TAB_REKAP: 'Rekap',     // kolom: Bulan | Jumlah tindakan
  // Hanya dipakai bila API_URL kosong. Saat tersambung ke Apps Script, PIN yang
  // berlaku adalah properti skrip PIN_STAF di sisi server, bukan yang di sini.
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
  // Nama rumah sakit yang pernah dipakai, untuk saran isian Unit asal dan tujuan
  RS_RUJUKAN: ['RS Hermina Yogyakarta', 'RS Panti Rapih Yogyakarta', 'RS PKU Muhammadyah Gamping',
    'RS Bethesda Yogyakarta', 'RSA UGM', 'RSUD Wates', 'RS Panembahan Senopati Bantul',
    'RSUP DR. Sardjito', 'RS DKT Yogyakarta', 'RS Quuen Latifa Yogyakarta', 'RS Prambanan',
    'RS Sakinah Idaman', 'RS PKU Muhammadiyah Bantul', 'RSUD Wirosaban', 'RS Rizki Amalia Temon',
    'Klinik Nitipuran Yogyakarta', 'Klinik Damai'],
  DPJP: ['dr. Dwi Wulansih, Sp.PD, Subs. GH (K)'],
  DOKTER_JAGA: ['dr. Dyah Chandra Suwastiko Putri', 'dr. Andwikorina',
    'dr. Muhammad Nugraha Putra', 'dr. Mahendra'],

  /* Isian register pasien dialisis. Kunci k harus sama dengan nama kolom di
     Google Sheet register; server mencocokkannya lewat baris judul. */
  FORM_REGISTER: [
    { k: 'Tanggal Registrasi', l: 'Tanggal registrasi', t: 'date', v: 'hariini' },
    { k: 'Nama Pasien', l: 'Nama pasien', t: 'text', lebar: 2, ph: 'Tn Budi Santoso', d: 'daftar-pasien' },
    { k: 'No. RM', l: 'No. RM', t: 'text', ph: '002451' },
    { k: 'No. KTP', l: 'No. KTP', t: 'text', ph: '3404xxxxxxxxxxxx' },
    { k: 'Tanggal Lahir', l: 'Tanggal lahir', t: 'date' },
    { k: 'No. Handphone', l: 'No. handphone', t: 'tel', ph: '08xxxxxxxxxx' },
    { k: 'Alamat', l: 'Alamat', t: 'text', lebar: 2, ph: 'Argomulyo, Sedayu, Bantul' },
    { k: 'DPJP', l: 'DPJP', t: 'select', o: 'DPJP', lebar: 2 },
    { k: 'Diagnosis', l: 'Diagnosis', t: 'select', o: ['Endstage Kidney Disease', 'Accute Kidney Injured'] },
    { k: 'Penyebab', l: 'Penyebab', t: 'select', o: ['Hypertension', 'Nefropati Diabetika',
      'Nefropati Diabetika, Hypertension', 'Glomerulonephritis', 'Lain-lain'] },
    { k: 'Penyerta', l: 'Penyerta', t: 'select', o: ['Hypertension', 'Diabetes Mellitus',
      'Cardiovascular Disease', 'Ischaemic Heart Disease', 'Cancer', 'Tidak ada'] },
    { k: 'Akses Vaskuler', l: 'Akses vaskuler', t: 'select', o: ['CDL', 'AV-Shunt', 'Femoral'] },
    { k: 'Lokasi Akses', l: 'Lokasi akses', t: 'select', o: ['SubClavia', 'Jugularis', 'Femoral',
      'Ekst Atas (D)', 'Ekst Atas (S)'] },
    { k: 'Laboratorium', l: 'Laboratorium', t: 'select', o: ['Negatif', 'Positif', 'Belum ada'] },
    { k: 'HB', l: 'HB', t: 'text', ph: 'misal: 8,8' },
    { k: 'Tindakan', l: 'Tindakan', t: 'select', o: ['HD Rutin', 'HD Travelling', 'HD Ekstra'] },
    { k: 'Unit Asal', l: 'Unit asal', t: 'text', d: 'rs-rujukan' },
    { k: 'Unit Tujuan', l: 'Unit tujuan', t: 'text', d: 'rs-rujukan' },
    { k: 'Penanggung Jawab', l: 'Penanggung jawab', t: 'select', o: ['Pribadi / UMUM', 'Promo Gratis', 'BPJS'] },
    { k: 'Status Pasien', l: 'Status pasien', t: 'select', o: ['Rutin', 'Travelling', 'Meninggal'] },
    { k: 'Antrean BPJS', l: 'Antrean BPJS', t: 'select', o: ['Daftar HD BPJS', 'Belum Dapat Tempat',
      'Tidak Daftar', 'Unit Lain'] },
  ],

  /* Isian tindakan harian HD, ditulis ke tab bulan berjalan di Sheet tindakan. */
  FORM_TINDAKAN: [
    { k: 'Tanggal HD', l: 'Tanggal HD', t: 'date', v: 'hariini' },
    { k: 'Jam selesai', l: 'Jam selesai', t: 'time' },
    { k: 'Nama Pasien', l: 'Nama pasien', t: 'pasien', lebar: 2 },
    { k: 'Tanggal Lahir', l: 'Tanggal lahir', t: 'date' },
    { k: 'Jenis Kelamin', l: 'Jenis kelamin', t: 'select', o: ['Laki-laki', 'Perempuan'] },
    { k: 'Jenis Tindakan', l: 'Jenis tindakan', t: 'select', o: ['Rutin', 'Traveling', 'Ekstra',
      'HD 1 Minggu/sekali'] },
    { k: 'Diagnosa', l: 'Diagnosa', t: 'text', v: 'CKD V' },
    { k: 'DPJP', l: 'DPJP', t: 'select', o: 'DPJP', lebar: 2 },
    { k: 'Dokter jaga HD', l: 'Dokter jaga HD', t: 'select', o: 'DOKTER_JAGA', lebar: 2 },
    { k: 'Penjamin', l: 'Penjamin', t: 'select', o: ['Pribadi / Umum', 'Promo Gratis', 'BPJS'] },
    { k: 'Gol. Darah', l: 'Gol. darah', t: 'select', o: ['', 'A', 'B', 'AB', 'O'] },
    { k: 'HB', l: 'HB', t: 'text', ph: 'misal: 7,8' },
    { k: 'Tensi', l: 'Tensi', t: 'text', ph: '120/80' },
    { k: 'HR', l: 'HR', t: 'text', ph: 'x/menit' },
    { k: 'RR', l: 'RR', t: 'text', ph: 'x/menit' },
    { k: 'SUHU', l: 'Suhu', t: 'text', ph: "misal: 36,8" },
    { k: 'SPO2', l: 'SpO2', t: 'text', ph: '%' },
    { k: 'BB Pre', l: 'BB pre', t: 'text', ph: 'kg' },
    { k: 'BB Post', l: 'BB post', t: 'text', ph: 'kg' },
    { k: 'BB Kering', l: 'BB kering', t: 'text', ph: 'kg atau Obs' },
    { k: 'Time Dialisis *)Jam', l: 'Lama dialisis (jam)', t: 'text', ph: 'misal: 4,5' },
    { k: 'UF Goal *)ml', l: 'UF goal (ml)', t: 'text' },
    { k: 'UF Rate *)ml/jam', l: 'UF rate (ml/jam)', t: 'text' },
    { k: 'Quick Blood (QB)', l: 'QB', t: 'text', ph: 'ml/menit' },
    { k: 'Quick Dialisat (QD)', l: 'QD', t: 'text', ph: 'ml/menit' },
    { k: 'Akses', l: 'Akses', t: 'select', o: ['CDL (Catheter Double Lumen)', 'AV-Shunt', 'Femoral'] },
    { k: 'Problem', l: 'Problem akses', t: 'select', o: ['Tidak', 'Ada'] },
    { k: 'Kt/V', l: 'Kt/V', t: 'text' },
    { k: 'Status pasien', l: 'Status pasien', t: 'select', o: ['Pulang', 'Rawat Inap', 'APS'] },
    { k: 'keluhan', l: 'Keluhan saat HD', t: 'text', lebar: 2 },
    { k: 'keterangan', l: 'Keterangan', t: 'text', lebar: 2 },
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
