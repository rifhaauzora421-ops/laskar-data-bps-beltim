require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const {
  getMenuByCode,
  isKodeValid,
  isKodeAdmin,
  getMenuUtama,
} = require('./lib/menuEngine');

const {
  cariKeywordLokal,
  cariDenganAI,
  aiAktif,
} = require('./lib/search');

const {
  logAkses,
  LOG_PATH,
} = require('./lib/logger');


// =========================================================
// MENU UTAMA
// =========================================================

const SAPAAN_AWAL =
  'Hai #SahabatData, Selamat Datang di *LASKAR DATA* ' +
  '(Layanan Statistik dan Konsultasi Seputar Data) ' +
  'BPS Kabupaten Belitung Timur\n\n' +

  '━━━━━━━━━━━━━━━━━━━━\n' +
  '⚙️ *KONTROL MENU*\n' +
  '━━━━━━━━━━━━━━━━━━━━\n\n' +

  '🛑 *STOP*\n' +
  'Ketik *STOP* untuk menghentikan balasan otomatis.\n\n' +

  '▶️ *START*\n' +
  'Ketik *START* untuk mengaktifkan kembali menu.\n\n' +

  '━━━━━━━━━━━━━━━━━━━━\n\n' +

  getMenuUtama();


// =========================================================
// STATUS SESI USER
// =========================================================
//
// BOT
// User menggunakan bot secara normal.
//
// WAITING_ADMIN
// User memilih menu admin tetapi belum mengirim pertanyaan.
//
// ADMIN_ACTIVE
// User sedang dilayani admin.
//
// WAITING_CLOSE
// Admin meminta user menutup sesi.
//
// STOPPED
// User mematikan bot/menu otomatis.
// Hanya START yang akan mengaktifkannya kembali.
// =========================================================

const sesiPengguna = new Map();


// =========================================================
// CACHE IDENTITAS
// =========================================================

const cacheIdentitas = new Map();


// =========================================================
// ANTRIAN PER USER
// =========================================================
//
// User berbeda tetap bisa diproses bersamaan.
// User yang sama diproses berurutan.
// =========================================================

const antrianUser = new Map();


// =========================================================
// PENANDA PESAN YANG DIKIRIM BOT
// =========================================================
//
// Karena admin dan bot menggunakan 1 WhatsApp,
// event message_create akan muncul untuk pesan
// yang dikirim oleh bot maupun admin.
//
// Kita tandai pesan yang memang dikirim oleh bot
// supaya tidak dianggap sebagai jawaban admin.
// =========================================================

const pesanDikirimBot = new Map();


// =========================================================
// CLIENT WHATSAPP
// =========================================================

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session',
  }),

  puppeteer: {
  headless: true,

  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-features=Translate,BackForwardCache',
  ],

  defaultViewport: null,
},
});


// =========================================================
// QR
// =========================================================

client.on('qr', (qr) => {
  console.log(
    'Silakan scan QR WhatsApp BPS Belitung Timur:'
  );

  qrcode.generate(qr, {
    small: true,
  });
});


// =========================================================
// READY
// =========================================================

client.on('ready', () => {
  console.log('');
  console.log('==============================================');
  console.log('✅ BOT LASKAR DATA BPS BELITUNG TIMUR ONLINE');
  console.log('==============================================');

  console.log(
    `AI Claude: ${
      aiAktif
        ? 'AKTIF'
        : 'NONAKTIF'
    }`
  );

  console.log(
    `Riwayat: ${LOG_PATH}`
  );

  console.log(
    'Keyword lokal: PRIORITAS'
  );

  console.log(
    'Sesi admin: AKTIF'
  );

  console.log(
    'STOP / START: AKTIF'
  );

  console.log('');
});


// =========================================================
// AUTHENTICATED
// =========================================================

client.on('authenticated', () => {
  console.log('✅ WhatsApp berhasil terautentikasi.');
});


// =========================================================
// AUTH FAILURE
// =========================================================

client.on('auth_failure', (msg) => {
  console.error(
    '❌ WhatsApp authentication failure:',
    msg
  );
});


// =========================================================
// DISCONNECTED
// =========================================================

client.on('disconnected', (reason) => {
  console.log(
    '⚠️ WhatsApp terputus:',
    reason
  );
});


// =========================================================
// PESAN USER
// =========================================================

client.on('message', (msg) => {

  // Jangan proses pesan dari nomor bot sendiri
  if (msg.fromMe) {
    return;
  }

  // Abaikan grup dan status
  if (
    msg.from.endsWith('@g.us') ||
    msg.isStatus
  ) {
    return;
  }

  const userId = msg.from;


  /*
    User yang berbeda tetap bisa diproses bersamaan.

    User yang sama:
    pesan 1
       ↓
    selesai
       ↓
    pesan 2
       ↓
    selesai
  */

  const sebelumnya =
    antrianUser.get(userId) ||
    Promise.resolve();


  const sekarang =
    sebelumnya
      .then(() => tanganiPesan(msg))
      .catch((err) => {

        console.error(
          '❌ Error memproses pesan:',
          err
        );

      })
      .finally(() => {

        if (
          antrianUser.get(userId) ===
          sekarang
        ) {
          antrianUser.delete(userId);
        }

      });


  antrianUser.set(
    userId,
    sekarang
  );
});


// =========================================================
// ADMIN MENGIRIM PESAN
// =========================================================
//
// Karena admin menggunakan nomor WhatsApp yang sama,
// pesan keluar dari WhatsApp akan memunculkan
// event message_create.
//
// Pesan bot sendiri harus diabaikan.
// Pesan yang benar-benar diketik admin akan diproses.
// =========================================================

client.on(
  'message_create',
  async (msg) => {

    try {

      if (!msg.fromMe) {
        return;
      }

      if (!msg.to) {
        return;
      }

      if (
        msg.to.endsWith('@g.us')
      ) {
        return;
      }


      // ------------------------------------------------------
      // CEK APAKAH PESAN INI DIKIRIM OLEH BOT
      // ------------------------------------------------------

      const userId = msg.to;

      const teksPesan =
        normalisasi(
          msg.body || ''
        );


      if (
        pesanDikirimBot.has(userId)
      ) {

        const daftar =
          pesanDikirimBot.get(userId);


        const index =
          daftar.indexOf(
            teksPesan
          );


        if (index !== -1) {

          daftar.splice(
            index,
            1
          );


          if (
            daftar.length === 0
          ) {
            pesanDikirimBot.delete(
              userId
            );
          }


          // Ini pesan bot, bukan admin.
          return;
        }
      }


      // ------------------------------------------------------
      // Kalau bukan pesan bot,
      // berarti kemungkinan pesan admin.
      // ------------------------------------------------------

      await tanganiPesanAdmin(msg);

    } catch (err) {

      console.error(
        '❌ Error pesan admin:',
        err
      );

    }

  }
);


// =========================================================
// PROSES PESAN USER
// =========================================================

async function tanganiPesan(msg) {

  const whatsappId =
    msg.from;


  const pesanAsli =
    (msg.body || '').trim();


  const pesanKode =
    pesanAsli.replace(
      /\s+/g,
      ''
    );


  if (!pesanAsli) {
    return;
  }


  // =======================================================
  // STATUS USER
  // =======================================================

  const status =
    sesiPengguna.get(
      whatsappId
    ) || 'BOT';


  // =======================================================
  // COMMAND START
  // =======================================================
  //
  // START harus diperiksa PALING AWAL setelah
  // pesan diterima.
  //
  // Dengan begitu user yang sedang STOP tetap
  // bisa mengaktifkan kembali bot.
  // =======================================================

  if (
    isPerintahStart(
      pesanAsli
    )
  ) {

    // Aktifkan bot
    sesiPengguna.set(
      whatsappId,
      'BOT'
    );


    const balasan =
      SAPAAN_AWAL;


    await balasBot(
      msg,
      balasan
    );


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'START',
      kodeMenu: '0',
      balasan,
    });


    console.log(
      `▶️ USER START: ${info.nomor}`
    );


    return;
  }


  // =======================================================
  // COMMAND STOP
  // =======================================================
  //
  // PENTING:
  //
  // Jika user sedang ADMIN:
  // STOP = tutup sesi admin.
  //
  // Jika user sedang BOT:
  // STOP = matikan bot/menu otomatis.
  //
  // Jadi 1 perintah STOP memiliki fungsi
  // sesuai kondisi user.
  // =======================================================

  if (
    isPerintahStop(
      pesanAsli
    )
  ) {

    // -----------------------------------------------------
    // Jika sedang sesi admin
    // -----------------------------------------------------

    if (
      status === 'WAITING_ADMIN' ||
      status === 'ADMIN_ACTIVE' ||
      status === 'WAITING_CLOSE'
    ) {

      await tutupSesi(
        msg,
        whatsappId
      );


      return;
    }


    // -----------------------------------------------------
    // Jika sedang BOT
    // -----------------------------------------------------

    sesiPengguna.set(
      whatsappId,
      'STOPPED'
    );


    const balasanStop =
      '🛑 *BOT DINONAKTIFKAN*\n\n' +

      'Baik #SahabatData, balasan otomatis ' +
      'telah dihentikan untuk nomor Anda.\n\n' +

      'Bot tidak akan membalas pesan otomatis ' +
      'sampai Anda mengaktifkannya kembali.\n\n' +

      '▶️ Ketik *START* untuk mengaktifkan kembali.';


    await balasBot(
      msg,
      balasanStop
    );


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'STOP',
      kodeMenu: '',
      balasan: balasanStop,
    });


    console.log(
      `🛑 USER STOP: ${info.nomor}`
    );


    return;
  }


  // =======================================================
  // USER DALAM STATUS STOPPED
  // =======================================================
  //
  // Setelah STOP:
  //
  // halo       → diam
  // publikasi  → diam
  // 1          → diam
  // pertanyaan → diam
  //
  // Hanya START yang diproses karena sudah
  // ditangani di atas.
  // =======================================================

  if (
    status === 'STOPPED'
  ) {

    console.log(
      `⏸️ USER STOPPED - diabaikan: ${whatsappId}`
    );


    return;
  }


  // =======================================================
  // PENUTUPAN SESI
  // =======================================================
  //
  // Untuk sesi admin:
  //
  // STOP
  // SELESAI
  // TUTUP
  // BAIK
  // OKE
  //
  // bisa menutup sesi sesuai status.
  // =======================================================

  if (
    status !== 'BOT' &&
    isPerintahTutup(
      pesanAsli,
      status
    )
  ) {

    await tutupSesi(
      msg,
      whatsappId
    );


    return;
  }


  // =======================================================
  // WAITING ADMIN
  // =======================================================

  if (
    status === 'WAITING_ADMIN'
  ) {

    /*
      Pesan pertama user setelah memilih admin
      berarti percakapan admin sudah dimulai.
    */

    sesiPengguna.set(
      whatsappId,
      'ADMIN_ACTIVE'
    );


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'ADMIN',
      kodeMenu: '',
      balasan:
        '(pesan masuk ke sesi admin)',
    });


    console.log(
      `👨‍💼 ADMIN SESSION: ${info.nomor}`
    );


    return;
  }


  // =======================================================
  // ADMIN ACTIVE
  // =======================================================

  if (
    status === 'ADMIN_ACTIVE'
  ) {

    /*
      BOT TIDAK BOLEH MENJAWAB.

      Semua percakapan ditangani admin
      secara manual.
    */

    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'ADMIN',
      kodeMenu: '',
      balasan:
        '(pesan user dalam sesi admin)',
    });


    console.log(
      `👨‍💼 ADMIN SESSION: ${info.nomor}`
    );


    return;
  }


  // =======================================================
  // WAITING CLOSE
  // =======================================================

  if (
    status === 'WAITING_CLOSE'
  ) {

    /*
      Seharusnya status WAITING_CLOSE
      sudah tertangani oleh isPerintahTutup
      di atas.

      Kalau pesan lain masuk, jangan dijawab.
    */

    return;
  }


  // =======================================================
  // SAPAAN
  // =======================================================

  const sapaanRegex =
    /^(halo|hallo|hai|hi|p|permisi|assalamualaikum|menu)$/i;


  if (
    sapaanRegex.test(
      pesanAsli
    )
  ) {

    await balasBot(
      msg,
      SAPAAN_AWAL
    );


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'MENU',
      kodeMenu: '0',
      balasan: SAPAAN_AWAL,
    });


    return;
  }


  // =======================================================
  // MENU ANGKA
  // =======================================================

  if (
    isKodeValid(
      pesanKode
    )
  ) {

    const balasan =
      getMenuByCode(
        pesanKode
      );


    await balasBot(
      msg,
      balasan
    );


    /*
      Jika menu adalah ADMIN,
      masuk mode admin.
    */

    if (
      isKodeAdmin(
        pesanKode
      )
    ) {

      sesiPengguna.set(
        whatsappId,
        'WAITING_ADMIN'
      );


      console.log(
        `🟠 User ${whatsappId} meminta ADMIN.`
      );
    }


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'MENU',
      kodeMenu: pesanKode,
      balasan,
    });


    return;
  }


  // =======================================================
  // KEYWORD LOKAL
  // =======================================================
  //
  // PENTING:
  // Keyword lokal diproses SEBELUM Claude.
  //
  // Contoh:
  //
  // publikasi kecamatan simpang pesak
  //
  // akan dicari di keywords.json terlebih dahulu.
  // =======================================================

  const hasilLokal =
    cariKeywordLokal(
      pesanAsli
    );


  if (
    hasilLokal &&
    hasilLokal.kode &&
    isKodeValid(
      String(
        hasilLokal.kode
      )
    )
  ) {

    const kode =
      String(
        hasilLokal.kode
      );


    const balasan =
      getMenuByCode(
        kode
      );


    await balasBot(
      msg,
      `*Jawab Otomatis*\n${balasan}`
    );


    if (
      isKodeAdmin(
        kode
      )
    ) {

      sesiPengguna.set(
        whatsappId,
        'WAITING_ADMIN'
      );
    }


    const info =
      await getIdentitasUser(
        msg
      );


    logAkses({
      nomor: info.nomor,
      nama: info.nama,
      pesanMasuk: pesanAsli,
      modeJawaban: 'KEYWORD',
      kodeMenu: kode,
      balasan,
    });


    console.log(
      `⚡ KEYWORD ${kode} → ${pesanAsli}`
    );


    return;
  }


  // =======================================================
  // CLAUDE
  // =======================================================
  //
  // Claude hanya dipanggil jika keyword lokal
  // tidak menemukan jawaban.
  // =======================================================

  if (
    aiAktif
  ) {

    console.log(
      `🤖 AI → ${pesanAsli}`
    );


    const hasilAI =
      await cariDenganAI(
        pesanAsli
      );


    if (
      hasilAI &&
      hasilAI.kode &&
      isKodeValid(
        String(
          hasilAI.kode
        )
      )
    ) {

      const kode =
        String(
          hasilAI.kode
        );


      const balasan =
        getMenuByCode(
          kode
        );


      await balasBot(
        msg,
        `*Jawab Otomatis (AI)*\n${balasan}`
      );


      if (
        isKodeAdmin(
          kode
        )
      ) {

        sesiPengguna.set(
          whatsappId,
          'WAITING_ADMIN'
        );
      }


      const info =
        await getIdentitasUser(
          msg
        );


      logAkses({
        nomor: info.nomor,
        nama: info.nama,
        pesanMasuk: pesanAsli,
        modeJawaban: 'AI_CLAUDE',
        kodeMenu: kode,
        balasan,
      });


      return;
    }
  }


  // =======================================================
  // TIDAK DIKENALI
  // =======================================================

  const balasanTidakDikenali =
    'Maaf, #SahabatData, saya belum menemukan informasi yang sesuai.\n\n' +

    'Coba gunakan kata kunci yang lebih spesifik, misalnya:\n' +

    '• publikasi kecamatan simpang pesak\n' +
    '• data IPM\n' +
    '• jumlah penduduk\n' +
    '• kemiskinan\n\n' +

    'Atau ketik *MENU* untuk melihat layanan.';


  await balasBot(
    msg,
    balasanTidakDikenali
  );


  const info =
    await getIdentitasUser(
      msg
    );


  logAkses({
    nomor: info.nomor,
    nama: info.nama,
    pesanMasuk: pesanAsli,
    modeJawaban:
      'TIDAK_DIKENALI',
    kodeMenu: '',
    balasan:
      balasanTidakDikenali,
  });
}


// =========================================================
// ADMIN MENGIRIM PESAN
// =========================================================

async function tanganiPesanAdmin(msg) {

  const userId =
    msg.to;


  const status =
    sesiPengguna.get(
      userId
    );


  if (
    status !== 'ADMIN_ACTIVE'
  ) {
    return;
  }


  const pesanAdmin =
    (msg.body || '').trim();


  if (!pesanAdmin) {
    return;
  }


  /*
    Contoh admin:

    "Jika tidak ada pertanyaan lain
    silakan ketik STOP"

    atau:

    "Silakan tutup sesi"

    atau:

    "Ketik STOP jika sudah selesai"
  */


  if (
    pesanAdminMemintaPenutupan(
      pesanAdmin
    )
  ) {

    sesiPengguna.set(
      userId,
      'WAITING_CLOSE'
    );


    console.log(
      `🟡 MENUNGGU STOP dari user: ${userId}`
    );


    return;
  }


  /*
    Admin menjawab biasa.

    Status tetap ADMIN_ACTIVE.
  */

  console.log(
    `👨‍💼 Admin menjawab user: ${userId}`
  );
}


// =========================================================
// TUTUP SESI ADMIN
// =========================================================

async function tutupSesi(
  msg,
  whatsappId
) {

  sesiPengguna.set(
    whatsappId,
    'BOT'
  );


  const balasan =
    '✅ *Sesi pertanyaan telah ditutup.*\n\n' +

    'Terima kasih telah menghubungi ' +
    '*LASKAR DATA BPS Kabupaten Belitung Timur*. 🙏\n\n' +

    'Jika membutuhkan informasi lainnya, ' +
    'silakan ketik *MENU* atau *HALO*.';


  await balasBot(
    msg,
    balasan
  );


  const info =
    await getIdentitasUser(
      msg
    );


  logAkses({
    nomor: info.nomor,
    nama: info.nama,
    pesanMasuk:
      msg.body || '',
    modeJawaban:
      'PENUTUPAN_SESI',
    kodeMenu: '',
    balasan,
  });


  console.log(
    `✅ SESI DITUTUP: ${info.nomor}`
  );
}


// =========================================================
// PERINTAH STOP
// =========================================================

function isPerintahStop(
  pesan
) {

  const teks =
    normalisasi(
      pesan
    );


  const perintahStop = [

    'stop',

    'stop bot',

    'stop menu',

    'berhenti',

    'hentikan',

    'matikan bot',

    'matikan menu',

    'nonaktifkan bot',

    'nonaktifkan menu',

    'jangan balas',

    'jangan jawab',

    'tidak perlu balas',

    'tidak usah balas',

    'tutup bot',

  ];


  return perintahStop.includes(
    teks
  );
}


// =========================================================
// PERINTAH START
// =========================================================

function isPerintahStart(
  pesan
) {

  const teks =
    normalisasi(
      pesan
    );


  const perintahStart = [

    'start',

    'start bot',

    'start menu',

    'mulai',

    'aktifkan',

    'aktifkan bot',

    'aktifkan menu',

    'nyalakan bot',

    'nyalakan menu',

    'buka menu',

    'kembali ke menu',

  ];


  return perintahStart.includes(
    teks
  );
}


// =========================================================
// PERINTAH TUTUP SESI
// =========================================================

function isPerintahTutup(
  pesan,
  status
) {

  const teks =
    normalisasi(
      pesan
    );


  /*
    Perintah pasti.

    Berlaku ketika user berada
    dalam sesi admin.
  */

  const perintahPasti = [

    'stop',

    'selesai',

    'tutup',

    'tutup sesi',

    'tutup pertanyaan',

    'selesai kak',

    'sudah selesai',

    'sudah cukup',

    'cukup',

  ];


  if (
    perintahPasti.includes(
      teks
    )
  ) {

    return true;
  }


  /*
    "baik", "oke", "siap", dll
    hanya boleh menutup ketika
    admin sudah meminta penutupan.
  */

  if (
    status === 'WAITING_CLOSE'
  ) {

    const persetujuan = [

      'baik',

      'baik kak',

      'baik pak',

      'baik bu',

      'oke',

      'ok',

      'okay',

      'siap',

      'terima kasih',

      'terimakasih',

      'makasih',

      'makasih kak',

    ];


    return persetujuan.includes(
      teks
    );
  }


  return false;
}


// =========================================================
// DETEKSI ADMIN MEMINTA PENUTUPAN
// =========================================================

function pesanAdminMemintaPenutupan(
  pesan
) {

  const teks =
    normalisasi(
      pesan
    );


  return (

    teks.includes(
      'ketik stop'
    ) ||

    teks.includes(
      'ketik selesai'
    ) ||

    teks.includes(
      'silakan stop'
    ) ||

    teks.includes(
      'silahkan stop'
    ) ||

    teks.includes(
      'tutup sesi'
    ) ||

    teks.includes(
      'menutup sesi'
    ) ||

    teks.includes(
      'jika tidak ada pertanyaan'
    ) ||

    teks.includes(
      'tidak ada pertanyaan lagi'
    ) ||

    teks.includes(
      'tidak ada pertanyaan lain'
    )

  );
}


// =========================================================
// NORMALISASI
// =========================================================

function normalisasi(
  text
) {

  return String(
    text || ''
  )

    .toLowerCase()

    .normalize(
      'NFD'
    )

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    .replace(
      /[^a-z0-9\s]/g,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();
}


// =========================================================
// BALASAN BOT
// =========================================================
//
// Semua balasan bot lewat fungsi ini.
//
// Tujuannya agar event message_create tidak
// menganggap balasan bot sebagai pesan admin.
// =========================================================

async function balasBot(
  msg,
  teks
) {

  const userId =
    msg.from;


  const teksNormal =
    normalisasi(
      teks
    );


  if (
    !pesanDikirimBot.has(
      userId
    )
  ) {

    pesanDikirimBot.set(
      userId,
      []
    );
  }


  const daftar =
    pesanDikirimBot.get(
      userId
    );


  daftar.push(
    teksNormal
  );


  /*
    Batasi cache supaya tidak membesar.
  */

  if (
    daftar.length > 20
  ) {

    daftar.shift();
  }


  return await msg.reply(
    teks
  );
}


// =========================================================
// AMBIL NOMOR USER SEBENARNYA
// =========================================================

async function getIdentitasUser(
  msg
) {

  const whatsappId =
    msg.from;


  /*
    Kalau sudah pernah diambil,
    gunakan cache.
  */

  if (
    cacheIdentitas.has(
      whatsappId
    )
  ) {

    return cacheIdentitas.get(
      whatsappId
    );
  }


  let contact = null;


  try {

    contact =
      await msg.getContact();

  } catch (err) {

    console.error(
      '⚠️ getContact gagal:',
      err.message
    );
  }


  let nomorAsli = null;


  // =======================================================
  // LID → NOMOR ASLI
  // =======================================================

  if (
    typeof client.getContactLidAndPhone ===
    'function'
  ) {

    const kandidat = [];


    if (
      contact &&
      contact.id &&
      contact.id._serialized
    ) {

      kandidat.push(
        contact.id._serialized
      );
    }


    kandidat.push(
      whatsappId
    );


    for (
      const id of [
        ...new Set(
          kandidat
        )
      ]
    ) {

      try {

        const hasil =
          await client.getContactLidAndPhone(
            [id]
          );


        const resolved =
          hasil &&
          hasil[0];


        if (
          resolved &&
          resolved.pn
        ) {

          const digits =
            String(
              resolved.pn
            ).replace(
              /@c\.us$/i,
              ''
            );


          if (
            /^\d+$/.test(
              digits
            )
          ) {

            nomorAsli =
              digits;


            break;
          }
        }

      } catch (_) {

        // Coba metode berikutnya.

      }
    }
  }


  // =======================================================
  // FALLBACK CONTACT.NUMBER
  // =======================================================

  if (
    !nomorAsli &&
    contact &&
    contact.number
  ) {

    const digits =
      String(
        contact.number
      ).replace(
        /\D/g,
        ''
      );


    /*
      Jangan menerima LID seperti:
      272348171247739

      Untuk Indonesia,
      nomor asli diterima jika:
      62...
      atau
      08...
    */

    if (
      /^(62|08)\d{8,13}$/.test(
        digits
      )
    ) {

      nomorAsli =
        digits;
    }
  }


  // =======================================================
  // FALLBACK FORMATTED NUMBER
  // =======================================================

  if (
    !nomorAsli &&
    contact &&
    typeof contact.getFormattedNumber ===
    'function'
  ) {

    try {

      const formatted =
        await contact.getFormattedNumber();


      const digits =
        String(
          formatted || ''
        ).replace(
          /\D/g,
          ''
        );


      if (
        /^(62|08)\d{8,13}$/.test(
          digits
        )
      ) {

        nomorAsli =
          digits;
      }

    } catch (_) {

      // Abaikan.

    }
  }


  // =======================================================
  // HASIL NOMOR
  // =======================================================

  /*
    Jika berhasil:

    6281278578240
            ↓
    081278578240

    Jika gagal:

    JANGAN mengubah LID
    272... menjadi nomor palsu.
  */

  const nomor =
    nomorAsli
      ? formatNomorIndonesia(
          nomorAsli
        )
      : `ID WhatsApp ${whatsappId}`;


  const nama =
    (
      contact &&
      (
        contact.pushname ||
        contact.name
      )
    ) ||
    nomor;


  const data = {
    nomor,
    nama,
  };


  cacheIdentitas.set(
    whatsappId,
    data
  );


  return data;
}


// =========================================================
// FORMAT NOMOR INDONESIA
// =========================================================

function formatNomorIndonesia(
  value
) {

  let digits =
    String(
      value
    ).replace(
      /\D/g,
      ''
    );


  if (
    digits.startsWith(
      '62'
    )
  ) {

    digits =
      '0' +
      digits.slice(2);
  }


  if (
    digits.startsWith(
      '0'
    )
  ) {

    return digits;
  }


  return '0' + digits;
}


// =========================================================
// BERSIHKAN CACHE IDENTITAS
// =========================================================

setInterval(
  () => {

    if (
      cacheIdentitas.size >
      2000
    ) {

      cacheIdentitas.clear();


      console.log(
        '🧹 Cache identitas dibersihkan.'
      );
    }

  },
  30 * 60 * 1000
);


// =========================================================
// BERSIHKAN CACHE PESAN BOT
// =========================================================

setInterval(
  () => {

    if (
      pesanDikirimBot.size >
      2000
    ) {

      pesanDikirimBot.clear();


      console.log(
        '🧹 Cache pesan bot dibersihkan.'
      );
    }

  },
  30 * 60 * 1000
);


// =========================================================
// START BOT
// =========================================================

console.log('');
console.log(
  '🚀 Menjalankan LASKAR DATA BPS Belitung Timur...'
);
console.log('');


client.initialize();