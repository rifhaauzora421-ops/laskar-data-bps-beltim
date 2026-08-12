const fs = require('fs');
const path = require('path');

/*
=========================================================
LOAD KEYWORDS
=========================================================
*/

const KEYWORDS_PATH = path.join(
  __dirname,
  '..',
  'keywords.json'
);

let keywordsData = {};

try {
  keywordsData = JSON.parse(
    fs.readFileSync(
      KEYWORDS_PATH,
      'utf8'
    )
  );

  console.log(
    `✅ Keywords loaded: ${Object.keys(keywordsData).length} kode`
  );

} catch (err) {

  console.error(
    '❌ Gagal membaca keywords.json:',
    err.message
  );
}


/*
=========================================================
NORMALISASI
=========================================================
*/

function normalisasi(text) {

  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
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


/*
=========================================================
STOP WORD
=========================================================
*/

const STOP_WORDS = new Set([
  'yang',
  'dan',
  'di',
  'ke',
  'dari',
  'untuk',
  'dengan',
  'pada',
  'ini',
  'itu',
  'saya',
  'mau',
  'ingin',
  'bisa',
  'bagaimana',
  'cara',
  'apa',
  'ada',
  'nya',
  'dong',
  'tolong',
  'mohon',
  'kak',
  'pak',
  'bu',
  'bps'
]);


/*
=========================================================
TOKEN
=========================================================
*/

function tokenisasi(text) {

  return normalisasi(text)
    .split(' ')
    .filter(Boolean)
    .filter(
      token => !STOP_WORDS.has(token)
    );
}


/*
=========================================================
ADMIN INTENT
=========================================================
*/

/*
JANGAN gunakan kata:

- statistik
- data
- tanya
- bantuan
- bps

sebagai penentu ADMIN.

Admin hanya boleh aktif jika user benar-benar
menyebut maksud untuk berbicara dengan admin.
*/

const ADMIN_PHRASES = [
  'hubungi admin',
  'hubungi admin bps',
  'chat admin',
  'chat dengan admin',
  'bicara dengan admin',
  'bicara admin',
  'ingin bicara dengan admin',
  'mau bicara dengan admin',
  'tanya admin',
  'tanya ke admin',
  'bertanya ke admin',
  'minta admin',
  'minta bantuan admin',
  'hubungi cs',
  'chat cs',
  'customer service',
  'kontak admin',
  'kontak cs'
];


/*
=========================================================
KODE ADMIN YANG DILINDUNGI
=========================================================
*/

const ADMIN_CODES = new Set([
  '2',
  '9'
]);


/*
=========================================================
CEK ADMIN
=========================================================
*/

function isExplicitAdminRequest(text) {

  const normalized =
    normalisasi(text);

  return ADMIN_PHRASES.some(
    phrase =>
      normalized === phrase ||
      normalized.includes(
        phrase
      )
  );
}


/*
=========================================================
KATA KUNCI KHUSUS ADMIN
=========================================================
*/

function isAdminCodeAllowed(
  code,
  text
) {

  if (
    !ADMIN_CODES.has(
      String(code)
    )
  ) {
    return true;
  }

  return isExplicitAdminRequest(
    text
  );
}


/*
=========================================================
FUZZY SIMILARITY
=========================================================
*/

function levenshtein(a, b) {

  const matrix = [];

  for (
    let i = 0;
    i <= b.length;
    i++
  ) {

    matrix[i] = [i];
  }

  for (
    let j = 0;
    j <= a.length;
    j++
  ) {

    matrix[0][j] = j;
  }

  for (
    let i = 1;
    i <= b.length;
    i++
  ) {

    for (
      let j = 1;
      j <= a.length;
      j++
    ) {

      if (
        b.charAt(i - 1) ===
        a.charAt(j - 1)
      ) {

        matrix[i][j] =
          matrix[i - 1][j - 1];

      } else {

        matrix[i][j] =
          Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
      }
    }
  }

  return matrix[b.length][a.length];
}


function similarity(a, b) {

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (
    a.includes(b) ||
    b.includes(a)
  ) {

    const panjang =
      Math.max(
        a.length,
        b.length
      );

    const pendek =
      Math.min(
        a.length,
        b.length
      );

    return (
      pendek /
      panjang
    ) * 0.9 + 0.1;
  }

  const distance =
    levenshtein(
      a,
      b
    );

  return Math.max(
    0,
    1 -
      distance /
        Math.max(
          a.length,
          b.length
        )
  );
}


/*
=========================================================
TOKEN OVERLAP
=========================================================
*/

function tokenOverlap(
  queryTokens,
  keywordTokens
) {

  if (
    !queryTokens.length ||
    !keywordTokens.length
  ) {
    return 0;
  }

  let cocok = 0;

  for (
    const token of keywordTokens
  ) {

    if (
      queryTokens.includes(
        token
      )
    ) {

      cocok++;
    }
  }

  return (
    cocok /
    keywordTokens.length
  );
}


/*
=========================================================
PENILAIAN KEYWORD
=========================================================
*/

function scoreKeyword(
  query,
  keyword
) {

  const q =
    normalisasi(query);

  const k =
    normalisasi(keyword);

  if (!q || !k) {
    return 0;
  }


  /*
  EXACT MATCH
  */

  if (q === k) {
    return 1000;
  }


  /*
  FULL PHRASE
  */

  if (
    q.includes(k)
  ) {

    /*
    Semakin panjang keyword,
    semakin tinggi nilainya.
    */

    return (
      700 +
      k.split(' ').length * 80 +
      k.length
    );
  }


  /*
  QUERY ADA DI KEYWORD
  */

  if (
    k.includes(q)
  ) {

    return (
      500 +
      q.split(' ').length * 60
    );
  }


  /*
  TOKEN
  */

  const queryTokens =
    tokenisasi(q);

  const keywordTokens =
    tokenisasi(k);

  const overlap =
    tokenOverlap(
      queryTokens,
      keywordTokens
    );


  /*
  FUZZY
  */

  const fuzzy =
    similarity(
      q,
      k
    );


  let score =
    overlap * 400 +
    fuzzy * 100;


  /*
  Bonus berdasarkan jumlah
  token yang benar-benar cocok.
  */

  const jumlahCocok =
    keywordTokens.filter(
      token =>
        queryTokens.includes(
          token
        )
    ).length;

  score +=
    jumlahCocok * 80;


  return score;
}


/*
=========================================================
KATA KUNCI WAJIB / KOMBINASI
=========================================================
*/

/*
Ini digunakan untuk menghindari konflik.

Contoh:

"publikasi kecamatan simpang pesak"

harus lebih kuat ke 63 daripada
kode 4 "publikasi".
*/

const PRIORITY_PHRASES = {

  '63': [
    'publikasi kecamatan simpang pesak',
    'publikasi simpang pesak',
    'simpang pesak dalam angka',
    'kecamatan simpang pesak dalam angka',
    'data simpang pesak',
    'statistik simpang pesak'
  ],

  '62': [
    'publikasi kecamatan dendang',
    'publikasi dendang',
    'dendang dalam angka',
    'kecamatan dendang dalam angka',
    'data dendang',
    'statistik dendang'
  ],

  '64': [
    'publikasi kecamatan simpang renggiang',
    'publikasi simpang renggiang',
    'simpang renggiang dalam angka',
    'kecamatan simpang renggiang dalam angka',
    'data simpang renggiang',
    'statistik simpang renggiang'
  ],

  '65': [
    'publikasi kecamatan gantung',
    'publikasi gantung',
    'gantung dalam angka',
    'kecamatan gantung dalam angka',
    'data gantung',
    'statistik gantung'
  ],

  '66': [
    'publikasi kecamatan manggar',
    'publikasi manggar',
    'manggar dalam angka',
    'kecamatan manggar dalam angka',
    'data manggar',
    'statistik manggar'
  ],

  '67': [
    'publikasi kecamatan damar',
    'publikasi damar',
    'damar dalam angka',
    'kecamatan damar dalam angka',
    'data damar',
    'statistik damar'
  ],

  '68': [
    'publikasi kecamatan kelapa kampit',
    'publikasi kelapa kampit',
    'kelapa kampit dalam angka',
    'kecamatan kelapa kampit dalam angka',
    'data kelapa kampit',
    'statistik kelapa kampit'
  ],

  '61': [
    'belitung timur dalam angka',
    'publikasi belitung timur dalam angka',
    'kabupaten belitung timur dalam angka',
    'buku belitung timur dalam angka',
    'statistik belitung timur dalam angka'
  ],

  '114': [
    'indeks pembangunan manusia',
    'data ipm',
    'ipm belitung timur',
    'nilai ipm',
    'angka ipm',
    'statistik ipm'
  ],

  '115': [
    'data kemiskinan',
    'penduduk miskin',
    'jumlah penduduk miskin',
    'persentase penduduk miskin',
    'angka kemiskinan',
    'tingkat kemiskinan'
  ],

  '116': [
    'jumlah penduduk',
    'data kependudukan',
    'penduduk belitung timur',
    'jumlah penduduk belitung timur',
    'kepadatan penduduk',
    'pertumbuhan penduduk'
  ],

  '124': [
    'data pariwisata',
    'jumlah wisatawan',
    'kunjungan wisatawan',
    'wisatawan nusantara',
    'wisatawan mancanegara',
    'pariwisata belitung timur'
  ],

  '125': [
    'pdrb lapangan usaha',
    'pdrb menurut lapangan usaha',
    'produk domestik regional bruto lapangan usaha',
    'pertumbuhan pdrb',
    'struktur ekonomi'
  ],

  '126': [
    'pdrb pengeluaran',
    'pdrb menurut pengeluaran',
    'produk domestik regional bruto pengeluaran',
    'investasi pdrb',
    'ekspor pdrb',
    'impor pdrb'
  ]

};


/*
=========================================================
PRIORITY PHRASE MATCH
=========================================================
*/

function cariPriorityPhrase(
  pesan
) {

  const query =
    normalisasi(
      pesan
    );

  let terbaik = null;

  for (
    const [kode, phrases]
    of Object.entries(
      PRIORITY_PHRASES
    )
  ) {

    for (
      const phrase of phrases
    ) {

      const normalizedPhrase =
        normalisasi(
          phrase
        );

      if (
        query.includes(
          normalizedPhrase
        )
      ) {

        const score =
          5000 +
          normalizedPhrase.length * 100;

        if (
          !terbaik ||
          score >
            terbaik.score
        ) {

          terbaik = {
            kode,
            keyword: phrase,
            score
          };
        }
      }
    }
  }

  return terbaik;
}


/*
=========================================================
CARI KEYWORD LOKAL
=========================================================
*/

function cariKeywordLokal(
  pesan
) {

  const query =
    normalisasi(
      pesan
    );

  if (!query) {
    return null;
  }


  /*
  1. ADMIN EXPLICIT
  */

  if (
    isExplicitAdminRequest(
      query
    )
  ) {

    /*
    Bedakan "Hubungi Admin"
    dan "Konsultasi Statistik".

    Jika benar-benar meminta
    konsultasi statistik -> 2.
    Jika meminta chat/admin -> 9.
    */

    if (
      query.includes(
        'konsultasi statistik'
      ) ||
      query.includes(
        'konsultasi data'
      )
    ) {

      return {
        kode: '2',
        keyword:
          'konsultasi statistik',
        score: 10000
      };
    }

    return {
      kode: '9',
      keyword:
        'permintaan admin',
      score: 10000
    };
  }


  /*
  2. PRIORITY PHRASE
  */

  const priority =
    cariPriorityPhrase(
      query
    );

  if (priority) {

    console.log(
      `🎯 PRIORITY MATCH: ${priority.kode} ← ${priority.keyword}`
    );

    return priority;
  }


  /*
  3. SCAN SEMUA KEYWORD
  */

  const kandidat = [];


  for (
    const [kode, data]
    of Object.entries(
      keywordsData
    )
  ) {

    if (
      !data ||
      !Array.isArray(
        data.keywords
      )
    ) {
      continue;
    }


    /*
    Jangan biarkan kode admin
    menang hanya karena keyword umum.
    */

    if (
      !isAdminCodeAllowed(
        kode,
        query
      )
    ) {

      continue;
    }


    for (
      const keyword of data.keywords
    ) {

      const score =
        scoreKeyword(
          query,
          keyword
        );

      if (
        score <= 0
      ) {
        continue;
      }


      kandidat.push({
        kode,
        label:
          data.label || '',
        keyword,
        score
      });
    }
  }


  /*
  Tidak ada kandidat.
  */

  if (
    kandidat.length === 0
  ) {

    return null;
  }


  /*
  Urutkan score tertinggi.
  */

  kandidat.sort(
    (a, b) =>
      b.score -
      a.score
  );


  const terbaik =
    kandidat[0];

  const kedua =
    kandidat[1];


  /*
  =======================================================
  PROTEKSI AMBIGU
  =======================================================

  Jika dua kategori memiliki skor
  hampir sama, jangan asal pilih.
  */

  if (
    kedua &&
    terbaik.score < 500 &&
    (
      terbaik.score -
      kedua.score
    ) < 60
  ) {

    console.log(
      `⚠️ AMBIGU: ${terbaik.kode} vs ${kedua.kode}`
    );

    return null;
  }


  /*
  =======================================================
  MINIMUM SCORE
  =======================================================
  */

  if (
    terbaik.score < 180
  ) {

    return null;
  }


  /*
  =======================================================
  ADMIN PROTECTION
  =======================================================
  */

  if (
    ADMIN_CODES.has(
      String(
        terbaik.kode
      )
    )
  ) {

    /*
    Tidak boleh masuk admin
    hanya karena kata statistik/data.
    */

    if (
      !isExplicitAdminRequest(
        query
      )
    ) {

      return null;
    }
  }


  console.log(
    `🔎 MATCH ${terbaik.kode} | ${terbaik.keyword} | score=${Math.round(terbaik.score)}`
  );


  return {
    kode:
      String(
        terbaik.kode
      ),

    keyword:
      terbaik.keyword,

    score:
      Math.round(
        terbaik.score
      ),

    label:
      terbaik.label
  };
}


/*
=========================================================
AI
=========================================================
*/

/*
Untuk sekarang kita TIDAK membuat AI
menentukan kode secara bebas.

Jika Claude dipakai, tetap kita validasi
hasil kode terhadap menu.
*/

let anthropic = null;
let aiAktif = false;

try {

  if (
    process.env.ANTHROPIC_API_KEY
  ) {

    const {
      Anthropic
    } = require('@anthropic-ai/sdk');

    anthropic =
      new Anthropic({
        apiKey:
          process.env.ANTHROPIC_API_KEY
      });

    aiAktif = true;
  }

} catch (err) {

  console.log(
    '⚠️ AI Claude tidak tersedia:',
    err.message
  );
}


/*
=========================================================
AI SEARCH
=========================================================
*/

async function cariDenganAI(
  pesan
) {

  /*
  Jika keyword lokal sudah jelas,
  jangan panggil AI.
  */

  const lokal =
    cariKeywordLokal(
      pesan
    );

  if (lokal) {
    return lokal;
  }


  if (
    !aiAktif ||
    !anthropic
  ) {

    return null;
  }


  /*
  HANYA kode yang memang ada
  di keywords.json.
  */

  const daftarKategori =
    Object.entries(
      keywordsData
    )
      .map(
        ([kode, data]) =>
          `${kode} = ${data.label}`
      )
      .join('\n');


  const prompt = `
Kamu adalah classifier untuk chatbot BPS Kabupaten Belitung Timur.

Tugas kamu HANYA menentukan kode kategori yang PALING SESUAI.

Jangan membuat kode baru.

DAFTAR KODE:
${daftarKategori}

ATURAN SANGAT PENTING:

1. Jangan pilih kode 2 atau 9 kecuali user benar-benar meminta admin.
2. Kata "data", "statistik", "tanya", "bantuan", "BPS" saja BUKAN permintaan admin.
3. Jika user menyebut nama kecamatan dan publikasi/statistik/data,
   pilih kode kecamatan yang sesuai.
4. Jika user menyebut Simpang Pesak,
   gunakan kode 63 jika konteksnya publikasi/data/statistik.
5. Jika user menyebut Dendang,
   gunakan kode 62 jika konteksnya publikasi/data/statistik.
6. Jika user menyebut Simpang Renggiang,
   gunakan kode 64 jika konteksnya publikasi/data/statistik.
7. Jika user menyebut Gantung,
   gunakan kode 65 jika konteksnya publikasi/data/statistik.
8. Jika user menyebut Manggar,
   gunakan kode 66 jika konteksnya publikasi/data/statistik.
9. Jika user menyebut Damar,
   gunakan kode 67 jika konteksnya publikasi/data/statistik.
10. Jika user menyebut Kelapa Kampit,
    gunakan kode 68 jika konteksnya publikasi/data/statistik.
11. Jika tidak yakin, kembalikan null.
12. Jangan memilih berdasarkan satu kata umum.

Pertanyaan user:
"${pesan}"

Balas JSON SAJA:

{
  "kode": "63",
  "confidence": 0.95
}

atau:

{
  "kode": null,
  "confidence": 0
}
`;


  try {

    const response =
      await anthropic.messages.create({
        model:
          'claude-3-5-haiku-latest',

        max_tokens:
          200,

        temperature:
          0,

        messages: [
          {
            role: 'user',
            content:
              prompt
          }
        ]
      });


    const text =
      response.content
        ?.map(
          item =>
            item.text || ''
        )
        .join('')
        .trim();


    if (!text) {
      return null;
    }


    let parsed;

    try {

      parsed =
        JSON.parse(
          text
        );

    } catch (_) {

      const match =
        text.match(
          /\{[\s\S]*\}/
        );

      if (!match) {
        return null;
      }

      parsed =
        JSON.parse(
          match[0]
        );
    }


    const kode =
      parsed.kode
        ? String(
            parsed.kode
          )
        : null;


    const confidence =
      Number(
        parsed.confidence
      ) || 0;


    /*
    Confidence minimum.
    */

    if (
      !kode ||
      confidence < 0.80
    ) {

      return null;
    }


    /*
    Pastikan kode memang ada.
    */

    if (
      !keywordsData[kode]
    ) {

      return null;
    }


    /*
    ADMIN PROTECTION
    */

    if (
      ADMIN_CODES.has(
        kode
      ) &&
      !isExplicitAdminRequest(
        pesan
      )
    ) {

      return null;
    }


    return {
      kode,
      score:
        Math.round(
          confidence * 1000
        ),
      keyword:
        'AI',
      confidence
    };


  } catch (err) {

    console.error(
      '❌ AI search error:',
      err.message
    );

    return null;
  }
}


/*
=========================================================
EXPORT
=========================================================
*/

module.exports = {
  cariKeywordLokal,
  cariDenganAI,
  aiAktif,
  normalisasi
};