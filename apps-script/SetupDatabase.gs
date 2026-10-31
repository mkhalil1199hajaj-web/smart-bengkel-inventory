/**
 * ==================================================================
 *  SMART BENGKEL INVENTORY — SetupDatabase.gs
 *  Sediakan Google Sheets (tab, header, tetapan awal) & folder Drive.
 *
 *  CARA GUNA: Pilih fungsi "setupDatabase" di editor Apps Script → Run.
 *  Selamat dijalankan berulang kali — data sedia ada TIDAK dipadam.
 * ==================================================================
 */

function setupDatabase() {
  requireEditor_();
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.create('SMART BENGKEL INVENTORY — Pangkalan Data');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', randomHex_(64));

  getSS_.cache = ss;
  resetReq_();

  Object.keys(SCHEMA).forEach(function (name) { sediakanSheet_(ss, name); });
  buangSheetLalai_(ss);
  resetReq_();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    benihKategori_();
    benihLokasi_();
    benihTetapan_();
    updateRingkasan_();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const t = tetapanMap_();
  const mesej = [
    '✅ Pangkalan data siap.',
    'Google Sheets : ' + ss.getUrl(),
    'SPREADSHEET_ID: ' + ss.getId(),
    'Emel Admin    : ' + (t.ADMIN_EMAIL || '(belum ditetapkan)'),
    '',
    'Langkah seterusnya: Deploy > New deployment > Web app, kemudian daftar akaun',
    'menggunakan emel Admin di atas. Akaun itu akan terus menjadi Admin.'
  ].join('\n');
  Logger.log(mesej);
  return mesej;
}

function sediakanSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const headers = SCHEMA[name];
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const sedia = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); });
    const hilang = headers.filter(function (h) { return sedia.indexOf(h) < 0; });
    if (hilang.length) sh.getRange(1, lastCol + 1, 1, hilang.length).setValues([hilang]);
  }
  const jumlahLajur = sh.getLastColumn();
  sh.getRange(1, 1, 1, jumlahLajur)
    .setFontWeight('bold')
    .setBackground('#243E55')
    .setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setTabColor(name === 'PENGGUNA' || name === 'TETAPAN' ? '#B04A4F' : '#2F8794');
}

function buangSheetLalai_(ss) {
  ['Sheet1', 'Helaian1', 'Sheet 1', 'Helaian 1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function benihKategori_() {
  const sedia = readTable_('KATEGORI').map(function (k) { return k.NAMA_KATEGORI.toLowerCase(); });
  if (sedia.length) return;
  const ts = now_();
  SENARAI.KATEGORI_LALAI.forEach(function (nama) {
    appendRow_('KATEGORI', { ID_KATEGORI: genId_('KAT'), NAMA_KATEGORI: nama, KETERANGAN: '', STATUS: 'Aktif', DICIPTA_PADA: ts });
  });
}

function benihLokasi_() {
  if (readTable_('LOKASI').length) return;
  const ts = now_();
  [['Bengkel RBT', 'Ruang kerja utama bengkel'], ['Stor Bengkel RBT', 'Stor simpanan peralatan dan bahan']].forEach(function (l) {
    appendRow_('LOKASI', { ID_LOKASI: genId_('LOK'), NAMA_LOKASI: l[0], KETERANGAN: l[1], RAK_ALMARI: '', STATUS: 'Aktif', DICIPTA_PADA: ts });
  });
}

function benihTetapan_() {
  const t = tetapanMap_();
  const lalai = [
    ['NAMA_SEKOLAH', '', 'Nama sekolah (dipaparkan pada laporan)'],
    ['NAMA_BENGKEL', 'Bengkel Reka Bentuk dan Teknologi (RBT)', 'Nama bengkel'],
    ['ALAMAT_SEKOLAH', '', 'Alamat sekolah (dipaparkan pada laporan)'],
    ['KELULUSAN_PENDAFTARAN', 'YA', 'YA = akaun baharu perlu kelulusan admin, TIDAK = terus aktif'],
    ['ADMIN_EMAIL', String(Session.getEffectiveUser().getEmail() || '').toLowerCase(),
      'Emel yang akan menjadi Admin pertama semasa mendaftar']
  ];
  lalai.forEach(function (r) {
    if (!(r[0] in t)) appendRow_('TETAPAN', { KUNCI: r[0], NILAI: r[1], KETERANGAN: r[2] });
  });
  let folderOk = false;
  if (t.DRIVE_FOLDER_ID) {
    try { DriveApp.getFolderById(t.DRIVE_FOLDER_ID); folderOk = true; } catch (e) { folderOk = false; }
  }
  if (!folderOk) {
    const folder = DriveApp.createFolder('SMART BENGKEL INVENTORY — Gambar Barang');
    setTetapan_('DRIVE_FOLDER_ID', folder.getId(), 'Folder Google Drive untuk gambar barang');
  }
}

/**
 * Pemulihan: jadikan seorang pengguna sebagai Admin aktif.
 * Edit emel di bawah, kemudian Run dari editor.
 */
function jadikanAdmin() {
  requireEditor_();
  const EMEL = 'masukkan.emel@contoh.com'; // <-- tukar kepada emel pengguna
  resetReq_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const u = readTable_('PENGGUNA').find(function (x) { return x.EMEL.toLowerCase() === EMEL.toLowerCase(); });
    if (!u) throw new Error('Pengguna dengan emel ' + EMEL + ' tidak dijumpai.');
    updateRow_('PENGGUNA', u._row, { PERANAN: PERANAN.ADMIN, STATUS: 'Aktif', CUBAAN_GAGAL: 0, DIKUNCI_HINGGA: 0 });
    log_(null, 'Naik taraf Admin (editor)', 'Pengguna', u.ID_PENGGUNA, u.EMEL);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  Logger.log('✅ ' + EMEL + ' kini Admin aktif.');
}

/** Semak status pemasangan. Run dari editor dan lihat Execution log. */
function semakSistem() {
  requireEditor_();
  resetReq_();
  const props = PropertiesService.getScriptProperties();
  const out = [];
  out.push('SPREADSHEET_ID : ' + (props.getProperty('SPREADSHEET_ID') || '❌ belum ditetapkan'));
  out.push('PEPPER         : ' + (props.getProperty('PEPPER') ? '✅ ada' : '❌ tiada'));
  try {
    const ss = getSS_();
    out.push('Sheets         : ' + ss.getUrl());
    Object.keys(SCHEMA).forEach(function (n) {
      try { headerMap_(n); out.push('  ✅ ' + n + ' (' + readTable_(n).length + ' rekod)'); }
      catch (e) { out.push('  ❌ ' + n + ': ' + e.message); }
    });
    const admin = readTable_('PENGGUNA').filter(function (u) { return u.PERANAN === PERANAN.ADMIN && u.STATUS === 'Aktif'; });
    out.push('Admin aktif    : ' + (admin.length ? admin.map(function (u) { return u.EMEL; }).join(', ') : '❌ tiada'));
  } catch (e) {
    out.push('❌ ' + e.message);
  }
  Logger.log(out.join('\n'));
  return out.join('\n');
}
