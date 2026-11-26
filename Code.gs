/**
 * PBDku — edaran laporan murid (PDF) kepada ibu bapa melalui akaun DELIMa anak.
 * Tukar NAMA_SEKOLAH di bawah mengikut sekolah anda.
 *
 * CARA KERJA
 *  - Skrip ini terikat pada Google Sheet "PBDku" (tab Laporan, Admin, Log dicipta automatik).
 *  - Senarai murid + ID DELIMa berada dalam Google Sheet BERASINGAN (URL diisi dalam Tetapan).
 *  - Admin muat naik PDF gabungan satu kelas; pelayar memecahkannya ikut murid (No. KP),
 *    kemudian setiap fail disimpan PRIVATE dalam Google Drive pemilik skrip.
 *  - Ibu bapa buka web app, log masuk dengan akaun DELIMa anak (…@moe-dl.edu.my) dan
 *    hanya nampak laporan anak itu.
 *
 * DEPLOY (WAJIB menggunakan akaun DELIMa guru):
 *  Deploy → New deployment → Web app
 *    Execute as:      Me
 *    Who has access:  Anyone within Kementerian Pendidikan Malaysia (moe-dl.edu.my)
 */

const VERSI = '1.0.6';
const NAMA_SEKOLAH = 'SM Sains Kuala Selangor';   // tukar mengikut sekolah anda
const FAVICON_URL = 'https://raw.githubusercontent.com/g-03355699-tech/pbdku/main/docs/ikon/ikon-32.png';
const NAMA_FOLDER = 'PBDku - Laporan Murid';
const TAB = { laporan: 'Laporan', admin: 'Admin', log: 'Log' };
const KEPALA = {
  Laporan: ['Masa', 'Tajuk', 'Kelas', 'NoKP', 'Nama', 'ID DELIMa', 'FileID', 'Saiz (KB)', 'Dimuat naik oleh'],
  Admin: ['Emel', 'Nama', 'Catatan'],
  Log: ['Masa', 'Emel', 'Tindakan', 'Butiran', 'FileID']
};

/* ============================ Web app ============================ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PBDku · SMSKS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl(FAVICON_URL)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Kod JavaScript app (fail App.html) dihantar sebagai teks mentah.
 *  getRawContent() mengelakkan HtmlService menolak / merosakkan kod JS ("Malformed HTML"). */
function kodApp() {
  try {
    return HtmlService.createTemplateFromFile('App').getRawContent();
  } catch (e) {
    throw new Error('Fail "App" tidak dijumpai dalam projek Apps Script. Tekan + > HTML, namakan App (tanpa .html), tampal kandungan App.html, simpan dan deploy versi baharu. [' + ((e && e.message) || e) + ']');
  }
}

/** Panggilan pertama dari halaman: kenal pasti pengguna & peranan. */
function muatAwal() {
  const emel = emelSemasa_();
  const url = ScriptApp.getService().getUrl();
  if (!emel) return { peranan: 'TIADA', sebab: 'TIADA_EMEL', versi: VERSI, sekolah: NAMA_SEKOLAH, url };

  if (adalahAdmin_(emel)) {
    sediaTab_();
    return {
      peranan: 'ADMIN', emel, versi: VERSI, sekolah: NAMA_SEKOLAH, url,
      nama: namaAdmin_(emel),
      pemilik: adalahPemilik_(emel),
      tetapan: bacaTetapan_(),
      ringkasan: ringkasan_()
    };
  }

  if (PropertiesService.getScriptProperties().getProperty('TUTUP'))
    return { peranan: 'TIADA', sebab: 'DITUTUP', emel, versi: VERSI, sekolah: NAMA_SEKOLAH, url };

  const murid = cariMuridIkutEmel_(emel);
  if (!murid) return { peranan: 'TIADA', sebab: 'TIADA_MURID', emel, versi: VERSI, sekolah: NAMA_SEKOLAH, url };

  const laporan = laporanMurid_(murid, emel).map(r => ({
    id: r.fileId, tajuk: r.tajuk, kelas: r.kelas, masa: tarikhIso_(r.masa), saiz: r.saiz
  }));
  log_(emel, 'LOG_MASUK', murid.nama);
  return {
    peranan: 'IBUBAPA', emel, versi: VERSI, sekolah: NAMA_SEKOLAH, url,
    murid: { nama: murid.nama, kelas: murid.kelas || (laporan[0] && laporan[0].kelas) || '' },
    laporan
  };
}

/**
 * ADMIN: lihat paparan ibu bapa bagi seorang murid (tanpa perlu akaun DELIMa murid).
 * @param {string} kunci  ID DELIMa, No. KP atau nama murid
 */
function lihatSebagaiIbuBapa(kunci) {
  const emelAdmin = wajibAdmin_();
  const q = String(kunci || '').trim();
  if (!q) throw new Error('Sila masukkan ID DELIMa, No. KP atau nama murid.');
  const s = senaraiMurid_().senarai;
  const qEmel = q.toLowerCase(), qKp = q.replace(/\D/g, ''), qNama = normNama_(q);
  let murid = s.find(m => m.delima === qEmel || m.delima === qEmel + '@moe-dl.edu.my')
    || (qKp.length === 12 && s.find(m => m.kp === qKp))
    || s.find(m => normNama_(m.nama) === qNama)
    || (qNama.length >= 4 && s.find(m => normNama_(m.nama).indexOf(qNama) >= 0));
  let amaran = '';
  if (!murid) {   // tiada dalam senarai DELIMa — cuba cari dalam laporan yang dimuat naik
    const r = bacaLaporan_().find(x => (qKp.length === 12 && x.kp === qKp) || normNama_(x.nama) === qNama
      || (qNama.length >= 4 && normNama_(x.nama).indexOf(qNama) >= 0));
    if (!r) throw new Error('Murid "' + q + '" tidak dijumpai dalam senarai DELIMa atau laporan.');
    murid = { nama: r.nama, kp: r.kp, kelas: r.kelas, delima: '' };
    amaran = 'Murid ini TIADA dalam senarai ID DELIMa — ibu bapa belum boleh log masuk. Tambah murid ke Sheet senarai.';
  }
  const laporan = laporanMurid_(murid, murid.delima || '-').map(r => ({
    id: r.fileId, tajuk: r.tajuk, kelas: r.kelas, masa: tarikhIso_(r.masa), saiz: r.saiz
  }));
  log_(emelAdmin, 'PRATONTON_IBUBAPA', murid.nama);
  return {
    peranan: 'IBUBAPA', pratonton: true, amaran,
    emel: murid.delima || '(tiada ID DELIMa)', versi: VERSI, sekolah: NAMA_SEKOLAH, url: ScriptApp.getService().getUrl(),
    murid: { nama: murid.nama, kelas: murid.kelas || (laporan[0] && laporan[0].kelas) || '' },
    laporan
  };
}

/** ADMIN: senarai ringkas murid untuk pilihan pratonton. */
function senaraiPratonton() {
  wajibAdmin_();
  return senaraiMurid_().senarai.map(m => ({ nama: m.nama, kelas: m.kelas, delima: m.delima }));
}

/** Muat turun satu laporan (base64). Ibu bapa hanya boleh ambil fail anak sendiri. */
function muatTurun(fileId) {
  const emel = emelSemasa_();
  if (!emel) throw new Error('TIADA_AKSES');
  const baris = bacaLaporan_().find(r => r.fileId === fileId);
  if (!baris) throw new Error('Laporan tidak dijumpai.');

  const admin = adalahAdmin_(emel);
  if (!admin) {
    if (PropertiesService.getScriptProperties().getProperty('TUTUP')) throw new Error('Semakan laporan telah ditutup.');
    const murid = cariMuridIkutEmel_(emel);
    const boleh = murid && laporanMurid_(murid, emel).some(r => r.fileId === fileId);
    if (!boleh) { log_(emel, 'DITOLAK', fileId); throw new Error('Anda tidak dibenarkan membuka laporan ini.'); }
  }

  const blob = DriveApp.getFileById(fileId).getBlob();
  log_(emel, admin ? 'ADMIN_MUAT_TURUN' : 'MUAT_TURUN', `${baris.nama} · ${baris.tajuk}`, fileId);
  return {
    namaFail: `${bersihNamaFail_(baris.tajuk)}_${bersihNamaFail_(baris.nama)}.pdf`,
    data: Utilities.base64Encode(blob.getBytes())
  };
}

/* ============================ Admin ============================ */

/**
 * Padankan senarai halaman (hasil baca PDF di pelayar) dengan senarai murid DELIMa.
 * @param {Array<{kp:string,nama:string}>} item
 */
function padankan(item) {
  wajibAdmin_();
  const s = senaraiMurid_();
  const sedia = bacaLaporan_();
  return (item || []).map(x => {
    const m = padanMurid_(s, x.kp, x.nama);
    return {
      kp: x.kp, nama: x.nama,
      jumpa: !!(m && m.delima),
      delima: m ? m.delima : '',
      kelasSenarai: m ? m.kelas : '',
      namaSenarai: m ? m.nama : ''
    };
  });
}

/** Semak sama ada tajuk + kelas sudah pernah dimuat naik (untuk amaran ganti). */
function semakSedia(tajuk, kelas) {
  wajibAdmin_();
  return bacaLaporan_().filter(r => r.tajuk === tajuk && r.kelas === kelas).length;
}

/**
 * Simpan satu laporan murid. Jika tajuk + No. KP sama sudah wujud, fail lama diganti.
 * @param {{tajuk,kelas,kp,nama,delima,data}} x  data = PDF base64
 */
function simpanLaporan(x) {
  const emel = wajibAdmin_();
  const tajuk = String(x.tajuk || '').trim();
  const kelas = String(x.kelas || '').trim().toUpperCase();
  const kp = String(x.kp || '').replace(/\D/g, '');
  const nama = String(x.nama || '').trim().toUpperCase();
  if (!tajuk || !kelas || !nama || !x.data) throw new Error('Maklumat laporan tidak lengkap.');

  const bait = Utilities.base64Decode(x.data);
  const blob = Utilities.newBlob(bait, 'application/pdf', `${kp || bersihNamaFail_(nama)}_${bersihNamaFail_(tajuk)}.pdf`);
  const fail = folderKelas_(kelas).createFile(blob);
  const saiz = Math.round(bait.length / 1024);

  const kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    const sh = tab_(TAB.laporan);
    const data = sh.getDataRange().getValues();
    let ganti = -1;
    for (let i = 1; i < data.length; i++) {
      const samaKp = kp && String(data[i][3]).replace(/\D/g, '') === kp;
      const samaNama = !kp && normNama_(data[i][4]) === normNama_(nama);
      if (data[i][1] === tajuk && (samaKp || samaNama)) { ganti = i; break; }
    }
    const baris = [new Date(), tajuk, kelas, kp ? "'" + kp : '', nama, x.delima || '', fail.getId(), saiz, emel];
    if (ganti > 0) {
      try { DriveApp.getFileById(data[ganti][6]).setTrashed(true); } catch (e) {}
      sh.getRange(ganti + 1, 1, 1, baris.length).setValues([baris]);
    } else {
      sh.appendRow(baris);
    }
  } finally { kunci.releaseLock(); }
  return { ok: true, fileId: fail.getId(), saiz };
}

/** Senarai laporan untuk paparan admin. */
function senaraiLaporan() {
  wajibAdmin_();
  const st = statusIbuBapa_();
  // ID DELIMa semasa ikut No. KP (untuk laporan yang dimuat naik sebelum senarai disambung)
  const delimaIkutKp = {};
  senaraiMurid_().senarai.forEach(m => { if (m.kp) delimaIkutKp[m.kp] = m.delima; });
  return bacaLaporan_().map(r => {
    const delima = r.delima || (r.kp && delimaIkutKp[r.kp]) || '';
    const m = delima ? st.masuk[delima] : null;
    const d = st.fail[r.fileId] || (delima && st.emelTajuk[delima + '|' + r.tajuk]) || null;
    return {
      id: r.fileId, tajuk: r.tajuk, kelas: r.kelas, kp: r.kp, nama: r.nama,
      delima, masa: tarikhIso_(r.masa), saiz: r.saiz,
      bilMasuk: m ? m.kali : 0, akhirMasuk: m ? tarikhIso_(m.akhir) : '',
      bilMuatTurun: d ? d.kali : 0, akhirMuatTurun: d ? tarikhIso_(d.akhir) : ''
    };
  });
}

/** Ringkasan aktiviti ibu bapa daripada tab Log (log masuk ikut emel, muat turun ikut fail). */
function statusIbuBapa_() {
  const masuk = {}, fail = {}, emelTajuk = {};
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.log);
  if (!sh || sh.getLastRow() < 2) return { masuk, fail, emelTajuk };
  const tambah = (peta, k, masa) => {
    const x = peta[k] = peta[k] || { kali: 0, akhir: masa };
    x.kali++; if (masa > x.akhir) x.akhir = masa;
  };
  sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(r => {
    const masa = r[0] instanceof Date ? r[0] : new Date(r[0]);
    const emel = String(r[1]).toLowerCase(), t = r[2];
    if (t === 'LOG_MASUK') tambah(masuk, emel, masa);
    else if (t === 'MUAT_TURUN') {
      if (r[4]) tambah(fail, String(r[4]), masa);
      else tambah(emelTajuk, emel + '|' + String(r[3]).split(' \u00B7 ').slice(1).join(' \u00B7 '), masa);   // rekod lama
    }
  });
  return { masuk, fail, emelTajuk };
}

/** Padam laporan (fail ke Trash + buang baris). */
function padamLaporan(ids) {
  const emel = wajibAdmin_();
  const set = new Set(ids || []);
  const kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    const sh = tab_(TAB.laporan);
    const data = sh.getDataRange().getValues();
    let bil = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (set.has(String(data[i][6]))) {
        try { DriveApp.getFileById(data[i][6]).setTrashed(true); } catch (e) {}
        sh.deleteRow(i + 1); bil++;
      }
    }
    log_(emel, 'PADAM', `${bil} laporan`);
    return { bil, ringkasan: ringkasan_() };
  } finally { kunci.releaseLock(); }
}

/** Simpan tetapan: URL Sheet senarai murid + senarai admin tambahan. */
function simpanTetapan(t) {
  const emel = wajibAdmin_();
  const p = PropertiesService.getScriptProperties();
  if ((t.senaraiUrl || t.tabDelima !== undefined || t.tabKp !== undefined) && !adalahPemilik_(emel))
    throw new Error('Hanya pemilik PBDku boleh menukar Sheet senarai murid.');
  const url = String(t.senaraiUrl || '').trim();
  if (url) {
    const id = idDariUrl_(url);
    try { SpreadsheetApp.openById(id).getName(); }
    catch (e) { throw new Error('Sheet senarai murid tidak dapat dibuka. Pastikan URL betul dan anda (pemilik skrip) ada akses.'); }
    if (id !== p.getProperty('SENARAI_ID')) { p.setProperty('TAB_DELIMA', ''); p.setProperty('TAB_KP', ''); }
    p.setProperty('SENARAI_ID', id);
  }
  if (t.tutup !== undefined) p.setProperty('TUTUP', t.tutup ? '1' : '');
  if (t.tabDelima !== undefined) p.setProperty('TAB_DELIMA', t.tabDelima || '');
  if (t.tabKp !== undefined) p.setProperty('TAB_KP', t.tabKp || '');
  if (Array.isArray(t.admin)) {
    const sh = tab_(TAB.admin);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
    const baris = t.admin.map(a => [String(a.emel || '').trim().toLowerCase(), a.nama || '', ''])
      .filter(a => /@/.test(a[0]));
    if (baris.length) sh.getRange(2, 1, baris.length, 3).setValues(baris);
  }
  CacheService.getScriptCache().remove('senarai');
  log_(emel, 'TETAPAN', 'Dikemas kini');
  return bacaTetapan_();
}

/** Uji Sheet senarai murid: pulangkan bilangan murid & contoh lajur dikesan. */
function ujiSenarai() {
  if (!adalahPemilik_(wajibAdmin_())) throw new Error('Hanya pemilik PBDku boleh menguji Sheet senarai murid.');
  CacheService.getScriptCache().remove('senarai');
  const s = senaraiMurid_();
  const id = PropertiesService.getScriptProperties().getProperty('SENARAI_ID');
  const semuaTab = [];
  if (id) SpreadsheetApp.openById(id).getSheets().forEach(sh => {
    const v = sh.getRange(1, 1, Math.min(10, Math.max(1, sh.getLastRow())), Math.max(1, sh.getLastColumn())).getValues();
    let jenis = '';
    for (const baris of v) {
      const k = cariLajur_(baris);
      if (k.nama >= 0 && k.delima >= 0) { jenis = 'delima'; break; }
      if (k.nama >= 0 && k.kp >= 0) { jenis = 'kp'; break; }
    }
    semuaTab.push({ nama: sh.getName(), jenis, baris: sh.getLastRow() });
  });
  return {
    semuaTab,
    bil: s.senarai.length,
    adaKp: s.senarai.some(m => m.kp),
    adaKelas: s.senarai.some(m => m.kelas),
    tab: s.tab,
    tabKp: s.tabKp || [],
    kpDigabung: s.kpDigabung || 0,
    tanpaKp: s.tanpaKp || 0,
    contoh: s.senarai.slice(0, 3).map(m => ({ nama: m.nama, delima: m.delima, kelas: m.kelas }))
  };
}

/* ============================ Senarai murid (Sheet berasingan) ============================ */

/**
 * Baca semua tab dalam Sheet senarai. Lajur dikesan ikut tajuk (dalam 10 baris pertama):
 *   Nama | ID DELIMa / Emel | No. KP (pilihan) | Kelas (pilihan)
 * - Satu tab satu kelas pun boleh: nama tab digunakan sebagai kelas jika tiada lajur Kelas.
 * - ID DELIMa dan No. KP boleh berada dalam TAB BERLAINAN: tab yang ada Nama + No. KP
 *   (tanpa ID DELIMa) digabungkan dengan tab ID DELIMa ikut nama murid.
 */
function senaraiMurid_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('senarai');
  if (c) return JSON.parse(c);

  const id = PropertiesService.getScriptProperties().getProperty('SENARAI_ID');
  if (!id) return { senarai: [], tab: [], tabKp: [], kpDigabung: 0, tanpaKp: 0 };
  const p = PropertiesService.getScriptProperties();
  const tabD = p.getProperty('TAB_DELIMA') || '', tabK = p.getProperty('TAB_KP') || '';
  const ss = SpreadsheetApp.openById(id);
  const senarai = [], tabDibaca = [], tabKp = [];
  const petaKp = {};          // normNama -> { kp, kelas } daripada tab No. KP

  // Jika admin memilih tab, baca tab itu sahaja (Sheet induk sekolah biasanya ada banyak tab lain).
  const helaian = tabD
    ? [ss.getSheetByName(tabD), tabK && tabK !== tabD ? ss.getSheetByName(tabK) : null].filter(Boolean)
    : ss.getSheets();
  helaian.forEach(sh => {
    const v = sh.getDataRange().getValues();
    if (v.length < 2) return;
    let h = -1, col = null;
    for (let r = 0; r < Math.min(10, v.length) && h < 0; r++) {
      const k = cariLajur_(v[r]);
      if (k.nama >= 0 && (k.delima >= 0 || k.kp >= 0)) { h = r; col = k; }
    }
    if (h < 0) return;
    if (tabD && sh.getName() === tabK && tabK !== tabD) col.delima = -1;   // tab No. KP: abaikan lajur emel
    const namaTab = sh.getName().trim().toUpperCase();
    const namaDari = r => [v[r][col.nama], col.namaAkhir >= 0 ? v[r][col.namaAkhir] : '']
      .map(x => String(x || '').trim()).filter(Boolean).join(' ');
    const kelasDari = r => col.kelas >= 0 ? String(v[r][col.kelas] || '').trim().toUpperCase() : '';

    if (col.delima >= 0) {                      // tab ID DELIMa
      tabDibaca.push(sh.getName());
      for (let r = h + 1; r < v.length; r++) {
        const nama = namaDari(r);
        const delima = String(v[r][col.delima] || '').trim().toLowerCase();
        if (!nama || !delima) continue;
        senarai.push({
          nama: nama.toUpperCase(),
          delima: /@/.test(delima) ? delima : delima + '@moe-dl.edu.my',
          kp: col.kp >= 0 ? bersihKp_(v[r][col.kp]) : '',
          kelas: kelasDari(r),
          tab: namaTab
        });
      }
    } else {                                    // tab No. KP sahaja
      tabKp.push(sh.getName());
      for (let r = h + 1; r < v.length; r++) {
        const n = normNama_(namaDari(r));
        const kp = bersihKp_(v[r][col.kp]);
        if (n && kp) petaKp[n] = { kp, kelas: kelasDari(r) || namaTab };
      }
    }
  });

  let kpDigabung = 0;
  senarai.forEach(m => {
    const x = petaKp[normNama_(m.nama)];
    if (!m.kp && x) { m.kp = x.kp; kpDigabung++; }
    if (!m.kelas) m.kelas = (x && x.kelas) || m.tab;
    delete m.tab;
  });
  const hasil = { senarai, tab: tabDibaca, tabKp, kpDigabung, tanpaKp: senarai.filter(m => !m.kp).length };
  try { cache.put('senarai', JSON.stringify(hasil), 600); } catch (e) {}
  return hasil;
}

function bersihKp_(v) {
  const s = typeof v === 'number' ? v.toFixed(0) : String(v || '');
  const d = s.replace(/\D/g, '');
  return d.length === 12 ? d : '';
}

function cariLajur_(baris) {
  const k = { nama: -1, namaAkhir: -1, kp: -1, kelas: -1, delima: -1 };
  const kecil = baris.map(t => String(t).toLowerCase().trim());
  k.delima = kecil.findIndex(s => /delima/.test(s));
  if (k.delima < 0) k.delima = kecil.findIndex(s => /e-?mel|email|id\s*google|id\s*pengguna/.test(s));
  kecil.forEach((s, i) => {
    if (i === k.delima || !s) return;
    if (k.kp < 0 && (/pengenalan|mykid|mykad|\bk\/?p\b|\bic\b|no\.?\s*kp/.test(s))) k.kp = i;
    else if (k.kelas < 0 && /^kelas|kelas$|^tingkatan$/.test(s)) k.kelas = i;
    else if (k.nama < 0 && /nama|first name|full name|given name/.test(s)) k.nama = i;
    else if (k.namaAkhir < 0 && /last name|family name|surname/.test(s)) k.namaAkhir = i;
  });
  return k;
}

function padanMurid_(s, kp, nama) {
  kp = String(kp || '').replace(/\D/g, '');
  if (kp) { const m = s.senarai.find(x => x.kp && x.kp === kp); if (m) return m; }
  const n = normNama_(nama);
  return n ? s.senarai.find(x => normNama_(x.nama) === n) || null : null;
}

function cariMuridIkutEmel_(emel) {
  return senaraiMurid_().senarai.find(m => m.delima === emel) || null;
}

function laporanMurid_(murid, emel) {
  const n = normNama_(murid.nama);
  return bacaLaporan_()
    .filter(r => r.delima === emel || (murid.kp && r.kp === murid.kp) || (!murid.kp && !r.kp && normNama_(r.nama) === n))
    .sort((a, b) => new Date(b.masa) - new Date(a.masa));
}

/* ============================ Utiliti ============================ */

function emelSemasa_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function adalahAdmin_(emel) {
  if (!emel) return false;
  if (emel === String(Session.getEffectiveUser().getEmail()).toLowerCase()) return true;
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.admin);
  if (!sh || sh.getLastRow() < 2) return false;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().some(r => String(r[0]).trim().toLowerCase() === emel);
}

function namaAdmin_(emel) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.admin);
  if (sh && sh.getLastRow() > 1) {
    const r = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().find(x => String(x[0]).toLowerCase() === emel);
    if (r && r[1]) return r[1];
  }
  return emel.split('@')[0];
}

/** Pemilik skrip (akaun yang men-deploy) — satu-satunya yang boleh akses Sheet & folder secara terus. */
function adalahPemilik_(emel) {
  return !!emel && emel === String(Session.getEffectiveUser().getEmail()).toLowerCase();
}

function wajibAdmin_() {
  const emel = emelSemasa_();
  if (!adalahAdmin_(emel)) throw new Error('TIADA_AKSES');
  return emel;
}

function bacaTetapan_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('SENARAI_ID');
  const pemilik = adalahPemilik_(emelSemasa_());
  const sh = tab_(TAB.admin);
  const admin = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().filter(r => r[0]).map(r => ({ emel: r[0], nama: r[1] }))
    : [];
  return {
    adaSenarai: !!id,
    senaraiUrl: pemilik && id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '',
    pemilik: Session.getEffectiveUser().getEmail(),
    admin,
    tutup: !!p.getProperty('TUTUP'),
    tabDelima: pemilik ? p.getProperty('TAB_DELIMA') || '' : '',
    tabKp: pemilik ? p.getProperty('TAB_KP') || '' : '',
    dataUrl: pemilik ? SpreadsheetApp.getActive().getUrl() : '',
    folderUrl: pemilik ? folderUtama_().getUrl() : ''
  };
}

function ringkasan_() {
  const peta = {};
  bacaLaporan_().forEach(r => {
    const k = r.tajuk + '\u0001' + r.kelas;
    const x = peta[k] = peta[k] || { tajuk: r.tajuk, kelas: r.kelas, bil: 0, tanpaDelima: 0, masa: r.masa };
    x.bil++; if (!r.delima) x.tanpaDelima++;
    if (new Date(r.masa) > new Date(x.masa)) x.masa = r.masa;
  });
  return Object.values(peta).map(x => Object.assign(x, { masa: tarikhIso_(x.masa) }))
    .sort((a, b) => a.tajuk.localeCompare(b.tajuk) || a.kelas.localeCompare(b.kelas));
}

function bacaLaporan_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.laporan);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().filter(r => r[6]).map(r => ({
    masa: r[0], tajuk: String(r[1]), kelas: String(r[2]), kp: String(r[3]).replace(/\D/g, ''),
    nama: String(r[4]), delima: String(r[5]).toLowerCase(), fileId: String(r[6]), saiz: r[7]
  }));
}

function sediaTab_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(KEPALA).forEach(n => {
    let sh = ss.getSheetByName(n);
    if (!sh) {
      sh = ss.insertSheet(n);
      sh.getRange(1, 1, 1, KEPALA[n].length).setValues([KEPALA[n]])
        .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      if (n === TAB.laporan) sh.getRange('D:D').setNumberFormat('@');
    } else if (sh.getRange(1, KEPALA[n].length).getValue() === '') {     // naik taraf: lajur baharu
      sh.getRange(1, 1, 1, KEPALA[n].length).setValues([KEPALA[n]])
        .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    }
  });
}

function tab_(n) { sediaTab_(); return SpreadsheetApp.getActive().getSheetByName(n); }

function folderUtama_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(NAMA_FOLDER);
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function folderKelas_(kelas) {
  const induk = folderUtama_();
  const it = induk.getFoldersByName(kelas);
  return it.hasNext() ? it.next() : induk.createFolder(kelas);
}

function log_(emel, tindakan, butiran, fileId) {
  try { tab_(TAB.log).appendRow([new Date(), emel, tindakan, butiran || '', fileId || '']); } catch (e) {}
}

function normNama_(s) {
  return String(s || '').toUpperCase().replace(/\b(BINTI|BIN|BT|B|A\/L|A\/P|AL|AP)\b/g, ' ')
    .replace(/[^A-Z]/g, '');
}

function bersihNamaFail_(s) { return String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

function idDariUrl_(url) { const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(url); return m ? m[1] : url; }

function tarikhIso_(d) {
  try { return Utilities.formatDate(new Date(d), 'Asia/Kuala_Lumpur', "yyyy-MM-dd'T'HH:mm"); } catch (e) { return ''; }
}

/** Jalankan sekali dari editor untuk beri kebenaran (authorize) & cipta tab. */
function pasang() {
  sediaTab_();
  Logger.log('Folder: ' + folderUtama_().getUrl());
  Logger.log('Siap. Sekarang Deploy → New deployment → Web app.');
}
