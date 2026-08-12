// Dashboard web sederhana untuk memantau riwayat penggunaan chatbot.
// Jalankan terpisah dari bot utama: `node dashboard.js`
// lalu buka http://localhost:3000 di browser.

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.LOG_FILE || 'riwayat_akses.csv';
const LOG_PATH = path.join(__dirname, LOG_FILE);
const PORT = process.env.DASHBOARD_PORT || 3000;

const app = express();

function bacaCsvSederhana(isi) {
  const baris = isi.split(/\r?\n/).filter((b) => b.trim().length > 0);
  if (baris.length === 0) return { header: [], rows: [] };

  const parseBaris = (teks) => {
    const hasil = [];
    let cur = '';
    let dalamKutip = false;
    for (let i = 0; i < teks.length; i++) {
      const c = teks[i];
      if (c === '"') {
        if (dalamKutip && teks[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          dalamKutip = !dalamKutip;
        }
      } else if (c === ',' && !dalamKutip) {
        hasil.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    hasil.push(cur);
    return hasil;
  };

  const header = parseBaris(baris[0]);
  const rows = baris.slice(1).map(parseBaris);
  return { header, rows };
}

app.get('/', (req, res) => {
  let header = [];
  let rows = [];

  if (fs.existsSync(LOG_PATH)) {
    const isi = fs.readFileSync(LOG_PATH, 'utf-8');
    const parsed = bacaCsvSederhana(isi);
    header = parsed.header;
    rows = parsed.rows.reverse(); // terbaru di atas
  }

  const IDX_NOMOR = 2;
  const IDX_CATATAN = 8;

  const totalAkses = rows.length;
  const nomorUnik = new Set(rows.map((r) => r[IDX_NOMOR])).size;
  const nomorBelumJelas = rows.filter((r) => (r[IDX_NOMOR] || '').includes('@lid')).length;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<title>Riwayat Akses Chatbot LASKAR DATA - BPS Belitung Timur</title>
<meta http-equiv="refresh" content="30" />
<style>
  body { font-family: Arial, sans-serif; margin: 24px; background: #f5f6f8; color: #1a1a1a; }
  h1 { color: #0b3d91; margin-bottom: 4px; }
  .subtitle { color: #555; margin-bottom: 20px; }
  .ringkasan { display: flex; gap: 16px; margin-bottom: 20px; }
  .kartu { background: #fff; border-radius: 8px; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .kartu .angka { font-size: 28px; font-weight: bold; color: #0b3d91; }
  .kartu .label { font-size: 13px; color: #666; }
  .kartu.peringatan { border-left: 4px solid #e0a300; }
  .kartu.peringatan .angka { color: #b8860b; }
  .info-lid { background: #fff8e6; border: 1px solid #f0d98c; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #6b5300; margin-bottom: 16px; }
  .lid-badge { display: inline-block; background: #f0d98c; color: #6b5300; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { border-bottom: 1px solid #eee; padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
  th { background: #0b3d91; color: #fff; position: sticky; top: 0; }
  tr:hover { background: #f0f4ff; }
  tr.baris-lid { background: #fffdf3; }
  input#cari { padding: 8px 12px; width: 320px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 6px; }
  .kosong { padding: 40px; text-align: center; color: #888; }
</style>
</head>
<body>
  <h1>Riwayat Akses Chatbot LASKAR DATA</h1>
  <div class="subtitle">BPS Kabupaten Belitung Timur &mdash; halaman ini otomatis refresh tiap 30 detik</div>

  <div class="ringkasan">
    <div class="kartu"><div class="angka">${totalAkses}</div><div class="label">Total interaksi</div></div>
    <div class="kartu"><div class="angka">${nomorUnik}</div><div class="label">Nomor WA unik</div></div>
    ${nomorBelumJelas > 0 ? `<div class="kartu peringatan"><div class="angka">${nomorBelumJelas}</div><div class="label">Nomor belum bisa diresolusi (privasi WA / @lid)</div></div>` : ''}
  </div>
  ${nomorBelumJelas > 0 ? `<div class="info -lid">ℹ️ Sebagian pengguna WhatsApp mengaktifkan privasi nomor, sehingga WhatsApp mengirim ID internal <code>@lid</code> alih-alih nomor asli. Ini keterbatasan resmi dari WhatsApp, bukan nomor acak/salah dari sistem &mdash; bot sudah mencoba meresolusinya otomatis, dan baris yang masih bertanda <span class="lid-badge">@lid</span> berarti WhatsApp belum mengizinkan nomor aslinya diambil.</div>` : ''}

  <input id="cari" type="text" placeholder="Cari nama / nomor / pesan..." onkeyup="saring()" />

  ${rows.length === 0 ? '<div class="kosong">Belum ada riwayat akses.</div>' : `
  <table id="tabel">
    <thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((r) => {
        const isLid = (r[IDX_NOMOR] || '').includes('@lid');
        return `<tr class="${isLid ? 'baris-lid' : ''}">${r.map((c, i) => {
          if (i === IDX_NOMOR && isLid) {
            return `<td>${escapeHtml(c)} <span class="lid-badge">@lid</span></td>`;
          }
          return `<td>${escapeHtml(c)}</td>`;
        }).join('')}</tr>`;
      }).join('')}
    </tbody>
  </table>
  `}

<script>
function saring() {
  const kata = document.getElementById('cari').value.toLowerCase();
  const baris = document.querySelectorAll('#tabel tbody tr');
  baris.forEach((tr) => {
    tr.style.display = tr.textContent.toLowerCase().includes(kata) ? '' : 'none';
  });
}
</script>
</body>
</html>`;

  res.send(html);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

app.listen(PORT, () => {
  console.log(`📊 Dashboard riwayat akses berjalan di http://localhost:${PORT}`);
  console.log(`   Membaca data dari: ${LOG_PATH}`);
});
