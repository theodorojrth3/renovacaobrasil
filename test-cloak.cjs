const m = require('C:\\Users\\magri\\Desktop\\renovacaobrasil-master\\netlify\\functions\\cloak.js');
const test = async (ua, expectHuman) => {
  const r = await m.handler({ headers: { 'user-agent': ua }, path: '/' });
  const isBlack = r.body && r.body.includes('gov.br');
  const ok = expectHuman ? isBlack : !isBlack;
  console.log((ua||'').slice(0,45).padEnd(46), '=>', r.statusCode, isBlack ? 'BLACK' : 'HUMAN', ok ? 'OK' : 'FAIL');
};
(async () => {
  // Humans get BLACK, bots get REAL
  await test('facebookexternalhit/1.1', false); // bot -> real
  await test('Mozilla/5.0 (compatible; Googlebot/2.1)', false); // bot -> real
  await test('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36', true); // human -> black
  await test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', true); // human -> black
  await test('curl/8.0', false); // bot -> real
  await test('', false); // bot -> real
  await test('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/121.0 Safari/537.36', true); // human -> black
  await test('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36', true); // human -> black
  await test('TelegramBot (like TwitterBot)', false); // bot -> real
  await test('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120.0 Mobile Safari/537.36', true); // human -> black
  await test('Mozilla/5.0 (compatible; bingbot/2.0)', false); // bot -> real
  await test('Mozilla/5.0 (compatible; AhrefsBot/7.0)', false); // bot -> real
  await test('Mozilla/5.0 (Linux; Android 10; K) Chrome/120.0 Mobile Safari/537.36', true); // human -> black
})();