# Chatbot AI WhatsApp — LASKAR DATA BPS Kabupaten Belitung Timur

## Catatan Perbaikan (fix terbaru)

1. **Bug "ketik 1 tidak dibalas"** — sudah diperbaiki. Dulu, begitu nomor pernah masuk mode admin (2/9/99), bot berhenti membalas apa pun sampai user ketik `0` persis. Sekarang: ketik nomor menu valid apa saja (termasuk `1`) langsung keluar dari mode admin dan menu tampil lagi. Sesi admin juga otomatis lepas sendiri kalau didiamkan 30 menit.
2. **Delay balasan** — dulu bot menunggu `msg.getContact()` (round-trip ke WhatsApp Web) SEBELUM membalas apa pun. Sekarang bot balas dulu, baru ambil detail kontak di belakang layar untuk keperluan log — balasan jadi jauh lebih cepat.
3. **Delay QR / startup** — ditambah flag Chromium untuk mempercepat start (`--disable-gpu`, `--disable-dev-shm-usage`, dll) dan event `loading_screen` supaya ada info progres di terminal, bukan diam saja.
4. **Nomor pengguna di dashboard** — sejak akhir 2025 WhatsApp kadang mengirim ID internal `@lid` (Linked ID) alih-alih nomor asli, untuk kontak yang membatasi privasi nomornya. Ini keterbatasan resmi dari WhatsApp/library `whatsapp-web.js`, bukan bug nomor "sembarang" dari sistem kita. Bot sekarang mencoba meresolusi ke nomor asli otomatis kalau memungkinkan; kalau tidak bisa, baris itu ditandai jelas dengan badge kuning `@lid` di dashboard beserta keterangannya — supaya admin tahu itu memang batasan WA, bukan data salah.


Chatbot ini menggantikan aplikasi WhatAuto dengan bot WhatsApp otomatis yang:

1. **Memuat seluruh isi menu** dari file Excel `chatbot_auto_BPS_beltim.xlsx` (sheet menu layanan), sudah dikonversi ke `menu.json` — jadi semua kategori, subkategori, dan link BPS yang ada di Excel otomatis tersedia di bot.
2. **Punya mode AI** — pengguna tidak perlu mengetik nomor menu satu-satu (1 → 11 → 111, dst). Cukup ketik kata kunci atau pertanyaan bebas, misalnya *"data kemiskinan"*, *"mau lihat data pariwisata"*, *"cara pengaduan"* — bot langsung membalas jawaban yang sesuai.
3. **Mencatat riwayat akses** — setiap kali ada pengguna mengirim pesan / menggunakan chatbot, tercatat otomatis ke file CSV (`riwayat_akses.csv`), lengkap dengan tanggal, jam, nomor WA, nama, pesan masuk, mode jawaban (menu/AI/admin), dan balasan yang diberikan.
4. **Ada dashboard riwayat** (`dashboard.js`) — halaman web sederhana untuk melihat, mencari, dan memantau siapa saja yang memakai chatbot, tanpa perlu buka file CSV secara manual.

---

## 1. Struktur Folder

```
bps-beltim-bot/
├── index.js          # Bot WhatsApp utama (whatsapp-web.js)
├── dashboard.js       # Dashboard web untuk lihat riwayat akses
├── menu.json           # Seluruh isi menu (hasil konversi dari Excel)
├── keywords.json       # Kata kunci per topik, dipakai mesin pencarian "AI"
├── lib/
│   ├── menuEngine.js  # Navigasi menu berjenjang berdasarkan kode
│   ├── search.js       # Pencarian kata kunci (fuzzy) + opsi AI Claude
│   └── logger.js        # Pencatatan riwayat akses ke CSV
├── package.json
├── .env.example         # Contoh konfigurasi (salin jadi .env)
└── .gitignore
```

## 2. Persiapan

Pastikan sudah terpasang **Node.js versi 18 ke atas**.

```bash
cd bps-beltim-bot
npm install
cp .env.example .env
```

Buka file `.env`, isi sesuai kebutuhan:

- `ANTHROPIC_API_KEY` — **opsional**. Kalau diisi dengan API key Claude (dari [console.anthropic.com](https://console.anthropic.com)), bot memakai AI sungguhan untuk memahami pertanyaan bebas pengguna secara lebih pintar. Kalau dikosongkan, bot tetap berfungsi memakai pencarian kata kunci (fuzzy search) yang sudah disiapkan di `keywords.json` — tanpa biaya API.
- `ADMIN_NUMBERS` — nomor WA admin (format `62xxxxxxxxxx@c.us`).
- Jam kerja layanan admin, sesuai catatan di menu Excel.

## 3. Menjalankan Bot

```bash
npm start
```

Saat pertama kali dijalankan akan muncul **QR code** di terminal. Scan pakai WhatsApp di ponsel **nomor resmi BPS Belitung Timur** (Perangkat Tertaut / Linked Devices). Setelah tersambung sekali, sesi login tersimpan otomatis di folder `session/` sehingga tidak perlu scan ulang setiap kali restart (selama tidak logout).

## 4. Menjalankan Dashboard Riwayat Akses

Buka terminal baru (biarkan bot tetap berjalan di terminal pertama):

```bash
npm run dashboard
```

Lalu buka `http://localhost:3000` di browser. Halaman ini menampilkan:

- Jumlah total interaksi dan jumlah nomor WA unik yang pernah memakai bot.
- Tabel riwayat lengkap (tanggal, jam, nomor, nama, pesan masuk, mode jawaban, kode menu, balasan) — bisa dicari dengan kotak pencarian.
- Otomatis refresh tiap 30 detik.

File mentahnya juga tetap tersimpan sebagai `riwayat_akses.csv` di folder proyek, bisa dibuka langsung dengan Excel kapan pun dibutuhkan.

## 5. Cara Kerja Alur Pesan

1. **Sapaan** ("halo", "hai", "menu", dst.) → bot membalas menu utama.
2. **Ketik nomor kode menu** (mis. `1`, `11`, `111`) → bot menavigasi sesuai isi Excel, sama seperti bot lama.
3. **Ketik kata kunci / pertanyaan bebas** (mis. `data kemiskinan`, `alamat kantor BPS`) → bot langsung mencari topik paling cocok dan membalas otomatis (ditandai `*Jawab Otomatis (AI)*`), tanpa pengguna perlu klik menu berjenjang.
4. Kode **Konsultasi Statistik (2)**, **Hubungi Admin (9)**, dan **Janji Temu (99)** → bot menandai sesi pengguna sebagai "tersambung admin" sehingga pesan berikutnya diteruskan apa adanya ke admin (tidak dibalas otomatis), sampai pengguna mengetik `0` untuk kembali ke menu.
5. **Setiap** langkah di atas selalu dicatat ke `riwayat_akses.csv`.

## 6. Menambah / Mengubah Isi Menu

- Untuk mengubah isi jawaban per kode menu → edit `menu.json` (atau edit ulang Excel lalu jalankan ulang skrip konversi bila Excel diperbarui).
- Untuk menambah kata kunci baru supaya mode AI makin pintar mengenali pertanyaan → tambahkan di `keywords.json`, pada kode menu terkait.

## 7. Catatan Deployment

- Bot ini memakai `whatsapp-web.js`, yaitu library tidak resmi yang menjalankan WhatsApp Web di background (headless browser). Nomor yang dipakai sebaiknya nomor khusus untuk layanan (WhatsApp Business), dan perangkat harus tetap menyala/online agar bot terus aktif.
- Jika ke depan ingin memakai jalur resmi (WhatsApp Business Cloud API dari Meta), struktur `menu.json`, `keywords.json`, `lib/search.js`, dan `lib/logger.js` tetap bisa dipakai ulang — yang perlu diganti hanya bagian pengiriman/penerimaan pesan di `index.js`.
