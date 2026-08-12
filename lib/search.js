const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');


/* =========================================================
   LOAD KEYWORDS
   ========================================================= */

const keywordsDb =
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'keywords.json'
      ),
      'utf-8'
    )
  );


/* =========================================================
   NORMALISASI
   ========================================================= */

function normalisasi(text) {

  return String(
    text || ''
  )
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


function token(text) {

  return normalisasi(
    text
  )
    .split(' ')
    .filter(Boolean);
}


/* =========================================================
   DATASET
   ========================================================= */

const dataset =
  Object.entries(
    keywordsDb
  ).map(
    ([kode, info]) => ({

      kode,

      label:
        info.label,

      keywords:
        info.keywords,

      searchText:
        [
          info.label,
          ...info.keywords,
        ].join(' '),

    })
  );


/* =========================================================
   FUSE
   ========================================================= */

const fuse =
  new Fuse(
    dataset,
    {

      keys: [
        {
          name: 'label',
          weight: 0.35,
        },
        {
          name: 'searchText',
          weight: 0.65,
        },
      ],

      threshold: 0.48,

      ignoreLocation: true,

      includeScore: true,

      minMatchCharLength: 2,

    }
  );


/* =========================================================
   KATA UMUM
   ========================================================= */

const GENERIC_WORDS =
  new Set([

    'data',
    'tentang',
    'mengenai',
    'minta',
    'ingin',
    'cari',
    'carikan',
    'tolong',
    'mohon',
    'bisa',
    'boleh',
    'berapa',
    'yang',
    'di',
    'ke',
    'dari',
    'untuk',
    'apa',
    'bagaimana',
    'dimana',
    'mana',
    'tahun',
    'terbaru',
    'terkini',

  ]);


/* =========================================================
   N-GRAM
   ========================================================= */

function ngramSet(
  words,
  size
) {

  const hasil =
    new Set();


  for (
    let i = 0;
    i <= words.length - size;
    i++
  ) {

    hasil.add(
      words
        .slice(
          i,
          i + size
        )
        .join(' ')
    );
  }


  return hasil;
}


/* =========================================================
   HITUNG SKOR
   ========================================================= */

function hitungSkor(
  pertanyaan,
  kandidat
) {

  const q =
    normalisasi(
      pertanyaan
    );


  const qt =
    token(q);


  const qMeaning =
    qt.filter(
      (x) =>
        !GENERIC_WORDS.has(
          x
        )
    );


  let terbaik = 0;

  let sumber = '';

  let detail = '';


  for (
    const rawKeyword of [
      kandidat.label,
      ...kandidat.keywords,
    ]
  ) {

    const k =
      normalisasi(
        rawKeyword
      );


    if (!k) {
      continue;
    }


    /* =====================================================
       EXACT
       ===================================================== */

    if (
      q === k
    ) {

      if (
        1 > terbaik
      ) {

        terbaik = 1;

        sumber = 'EXACT';

        detail =
          rawKeyword;
      }

      continue;
    }


    /* =====================================================
       KEYWORD ADA DI PERTANYAAN
       ===================================================== */

    if (
      q.includes(k)
    ) {

      const coverage =
        Math.min(
          1,
          token(k).length /
            Math.max(
              1,
              qt.length
            )
        );


      const score =
        0.72 +
        coverage * 0.23;


      if (
        score > terbaik
      ) {

        terbaik =
          score;

        sumber =
          'PHRASE_IN_QUERY';

        detail =
          rawKeyword;
      }
    }


    /* =====================================================
       PERTANYAAN ADA DI KEYWORD
       ===================================================== */

    if (
      k.includes(q) &&
      q.length >= 3
    ) {

      const coverage =
        Math.min(
          1,
          qt.length /
            Math.max(
              1,
              token(k).length
            )
        );


      const score =
        0.72 +
        coverage * 0.23;


      if (
        score > terbaik
      ) {

        terbaik =
          score;

        sumber =
          'QUERY_IN_PHRASE';

        detail =
          rawKeyword;
      }
    }


    /* =====================================================
       TOKEN
       ===================================================== */

    const kt =
      token(k);


    const kSet =
      new Set(
        kt
      );


    const meaningful =
      qMeaning.length
        ? qMeaning
        : qt;


    const overlap =
      meaningful.filter(
        (x) =>
          kSet.has(x)
      ).length;


    if (
      overlap > 0
    ) {

      const coverage =
        overlap /
        Math.max(
          1,
          meaningful.length
        );


      const precision =
        overlap /
        Math.max(
          1,
          kt.length
        );


      const score =
        0.55 * coverage +
        0.45 * precision;


      if (
        score > terbaik
      ) {

        terbaik =
          score;

        sumber =
          'TOKEN';

        detail =
          rawKeyword;
      }
    }


    /* =====================================================
       BIGRAM
       ===================================================== */

    const q2 =
      ngramSet(
        qt,
        2
      );


    const k2 =
      ngramSet(
        kt,
        2
      );


    let bigramHit = 0;


    for (
      const phrase of q2
    ) {

      if (
        k2.has(
          phrase
        )
      ) {

        bigramHit++;
      }
    }


    if (
      bigramHit > 0
    ) {

      const score =
        Math.min(
          0.92,
          0.68 +
            bigramHit * 0.10
        );


      if (
        score > terbaik
      ) {

        terbaik =
          score;

        sumber =
          'BIGRAM';

        detail =
          rawKeyword;
      }
    }
  }


  /* =====================================================
     BONUS LOKASI + PUBLIKASI
     ===================================================== */

  const lokasi =
    [
      'dendang',
      'simpang pesak',
      'simpang renggiang',
      'gantung',
      'manggar',
      'damar',
      'kelapa kampit',
    ];


  const adaLokasi =
    lokasi.some(
      (loc) =>
        q.includes(
          loc
        )
    );


  const adaPublikasi =
    q.includes(
      'publikasi'
    ) ||
    q.includes(
      'dalam angka'
    ) ||
    q.includes(
      'buku'
    );


  if (
    adaLokasi &&
    adaPublikasi
  ) {

    const teksKandidat =
      normalisasi(
        [
          kandidat.label,
          ...kandidat.keywords,
        ].join(' ')
      );


    const kandidatSpesifik =
      lokasi.some(
        (loc) =>
          teksKandidat.includes(
            loc
          )
      );


    if (
      kandidatSpesifik
    ) {

      terbaik =
        Math.min(
          1,
          terbaik + 0.15
        );
    }
  }


  return {
    score:
      terbaik,

    sumber,

    detail,
  };
}


/* =========================================================
   CARI KEYWORD
   ========================================================= */

function cariKeywordLokal(
  text
) {

  if (
    !text ||
    typeof text !==
      'string'
  ) {

    return null;
  }


  const pertanyaan =
    normalisasi(
      text
    );


  if (!pertanyaan) {
    return null;
  }


  const scored =
    dataset
      .map(
        (item) => ({

          item,

          hasil:
            hitungSkor(
              pertanyaan,
              item
            ),

        })
      )
      .sort(
        (a, b) => {

          if (
            b.hasil.score !==
            a.hasil.score
          ) {

            return (
              b.hasil.score -
              a.hasil.score
            );
          }


          /*
            Jika skor sama,
            keyword yang lebih panjang
            menang karena lebih spesifik.
          */

          return (
            b.item.searchText.length -
            a.item.searchText.length
          );
        }
      );


  const top =
    scored[0];


  /* =====================================================
     HASIL KUAT
     ===================================================== */

  if (
    top &&
    top.hasil.score >=
      0.52
  ) {

    return {

      kode:
        top.item.kode,

      label:
        top.item.label,

      score:
        top.hasil.score,

      sumber:
        top.hasil.sumber,

    };
  }


  /* =====================================================
     FALLBACK FUZZY
     ===================================================== */

  const fuzzy =
    fuse.search(
      pertanyaan,
      {
        limit: 3,
      }
    );


  if (
    fuzzy.length > 0
  ) {

    const f =
      fuzzy[0];


    const score =
      1 -
      (
        f.score ??
        1
      );


    if (
      score >=
      0.58
    ) {

      return {

        kode:
          f.item.kode,

        label:
          f.item.label,

        score,

        sumber:
          'FUZZY',

      };
    }
  }


  return null;
}


/* =========================================================
   CLAUDE
   ========================================================= */

let anthropic = null;


if (
  process.env.ANTHROPIC_API_KEY
) {

  const Anthropic =
    require(
      '@anthropic-ai/sdk'
    );


  anthropic =
    new Anthropic({
      apiKey:
        process.env.ANTHROPIC_API_KEY,
    });
}


/* =========================================================
   TOPIK UNTUK CLAUDE
   ========================================================= */

function daftarTopikUntukPrompt() {

  return Object.entries(
    keywordsDb
  )
    .map(
      ([kode, info]) =>
        `${kode} - ${info.label} - ${info.keywords.join(', ')}`
    )
    .join('\n');
}


/* =========================================================
   ANTRIAN AI
   ========================================================= */

const MAX_AI_CONCURRENT =
  3;


let aiSedangBerjalan =
  0;


const antrianAI =
  [];


function jalankanAI(
  task
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      antrianAI.push({
        task,
        resolve,
        reject,
      });


      prosesAntrianAI();
    }
  );
}


async function prosesAntrianAI() {

  if (
    aiSedangBerjalan >=
    MAX_AI_CONCURRENT
  ) {

    return;
  }


  const job =
    antrianAI.shift();


  if (!job) {
    return;
  }


  aiSedangBerjalan++;


  try {

    job.resolve(
      await job.task()
    );

  } catch (err) {

    job.reject(
      err
    );

  } finally {

    aiSedangBerjalan--;

    prosesAntrianAI();
  }
}


/* =========================================================
   CLAUDE SEARCH
   ========================================================= */

async function cariDenganAI(
  pertanyaan
) {

  if (!anthropic) {
    return null;
  }


  const daftarTopik =
    daftarTopikUntukPrompt();


  const system =
`Kamu adalah pengklasifikasi pertanyaan untuk chatbot WhatsApp BPS Kabupaten Belitung Timur.

Pilih satu kode yang PALING SPESIFIK dari daftar topik.

ATURAN PENTING:
1. Jika pengguna menyebut nama kecamatan, prioritaskan publikasi kecamatan tersebut.
2. Jika pengguna menyebut "dalam angka", prioritaskan kode publikasi Dalam Angka yang sesuai.
3. Jika pengguna menulis "publikasi kecamatan simpang pesak", pilih kode 63, bukan kode 4.
4. Jangan memilih "Publikasi" umum jika ada kategori yang lebih spesifik.
5. Jangan menjawab pertanyaan. Hanya tentukan kode.

DAFTAR TOPIK:
${daftarTopik}

Balas HANYA JSON.

Contoh:
{"kode":"63","alasan":"publikasi Kecamatan Simpang Pesak Dalam Angka"}

Jika benar-benar tidak ada topik:
{"kode":null,"alasan":"tidak ada topik yang cocok"}`;


  try {

    return await jalankanAI(
      async () => {

        const response =
          await anthropic.messages.create(
            {

              model:
                'claude-sonnet-4-6',

              max_tokens:
                120,

              system,

              messages: [
                {
                  role:
                    'user',

                  content:
                    pertanyaan,
                },
              ],

            }
          );


        const teks =
          response.content
            .filter(
              (c) =>
                c.type ===
                'text'
            )
            .map(
              (c) =>
                c.text
            )
            .join('')
            .trim();


        const bersih =
          teks
            .replace(
              /```json/gi,
              ''
            )
            .replace(
              /```/g,
              ''
            )
            .trim();


        return JSON.parse(
          bersih
        );
      }
    );

  } catch (err) {

    console.error(
      '[AI] Claude error:',
      err.message
    );


    return null;
  }
}


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {

  cariKeywordLokal,

  cariDenganAI,

  aiAktif:
    !!anthropic,

};