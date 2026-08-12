const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.LOG_FILE || 'riwayat_akses.csv';
const LOG_PATH = path.join(__dirname, '..', LOG_FILE);

const HEADER = [
  'tanggal',
  'waktu',
  'nomor_wa',
  'nama_kontak',
  'pesan_masuk',
  'mode_jawaban',
  'kode_menu',
  'balasan_singkat',
  'catatan_nomor',
].join(',') + '\n';

function ensureFile() {
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, HEADER, 'utf-8');
  }
}

// Escape nilai supaya aman dimasukkan ke CSV (koma, kutip, baris baru)
function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const str = String(value).replace(/\r?\n/g, ' ').trim();
  if (str.includes(',') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Menambahkan satu baris riwayat akses setiap kali ada pengguna
 * mengirim pesan / menggunakan chatbot.
 *
 * @param {Object} entry
 * @param {string} entry.nomor - nomor WA pengguna (mis. 6281234567890@c.us)
 * @param {string} entry.nama - nama kontak / push name
 * @param {string} entry.pesanMasuk - isi pesan yang dikirim pengguna
 * @param {string} entry.modeJawaban - 'MENU' | 'AI_KEYWORD' | 'AI_CLAUDE' | 'ADMIN' | 'TIDAK_DIKENALI'
 * @param {string} entry.kodeMenu - kode menu yang cocok (jika ada), boleh kosong
 * @param {string} entry.balasan - potongan singkat dari balasan bot
 * @param {string} [entry.catatan] - keterangan tambahan soal nomor (mis. jika ID @lid WA)
 */
function logAkses(entry) {
  ensureFile();
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const waktu = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

  const row = [
    tanggal,
    waktu,
    entry.nomor,
    entry.nama,
    entry.pesanMasuk,
    entry.modeJawaban,
    entry.kodeMenu || '',
    (entry.balasan || '').slice(0, 120),
    entry.catatan || '',
  ].map(csvEscape).join(',') + '\n';

  fs.appendFileSync(LOG_PATH, row, 'utf-8');
}

module.exports = { logAkses, LOG_PATH };
