/**
 * ==================================================================
 *  SMART BENGKEL INVENTORY — Sistem Pengurusan Stok Bengkel RBT
 *  Code.gs : API, pengesahan, kebenaran akses dan operasi data
 * ------------------------------------------------------------------
 *  Nota keselamatan:
 *  - Hanya fungsi tanpa garis bawah (_) di hujung nama boleh dipanggil
 *    dari pelayar. Fungsi awam: doGet, doPost, api (+ fungsi setup yang
 *    dikawal oleh requireEditor_).
 *  - Setiap tindakan disemak sesi & peranan di pelayan (ROUTES).
 *  - Kata laluan disimpan sebagai hash SHA-256 berulang + salt + pepper.
 * ==================================================================
 */

const APP = {
  NAMA: 'SMART BENGKEL INVENTORY',
  TZ: 'Asia/Kuala_Lumpur',
  SESI_SAAT: 6 * 60 * 60,          // 6 jam (had maksimum CacheService)
  HASH_ITER: 1000,                 // bilangan ulangan hash kata laluan
  MAX_CUBAAN: 5,                   // cubaan log masuk gagal sebelum dikunci
  KUNCI_MINIT: 15,                 // tempoh akaun dikunci
  MAX_GAMBAR_BAIT: 5 * 1024 * 1024 // 5MB
};

const PERANAN = { ADMIN: 'Admin', PENYELARAS: 'Guru Penyelaras Bengkel', GURU: 'Guru Biasa' };
const SEMUA = [PERANAN.ADMIN, PERANAN.PENYELARAS, PERANAN.GURU];
const PENGURUS = [PERANAN.ADMIN, PERANAN.PENYELARAS];
const ADMIN_SAHAJA = [PERANAN.ADMIN];

const MSG_STOK = 'STOK TIDAK MENCUKUPI. SILA SEMAK KUANTITI TERSEDIA.';

const SENARAI = {
  KATEGORI_LALAI: ['Alatan Tangan', 'Alatan Mesin', 'Peralatan Elektrik', 'Komponen Elektronik', 'Bahan Kayu',
    'Bahan Logam', 'Bahan Plastik', 'Bahan Fertigasi', 'Bahan Akuaponik', 'Alatan Jahitan', 'Bahan Habis Guna', 'Lain-lain'],
  JENIS_BARANG: ['Aset / Peralatan (Boleh Dipinjam)', 'Bahan Habis Guna', 'Komponen / Alat Ganti'],
  UNIT: ['Unit', 'Set', 'Pasang', 'Batang', 'Keping', 'Helai', 'Meter', 'Gulung', 'Kotak', 'Pek', 'Liter', 'Kilogram', 'Gram'],
  KEADAAN_BARANG: ['Baharu', 'Baik', 'Rosak Ringan', 'Rosak Teruk', 'Tidak Boleh Digunakan'],
  JENIS_MASUK: ['Pembelian', 'Sumbangan', 'Pemulangan', 'Pelarasan'],
  JENIS_KELUAR: ['Penggunaan Bahan Habis Guna', 'Pinjaman Peralatan', 'Pelupusan', 'Pelarasan Stok'],
  JENIS_KELUAR_GURU: ['Penggunaan Bahan Habis Guna', 'Pinjaman Peralatan'],
  KEADAAN_PULANG: ['Baik', 'Rosak Ringan', 'Rosak Teruk', 'Hilang'],
  STATUS_PENGGUNA: ['Aktif', 'Menunggu Kelulusan', 'Tidak Aktif'],
  PERANAN: [PERANAN.ADMIN, PERANAN.PENYELARAS, PERANAN.GURU]
};

const SCHEMA = {
  BARANG: ['ID_BARANG', 'KOD_BARANG', 'NAMA_BARANG', 'KATEGORI', 'JENIS_BARANG', 'UNIT_UKURAN', 'KUANTITI_AWAL',
    'STOK_SEMASA', 'DIPINJAM', 'STOK_MINIMUM', 'LOKASI', 'RAK_ALMARI', 'JENAMA', 'MODEL', 'HARGA_SEUNIT', 'PEMBEKAL',
    'TARIKH_PEMBELIAN', 'KEADAAN', 'GAMBAR_URL', 'CATATAN', 'STATUS_REKOD', 'DIDAFTAR_OLEH', 'DIDAFTAR_PADA', 'DIKEMASKINI_PADA'],
  BARANG_MASUK: ['ID_TRANSAKSI', 'TARIKH_MASA', 'ID_BARANG', 'KOD_BARANG', 'NAMA_BARANG', 'KUANTITI', 'JENIS_TRANSAKSI',
    'SUMBER', 'NO_DOKUMEN', 'NAMA_GURU', 'ID_PENGGUNA', 'CATATAN', 'STOK_SEBELUM', 'STOK_SELEPAS'],
  BARANG_KELUAR: ['ID_TRANSAKSI', 'TARIKH_MASA', 'ID_BARANG', 'KOD_BARANG', 'NAMA_BARANG', 'KUANTITI', 'NAMA_PEMINJAM',
    'KELAS_UNIT', 'TUJUAN', 'JENIS_PENGELUARAN', 'TARIKH_JANGKA_PULANG', 'GURU_PELULUS', 'ID_PEMOHON', 'NAMA_PEMOHON',
    'STATUS', 'ID_PINJAMAN', 'CATATAN', 'STOK_SEBELUM', 'STOK_SELEPAS', 'DIPROSES_PADA', 'SEBAB_TOLAK'],
  PINJAMAN: ['ID_PINJAMAN', 'ID_TRANSAKSI_KELUAR', 'TARIKH_PINJAM', 'ID_BARANG', 'KOD_BARANG', 'NAMA_BARANG', 'NAMA_PEMINJAM',
    'KELAS_UNIT', 'KUANTITI_DIPINJAM', 'KUANTITI_DIPULANGKAN', 'BAKI', 'TARIKH_JANGKA_PULANG', 'STATUS', 'GURU_PELULUS',
    'ID_PEMOHON', 'DIKEMASKINI_PADA'],
  PEMULANGAN: ['ID_PEMULANGAN', 'ID_PINJAMAN', 'TARIKH_PULANG', 'ID_BARANG', 'KOD_BARANG', 'NAMA_BARANG', 'NAMA_PEMINJAM',
    'KUANTITI_DIPINJAM', 'KUANTITI_DIPULANGKAN', 'BAKI_SELEPAS', 'KEADAAN', 'GURU_PENERIMA', 'ID_PENGGUNA', 'CATATAN', 'DIREKOD_PADA'],
  PENGGUNA: ['ID_PENGGUNA', 'NAMA', 'EMEL', 'NO_TELEFON', 'PERANAN', 'STATUS', 'SALT', 'HASH', 'DICIPTA_PADA',
    'LOG_MASUK_TERAKHIR', 'CUBAAN_GAGAL', 'DIKUNCI_HINGGA', 'VERSI_SESI'],
  LOKASI: ['ID_LOKASI', 'NAMA_LOKASI', 'KETERANGAN', 'RAK_ALMARI', 'STATUS', 'DICIPTA_PADA'],
  KATEGORI: ['ID_KATEGORI', 'NAMA_KATEGORI', 'KETERANGAN', 'STATUS', 'DICIPTA_PADA'],
  LOG_AKTIVITI: ['ID_LOG', 'TARIKH_MASA', 'ID_PENGGUNA', 'NAMA_PENGGUNA', 'PERANAN', 'TINDAKAN', 'MODUL', 'RUJUKAN', 'BUTIRAN'],
  TETAPAN: ['KUNCI', 'NILAI', 'KETERANGAN'],
  RINGKASAN: ['METRIK', 'NILAI', 'DIKEMASKINI_PADA']
};

const NOMBOR = {
  BARANG: ['KUANTITI_AWAL', 'STOK_SEMASA', 'DIPINJAM', 'STOK_MINIMUM', 'HARGA_SEUNIT'],
  BARANG_MASUK: ['KUANTITI', 'STOK_SEBELUM', 'STOK_SELEPAS'],
  BARANG_KELUAR: ['KUANTITI', 'STOK_SEBELUM', 'STOK_SELEPAS'],
  PINJAMAN: ['KUANTITI_DIPINJAM', 'KUANTITI_DIPULANGKAN', 'BAKI'],
  PEMULANGAN: ['KUANTITI_DIPINJAM', 'KUANTITI_DIPULANGKAN', 'BAKI_SELEPAS'],
  PENGGUNA: ['CUBAAN_GAGAL', 'DIKUNCI_HINGGA', 'VERSI_SESI'],
  RINGKASAN: ['NILAI']
};
const TARIKH_SAHAJA = ['TARIKH_PEMBELIAN', 'TARIKH_JANGKA_PULANG', 'TARIKH_PULANG'];

const TETAPAN_DIBENARKAN = ['NAMA_SEKOLAH', 'NAMA_BENGKEL', 'ALAMAT_SEKOLAH', 'KELULUSAN_PENDAFTARAN', 'ADMIN_EMAIL'];

class AppError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AppError';
    this.code = code || 'ERR';
  }
}

/* =========================== JADUAL LALUAN API =========================== */
const ROUTES = {
  ping:              { fn: ping_ },
  getPublicConfig:   { fn: getPublicConfig_ },
  login:             { fn: login_ },
  register:          { fn: register_ },
  requestReset:      { fn: requestReset_ },
  resetPassword:     { fn: resetPassword_ },

  me:                { roles: SEMUA, fn: me_ },
  logout:            { roles: SEMUA, fn: logout_ },
  updateProfile:     { roles: SEMUA, fn: updateProfile_ },
  changePassword:    { roles: SEMUA, fn: changePassword_ },
  getMeta:           { roles: SEMUA, fn: getMeta_ },
  getDashboard:      { roles: SEMUA, fn: getDashboard_ },

  listBarang:        { roles: SEMUA, fn: listBarang_ },
  getBarang:         { roles: SEMUA, fn: getBarang_ },
  createBarang:      { roles: PENGURUS, fn: createBarang_ },
  updateBarang:      { roles: PENGURUS, fn: updateBarang_ },
  archiveBarang:     { roles: PENGURUS, fn: archiveBarang_ },
  deleteBarang:      { roles: ADMIN_SAHAJA, fn: deleteBarang_ },

  stokMasuk:         { roles: PENGURUS, fn: stokMasuk_ },
  stokKeluar:        { roles: SEMUA, fn: stokKeluar_ },
  listPermohonan:    { roles: SEMUA, fn: listPermohonan_ },
  approvePermohonan: { roles: PENGURUS, fn: approvePermohonan_ },
  rejectPermohonan:  { roles: PENGURUS, fn: rejectPermohonan_ },
  cancelPermohonan:  { roles: SEMUA, fn: cancelPermohonan_ },

  listPinjaman:      { roles: SEMUA, fn: listPinjaman_ },
  pemulangan:        { roles: PENGURUS, fn: pemulangan_ },
  listPemulangan:    { roles: PENGURUS, fn: listPemulangan_ },

  listLokasi:        { roles: SEMUA, fn: listLokasi_ },
  saveLokasi:        { roles: PENGURUS, fn: saveLokasi_ },
  listKategori:      { roles: SEMUA, fn: listKategori_ },
  saveKategori:      { roles: ADMIN_SAHAJA, fn: saveKategori_ },

  listTransaksi:     { roles: SEMUA, fn: listTransaksi_ },
  getReport:         { roles: PENGURUS, fn: getReport_ },

  listUsers:         { roles: ADMIN_SAHAJA, fn: listUsers_ },
  updateUser:        { roles: ADMIN_SAHAJA, fn: updateUser_ },
  resetUserPassword: { roles: ADMIN_SAHAJA, fn: resetUserPassword_ },
  getTetapan:        { roles: ADMIN_SAHAJA, fn: getTetapan_ },
  saveTetapan:       { roles: ADMIN_SAHAJA, fn: saveTetapan_ }
};

/* =========================== TITIK MASUK =========================== */

/** Paparkan aplikasi web. */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Smart Bengkel Inventory — Bengkel RBT')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * API JSON untuk frontend yang dihoskan di luar Apps Script (cth: GitHub Pages).
 * Frontend mesti hantar POST dengan Content-Type: text/plain supaya tiada preflight CORS.
 */
function doPost(e) {
  let body = null;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    body = null;
  }
  const res = body ? api(body) : { ok: false, error: 'Permintaan tidak sah.', code: 'BAD_REQUEST' };
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Pintu masuk tunggal API. Dipanggil melalui google.script.run.api(req) atau doPost.
 * req = { action: string, payload: object, token: string }
 */
function api(req) {
  resetReq_();
  try {
    req = req || {};
    const action = String(req.action || '');
    const route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null;
    if (!route) throw new AppError('Tindakan tidak dikenali.', 'BAD_REQUEST');
    const payload = (req.payload && typeof req.payload === 'object') ? req.payload : {};
    let user = null;
    if (route.roles) {
      user = requireSession_(req.token);
      if (route.roles.indexOf(user.PERANAN) < 0) {
        throw new AppError('Anda tiada kebenaran untuk melakukan tindakan ini.', 'FORBIDDEN');
      }
    }
    const data = route.fn(payload, user, req.token);
    return { ok: true, data: JSON.parse(JSON.stringify(data === undefined ? null : data, safeReplacer_)) };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, code: err.code };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'Ralat sistem berlaku. Sila cuba lagi atau hubungi pentadbir.', code: 'SERVER' };
  }
}

function safeReplacer_(key, value) {
  if (key === '_row' || key === 'SALT' || key === 'HASH' || key === 'VERSI_SESI') return undefined;
  return value;
}

/* =========================== UTILITI DATA =========================== */

let REQ = { cache: {}, hdr: {} };
function resetReq_() { REQ = { cache: {}, hdr: {} }; }

function getProps_() { return PropertiesService.getScriptProperties(); }

function getSS_() {
  if (getSS_.cache) return getSS_.cache;
  const id = getProps_().getProperty('SPREADSHEET_ID');
  if (!id) throw new AppError('Sistem belum disediakan. Pentadbir perlu menjalankan setupDatabase() dahulu.', 'SETUP');
  try {
    getSS_.cache = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new AppError('Google Sheets pangkalan data tidak dapat dibuka. Semak SPREADSHEET_ID dalam Script Properties.', 'SETUP');
  }
  return getSS_.cache;
}

function sheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) throw new AppError('Sheet "' + name + '" tidak dijumpai. Jalankan setupDatabase() semula.', 'SETUP');
  return sh;
}

function headerMap_(name) {
  if (REQ.hdr[name]) return REQ.hdr[name];
  const sh = sheet_(name);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new AppError('Sheet ' + name + ' tiada header. Jalankan setupDatabase() semula.', 'SETUP');
  const row = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); });
  const map = { _len: lastCol };
  row.forEach(function (h, i) { if (h && !(h in map)) map[h] = i; });
  SCHEMA[name].forEach(function (h) {
    if (!(h in map)) throw new AppError('Lajur ' + h + ' tiada dalam sheet ' + name + '. Jalankan setupDatabase() semula.', 'SETUP');
  });
  REQ.hdr[name] = map;
  return map;
}

function norm_(sheet, h, v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, APP.TZ, TARIKH_SAHAJA.indexOf(h) >= 0 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  }
  if ((NOMBOR[sheet] || []).indexOf(h) >= 0) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  return (v === null || v === undefined) ? '' : String(v);
}

/** Baca keseluruhan sheet sebagai senarai objek (dicache bagi satu permintaan). */
function readTable_(name) {
  if (REQ.cache[name]) return REQ.cache[name];
  const sh = sheet_(name);
  const map = headerMap_(name);
  const last = sh.getLastRow();
  let rows = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, map._len).getValues();
    const key0 = SCHEMA[name][0];
    rows = vals.map(function (r, i) {
      const o = { _row: i + 2 };
      SCHEMA[name].forEach(function (h) { o[h] = norm_(name, h, r[map[h]]); });
      return o;
    }).filter(function (o) { return o[key0] !== ''; });
  }
  REQ.cache[name] = rows;
  return rows;
}

/**
 * Sediakan nilai untuk ditulis ke sel. Semua teks diberi awalan petikan (')
 * supaya Sheets tidak menukar teks kepada formula, nombor atau tarikh
 * (cegah formula injection & kehilangan sifar di hadapan no. telefon).
 */
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  let s = String(v);
  if (s.length > 5000) s = s.slice(0, 5000);
  if (s === '') return '';
  return "'" + s;
}

function appendRow_(name, obj) {
  const map = headerMap_(name);
  const row = new Array(map._len).fill('');
  SCHEMA[name].forEach(function (h) { row[map[h]] = cell_(obj[h]); });
  sheet_(name).appendRow(row);
  delete REQ.cache[name];
}

function updateRow_(name, rowNum, patch) {
  const map = headerMap_(name);
  const rng = sheet_(name).getRange(rowNum, 1, 1, map._len);
  const row = rng.getValues()[0].map(cell_);
  Object.keys(patch).forEach(function (h) {
    if (h !== '_len' && Object.prototype.hasOwnProperty.call(map, h)) row[map[h]] = cell_(patch[h]);
  });
  rng.setValues([row]);
  delete REQ.cache[name];
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new AppError('Sistem sedang sibuk memproses transaksi lain. Sila cuba sebentar lagi.', 'BUSY');
  }
  REQ.cache = {};
  try {
    const result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function now_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }

function randomHex_(n) {
  let s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}

function genId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), APP.TZ, 'yyMMdd-HHmmss') + '-' + randomHex_(4).toUpperCase();
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function fmtTarikh_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s || '');
}

function tetapanMap_() {
  const m = {};
  readTable_('TETAPAN').forEach(function (r) { m[r.KUNCI] = r.NILAI; });
  return m;
}

function setTetapan_(kunci, nilai, keterangan) {
  const row = readTable_('TETAPAN').find(function (r) { return r.KUNCI === kunci; });
  if (row) updateRow_('TETAPAN', row._row, { NILAI: nilai });
  else appendRow_('TETAPAN', { KUNCI: kunci, NILAI: nilai, KETERANGAN: keterangan || '' });
}

function log_(user, tindakan, modul, rujukan, butiran) {
  appendRow_('LOG_AKTIVITI', {
    ID_LOG: genId_('LOG'),
    TARIKH_MASA: now_(),
    ID_PENGGUNA: user ? user.ID_PENGGUNA : '',
    NAMA_PENGGUNA: user ? user.NAMA : '',
    PERANAN: user ? user.PERANAN : '',
    TINDAKAN: tindakan,
    MODUL: modul,
    RUJUKAN: rujukan || '',
    BUTIRAN: butiran || ''
  });
}

/* =========================== VALIDASI =========================== */

function str_(v, label, opt) {
  opt = opt || {};
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  if (opt.wajib && !s) throw new AppError(label + ' wajib diisi.', 'VALIDATION');
  const max = opt.max || 200;
  if (s.length > max) throw new AppError(label + ' terlalu panjang (maksimum ' + max + ' aksara).', 'VALIDATION');
  return s;
}

function int_(v, label, opt) {
  opt = opt || {};
  const wajib = opt.wajib !== false;
  if (v === '' || v === null || v === undefined) {
    if (wajib) throw new AppError(label + ' wajib diisi.', 'VALIDATION');
    return 0;
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw new AppError(label + ' mesti nombor bulat.', 'VALIDATION');
  const min = opt.min === undefined ? 0 : opt.min;
  const max = opt.max === undefined ? 10000000 : opt.max;
  if (n < min || n > max) throw new AppError(label + ' mesti antara ' + min + ' dan ' + max + '.', 'VALIDATION');
  return n;
}

function num_(v, label, opt) {
  opt = opt || {};
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!isFinite(n)) throw new AppError(label + ' mesti nombor.', 'VALIDATION');
  const min = opt.min === undefined ? 0 : opt.min;
  const max = opt.max === undefined ? 100000000 : opt.max;
  if (n < min || n > max) throw new AppError(label + ' mesti antara ' + min + ' dan ' + max + '.', 'VALIDATION');
  return Math.round(n * 100) / 100;
}

function date_(v, label, opt) {
  opt = opt || {};
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  if (!s) {
    if (opt.wajib) throw new AppError(label + ' wajib diisi.', 'VALIDATION');
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AppError(label + ' tidak sah.', 'VALIDATION');
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new AppError(label + ' tidak sah.', 'VALIDATION');
  return s;
}

function oneOf_(v, list, label) {
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  if (!s) throw new AppError(label + ' wajib dipilih.', 'VALIDATION');
  if (list.indexOf(s) < 0) throw new AppError(label + ' tidak sah.', 'VALIDATION');
  return s;
}

function emel_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 120) throw new AppError('Alamat emel tidak sah.', 'VALIDATION');
  return s;
}

function kataLaluan_(v) {
  const s = String(v || '');
  if (s.length < 8) throw new AppError('Kata laluan mesti sekurang-kurangnya 8 aksara.', 'VALIDATION');
  if (s.length > 100) throw new AppError('Kata laluan terlalu panjang.', 'VALIDATION');
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) throw new AppError('Kata laluan mesti mengandungi huruf dan nombor.', 'VALIDATION');
  return s;
}

function kod_(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) throw new AppError('Kod barang wajib diisi.', 'VALIDATION');
  if (!/^[A-Z0-9][A-Z0-9\-_/.]{1,29}$/.test(s)) {
    throw new AppError('Kod barang hanya boleh mengandungi huruf, nombor, -, _, / atau . (2–30 aksara).', 'VALIDATION');
  }
  return s;
}

/* =========================== KESELAMATAN =========================== */

function hashPassword_(pw, salt) {
  const pepper = getProps_().getProperty('PEPPER') || '';
  let h = salt + '|' + pw + '|' + pepper;
  for (let i = 0; i < APP.HASH_ITER; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function hashShort_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

function safeEq_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function createSession_(u) {
  const token = randomHex_(64);
  CacheService.getScriptCache().put('S_' + token,
    JSON.stringify({ uid: u.ID_PENGGUNA, v: Number(u.VERSI_SESI) || 0 }), APP.SESI_SAAT);
  return token;
}

function requireSession_(token) {
  const authErr = new AppError('Sesi anda telah tamat. Sila log masuk semula.', 'AUTH');
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw authErr;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('S_' + token);
  if (!raw) throw authErr;
  let s;
  try { s = JSON.parse(raw); } catch (e) { throw authErr; }
  const user = readTable_('PENGGUNA').find(function (u) { return u.ID_PENGGUNA === s.uid; });
  if (!user || user.STATUS !== 'Aktif' || (Number(user.VERSI_SESI) || 0) !== s.v) {
    cache.remove('S_' + token);
    throw authErr;
  }
  cache.put('S_' + token, raw, APP.SESI_SAAT); // sesi gelongsor
  return user;
}

function publicUser_(u) {
  return {
    ID_PENGGUNA: u.ID_PENGGUNA, NAMA: u.NAMA, EMEL: u.EMEL, NO_TELEFON: u.NO_TELEFON,
    PERANAN: u.PERANAN, STATUS: u.STATUS, DICIPTA_PADA: u.DICIPTA_PADA, LOG_MASUK_TERAKHIR: u.LOG_MASUK_TERAKHIR
  };
}

function isPengurus_(user) { return PENGURUS.indexOf(user.PERANAN) >= 0; }

/** Hanya pemilik skrip yang menjalankan dari editor dibenarkan (lindungi fungsi setup). */
function requireEditor_() {
  const eff = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const act = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!eff || !act || eff !== act) {
    throw new Error('Fungsi ini hanya boleh dijalankan oleh pemilik skrip dari editor Apps Script.');
  }
}

/* =========================== PENGESAHAN PENGGUNA =========================== */

function ping_() { return { masa: now_() }; }

function getPublicConfig_() {
  const t = tetapanMap_();
  return {
    namaSekolah: t.NAMA_SEKOLAH || '',
    namaBengkel: t.NAMA_BENGKEL || '',
    kelulusan: (t.KELULUSAN_PENDAFTARAN || 'YA') === 'YA'
  };
}

function register_(p) {
  const nama = str_(p.nama, 'Nama penuh', { wajib: true, max: 100 });
  const emel = emel_(p.emel);
  const tel = str_(p.telefon, 'No. telefon', { max: 20 });
  if (tel && !/^[0-9+\-\s]{7,20}$/.test(tel)) throw new AppError('No. telefon tidak sah.', 'VALIDATION');
  const pw = kataLaluan_(p.kataLaluan);
  const salt = randomHex_(32);
  const hash = hashPassword_(pw, salt);

  return withLock_(function () {
    const users = readTable_('PENGGUNA');
    if (users.some(function (u) { return u.EMEL.toLowerCase() === emel; })) {
      throw new AppError('Emel ini telah didaftarkan.', 'VALIDATION');
    }
    const t = tetapanMap_();
    const adminEmel = String(t.ADMIN_EMAIL || '').trim().toLowerCase();
    const adaAdmin = users.some(function (u) { return u.PERANAN === PERANAN.ADMIN && u.STATUS === 'Aktif'; });
    let peranan = PERANAN.GURU;
    let status = (t.KELULUSAN_PENDAFTARAN || 'YA') === 'YA' ? 'Menunggu Kelulusan' : 'Aktif';
    if (!adaAdmin && adminEmel && emel === adminEmel) {
      peranan = PERANAN.ADMIN;
      status = 'Aktif';
    }
    const u = {
      ID_PENGGUNA: genId_('USR'), NAMA: nama, EMEL: emel, NO_TELEFON: tel, PERANAN: peranan, STATUS: status,
      SALT: salt, HASH: hash, DICIPTA_PADA: now_(), LOG_MASUK_TERAKHIR: '', CUBAAN_GAGAL: 0, DIKUNCI_HINGGA: 0, VERSI_SESI: 0
    };
    appendRow_('PENGGUNA', u);
    log_(u, 'Daftar akaun', 'Pengguna', u.ID_PENGGUNA, 'Peranan: ' + peranan + ', Status: ' + status);
    return {
      status: status,
      peranan: peranan,
      mesej: status === 'Aktif'
        ? (peranan === PERANAN.ADMIN ? 'Akaun Admin berjaya dicipta. Sila log masuk.' : 'Pendaftaran berjaya. Sila log masuk.')
        : 'Pendaftaran berjaya. Akaun anda sedang menunggu kelulusan admin.'
    };
  });
}

function login_(p) {
  const emel = String(p.emel || '').trim().toLowerCase();
  const pw = String(p.kataLaluan || '');
  if (!emel || !pw) throw new AppError('Sila masukkan emel dan kata laluan.', 'VALIDATION');
  const GENERIC = 'Emel atau kata laluan tidak sah.';

  return withLock_(function () {
    const u = readTable_('PENGGUNA').find(function (x) { return x.EMEL.toLowerCase() === emel; });
    if (!u) throw new AppError(GENERIC, 'LOGIN');
    const nowMs = Date.now();
    if (u.DIKUNCI_HINGGA && u.DIKUNCI_HINGGA > nowMs) {
      const min = Math.ceil((u.DIKUNCI_HINGGA - nowMs) / 60000);
      throw new AppError('Akaun dikunci sementara kerana terlalu banyak cubaan gagal. Cuba semula dalam ' + min + ' minit.', 'LOCKED');
    }
    if (!safeEq_(hashPassword_(pw, u.SALT), u.HASH)) {
      const gagal = (Number(u.CUBAAN_GAGAL) || 0) + 1;
      const patch = { CUBAAN_GAGAL: gagal };
      if (gagal >= APP.MAX_CUBAAN) {
        patch.DIKUNCI_HINGGA = nowMs + APP.KUNCI_MINIT * 60000;
        patch.CUBAAN_GAGAL = 0;
      }
      updateRow_('PENGGUNA', u._row, patch);
      log_(u, 'Log masuk gagal', 'Pengesahan', u.ID_PENGGUNA, 'Cubaan gagal ke-' + gagal);
      throw new AppError(GENERIC, 'LOGIN');
    }
    if (u.STATUS === 'Menunggu Kelulusan') throw new AppError('Akaun anda masih menunggu kelulusan admin.', 'PENDING');
    if (u.STATUS !== 'Aktif') throw new AppError('Akaun anda tidak aktif. Sila hubungi admin.', 'INACTIVE');
    updateRow_('PENGGUNA', u._row, { CUBAAN_GAGAL: 0, DIKUNCI_HINGGA: 0, LOG_MASUK_TERAKHIR: now_() });
    const token = createSession_(u);
    log_(u, 'Log masuk', 'Pengesahan', u.ID_PENGGUNA, '');
    return { token: token, user: publicUser_(u) };
  });
}

function requestReset_(p) {
  const emel = emel_(p.emel);
  const mesej = 'Jika emel tersebut berdaftar dan aktif, kod tetapan semula telah dihantar. Sila semak peti masuk (dan folder spam).';
  const cache = CacheService.getScriptCache();
  const key = 'RST_' + hashShort_(emel).replace(/[^A-Za-z0-9]/g, '');
  const sedia = cache.get(key);
  if (sedia) {
    try { if (Date.now() - JSON.parse(sedia).t < 60000) return { mesej: mesej }; } catch (e) { /* abaikan */ }
  }
  const u = readTable_('PENGGUNA').find(function (x) { return x.EMEL.toLowerCase() === emel && x.STATUS === 'Aktif'; });
  if (!u) return { mesej: mesej };
  const kod = String(parseInt(randomHex_(8), 16) % 1000000).padStart(6, '0');
  cache.put(key, JSON.stringify({ h: hashShort_(kod + '|' + u.SALT), t: Date.now(), c: 0 }), 900);
  MailApp.sendEmail({
    to: u.EMEL,
    subject: '[Smart Bengkel Inventory] Kod Tetapan Semula Kata Laluan',
    body: 'Salam ' + u.NAMA + ',\n\n' +
      'Kod tetapan semula kata laluan anda ialah: ' + kod + '\n\n' +
      'Kod ini sah selama 15 minit. Jika anda tidak memohon, abaikan emel ini.\n\n' +
      '— Smart Bengkel Inventory'
  });
  withLock_(function () { log_(u, 'Mohon tetapan semula kata laluan', 'Pengesahan', u.ID_PENGGUNA, ''); });
  return { mesej: mesej };
}

function resetPassword_(p) {
  const emel = emel_(p.emel);
  const kod = String(p.kod || '').trim();
  if (!/^\d{6}$/.test(kod)) throw new AppError('Kod mesti 6 digit.', 'VALIDATION');
  const pw = kataLaluan_(p.kataLaluanBaru);
  const cache = CacheService.getScriptCache();
  const key = 'RST_' + hashShort_(emel).replace(/[^A-Za-z0-9]/g, '');
  const raw = cache.get(key);
  const salah = new AppError('Kod tidak sah atau telah tamat tempoh.', 'VALIDATION');
  if (!raw) throw salah;
  const e = JSON.parse(raw);
  const salt = randomHex_(32);
  const hash = hashPassword_(pw, salt);
  return withLock_(function () {
    const u = readTable_('PENGGUNA').find(function (x) { return x.EMEL.toLowerCase() === emel; });
    if (!u) throw salah;
    if (e.c >= 5) { cache.remove(key); throw new AppError('Terlalu banyak cubaan. Sila mohon kod baharu.', 'VALIDATION'); }
    if (!safeEq_(hashShort_(kod + '|' + u.SALT), e.h)) {
      e.c++;
      cache.put(key, JSON.stringify(e), 900);
      throw salah;
    }
    updateRow_('PENGGUNA', u._row, {
      SALT: salt, HASH: hash, CUBAAN_GAGAL: 0, DIKUNCI_HINGGA: 0, VERSI_SESI: (Number(u.VERSI_SESI) || 0) + 1
    });
    cache.remove(key);
    log_(u, 'Tetapan semula kata laluan', 'Pengesahan', u.ID_PENGGUNA, 'Melalui kod emel');
    return { mesej: 'Kata laluan berjaya ditetapkan semula. Sila log masuk.' };
  });
}

function me_(p, user) { return { user: publicUser_(user) }; }

function logout_(p, user, token) {
  CacheService.getScriptCache().remove('S_' + token);
  withLock_(function () { log_(user, 'Log keluar', 'Pengesahan', user.ID_PENGGUNA, ''); });
  return { mesej: 'Anda telah log keluar.' };
}

function updateProfile_(p, user) {
  const nama = str_(p.nama, 'Nama penuh', { wajib: true, max: 100 });
  const tel = str_(p.telefon, 'No. telefon', { max: 20 });
  if (tel && !/^[0-9+\-\s]{7,20}$/.test(tel)) throw new AppError('No. telefon tidak sah.', 'VALIDATION');
  return withLock_(function () {
    const u = readTable_('PENGGUNA').find(function (x) { return x.ID_PENGGUNA === user.ID_PENGGUNA; });
    updateRow_('PENGGUNA', u._row, { NAMA: nama, NO_TELEFON: tel });
    log_(user, 'Kemas kini profil', 'Pengguna', user.ID_PENGGUNA, '');
    u.NAMA = nama; u.NO_TELEFON = tel;
    return { user: publicUser_(u), mesej: 'Profil berjaya dikemas kini.' };
  });
}

function changePassword_(p, user) {
  const lama = String(p.kataLaluanLama || '');
  const baru = kataLaluan_(p.kataLaluanBaru);
  if (!safeEq_(hashPassword_(lama, user.SALT), user.HASH)) throw new AppError('Kata laluan semasa tidak betul.', 'VALIDATION');
  const salt = randomHex_(32);
  const hash = hashPassword_(baru, salt);
  return withLock_(function () {
    const u = readTable_('PENGGUNA').find(function (x) { return x.ID_PENGGUNA === user.ID_PENGGUNA; });
    const versi = (Number(u.VERSI_SESI) || 0) + 1;
    updateRow_('PENGGUNA', u._row, { SALT: salt, HASH: hash, VERSI_SESI: versi });
    log_(user, 'Tukar kata laluan', 'Pengguna', user.ID_PENGGUNA, '');
    u.VERSI_SESI = versi;
    return { token: createSession_(u), mesej: 'Kata laluan berjaya ditukar.' };
  });
}

/* =========================== META & TETAPAN =========================== */

function getMeta_(p, user) {
  const t = tetapanMap_();
  return {
    kategori: readTable_('KATEGORI').filter(function (k) { return k.STATUS !== 'Tidak Aktif'; }).map(function (k) { return k.NAMA_KATEGORI; }),
    lokasi: readTable_('LOKASI').filter(function (l) { return l.STATUS !== 'Tidak Aktif'; }).map(function (l) {
      return { NAMA_LOKASI: l.NAMA_LOKASI, RAK_ALMARI: l.RAK_ALMARI, KETERANGAN: l.KETERANGAN };
    }),
    senarai: SENARAI,
    tetapan: { NAMA_SEKOLAH: t.NAMA_SEKOLAH || '', NAMA_BENGKEL: t.NAMA_BENGKEL || '', ALAMAT_SEKOLAH: t.ALAMAT_SEKOLAH || '' },
    hariIni: today_()
  };
}

function getTetapan_() {
  const t = tetapanMap_();
  const out = {};
  TETAPAN_DIBENARKAN.forEach(function (k) { out[k] = t[k] || ''; });
  out.KELULUSAN_PENDAFTARAN = out.KELULUSAN_PENDAFTARAN || 'YA';
  return out;
}

function saveTetapan_(p, user) {
  const data = {
    NAMA_SEKOLAH: str_(p.NAMA_SEKOLAH, 'Nama sekolah', { max: 150 }),
    NAMA_BENGKEL: str_(p.NAMA_BENGKEL, 'Nama bengkel', { max: 150 }),
    ALAMAT_SEKOLAH: str_(p.ALAMAT_SEKOLAH, 'Alamat sekolah', { max: 300 }),
    KELULUSAN_PENDAFTARAN: oneOf_(p.KELULUSAN_PENDAFTARAN || 'YA', ['YA', 'TIDAK'], 'Tetapan kelulusan pendaftaran'),
    ADMIN_EMAIL: p.ADMIN_EMAIL ? emel_(p.ADMIN_EMAIL) : ''
  };
  return withLock_(function () {
    Object.keys(data).forEach(function (k) { setTetapan_(k, data[k]); });
    log_(user, 'Kemas kini tetapan sistem', 'Tetapan', '', Object.keys(data).join(', '));
    return { mesej: 'Tetapan sistem berjaya disimpan.' };
  });
}

/* =========================== BARANG =========================== */

function statusStok_(b) {
  const s = Number(b.STOK_SEMASA) || 0;
  if (s <= 0) return 'Habis Stok';
  if (s <= (Number(b.STOK_MINIMUM) || 0)) return 'Stok Rendah';
  return 'Mencukupi';
}

function barangOut_(b, user) {
  const o = {};
  SCHEMA.BARANG.forEach(function (h) { o[h] = b[h]; });
  o.STATUS_STOK = statusStok_(b);
  o.JUMLAH_DIMILIKI = (Number(b.STOK_SEMASA) || 0) + (Number(b.DIPINJAM) || 0);
  if (user && user.PERANAN === PERANAN.GURU) {
    delete o.HARGA_SEUNIT; delete o.PEMBEKAL; delete o.DIDAFTAR_OLEH;
  }
  return o;
}

function findBarang_(id) {
  const s = String(id || '');
  if (!s) return null;
  return readTable_('BARANG').find(function (b) { return b.ID_BARANG === s; }) || null;
}

function listBarang_(p, user) {
  let rows = readTable_('BARANG');
  if (user.PERANAN === PERANAN.GURU) rows = rows.filter(function (b) { return b.STATUS_REKOD !== 'Arkib'; });
  return rows.map(function (b) { return barangOut_(b, user); });
}

function getBarang_(p, user) {
  const b = findBarang_(p.id);
  if (!b || (user.PERANAN === PERANAN.GURU && b.STATUS_REKOD === 'Arkib')) throw new AppError('Barang tidak dijumpai.', 'NOT_FOUND');
  const sejarah = buildTransaksi_(user, { idBarang: b.ID_BARANG }).slice(0, 300);
  const adaTransaksi = buildTransaksi_(null, { idBarang: b.ID_BARANG }).length > 0;
  return { barang: barangOut_(b, user), sejarah: sejarah, adaTransaksi: adaTransaksi };
}

function senaraiAktif_(sheet, field) {
  return readTable_(sheet).filter(function (r) { return r.STATUS !== 'Tidak Aktif'; }).map(function (r) { return r[field]; });
}

function validateBarang_(p, semasa) {
  const kategori = senaraiAktif_('KATEGORI', 'NAMA_KATEGORI');
  const lokasi = senaraiAktif_('LOKASI', 'NAMA_LOKASI');
  if (semasa) {
    if (kategori.indexOf(semasa.KATEGORI) < 0) kategori.push(semasa.KATEGORI);
    if (lokasi.indexOf(semasa.LOKASI) < 0) lokasi.push(semasa.LOKASI);
  }
  return {
    NAMA_BARANG: str_(p.nama, 'Nama barang', { wajib: true, max: 150 }),
    KATEGORI: oneOf_(p.kategori, kategori, 'Kategori'),
    JENIS_BARANG: oneOf_(p.jenis, SENARAI.JENIS_BARANG, 'Jenis barang'),
    UNIT_UKURAN: str_(p.unit, 'Unit ukuran', { wajib: true, max: 30 }),
    STOK_MINIMUM: int_(p.stokMinimum, 'Stok minimum', { min: 0, max: 1000000 }),
    LOKASI: oneOf_(p.lokasi, lokasi, 'Lokasi bengkel'),
    RAK_ALMARI: str_(p.rak, 'Rak / Almari', { max: 60 }),
    JENAMA: str_(p.jenama, 'Jenama', { max: 80 }),
    MODEL: str_(p.model, 'Model', { max: 80 }),
    HARGA_SEUNIT: num_(p.harga, 'Harga seunit', { min: 0, max: 10000000 }),
    PEMBEKAL: str_(p.pembekal, 'Pembekal', { max: 150 }),
    TARIKH_PEMBELIAN: date_(p.tarikhBeli, 'Tarikh pembelian'),
    KEADAAN: oneOf_(p.keadaan, SENARAI.KEADAAN_BARANG, 'Keadaan barang'),
    CATATAN: str_(p.catatan, 'Catatan', { max: 500 })
  };
}

function createBarang_(p, user) {
  const kod = kod_(p.kod);
  const d = validateBarang_(p, null);
  const qty = int_(p.kuantitiAwal, 'Kuantiti awal', { min: 0, max: 1000000, wajib: false });
  if (d.TARIKH_PEMBELIAN && d.TARIKH_PEMBELIAN > today_()) throw new AppError('Tarikh pembelian tidak boleh pada masa hadapan.', 'VALIDATION');
  const wujud = function () {
    return readTable_('BARANG').some(function (b) { return b.KOD_BARANG.toUpperCase() === kod; });
  };
  if (wujud()) throw new AppError('Kod barang "' + kod + '" telah didaftarkan. Sila guna kod lain.', 'DUPLICATE');
  const gambarUrl = p.gambar ? uploadGambar_(p.gambar, kod) : '';

  return withLock_(function () {
    if (wujud()) throw new AppError('Kod barang "' + kod + '" telah didaftarkan. Sila guna kod lain.', 'DUPLICATE');
    const ts = now_();
    const id = genId_('BRG');
    const b = Object.assign({
      ID_BARANG: id, KOD_BARANG: kod, KUANTITI_AWAL: qty, STOK_SEMASA: qty, DIPINJAM: 0, GAMBAR_URL: gambarUrl,
      STATUS_REKOD: 'Aktif', DIDAFTAR_OLEH: user.NAMA, DIDAFTAR_PADA: ts, DIKEMASKINI_PADA: ts
    }, d);
    appendRow_('BARANG', b);
    if (qty > 0) {
      appendRow_('BARANG_MASUK', {
        ID_TRANSAKSI: genId_('BM'), TARIKH_MASA: ts, ID_BARANG: id, KOD_BARANG: kod, NAMA_BARANG: d.NAMA_BARANG,
        KUANTITI: qty, JENIS_TRANSAKSI: 'Stok Awal', SUMBER: d.PEMBEKAL || 'Pendaftaran barang', NO_DOKUMEN: '',
        NAMA_GURU: user.NAMA, ID_PENGGUNA: user.ID_PENGGUNA, CATATAN: 'Kuantiti awal semasa pendaftaran barang',
        STOK_SEBELUM: 0, STOK_SELEPAS: qty
      });
    }
    log_(user, 'Daftar barang', 'Barang', id, kod + ' — ' + d.NAMA_BARANG + ' (kuantiti awal ' + qty + ')');
    updateRingkasan_();
    return { id: id, mesej: 'Barang "' + d.NAMA_BARANG + '" berjaya didaftarkan.' };
  });
}

function updateBarang_(p, user) {
  const asal = findBarang_(p.id);
  if (!asal) throw new AppError('Barang tidak dijumpai.', 'NOT_FOUND');
  const d = validateBarang_(p, asal);
  if (d.TARIKH_PEMBELIAN && d.TARIKH_PEMBELIAN > today_()) throw new AppError('Tarikh pembelian tidak boleh pada masa hadapan.', 'VALIDATION');
  let gambarUrl = null;
  if (p.gambar) gambarUrl = uploadGambar_(p.gambar, asal.KOD_BARANG);
  else if (p.buangGambar) gambarUrl = '';

  return withLock_(function () {
    const b = findBarang_(p.id);
    if (!b) throw new AppError('Barang tidak dijumpai.', 'NOT_FOUND');
    const patch = Object.assign({}, d, { DIKEMASKINI_PADA: now_() });
    if (gambarUrl !== null) patch.GAMBAR_URL = gambarUrl;
    const berubah = Object.keys(d).filter(function (k) { return String(b[k]) !== String(d[k]); });
    if (gambarUrl !== null) berubah.push('GAMBAR_URL');
    updateRow_('BARANG', b._row, patch);
    log_(user, 'Kemas kini barang', 'Barang', b.ID_BARANG, b.KOD_BARANG + ' — medan: ' + (berubah.join(', ') || 'tiada perubahan'));
    updateRingkasan_();
    return { id: b.ID_BARANG, mesej: 'Maklumat barang berjaya dikemas kini.' };
  });
}

function archiveBarang_(p, user) {
  const arkib = p.arkib !== false;
  return withLock_(function () {
    const b = findBarang_(p.id);
    if (!b) throw new AppError('Barang tidak dijumpai.', 'NOT_FOUND');
    if (arkib) {
      if (b.DIPINJAM > 0) throw new AppError('Barang ini masih mempunyai pinjaman aktif (' + b.DIPINJAM + ' unit). Selesaikan pemulangan dahulu.', 'VALIDATION');
      const menunggu = readTable_('BARANG_KELUAR').some(function (k) { return k.ID_BARANG === b.ID_BARANG && k.STATUS === 'Menunggu Kelulusan'; });
      if (menunggu) throw new AppError('Barang ini mempunyai permohonan pengeluaran yang belum diproses.', 'VALIDATION');
    }
    updateRow_('BARANG', b._row, { STATUS_REKOD: arkib ? 'Arkib' : 'Aktif', DIKEMASKINI_PADA: now_() });
    log_(user, arkib ? 'Arkib barang' : 'Pulih barang dari arkib', 'Barang', b.ID_BARANG, b.KOD_BARANG + ' — ' + b.NAMA_BARANG);
    updateRingkasan_();
    return { mesej: arkib ? 'Barang telah diarkibkan.' : 'Barang telah dipulihkan dari arkib.' };
  });
}

function deleteBarang_(p, user) {
  return withLock_(function () {
    const b = findBarang_(p.id);
    if (!b) throw new AppError('Barang tidak dijumpai.', 'NOT_FOUND');
    if (buildTransaksi_(null, { idBarang: b.ID_BARANG }).length > 0 ||
        readTable_('PINJAMAN').some(function (x) { return x.ID_BARANG === b.ID_BARANG; })) {
      throw new AppError('Barang ini sudah mempunyai rekod transaksi dan tidak boleh dipadam kekal. Gunakan fungsi Arkib.', 'VALIDATION');
    }
    sheet_('BARANG').deleteRow(b._row);
    delete REQ.cache.BARANG;
    log_(user, 'Padam barang', 'Barang', b.ID_BARANG, b.KOD_BARANG + ' — ' + b.NAMA_BARANG);
    updateRingkasan_();
    return { mesej: 'Barang telah dipadam.' };
  });
}

/* =========================== GAMBAR (GOOGLE DRIVE) =========================== */

function folderGambar_() {
  const id = tetapanMap_().DRIVE_FOLDER_ID;
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder dipadam — cipta semula */ }
  }
  const folder = DriveApp.createFolder('SMART BENGKEL INVENTORY — Gambar Barang');
  withLock_(function () { setTetapan_('DRIVE_FOLDER_ID', folder.getId(), 'Folder Google Drive untuk gambar barang'); });
  return folder;
}

function uploadGambar_(g, kod) {
  if (!g || typeof g !== 'object' || !g.data) return '';
  const mime = String(g.mime || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) {
    throw new AppError('Format gambar tidak disokong. Guna JPG, PNG atau WEBP.', 'VALIDATION');
  }
  const data = String(g.data);
  if (data.length > APP.MAX_GAMBAR_BAIT * 1.37) throw new AppError('Saiz gambar melebihi 5MB.', 'VALIDATION');
  let bytes;
  try { bytes = Utilities.base64Decode(data); } catch (e) { throw new AppError('Data gambar rosak.', 'VALIDATION'); }
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const nama = String(kod).replace(/[^A-Za-z0-9\-_]/g, '_') + '_' + Date.now() + '.' + ext;
  const file = folderGambar_().createFile(Utilities.newBlob(bytes, mime, nama));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('Tidak dapat menetapkan perkongsian gambar: ' + e);
  }
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
}

/* =========================== BARANG MASUK =========================== */

function stokMasuk_(p, user) {
  const qty = int_(p.kuantiti, 'Kuantiti masuk', { min: 1, max: 1000000 });
  const jenis = oneOf_(p.jenis, SENARAI.JENIS_MASUK, 'Jenis transaksi');
  const sumber = str_(p.sumber, 'Sumber / Pembekal', { max: 150 });
  const noDok = str_(p.noDokumen, 'No. dokumen', { max: 60 });
  const catatan = str_(p.catatan, 'Catatan', { max: 500 });

  return withLock_(function () {
    const b = findBarang_(p.idBarang);                                      // 1. semak kewujudan barang
    if (!b) throw new AppError('Barang tidak dijumpai. Sila pilih kod barang yang sah.', 'NOT_FOUND');
    if (b.STATUS_REKOD === 'Arkib') throw new AppError('Barang ini telah diarkibkan.', 'VALIDATION');
    const ts = now_();
    const sebelum = Number(b.STOK_SEMASA) || 0;
    const selepas = sebelum + qty;
    const id = genId_('BM');
    appendRow_('BARANG_MASUK', {                                            // 2. rekod transaksi
      ID_TRANSAKSI: id, TARIKH_MASA: ts, ID_BARANG: b.ID_BARANG, KOD_BARANG: b.KOD_BARANG, NAMA_BARANG: b.NAMA_BARANG,
      KUANTITI: qty, JENIS_TRANSAKSI: jenis, SUMBER: sumber, NO_DOKUMEN: noDok, NAMA_GURU: user.NAMA,
      ID_PENGGUNA: user.ID_PENGGUNA, CATATAN: catatan, STOK_SEBELUM: sebelum, STOK_SELEPAS: selepas
    });
    updateRow_('BARANG', b._row, { STOK_SEMASA: selepas, DIKEMASKINI_PADA: ts }); // 3. tambah stok
    log_(user, 'Barang masuk', 'Barang Masuk', id, b.KOD_BARANG + ' +' + qty + ' (' + jenis + ') ' + sebelum + '→' + selepas); // 4. log
    updateRingkasan_();                                                     // 5. kemas kini ringkasan
    return { id: id, stokSemasa: selepas, mesej: 'Barang masuk berjaya direkodkan. Stok semasa ' + b.NAMA_BARANG + ': ' + selepas + ' ' + b.UNIT_UKURAN + '.' };
  });
}

/* =========================== BARANG KELUAR & PERMOHONAN =========================== */

function stokKeluar_(p, user) {
  const isGuru = user.PERANAN === PERANAN.GURU;
  const qty = int_(p.kuantiti, 'Kuantiti keluar', { min: 1, max: 1000000 });
  const jenis = oneOf_(p.jenis, isGuru ? SENARAI.JENIS_KELUAR_GURU : SENARAI.JENIS_KELUAR, 'Jenis pengeluaran');
  const peminjam = str_(p.peminjam, 'Nama peminjam / pengguna', { wajib: true, max: 100 });
  const kelas = str_(p.kelas, 'Kelas / Unit', { max: 60 });
  const tujuan = str_(p.tujuan, 'Tujuan penggunaan', { wajib: true, max: 200 });
  const catatan = str_(p.catatan, 'Catatan', { max: 500 });
  let jangka = '';
  if (jenis === 'Pinjaman Peralatan') {
    jangka = date_(p.tarikhJangkaPulang, 'Tarikh jangka pulang', { wajib: true });
    if (jangka < today_()) throw new AppError('Tarikh jangka pulang tidak boleh lebih awal daripada hari ini.', 'VALIDATION');
  }

  return withLock_(function () {
    const b = findBarang_(p.idBarang);
    if (!b) throw new AppError('Barang tidak dijumpai. Sila pilih kod barang yang sah.', 'NOT_FOUND');
    if (b.STATUS_REKOD === 'Arkib') throw new AppError('Barang ini telah diarkibkan.', 'VALIDATION');
    if (qty > (Number(b.STOK_SEMASA) || 0)) throw new AppError(MSG_STOK, 'STOK');
    const ts = now_();
    const tx = {
      ID_TRANSAKSI: genId_('BK'), TARIKH_MASA: ts, ID_BARANG: b.ID_BARANG, KOD_BARANG: b.KOD_BARANG, NAMA_BARANG: b.NAMA_BARANG,
      KUANTITI: qty, NAMA_PEMINJAM: peminjam, KELAS_UNIT: kelas, TUJUAN: tujuan, JENIS_PENGELUARAN: jenis,
      TARIKH_JANGKA_PULANG: jangka, GURU_PELULUS: '', ID_PEMOHON: user.ID_PENGGUNA, NAMA_PEMOHON: user.NAMA,
      STATUS: 'Menunggu Kelulusan', ID_PINJAMAN: '', CATATAN: catatan, STOK_SEBELUM: '', STOK_SELEPAS: '',
      DIPROSES_PADA: '', SEBAB_TOLAK: ''
    };
    if (isGuru) {
      appendRow_('BARANG_KELUAR', tx);
      log_(user, 'Hantar permohonan pengeluaran', 'Barang Keluar', tx.ID_TRANSAKSI, b.KOD_BARANG + ' x' + qty + ' (' + jenis + ')');
      return { id: tx.ID_TRANSAKSI, status: tx.STATUS, mesej: 'Permohonan pengeluaran dihantar dan sedang menunggu kelulusan.' };
    }
    laksanaKeluar_(tx, b, user);
    appendRow_('BARANG_KELUAR', tx);
    log_(user, 'Barang keluar', 'Barang Keluar', tx.ID_TRANSAKSI,
      b.KOD_BARANG + ' -' + qty + ' (' + jenis + ') ' + tx.STOK_SEBELUM + '→' + tx.STOK_SELEPAS + (tx.ID_PINJAMAN ? ' | ' + tx.ID_PINJAMAN : ''));
    updateRingkasan_();
    return {
      id: tx.ID_TRANSAKSI, status: tx.STATUS, idPinjaman: tx.ID_PINJAMAN, stokSemasa: tx.STOK_SELEPAS,
      mesej: 'Barang keluar berjaya direkodkan. Baki stok tersedia: ' + tx.STOK_SELEPAS + ' ' + b.UNIT_UKURAN + '.'
    };
  });
}

/** Tolak stok & cipta rekod pinjaman. Mesti dipanggil dalam withLock_. */
function laksanaKeluar_(tx, b, pelulus) {
  const sebelum = Number(b.STOK_SEMASA) || 0;
  if (tx.KUANTITI > sebelum) throw new AppError(MSG_STOK, 'STOK');
  const ts = now_();
  const selepas = sebelum - tx.KUANTITI;
  const patch = { STOK_SEMASA: selepas, DIKEMASKINI_PADA: ts };
  tx.STATUS = 'Diluluskan';
  tx.GURU_PELULUS = pelulus.NAMA;
  tx.STOK_SEBELUM = sebelum;
  tx.STOK_SELEPAS = selepas;
  tx.DIPROSES_PADA = ts;
  if (tx.JENIS_PENGELUARAN === 'Pinjaman Peralatan') {
    const pid = genId_('PJ');
    tx.ID_PINJAMAN = pid;
    patch.DIPINJAM = (Number(b.DIPINJAM) || 0) + tx.KUANTITI;
    appendRow_('PINJAMAN', {
      ID_PINJAMAN: pid, ID_TRANSAKSI_KELUAR: tx.ID_TRANSAKSI, TARIKH_PINJAM: ts, ID_BARANG: b.ID_BARANG,
      KOD_BARANG: b.KOD_BARANG, NAMA_BARANG: b.NAMA_BARANG, NAMA_PEMINJAM: tx.NAMA_PEMINJAM, KELAS_UNIT: tx.KELAS_UNIT,
      KUANTITI_DIPINJAM: tx.KUANTITI, KUANTITI_DIPULANGKAN: 0, BAKI: tx.KUANTITI, TARIKH_JANGKA_PULANG: tx.TARIKH_JANGKA_PULANG,
      STATUS: 'Aktif', GURU_PELULUS: pelulus.NAMA, ID_PEMOHON: tx.ID_PEMOHON, DIKEMASKINI_PADA: ts
    });
  }
  updateRow_('BARANG', b._row, patch);
}

function cariPermohonan_(id) {
  const tx = readTable_('BARANG_KELUAR').find(function (k) { return k.ID_TRANSAKSI === String(id || ''); });
  if (!tx) throw new AppError('Permohonan tidak dijumpai.', 'NOT_FOUND');
  if (tx.STATUS !== 'Menunggu Kelulusan') throw new AppError('Permohonan ini telah diproses (' + tx.STATUS + ').', 'VALIDATION');
  return tx;
}

function approvePermohonan_(p, user) {
  return withLock_(function () {
    const tx = cariPermohonan_(p.id);
    const b = findBarang_(tx.ID_BARANG);
    if (!b) throw new AppError('Barang bagi permohonan ini tidak dijumpai.', 'NOT_FOUND');
    if (b.STATUS_REKOD === 'Arkib') throw new AppError('Barang ini telah diarkibkan.', 'VALIDATION');
    laksanaKeluar_(tx, b, user);
    updateRow_('BARANG_KELUAR', tx._row, {
      STATUS: tx.STATUS, GURU_PELULUS: tx.GURU_PELULUS, STOK_SEBELUM: tx.STOK_SEBELUM, STOK_SELEPAS: tx.STOK_SELEPAS,
      DIPROSES_PADA: tx.DIPROSES_PADA, ID_PINJAMAN: tx.ID_PINJAMAN
    });
    log_(user, 'Lulus permohonan pengeluaran', 'Barang Keluar', tx.ID_TRANSAKSI,
      tx.KOD_BARANG + ' -' + tx.KUANTITI + ' untuk ' + tx.NAMA_PEMOHON + ' ' + tx.STOK_SEBELUM + '→' + tx.STOK_SELEPAS);
    updateRingkasan_();
    return { mesej: 'Permohonan diluluskan. Stok telah dikemas kini.' };
  });
}

function rejectPermohonan_(p, user) {
  const sebab = str_(p.sebab, 'Sebab penolakan', { wajib: true, max: 200 });
  return withLock_(function () {
    const tx = cariPermohonan_(p.id);
    updateRow_('BARANG_KELUAR', tx._row, { STATUS: 'Ditolak', GURU_PELULUS: user.NAMA, DIPROSES_PADA: now_(), SEBAB_TOLAK: sebab });
    log_(user, 'Tolak permohonan pengeluaran', 'Barang Keluar', tx.ID_TRANSAKSI, tx.KOD_BARANG + ' — ' + sebab);
    return { mesej: 'Permohonan telah ditolak.' };
  });
}

function cancelPermohonan_(p, user) {
  return withLock_(function () {
    const tx = cariPermohonan_(p.id);
    if (tx.ID_PEMOHON !== user.ID_PENGGUNA) throw new AppError('Anda hanya boleh membatalkan permohonan sendiri.', 'FORBIDDEN');
    updateRow_('BARANG_KELUAR', tx._row, { STATUS: 'Dibatalkan', DIPROSES_PADA: now_() });
    log_(user, 'Batal permohonan pengeluaran', 'Barang Keluar', tx.ID_TRANSAKSI, tx.KOD_BARANG);
    return { mesej: 'Permohonan telah dibatalkan.' };
  });
}

function listPermohonan_(p, user) {
  const semua = readTable_('BARANG_KELUAR');
  const desc = function (a, b) { return a.TARIKH_MASA < b.TARIKH_MASA ? 1 : -1; };
  if (user.PERANAN === PERANAN.GURU) {
    const sendiri = semua.filter(function (k) { return k.ID_PEMOHON === user.ID_PENGGUNA; }).sort(desc);
    return { menunggu: sendiri.filter(function (k) { return k.STATUS === 'Menunggu Kelulusan'; }), sejarah: sendiri.slice(0, 50) };
  }
  return {
    menunggu: semua.filter(function (k) { return k.STATUS === 'Menunggu Kelulusan'; }).sort(function (a, b) { return a.TARIKH_MASA > b.TARIKH_MASA ? 1 : -1; }),
    sejarah: semua.filter(function (k) { return k.STATUS !== 'Menunggu Kelulusan'; })
      .sort(function (a, b) { return (a.DIPROSES_PADA || a.TARIKH_MASA) < (b.DIPROSES_PADA || b.TARIKH_MASA) ? 1 : -1; }).slice(0, 15)
  };
}

/* =========================== PINJAMAN & PEMULANGAN =========================== */

function listPinjaman_(p, user) {
  const hari = today_();
  let rows = readTable_('PINJAMAN');
  if (user.PERANAN === PERANAN.GURU) rows = rows.filter(function (r) { return r.ID_PEMOHON === user.ID_PENGGUNA; });
  if (p.status) rows = rows.filter(function (r) { return r.STATUS === p.status; });
  return rows.map(function (r) {
    const o = Object.assign({}, r);
    o.LEWAT = r.STATUS === 'Aktif' && r.TARIKH_JANGKA_PULANG && r.TARIKH_JANGKA_PULANG < hari;
    return o;
  }).sort(function (a, b) { return a.TARIKH_PINJAM < b.TARIKH_PINJAM ? 1 : -1; });
}

function pemulangan_(p, user) {
  const qty = int_(p.kuantiti, 'Kuantiti dipulangkan', { min: 1, max: 1000000 });
  const keadaan = oneOf_(p.keadaan, SENARAI.KEADAAN_PULANG, 'Keadaan barang');
  const tarikh = p.tarikhPulang ? date_(p.tarikhPulang, 'Tarikh pulang') : today_();
  if (tarikh > today_()) throw new AppError('Tarikh pulang tidak boleh pada masa hadapan.', 'VALIDATION');
  const catatan = str_(p.catatan, 'Catatan', { max: 500 });

  return withLock_(function () {
    const loan = readTable_('PINJAMAN').find(function (r) { return r.ID_PINJAMAN === String(p.idPinjaman || ''); });
    if (!loan) throw new AppError('Rekod pinjaman tidak dijumpai.', 'NOT_FOUND');
    if (loan.STATUS !== 'Aktif') throw new AppError('Pinjaman ini telah selesai dipulangkan.', 'VALIDATION');
    if (qty > loan.BAKI) throw new AppError('Kuantiti dipulangkan melebihi baki pinjaman (' + loan.BAKI + ' unit).', 'VALIDATION');
    if (tarikh < String(loan.TARIKH_PINJAM).slice(0, 10)) throw new AppError('Tarikh pulang tidak boleh lebih awal daripada tarikh pinjaman.', 'VALIDATION');
    const b = findBarang_(loan.ID_BARANG);
    if (!b) throw new AppError('Barang bagi pinjaman ini tidak dijumpai.', 'NOT_FOUND');

    const ts = now_();
    const dipulang = loan.KUANTITI_DIPULANGKAN + qty;
    const baki = loan.BAKI - qty;
    const id = genId_('PL');
    appendRow_('PEMULANGAN', {
      ID_PEMULANGAN: id, ID_PINJAMAN: loan.ID_PINJAMAN, TARIKH_PULANG: tarikh, ID_BARANG: b.ID_BARANG, KOD_BARANG: b.KOD_BARANG,
      NAMA_BARANG: b.NAMA_BARANG, NAMA_PEMINJAM: loan.NAMA_PEMINJAM, KUANTITI_DIPINJAM: loan.KUANTITI_DIPINJAM,
      KUANTITI_DIPULANGKAN: qty, BAKI_SELEPAS: baki, KEADAAN: keadaan, GURU_PENERIMA: user.NAMA,
      ID_PENGGUNA: user.ID_PENGGUNA, CATATAN: catatan, DIREKOD_PADA: ts
    });
    updateRow_('PINJAMAN', loan._row, {
      KUANTITI_DIPULANGKAN: dipulang, BAKI: baki, STATUS: baki === 0 ? 'Selesai' : 'Aktif', DIKEMASKINI_PADA: ts
    });
    const patch = { DIPINJAM: Math.max(0, (Number(b.DIPINJAM) || 0) - qty), DIKEMASKINI_PADA: ts };
    if (keadaan !== 'Hilang') patch.STOK_SEMASA = (Number(b.STOK_SEMASA) || 0) + qty;
    updateRow_('BARANG', b._row, patch);
    log_(user, 'Pemulangan barang', 'Pemulangan', id,
      loan.ID_PINJAMAN + ' ' + b.KOD_BARANG + ' x' + qty + ' (' + keadaan + '), baki pinjaman ' + baki);
    updateRingkasan_();
    return {
      id: id, baki: baki,
      mesej: keadaan === 'Hilang'
        ? 'Pemulangan direkodkan. ' + qty + ' unit ditanda HILANG dan tidak ditambah ke stok.'
        : 'Pemulangan berjaya direkodkan.' + (baki > 0 ? ' Baki belum dipulangkan: ' + baki + ' unit.' : ' Pinjaman selesai.')
    };
  });
}

function listPemulangan_(p) {
  const had = Math.min(Number(p.had) || 50, 500);
  return readTable_('PEMULANGAN').slice().sort(function (a, b) { return a.DIREKOD_PADA < b.DIREKOD_PADA ? 1 : -1; }).slice(0, had);
}

/* =========================== LOKASI & KATEGORI =========================== */

function listLokasi_() { return readTable_('LOKASI'); }
function listKategori_() { return readTable_('KATEGORI'); }

function saveLokasi_(p, user) {
  const nama = str_(p.nama, 'Nama lokasi', { wajib: true, max: 100 });
  const ket = str_(p.keterangan, 'Keterangan', { max: 200 });
  const rak = str_(p.rak, 'Rak / Almari', { max: 200 });
  const status = oneOf_(p.status || 'Aktif', ['Aktif', 'Tidak Aktif'], 'Status');
  return withLock_(function () {
    const all = readTable_('LOKASI');
    const dup = all.find(function (l) { return l.NAMA_LOKASI.toLowerCase() === nama.toLowerCase() && l.ID_LOKASI !== p.id; });
    if (dup) throw new AppError('Lokasi "' + nama + '" sudah wujud.', 'DUPLICATE');
    if (p.id) {
      const l = all.find(function (x) { return x.ID_LOKASI === p.id; });
      if (!l) throw new AppError('Lokasi tidak dijumpai.', 'NOT_FOUND');
      const lama = l.NAMA_LOKASI;
      updateRow_('LOKASI', l._row, { NAMA_LOKASI: nama, KETERANGAN: ket, RAK_ALMARI: rak, STATUS: status });
      if (lama !== nama) {
        readTable_('BARANG').filter(function (b) { return b.LOKASI === lama; })
          .forEach(function (b) { updateRow_('BARANG', b._row, { LOKASI: nama }); });
      }
      log_(user, 'Kemas kini lokasi', 'Lokasi', l.ID_LOKASI, lama + (lama !== nama ? ' → ' + nama : '') + ' (' + status + ')');
      return { mesej: 'Lokasi berjaya dikemas kini.' };
    }
    const id = genId_('LOK');
    appendRow_('LOKASI', { ID_LOKASI: id, NAMA_LOKASI: nama, KETERANGAN: ket, RAK_ALMARI: rak, STATUS: status, DICIPTA_PADA: now_() });
    log_(user, 'Tambah lokasi', 'Lokasi', id, nama);
    return { mesej: 'Lokasi baharu berjaya ditambah.' };
  });
}

function saveKategori_(p, user) {
  const nama = str_(p.nama, 'Nama kategori', { wajib: true, max: 80 });
  const ket = str_(p.keterangan, 'Keterangan', { max: 200 });
  const status = oneOf_(p.status || 'Aktif', ['Aktif', 'Tidak Aktif'], 'Status');
  return withLock_(function () {
    const all = readTable_('KATEGORI');
    const dup = all.find(function (k) { return k.NAMA_KATEGORI.toLowerCase() === nama.toLowerCase() && k.ID_KATEGORI !== p.id; });
    if (dup) throw new AppError('Kategori "' + nama + '" sudah wujud.', 'DUPLICATE');
    if (p.id) {
      const k = all.find(function (x) { return x.ID_KATEGORI === p.id; });
      if (!k) throw new AppError('Kategori tidak dijumpai.', 'NOT_FOUND');
      const lama = k.NAMA_KATEGORI;
      updateRow_('KATEGORI', k._row, { NAMA_KATEGORI: nama, KETERANGAN: ket, STATUS: status });
      if (lama !== nama) {
        readTable_('BARANG').filter(function (b) { return b.KATEGORI === lama; })
          .forEach(function (b) { updateRow_('BARANG', b._row, { KATEGORI: nama }); });
      }
      log_(user, 'Kemas kini kategori', 'Kategori', k.ID_KATEGORI, lama + (lama !== nama ? ' → ' + nama : '') + ' (' + status + ')');
      return { mesej: 'Kategori berjaya dikemas kini.' };
    }
    const id = genId_('KAT');
    appendRow_('KATEGORI', { ID_KATEGORI: id, NAMA_KATEGORI: nama, KETERANGAN: ket, STATUS: status, DICIPTA_PADA: now_() });
    log_(user, 'Tambah kategori', 'Kategori', id, nama);
    return { mesej: 'Kategori baharu berjaya ditambah.' };
  });
}

/* =========================== SEJARAH TRANSAKSI =========================== */

/** Gabungkan semua transaksi (masuk, keluar, pemulangan). user=null bermaksud tanpa tapisan pemilik. */
function buildTransaksi_(user, f) {
  f = f || {};
  const out = [];
  readTable_('BARANG_MASUK').forEach(function (m) {
    out.push({ jenis: 'Masuk', id: m.ID_TRANSAKSI, tarikh: m.TARIKH_MASA, idBarang: m.ID_BARANG, kod: m.KOD_BARANG,
      nama: m.NAMA_BARANG, kuantiti: m.KUANTITI, jenisTx: m.JENIS_TRANSAKSI, butiran: [m.SUMBER, m.NO_DOKUMEN].filter(String).join(' · '),
      oleh: m.NAMA_GURU, idPengguna: m.ID_PENGGUNA, status: 'Selesai', catatan: m.CATATAN, stokSelepas: m.STOK_SELEPAS });
  });
  readTable_('BARANG_KELUAR').forEach(function (k) {
    out.push({ jenis: 'Keluar', id: k.ID_TRANSAKSI, tarikh: k.DIPROSES_PADA || k.TARIKH_MASA, idBarang: k.ID_BARANG, kod: k.KOD_BARANG,
      nama: k.NAMA_BARANG, kuantiti: k.KUANTITI, jenisTx: k.JENIS_PENGELUARAN,
      butiran: k.NAMA_PEMINJAM + (k.KELAS_UNIT ? ' (' + k.KELAS_UNIT + ')' : '') + (k.TUJUAN ? ' · ' + k.TUJUAN : ''),
      oleh: k.NAMA_PEMOHON + (k.GURU_PELULUS && k.GURU_PELULUS !== k.NAMA_PEMOHON ? ' / lulus: ' + k.GURU_PELULUS : ''),
      idPengguna: k.ID_PEMOHON, status: k.STATUS, catatan: k.CATATAN || k.SEBAB_TOLAK, stokSelepas: k.STOK_SELEPAS });
  });
  const pemohonPinjaman = {};
  readTable_('PINJAMAN').forEach(function (r) { pemohonPinjaman[r.ID_PINJAMAN] = r.ID_PEMOHON; });
  readTable_('PEMULANGAN').forEach(function (r) {
    out.push({ jenis: 'Pemulangan', id: r.ID_PEMULANGAN, tarikh: r.DIREKOD_PADA, idBarang: r.ID_BARANG, kod: r.KOD_BARANG,
      nama: r.NAMA_BARANG, kuantiti: r.KUANTITI_DIPULANGKAN, jenisTx: r.KEADAAN, butiran: r.NAMA_PEMINJAM + ' · ' + r.ID_PINJAMAN,
      oleh: r.GURU_PENERIMA, idPengguna: r.ID_PENGGUNA, idPemohon: pemohonPinjaman[r.ID_PINJAMAN] || '', status: 'Selesai',
      catatan: r.CATATAN, stokSelepas: '' });
  });

  let rows = out;
  if (user && user.PERANAN === PERANAN.GURU) {
    rows = rows.filter(function (t) {
      return t.idPengguna === user.ID_PENGGUNA || t.idPemohon === user.ID_PENGGUNA;
    });
  }
  if (f.idBarang) rows = rows.filter(function (t) { return t.idBarang === f.idBarang; });
  if (f.jenis) rows = rows.filter(function (t) { return t.jenis === f.jenis; });
  if (f.dari) rows = rows.filter(function (t) { return String(t.tarikh).slice(0, 10) >= f.dari; });
  if (f.hingga) rows = rows.filter(function (t) { return String(t.tarikh).slice(0, 10) <= f.hingga; });
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter(function (t) {
      return [t.id, t.kod, t.nama, t.butiran, t.oleh, t.jenisTx].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  return rows.sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : (a.tarikh > b.tarikh ? -1 : 0); });
}

function listTransaksi_(p, user) {
  const f = {
    jenis: p.jenis ? oneOf_(p.jenis, ['Masuk', 'Keluar', 'Pemulangan'], 'Jenis transaksi') : '',
    dari: p.dari ? date_(p.dari, 'Tarikh mula') : '',
    hingga: p.hingga ? date_(p.hingga, 'Tarikh akhir') : '',
    q: str_(p.q, 'Carian', { max: 100 }),
    idBarang: str_(p.idBarang, 'ID barang', { max: 60 })
  };
  const had = Math.min(Number(p.had) || 500, 1000);
  const rows = buildTransaksi_(user, f);
  return { jumlah: rows.length, rows: rows.slice(0, had) };
}

/* =========================== DASHBOARD & RINGKASAN =========================== */

function computeStats_() {
  const semua = readTable_('BARANG');
  const aktif = semua.filter(function (b) { return b.STATUS_REKOD !== 'Arkib'; });
  const masuk = readTable_('BARANG_MASUK');
  const keluar = readTable_('BARANG_KELUAR').filter(function (k) { return k.STATUS === 'Diluluskan'; });
  const bulanIni = now_().slice(0, 7);
  const jum = function (arr, f) { return arr.reduce(function (s, r) { return s + (Number(r[f]) || 0); }, 0); };
  const kat = {};
  aktif.forEach(function (b) { kat[b.KATEGORI] = 1; });
  return {
    jumlahJenis: aktif.length,
    jumlahKategori: Object.keys(kat).length,
    jumlahUnit: jum(aktif, 'STOK_SEMASA'),
    jumlahDipinjam: jum(aktif, 'DIPINJAM'),
    jumlahMasuk: jum(masuk, 'KUANTITI'),
    masukBulanIni: jum(masuk.filter(function (m) { return m.TARIKH_MASA.slice(0, 7) === bulanIni; }), 'KUANTITI'),
    jumlahKeluar: jum(keluar, 'KUANTITI'),
    keluarBulanIni: jum(keluar.filter(function (k) { return (k.DIPROSES_PADA || k.TARIKH_MASA).slice(0, 7) === bulanIni; }), 'KUANTITI'),
    stokRendah: aktif.filter(function (b) { return statusStok_(b) === 'Stok Rendah'; }).length,
    habisStok: aktif.filter(function (b) { return statusStok_(b) === 'Habis Stok'; }).length,
    nilaiInventori: Math.round(aktif.reduce(function (s, b) {
      return s + (Number(b.HARGA_SEUNIT) || 0) * ((Number(b.STOK_SEMASA) || 0) + (Number(b.DIPINJAM) || 0));
    }, 0) * 100) / 100
  };
}

function senaraiBulan_(n) {
  const kini = now_();
  let y = Number(kini.slice(0, 4));
  let m = Number(kini.slice(5, 7));
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(y + '-' + pad2_(m));
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

function getDashboard_(p, user) {
  const semua = readTable_('BARANG');
  const aktif = semua.filter(function (b) { return b.STATUS_REKOD !== 'Arkib'; });
  const stats = computeStats_();
  const masuk = readTable_('BARANG_MASUK');
  const keluar = readTable_('BARANG_KELUAR').filter(function (k) { return k.STATUS === 'Diluluskan'; });
  const pulang = readTable_('PEMULANGAN');
  const pinjaman = readTable_('PINJAMAN');
  const hari = today_();

  const bulan = senaraiBulan_(12);
  const masukB = {}, keluarB = {}, netB = {};
  const tambah = function (o, k, v) { o[k] = (o[k] || 0) + v; };
  masuk.forEach(function (m) { const k = m.TARIKH_MASA.slice(0, 7); tambah(masukB, k, m.KUANTITI); tambah(netB, k, m.KUANTITI); });
  keluar.forEach(function (x) {
    const k = (x.DIPROSES_PADA || x.TARIKH_MASA).slice(0, 7);
    tambah(keluarB, k, x.KUANTITI);
    if (x.JENIS_PENGELUARAN !== 'Pinjaman Peralatan') tambah(netB, k, -x.KUANTITI);
  });
  pulang.forEach(function (r) { if (r.KEADAAN === 'Hilang') tambah(netB, r.DIREKOD_PADA.slice(0, 7), -r.KUANTITI_DIPULANGKAN); });
  const jumlahKini = semua.reduce(function (s, b) { return s + (Number(b.STOK_SEMASA) || 0) + (Number(b.DIPINJAM) || 0); }, 0);
  const trend = bulan.map(function (bl) {
    return jumlahKini - Object.keys(netB).filter(function (k) { return k > bl; }).reduce(function (s, k) { return s + netB[k]; }, 0);
  });

  const katMap = {};
  aktif.forEach(function (b) {
    if (!katMap[b.KATEGORI]) katMap[b.KATEGORI] = { nama: b.KATEGORI, bil: 0, unit: 0 };
    katMap[b.KATEGORI].bil++;
    katMap[b.KATEGORI].unit += (Number(b.STOK_SEMASA) || 0) + (Number(b.DIPINJAM) || 0);
  });

  const isGuru = user.PERANAN === PERANAN.GURU;
  const pinjamanAktif = pinjaman.filter(function (r) { return r.STATUS === 'Aktif' && (!isGuru || r.ID_PEMOHON === user.ID_PENGGUNA); });
  const permohonan = readTable_('BARANG_KELUAR').filter(function (k) {
    return k.STATUS === 'Menunggu Kelulusan' && (!isGuru || k.ID_PEMOHON === user.ID_PENGGUNA);
  });

  return {
    stats: stats,
    bulan: bulan,
    masukBulanan: bulan.map(function (b) { return masukB[b] || 0; }),
    keluarBulanan: bulan.map(function (b) { return keluarB[b] || 0; }),
    trend: trend,
    kategori: Object.keys(katMap).map(function (k) { return katMap[k]; }).sort(function (a, b) { return b.bil - a.bil; }),
    terkini: buildTransaksi_(user, {}).slice(0, 5),
    perluTambah: aktif.filter(function (b) { return statusStok_(b) !== 'Mencukupi'; })
      .sort(function (a, b) { return (a.STOK_SEMASA - a.STOK_MINIMUM) - (b.STOK_SEMASA - b.STOK_MINIMUM); })
      .slice(0, 6)
      .map(function (b) {
        return { ID_BARANG: b.ID_BARANG, KOD_BARANG: b.KOD_BARANG, NAMA_BARANG: b.NAMA_BARANG, STOK_SEMASA: b.STOK_SEMASA,
          STOK_MINIMUM: b.STOK_MINIMUM, UNIT_UKURAN: b.UNIT_UKURAN, STATUS_STOK: statusStok_(b) };
      }),
    pinjamanAktif: pinjamanAktif.length,
    pinjamanLewat: pinjamanAktif.filter(function (r) { return r.TARIKH_JANGKA_PULANG && r.TARIKH_JANGKA_PULANG < hari; }).length,
    permohonanMenunggu: permohonan.length,
    dikemaskini: now_()
  };
}

function updateRingkasan_() {
  const sh = sheet_('RINGKASAN');
  const map = headerMap_('RINGKASAN');
  const st = computeStats_();
  const ts = now_();
  const data = [
    ['Jumlah Jenis Barang', st.jumlahJenis], ['Jumlah Kategori Digunakan', st.jumlahKategori],
    ['Jumlah Unit Stok Semasa', st.jumlahUnit], ['Jumlah Unit Sedang Dipinjam', st.jumlahDipinjam],
    ['Jumlah Barang Masuk (unit)', st.jumlahMasuk], ['Barang Masuk Bulan Ini (unit)', st.masukBulanIni],
    ['Jumlah Barang Keluar (unit)', st.jumlahKeluar], ['Barang Keluar Bulan Ini (unit)', st.keluarBulanIni],
    ['Barang Stok Rendah', st.stokRendah], ['Barang Kehabisan Stok', st.habisStok], ['Nilai Inventori (RM)', st.nilaiInventori]
  ];
  const rows = data.map(function (d) {
    const r = new Array(map._len).fill('');
    r[map.METRIK] = cell_(d[0]); r[map.NILAI] = d[1]; r[map.DIKEMASKINI_PADA] = cell_(ts);
    return r;
  });
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, map._len).clearContent();
  sh.getRange(2, 1, rows.length, map._len).setValues(rows);
  delete REQ.cache.RINGKASAN;
}

/* =========================== LAPORAN =========================== */

function julat_(p) {
  let dari = '', hingga = '';
  const tahun = p.tahun ? int_(p.tahun, 'Tahun', { min: 2000, max: 2100 }) : 0;
  const bulan = p.bulan ? int_(p.bulan, 'Bulan', { min: 1, max: 12 }) : 0;
  if (bulan) {
    const y = tahun || Number(today_().slice(0, 4));
    const hariAkhir = new Date(Date.UTC(y, bulan, 0)).getUTCDate();
    dari = y + '-' + pad2_(bulan) + '-01';
    hingga = y + '-' + pad2_(bulan) + '-' + pad2_(hariAkhir);
  } else if (tahun) {
    dari = tahun + '-01-01';
    hingga = tahun + '-12-31';
  } else {
    dari = p.dari ? date_(p.dari, 'Tarikh mula') : '';
    hingga = p.hingga ? date_(p.hingga, 'Tarikh akhir') : '';
  }
  if (dari && hingga && dari > hingga) throw new AppError('Tarikh mula tidak boleh selepas tarikh akhir.', 'VALIDATION');
  const label = dari && hingga ? fmtTarikh_(dari) + ' hingga ' + fmtTarikh_(hingga)
    : dari ? 'Dari ' + fmtTarikh_(dari) : hingga ? 'Sehingga ' + fmtTarikh_(hingga) : 'Semua tarikh';
  return {
    dari: dari, hingga: hingga, label: label,
    dalam: function (ts) { const d = String(ts || '').slice(0, 10); return (!dari || d >= dari) && (!hingga || d <= hingga); }
  };
}

const LAPORAN_TAJUK = {
  INVENTORI: 'Laporan Inventori Keseluruhan',
  MASUK: 'Laporan Barang Masuk',
  KELUAR: 'Laporan Barang Keluar',
  PINJAMAN: 'Laporan Pinjaman',
  STOK_RENDAH: 'Laporan Stok Rendah',
  KATEGORI: 'Laporan Stok Mengikut Kategori',
  LOKASI: 'Laporan Mengikut Lokasi',
  NILAI: 'Laporan Nilai Inventori',
  AKTIVITI: 'Laporan Aktiviti Pengguna'
};

function getReport_(p, user) {
  const jenis = oneOf_(p.jenis, Object.keys(LAPORAN_TAJUK), 'Jenis laporan');
  if (jenis === 'AKTIVITI' && user.PERANAN !== PERANAN.ADMIN) throw new AppError('Laporan aktiviti pengguna hanya untuk Admin.', 'FORBIDDEN');
  const j = julat_(p);
  const kat = str_(p.kategori, 'Kategori', { max: 80 });
  const guru = str_(p.guru, 'Guru', { max: 100 }).toLowerCase();
  const padanGuru = function () {
    if (!guru) return true;
    for (let i = 0; i < arguments.length; i++) if (String(arguments[i] || '').toLowerCase().indexOf(guru) >= 0) return true;
    return false;
  };
  const barangAll = readTable_('BARANG');
  const barangById = {};
  barangAll.forEach(function (b) { barangById[b.ID_BARANG] = b; });
  const katBarang = function (id) { return barangById[id] ? barangById[id].KATEGORI : ''; };
  const aktif = barangAll.filter(function (b) { return b.STATUS_REKOD !== 'Arkib' && (!kat || b.KATEGORI === kat); });
  const hari = today_();
  const snapshot = 'Kedudukan stok pada ' + fmtTarikh_(hari);
  const C = function (key, label, type) { return { key: key, label: label, type: type || 'text' }; };
  const jum = function (arr, f) { return arr.reduce(function (s, r) { return s + (Number(r[f]) || 0); }, 0); };
  let r;

  switch (jenis) {
    case 'INVENTORI': {
      const rows = aktif.map(function (b) { return Object.assign({}, b, { STATUS_STOK: statusStok_(b) }); })
        .sort(function (a, b) { return a.KATEGORI.localeCompare(b.KATEGORI) || a.KOD_BARANG.localeCompare(b.KOD_BARANG); });
      r = { tempoh: snapshot, columns: [C('KOD_BARANG', 'Kod'), C('NAMA_BARANG', 'Nama Barang'), C('KATEGORI', 'Kategori'),
        C('LOKASI', 'Lokasi'), C('RAK_ALMARI', 'Rak/Almari'), C('UNIT_UKURAN', 'Unit'), C('STOK_SEMASA', 'Stok Semasa', 'num'),
        C('DIPINJAM', 'Dipinjam', 'num'), C('STOK_MINIMUM', 'Stok Min.', 'num'), C('KEADAAN', 'Keadaan'), C('STATUS_STOK', 'Status')],
        rows: rows, jumlah: { STOK_SEMASA: jum(rows, 'STOK_SEMASA'), DIPINJAM: jum(rows, 'DIPINJAM') },
        ringkasan: [{ label: 'Bilangan jenis barang', nilai: rows.length }, { label: 'Jumlah unit stok semasa', nilai: jum(rows, 'STOK_SEMASA') },
          { label: 'Jumlah unit dipinjam', nilai: jum(rows, 'DIPINJAM') }] };
      break;
    }
    case 'MASUK': {
      const rows = readTable_('BARANG_MASUK').filter(function (m) {
        return j.dalam(m.TARIKH_MASA) && (!kat || katBarang(m.ID_BARANG) === kat) && padanGuru(m.NAMA_GURU);
      }).sort(function (a, b) { return a.TARIKH_MASA > b.TARIKH_MASA ? 1 : -1; });
      r = { tempoh: j.label, columns: [C('TARIKH_MASA', 'Tarikh', 'datetime'), C('ID_TRANSAKSI', 'ID Transaksi'), C('KOD_BARANG', 'Kod'),
        C('NAMA_BARANG', 'Nama Barang'), C('JENIS_TRANSAKSI', 'Jenis'), C('KUANTITI', 'Kuantiti', 'num'), C('SUMBER', 'Sumber/Pembekal'),
        C('NO_DOKUMEN', 'No. Dokumen'), C('NAMA_GURU', 'Guru')],
        rows: rows, jumlah: { KUANTITI: jum(rows, 'KUANTITI') },
        ringkasan: [{ label: 'Bilangan transaksi', nilai: rows.length }, { label: 'Jumlah unit masuk', nilai: jum(rows, 'KUANTITI') }] };
      break;
    }
    case 'KELUAR': {
      const rows = readTable_('BARANG_KELUAR').filter(function (k) {
        return k.STATUS === 'Diluluskan' && j.dalam(k.DIPROSES_PADA || k.TARIKH_MASA) && (!kat || katBarang(k.ID_BARANG) === kat) &&
          padanGuru(k.GURU_PELULUS, k.NAMA_PEMOHON);
      }).map(function (k) { return Object.assign({}, k, { TARIKH: k.DIPROSES_PADA || k.TARIKH_MASA }); })
        .sort(function (a, b) { return a.TARIKH > b.TARIKH ? 1 : -1; });
      r = { tempoh: j.label, columns: [C('TARIKH', 'Tarikh', 'datetime'), C('ID_TRANSAKSI', 'ID Transaksi'), C('KOD_BARANG', 'Kod'),
        C('NAMA_BARANG', 'Nama Barang'), C('JENIS_PENGELUARAN', 'Jenis'), C('KUANTITI', 'Kuantiti', 'num'),
        C('NAMA_PEMINJAM', 'Peminjam/Pengguna'), C('KELAS_UNIT', 'Kelas/Unit'), C('TUJUAN', 'Tujuan'), C('GURU_PELULUS', 'Pelulus')],
        rows: rows, jumlah: { KUANTITI: jum(rows, 'KUANTITI') },
        ringkasan: [{ label: 'Bilangan transaksi', nilai: rows.length }, { label: 'Jumlah unit keluar', nilai: jum(rows, 'KUANTITI') }] };
      break;
    }
    case 'PINJAMAN': {
      const rows = readTable_('PINJAMAN').filter(function (x) {
        return j.dalam(x.TARIKH_PINJAM) && (!kat || katBarang(x.ID_BARANG) === kat) && padanGuru(x.GURU_PELULUS);
      }).map(function (x) {
        const lewat = x.STATUS === 'Aktif' && x.TARIKH_JANGKA_PULANG && x.TARIKH_JANGKA_PULANG < hari;
        return Object.assign({}, x, { STATUS_PAPAR: lewat ? 'Lewat' : x.STATUS });
      }).sort(function (a, b) { return a.TARIKH_PINJAM > b.TARIKH_PINJAM ? 1 : -1; });
      r = { tempoh: j.label, columns: [C('TARIKH_PINJAM', 'Tarikh Pinjam', 'datetime'), C('ID_PINJAMAN', 'ID Pinjaman'), C('KOD_BARANG', 'Kod'),
        C('NAMA_BARANG', 'Nama Barang'), C('NAMA_PEMINJAM', 'Peminjam'), C('KELAS_UNIT', 'Kelas/Unit'), C('KUANTITI_DIPINJAM', 'Dipinjam', 'num'),
        C('KUANTITI_DIPULANGKAN', 'Dipulangkan', 'num'), C('BAKI', 'Baki', 'num'), C('TARIKH_JANGKA_PULANG', 'Jangka Pulang', 'date'),
        C('STATUS_PAPAR', 'Status')],
        rows: rows, jumlah: { KUANTITI_DIPINJAM: jum(rows, 'KUANTITI_DIPINJAM'), KUANTITI_DIPULANGKAN: jum(rows, 'KUANTITI_DIPULANGKAN'), BAKI: jum(rows, 'BAKI') },
        ringkasan: [{ label: 'Bilangan pinjaman', nilai: rows.length },
          { label: 'Pinjaman aktif', nilai: rows.filter(function (x) { return x.STATUS === 'Aktif'; }).length },
          { label: 'Pinjaman lewat', nilai: rows.filter(function (x) { return x.STATUS_PAPAR === 'Lewat'; }).length }] };
      break;
    }
    case 'STOK_RENDAH': {
      const rows = aktif.filter(function (b) { return statusStok_(b) !== 'Mencukupi'; })
        .map(function (b) { return Object.assign({}, b, { STATUS_STOK: statusStok_(b) }); })
        .sort(function (a, b) { return (a.STOK_SEMASA - a.STOK_MINIMUM) - (b.STOK_SEMASA - b.STOK_MINIMUM); });
      r = { tempoh: snapshot, columns: [C('KOD_BARANG', 'Kod'), C('NAMA_BARANG', 'Nama Barang'), C('KATEGORI', 'Kategori'), C('LOKASI', 'Lokasi'),
        C('UNIT_UKURAN', 'Unit'), C('STOK_SEMASA', 'Stok Semasa', 'num'), C('STOK_MINIMUM', 'Stok Minimum', 'num'), C('STATUS_STOK', 'Status')],
        rows: rows, jumlah: {},
        ringkasan: [{ label: 'Stok rendah', nilai: rows.filter(function (x) { return x.STATUS_STOK === 'Stok Rendah'; }).length },
          { label: 'Habis stok', nilai: rows.filter(function (x) { return x.STATUS_STOK === 'Habis Stok'; }).length }] };
      break;
    }
    case 'KATEGORI':
    case 'LOKASI': {
      const medan = jenis === 'KATEGORI' ? 'KATEGORI' : 'LOKASI';
      const g = {};
      aktif.forEach(function (b) {
        const k = b[medan] || '(Tiada)';
        if (!g[k]) g[k] = { KUMPULAN: k, BIL_JENIS: 0, STOK_SEMASA: 0, DIPINJAM: 0, RENDAH: 0, NILAI: 0 };
        g[k].BIL_JENIS++;
        g[k].STOK_SEMASA += b.STOK_SEMASA;
        g[k].DIPINJAM += b.DIPINJAM;
        if (statusStok_(b) !== 'Mencukupi') g[k].RENDAH++;
        g[k].NILAI += (Number(b.HARGA_SEUNIT) || 0) * (b.STOK_SEMASA + b.DIPINJAM);
      });
      const rows = Object.keys(g).sort().map(function (k) { g[k].NILAI = Math.round(g[k].NILAI * 100) / 100; return g[k]; });
      r = { tempoh: snapshot, columns: [C('KUMPULAN', jenis === 'KATEGORI' ? 'Kategori' : 'Lokasi'), C('BIL_JENIS', 'Bil. Jenis Barang', 'num'),
        C('STOK_SEMASA', 'Stok Semasa', 'num'), C('DIPINJAM', 'Dipinjam', 'num'), C('RENDAH', 'Stok Rendah/Habis', 'num'), C('NILAI', 'Nilai (RM)', 'rm')],
        rows: rows, jumlah: { BIL_JENIS: jum(rows, 'BIL_JENIS'), STOK_SEMASA: jum(rows, 'STOK_SEMASA'), DIPINJAM: jum(rows, 'DIPINJAM'),
          RENDAH: jum(rows, 'RENDAH'), NILAI: Math.round(jum(rows, 'NILAI') * 100) / 100 },
        ringkasan: [{ label: jenis === 'KATEGORI' ? 'Bilangan kategori' : 'Bilangan lokasi', nilai: rows.length }] };
      break;
    }
    case 'NILAI': {
      const rows = aktif.map(function (b) {
        const milik = b.STOK_SEMASA + b.DIPINJAM;
        return Object.assign({}, b, { JUMLAH_DIMILIKI: milik, NILAI: Math.round((Number(b.HARGA_SEUNIT) || 0) * milik * 100) / 100 });
      }).sort(function (a, b) { return b.NILAI - a.NILAI; });
      const total = Math.round(jum(rows, 'NILAI') * 100) / 100;
      r = { tempoh: snapshot, columns: [C('KOD_BARANG', 'Kod'), C('NAMA_BARANG', 'Nama Barang'), C('KATEGORI', 'Kategori'),
        C('JUMLAH_DIMILIKI', 'Kuantiti Dimiliki', 'num'), C('UNIT_UKURAN', 'Unit'), C('HARGA_SEUNIT', 'Harga Seunit (RM)', 'rm'), C('NILAI', 'Nilai (RM)', 'rm')],
        rows: rows, jumlah: { JUMLAH_DIMILIKI: jum(rows, 'JUMLAH_DIMILIKI'), NILAI: total },
        ringkasan: [{ label: 'Jumlah nilai inventori (RM)', nilai: total, type: 'rm' },
          { label: 'Barang tanpa harga direkodkan', nilai: rows.filter(function (x) { return !x.HARGA_SEUNIT; }).length }] };
      break;
    }
    case 'AKTIVITI': {
      const rows = readTable_('LOG_AKTIVITI').filter(function (l) { return j.dalam(l.TARIKH_MASA) && padanGuru(l.NAMA_PENGGUNA); })
        .sort(function (a, b) { return a.TARIKH_MASA < b.TARIKH_MASA ? 1 : -1; }).slice(0, 3000);
      r = { tempoh: j.label, columns: [C('TARIKH_MASA', 'Tarikh', 'datetime'), C('NAMA_PENGGUNA', 'Pengguna'), C('PERANAN', 'Peranan'),
        C('TINDAKAN', 'Tindakan'), C('MODUL', 'Modul'), C('RUJUKAN', 'Rujukan'), C('BUTIRAN', 'Butiran')],
        rows: rows, jumlah: {}, ringkasan: [{ label: 'Bilangan aktiviti', nilai: rows.length }] };
      break;
    }
  }
  const keys = r.columns.map(function (c) { return c.key; });
  r.rows = r.rows.map(function (row) { const o = {}; keys.forEach(function (k) { o[k] = row[k]; }); return o; });
  r.jenis = jenis;
  r.tajuk = LAPORAN_TAJUK[jenis];
  r.penapis = { kategori: kat, guru: p.guru || '' };
  r.dijanaPada = now_();
  r.dijanaOleh = user.NAMA;
  const t = tetapanMap_();
  r.sekolah = { nama: t.NAMA_SEKOLAH || '', bengkel: t.NAMA_BENGKEL || '', alamat: t.ALAMAT_SEKOLAH || '' };
  withLock_(function () { log_(user, 'Jana laporan', 'Laporan', jenis, r.tempoh + (kat ? ' | ' + kat : '')); });
  return r;
}

/* =========================== PENGURUSAN PENGGUNA =========================== */

function listUsers_() {
  return readTable_('PENGGUNA').map(publicUser_).sort(function (a, b) {
    const w = function (u) { return u.STATUS === 'Menunggu Kelulusan' ? 0 : u.STATUS === 'Aktif' ? 1 : 2; };
    return w(a) - w(b) || a.NAMA.localeCompare(b.NAMA);
  });
}

function updateUser_(p, user) {
  const peranan = oneOf_(p.peranan, SENARAI.PERANAN, 'Peranan');
  const status = oneOf_(p.status, SENARAI.STATUS_PENGGUNA, 'Status');
  return withLock_(function () {
    const users = readTable_('PENGGUNA');
    const u = users.find(function (x) { return x.ID_PENGGUNA === String(p.id || ''); });
    if (!u) throw new AppError('Pengguna tidak dijumpai.', 'NOT_FOUND');
    if (u.ID_PENGGUNA === user.ID_PENGGUNA && (peranan !== PERANAN.ADMIN || status !== 'Aktif')) {
      throw new AppError('Anda tidak boleh menurunkan peranan atau menyahaktifkan akaun sendiri.', 'VALIDATION');
    }
    if (u.PERANAN === PERANAN.ADMIN && (peranan !== PERANAN.ADMIN || status !== 'Aktif')) {
      const adminLain = users.filter(function (x) { return x.PERANAN === PERANAN.ADMIN && x.STATUS === 'Aktif' && x.ID_PENGGUNA !== u.ID_PENGGUNA; });
      if (!adminLain.length) throw new AppError('Sistem mesti mempunyai sekurang-kurangnya seorang Admin aktif.', 'VALIDATION');
    }
    updateRow_('PENGGUNA', u._row, { PERANAN: peranan, STATUS: status });
    log_(user, 'Kemas kini pengguna', 'Pengguna', u.ID_PENGGUNA,
      u.EMEL + ': ' + u.PERANAN + '/' + u.STATUS + ' → ' + peranan + '/' + status);
    return { mesej: 'Akaun ' + u.NAMA + ' dikemas kini.' };
  });
}

function resetUserPassword_(p, user) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const hex = randomHex_(20);
  let temp = '';
  for (let i = 0; i < 7; i++) temp += chars[parseInt(hex.substr(i * 2, 2), 16) % chars.length];
  temp += String(parseInt(hex.substr(14, 6), 16) % 1000).padStart(3, '0');
  const salt = randomHex_(32);
  const hash = hashPassword_(temp, salt);
  return withLock_(function () {
    const u = readTable_('PENGGUNA').find(function (x) { return x.ID_PENGGUNA === String(p.id || ''); });
    if (!u) throw new AppError('Pengguna tidak dijumpai.', 'NOT_FOUND');
    updateRow_('PENGGUNA', u._row, { SALT: salt, HASH: hash, CUBAAN_GAGAL: 0, DIKUNCI_HINGGA: 0, VERSI_SESI: (Number(u.VERSI_SESI) || 0) + 1 });
    log_(user, 'Tetapan semula kata laluan pengguna', 'Pengguna', u.ID_PENGGUNA, u.EMEL);
    return { kataLaluanSementara: temp, mesej: 'Kata laluan sementara dijana untuk ' + u.NAMA + '.' };
  });
}
