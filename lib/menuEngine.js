const fs = require('fs');
const path = require('path');

const menu = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'menu.json'), 'utf-8')
);

// Kode-kode yang isinya butuh diteruskan ke admin (bukan auto-reply link)
const KODE_ADMIN = new Set(['2', '9', '99']);

function getMenuByCode(code) {
  return menu[code];
}

function isKodeValid(code) {
  return Object.prototype.hasOwnProperty.call(menu, code);
}

function isKodeAdmin(code) {
  return KODE_ADMIN.has(code);
}

function getMenuUtama() {
  return menu['0'];
}

module.exports = { menu, getMenuByCode, isKodeValid, isKodeAdmin, getMenuUtama };
