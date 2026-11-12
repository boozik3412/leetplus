/* LeetPlus «Схема клуба»: 3D-сцена зала 1337 · Пушкинская 217 (шаблон 1337-pushkinskaya-217).
   Данные: GET/PATCH /api/stores/:id/floor-plan, GET /api/stores/:id/floor-plan/live, /live/seats/:n и /live/attention, POST /live/alerts/:id. */
(() => {
'use strict';
/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
/* ---------------- page parameters ---------------- */
const Q = new URLSearchParams(location.search);
const STORE_ID = Q.get('store') || '';
const CAN_EDIT = Q.get('edit') === '1';
// embed=shift: the hall on «Моя смена». Calm: no street traffic, no auto-rotation, guests do not walk in.
const EMBED = Q.get('embed') === 'shift';
const CALM = EMBED || Q.get('calm') === '1';
if (EMBED) document.documentElement.classList.add('embed');
const TEMPLATE = '1337-pushkinskaya-217';
if (Q.get('theme') === 'dark' || Q.get('theme') === 'light') document.documentElement.setAttribute('data-theme', Q.get('theme'));
// Inside the LeetPlus cabinet the scene follows the cabinet's theme switch.
(() => {
  if (Q.get('theme') || window.parent === window) return;
  let root = null; try { root = window.parent.document.documentElement; } catch (e) { return; }
  const sync = () => { const t = root.dataset.theme; if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); };
  sync(); new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
const API = STORE_ID ? `/api/stores/${encodeURIComponent(STORE_ID)}/floor-plan` : null;
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cfgOf = (z, k) => { const r = (z.cfg || []).find(c => c[0] === k); return r ? r[1] : '—'; };
const clubInitials = name => { const w = String(name).replace(/[^\p{L}\p{N} ]+/gu, ' ').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '··').slice(0, 2)).toUpperCase(); };
const rnd = (() => { let a = 1337; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const fmt = new Intl.NumberFormat('ru-RU');
const rub = n => fmt.format(Math.round(n)) + ' ₽';
const hm = m => { m = Math.max(0, Math.round(m)); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); if (t === 'dark') return true; if (t === 'light') return false; return matchMedia('(prefers-color-scheme: dark)').matches; };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/* ---------------- data ---------------- */
const GAMES = {
  'CS2': ['#F2A65A', '#5B3A1E'], 'Dota 2': ['#E86A6A', '#3A1416'], 'Valorant': ['#F27896', '#3C1524'],
  'PUBG': ['#F2CB5A', '#3B3214'], 'Fortnite': ['#9C8CF5', '#211B48'], 'LoL': ['#61B8EC', '#0E2A3D'], 'Apex': ['#EE8462', '#381A12']
};
const NICKS = ['Kirito', 'dasha.gg', 'NeoVlad', 'Mamba', 'kot_v_sapogah', 'Zeus_jr', 'Lina', 'Art3m', 'tilted', 'ez4ence', 'Bober', 'MoonWalker', 'R1ck', 'Shadow', 'Pelmen', 'Vortex', 'Sasha_99', 'frost', 'Nyasha', 'Hawk', 'Gl1tch', 'Toxa', 'Ramen', 'Iris', 'Kuzya', 'Bolt', 'Nika', 'Fenix', 'Yuki', 'Grom', 'Leo', 'Masha_k', 'Blink', 'Duck', 'Orbit', 'Zhenya', 'Raven', 'Sova', 'Mitya', 'Hollow', 'Slava', 'Kris', 'Tom', 'Panda', 'Dima_3', 'Nord'];
const AVA = ['#7FD3D8', '#B9A6F0', '#F7B48A', '#8FB8F5', '#F2A0B4', '#A8DDB5', '#F5D27A'];
const SHIRTS = [0x7FD3D8, 0xB9A6F0, 0xF7B48A, 0x8FB8F5, 0xF2A0B4, 0xA8DDB5, 0xF5D27A, 0xffffff, 0x3B4A55, 0x9AD0C2];
const HAIRS = [0x2b2220, 0x4a3226, 0x1d1d22, 0x8a5a3c, 0xd8b26a, 0x6b4b8f, 0x2f3e46];
const SKINS = [0xf1cfb4, 0xe6b896, 0xd39e7c, 0xf6dcc6, 0xb67d5e];

// Plan coordinates: 1 m = 38.5 px of the Langame booking scheme (seat pitch), origin at the hall centre.
// x runs left to right on the scheme, z top to bottom; the entrance and the street are at +z.
const PX = x => (x - 326) / 38.5, PZ = y => (y - 495) / 38.5;
const X0 = PX(35), X_END = PX(617), Z0 = PZ(215), Z_END = PZ(775);
const HALL_C = (X0 + X_END) / 2, HALL_W = X_END - X0, HALL_ZC = (Z0 + Z_END) / 2, HALL_D = Z_END - Z0;
const PLOT_C = HALL_C, PLOT_W = HALL_W + 13, PLOT_Z0 = Z0 - 3.6, PLOT_Z1 = Z_END + 7.6;
const PART = PX(238.5);                         // standart | vip a and the corridor
const VB = [PX(328), PX(495), PZ(500), PZ(652)]; // vip b room
const SX = PX(434), CX = PX(492);                // solo right wall, cybersport left wall
const cfgVal = (z, k) => { const r = (z.cfg || []).find(c => c[0] === k); return r ? r[1] : '—'; };

const ZONES = {
  standart: { name: 'Standart', range: 'ПК 1–20', color: '#4FB8C0', c3: 0x7FD3D8, anchor: [-4.87, 2.3, -3.2], off: [-170, -120], cam: { t: [-4.87, 0, -1.4], d: 30 },
    cfg: [['Видеокарта', 'RTX 3060 / 4060'], ['Монитор', 'Asus 240 Гц / MSI 300 Гц'], ['Девайсы', 'Razer DA v3']] },
  vipa: { name: 'VIP A', range: 'ПК 21–25', color: '#8E78E8', c3: 0xB9A6F0, anchor: [-1.1, 2.1, -4.6], off: [-80, -100], cam: { t: [-1.1, 0, -4.0], d: 16 },
    cfg: [['Видеокарта', 'RTX 4060 Ti'], ['Монитор', 'Alienware 240 Гц'], ['Девайсы', 'Ajazz Apex']] },
  vipb: { name: 'VIP B', range: 'ПК 26–30', color: '#E8955E', c3: 0xF7B48A, anchor: [2.3, 2.1, 2.0], off: [170, 40], cam: { t: [2.3, 0, 2.1], d: 16 },
    cfg: [['Видеокарта', 'RTX 4060 Ti'], ['Монитор', 'Alienware 240 Гц'], ['Девайсы', 'Ajazz Apex']] },
  solo: { name: 'Solo', range: 'ПК 34–35', color: '#E26D8E', c3: 0xF2A0B4, anchor: [1.4, 1.8, -3.3], off: [40, -190], cam: { t: [1.6, 0, -3.2], d: 14 },
    cfg: [['Видеокарта', 'RTX 4080 SUPER'], ['Монитор', 'Alienware 360 Гц'], ['Девайсы', 'Logitech Superlight 2']] },
  cyber: { name: 'Cybersport', range: 'ПК 31–33', color: '#5E93E0', c3: 0x8FB8F5, anchor: [5.9, 2.2, -3.6], off: [160, -140], cam: { t: [5.9, 0, -3.4], d: 15, rot: -0.4 },
    cfg: [['Видеокарта', 'RTX 4070'], ['Монитор', 'MSI 380 Гц'], ['Девайсы', 'Logitech Superlight']] },
  admin: { name: 'Админ', range: 'стойка и чек-ины LeetPlus', color: '#007681', c3: 0x2BA3AD, anchor: [-4.6, 2.4, 5.6], off: [-170, 110], cam: { t: [-4.0, 0, 5.0], d: 15, rot: -0.5 } }
};

const seats = [];
let guestPool = NICKS.slice();
function takeNick() { if (!guestPool.length) guestPool = NICKS.slice(); return guestPool.splice(Math.floor(rnd() * guestPool.length), 1)[0]; }
function newGuest() { const nick = takeNick(); return { nick, ava: pick(AVA), lvl: 3 + Math.floor(rnd() * 38), xp: Math.floor(rnd() * 100), spent: 200 + Math.floor(rnd() * 1400), quest: Math.floor(rnd() * 100), shirt: pick(SHIRTS), hair: pick(HAIRS), skin: pick(SKINS) }; }

/* ---------------- live club state (Langame through the LeetPlus API) ---------------- */
const LIVE = { loaded: false, status: 'LOADING', at: null, guests: null, shift: null, revenue: null, purchases: null, game: null, warnings: [], failed: false };
function plural(n, one, few, many) { const a = n % 10, b = n % 100; return `${fmt.format(n)} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`; }
const pad2 = n => String(n).padStart(2, '0');
const hhmm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const rubOr = v => v == null ? '—' : rub(v);
function shortName(full) { const p = String(full).trim().split(/\s+/); return p.length < 2 ? p[0] : `${p[0]} ${p.slice(1, 3).map(x => x[0].toUpperCase() + '.').join(' ')}`; }
function shiftInfo() {
  const s = LIVE.shift; if (!s) return null;
  const st = s.startedAt ? new Date(s.startedAt) : null;
  const mins = st ? Math.max(0, Math.floor((Date.now() - st.getTime()) / 60000)) : null;
  const full = s.adminName || 'Администратор';
  return { full, short: shortName(full), start: st ? hhmm(st) : '—', dur: mins == null ? '' : `${Math.floor(mins / 60)} ч ${pad2(mins % 60)} мин` };
}
const GAME_KIND = { MISSION: ['Миссия', 'acc'], CASE: ['Кейс', 'warn'], PROMO: ['Акция', 'lilac'] };
const ddmm = d => pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1);
function gameCounts(g) {
  const n = k => g.items.filter(i => i.kind === k).length;
  return [[n('MISSION'), 'миссия', 'миссии', 'миссий'], [n('CASE'), 'кейс', 'кейса', 'кейсов'], [n('PROMO'), 'акция', 'акции', 'акций']].filter(x => x[0]).map(x => plural(...x)).join(', ');
}
const FOLD = { zones: false, game: false };
try { Object.assign(FOLD, JSON.parse(localStorage.getItem('leetplus-floor-plan-fold') || '{}')); } catch (e) { }
function toggleFold(id) { FOLD[id] = !FOLD[id]; try { localStorage.setItem('leetplus-floor-plan-fold', JSON.stringify(FOLD)); } catch (e) { } }
const CHEVRON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function foldHead(id, title, summary) {
  const open = !!FOLD[id];
  return `<button class="fold" type="button" data-fold="${id}" aria-expanded="${open}"><span class="ft"><b>${title}</b><span class="fs">${summary}</span></span><span class="fc">${open ? 'Свернуть' : 'Развернуть'}${CHEVRON}</span></button>`;
}
function gameHtml() {
  const g = LIVE.game, r = LIVE.revenue;
  const when = r && r.period === 'TODAY' ? 'За сегодня' : 'За смену';
  let summary, body;
  if (!LIVE.loaded) { summary = 'загружаю…'; body = '<div class="note">Загружаю игровой модуль…</div>'; }
  else if (!g) { summary = 'нет данных'; body = '<div class="note">Не удалось получить активности игрового модуля, попробую при следующем обновлении.</div>'; }
  else {
    const done = g.completed || {}, items = Array.isArray(g.items) ? g.items : [], season = g.season;
    summary = `${when} выполнено: ${plural(done.missions || 0, 'миссия', 'миссии', 'миссий')}, ${plural(done.cases || 0, 'кейс', 'кейса', 'кейсов')}, ${plural(done.rewards || 0, 'награда', 'награды', 'наград')}`;
    if (!items.length && !season) body = '<div class="note">Для этого клуба сейчас нет запущенных миссий, кейсов и акций.</div>';
    else {
      const shown = items.slice(0, 6);
      const rows = shown.map(i => {
        const k = GAME_KIND[i.kind] || ['Активность', 'off'];
        const meta = [i.reward, i.xp ? `+${fmt.format(i.xp)} XP` : null, i.segment ? 'для сегмента' : null].filter(Boolean).map(esc).join(' · ');
        const end = i.endsAt ? `до ${ddmm(new Date(i.endsAt))}` : 'бессрочно';
        return `<div class="li"><span class="chip ${k[1]} gk">${k[0]}</span><span class="grow"><b title="${esc(i.title)}">${esc(i.title)}</b>${meta ? `<span>${meta}</span>` : ''}</span><span class="r num">${end}</span></div>`;
      }).join('');
      const seasonHtml = season ? `<div class="gseason"><span class="grow"><b>${esc(season.name)}</b><span>Сезон${season.levels ? ' · ' + plural(season.levels, 'уровень', 'уровня', 'уровней') : ''}</span></span><span class="r num">${season.endsAt ? 'до ' + ddmm(new Date(season.endsAt)) : 'бессрочно'}</span></div>` : '';
      body = `<div class="gnow">Активно сейчас · ${esc(gameCounts({ items }) || 'только сезон')}</div>${seasonHtml}<div class="list games">${rows}</div>${items.length > shown.length ? `<div class="note">И ещё ${plural(items.length - shown.length, 'активность', 'активности', 'активностей')}, все в разделе «Игровой модуль».</div>` : ''}`;
    }
  }
  return `<div class="sec fsec gamesec${FOLD.game ? ' open' : ''}">${foldHead('game', 'Игровой модуль', summary)}<div class="fbody">${body}</div></div>`;
}
function purchasesHtml() {
  const list = LIVE.purchases, r = LIVE.revenue;
  const when = r && r.period === 'TODAY' ? 'за сегодня' : 'за смену';
  let body;
  if (!LIVE.loaded) body = '<div class="note">Загружаю продажи…</div>';
  else if (!Array.isArray(list)) body = '<div class="note">Langame не отдал продажи, попробую при следующем обновлении.</div>';
  else if (!list.length) body = `<div class="note">${when === 'за смену' ? 'В этой смене' : 'Сегодня'} ещё ничего не продано.</div>`;
  else body = `<div class="list buys">${list.map(p => {
    const at = p.at ? hhmm(new Date(p.at)) : '—';
    const qty = p.quantity && p.quantity !== 1 ? ` × ${fmt.format(p.quantity)}` : '';
    return `<div class="li"><span class="t num">${at}</span><span class="grow"><b title="${esc(p.title)}">${esc(p.title)}${qty}</b>${p.category ? `<span>${esc(p.category)}</span>` : ''}</span><span class="r num">${rub(p.sum)}</span></div>`;
  }).join('')}</div>`;
  return `<div class="sec buysec"><h3>Последние покупки <span>${when}</span></h3>${body}</div>`;
}
/* ---------------- three setup ---------------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 8; controls.maxDistance = 105;
controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.22;
controls.autoRotateSpeed = 0.35;
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

const hemi = new THREE.HemisphereLight(0xffffff, 0xdbe5e5, 0.82);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.62);
sun.position.set(-17, 38, 20); sun.target.position.set(0, 0, 1); scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
scene.add(sun);
const nightLights = [
  [0x5fd0da, -4.9, 2.6, -4.2, 10], [0x5fd0da, -4.9, 2.6, 0.6, 10], [0xa58cff, -1.1, 2.2, -4.4, 6], [0xffb27a, 2.3, 2.2, 2.1, 6],
  [0xff8fb0, 1.5, 1.6, -4.1, 3.5], [0xff8fb0, 1.5, 1.6, -2.4, 3.5], [0x7fa8ff, 5.9, 2.2, -3.6, 6], [0x83e4ec, -4.4, 2.2, 5.4, 7], [0x83e4ec, 3.6, 2.2, -2.2, 7]
].map(([c, x, y, z, d]) => { const l = new THREE.PointLight(c, 0, d, 1.6); l.position.set(x, y, z); scene.add(l); return l; });
/* ---------------- material registry ---------------- */
const themed = [];
function std(light, dark, extra) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ color: light, roughness: 0.88, metalness: 0 }, extra || {}));
  m.userData.c = [light, dark == null ? light : dark]; themed.push(m); return m;
}
const flatCache = {};
function flat(hex) { return flatCache[hex] || (flatCache[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 })); }
const glow = hex => new THREE.MeshBasicMaterial({ color: hex });

const M = {
  plot: std(0xF8FAFA, 0x12252A), plotSide: std(0xEEF3F3, 0x0D1D21), grass: std(0xD6EEE2, 0x16332B), road: std(0xD5DDE0, 0x1A2B30),
  side: std(0xEBF0F1, 0x1E3237), dash: std(0xFFFFFF, 0x557178), floor: std(0xF3F6F6, 0x1A2E33), wall: std(0xFFFFFF, 0x223A40), wallTop: std(0xE6EEEF, 0x2B464C),
  trim: std(0x007681, 0x2F9BA5), desk: std(0xFFFFFF, 0x2C4349), deskLeg: std(0xD9E2E4, 0x22383E), dark: std(0x2C3A40, 0x0D1619), tower: std(0xEDF2F3, 0x1C2C31),
  wood: std(0xE7CFAE, 0x6B5236), woodDark: std(0xC9A47C, 0x523C25), sofaT: std(0x8FB8F5, 0x4A6FA8), sofaV: std(0xB9A6F0, 0x6E5BB0), rugC: std(0xDCE7FA, 0x22334F),
  carpetH: std(0xE2F3F4, 0x173A3F), carpetV: std(0xEDE8FB, 0x2A2647), carpetB: std(0xFCEBDD, 0x3A2B22), carpetBar: std(0xF7ECE2, 0x33281F), carpetK: std(0xE4F3F1, 0x173634),
  leaf: std(0x9ED9B4, 0x3E7D5C), leaf2: std(0x7CC9A0, 0x2F6A4C), trunk: std(0xB89272, 0x5E4632), pot: std(0xFFFFFF, 0x2C4349),
  steel: std(0xC9D3D6, 0x41565C), pole: std(0xB8C4C8, 0x3A4D52)
};
const glass = new THREE.MeshStandardMaterial({ color: 0xCFEFF3, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.1, depthWrite: false });
const LED = { free: glow(0x34C98A), busy: glow(0x2BB3BE), ending: glow(0xF2A142), booked: glow(0xA48CF2), off: glow(0x9AA7AB) };
const lampMat = glow(0xFFF3D6);

/* ---------------- geometry helpers ---------------- */
const gcache = {};
function rbox(w, h, d, r) {
  r = Math.min(r == null ? 0.05 : r, Math.min(w, h, d) / 2 - 0.001);
  const k = w + ',' + h + ',' + d + ',' + r;
  return gcache[k] || (gcache[k] = r > 0.004 ? new THREE.RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d));
}
function mesh(parent, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
// Box with y = bottom
function B(parent, w, h, d, mat, x, y, z, r) { return mesh(parent, rbox(w, h, d, r), mat, x, y + h / 2, z); }
const cylG = {}; function cyl(rt, rb, h, seg = 16) { const k = [rt, rb, h, seg].join(); return cylG[k] || (cylG[k] = new THREE.CylinderGeometry(rt, rb, h, seg)); }
const sphG = {}; function sph(r, w = 16, h = 12) { const k = [r, w, h].join(); return sphG[k] || (sphG[k] = new THREE.SphereGeometry(r, w, h)); }
function C(parent, rt, rb, h, mat, x, y, z, seg) { return mesh(parent, cyl(rt, rb, h, seg), mat, x, y + h / 2, z); }
function plane(parent, w, h, mat, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; }

/* ---------------- canvas textures ---------------- */
const MARK = 'M6 32 30 8H52V22H38V40H22V54H6Z M58 8H82L90 16V40H58Z';
const GLYPHS = [...document.querySelectorAll('.logo .tx path')].map(p => [parseFloat(p.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]), p.getAttribute('d')]);
function drawLogo(ctx, x, y, s, markColor, textColor) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const mk = new Path2D(MARK); ctx.fillStyle = markColor; ctx.fill(mk);
  ctx.save(); ctx.translate(48, 48); ctx.rotate(Math.PI); ctx.translate(-48, -48); ctx.fill(mk); ctx.restore();
  if (textColor) { ctx.fillStyle = textColor; ctx.translate(126, 73.5); ctx.scale(0.075, -0.075); for (const [dx, d] of GLYPHS) { ctx.save(); ctx.translate(dx, 0); ctx.fill(new Path2D(d)); ctx.restore(); } }
  ctx.restore();
}
const textures = [];
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  const rec = { c, t, draw }; textures.push(rec); draw(c.getContext('2d'), w, h, isDark()); return t;
}
function redrawTextures() { const d = isDark(); for (const r of textures) { const ctx = r.c.getContext('2d'); ctx.clearRect(0, 0, r.c.width, r.c.height); r.draw(ctx, r.c.width, r.c.height, d); r.t.needsUpdate = true; } }
const F = (w, s) => `${w} ${s}px Manrope, "Segoe UI", sans-serif`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

function gameScreen(name, cols, big) {
  return ctex(big ? 512 : 160, big ? 288 : 80, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = .25; ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) { ctx.fillRect((i * 0.17 + 0.05) * w, h * (0.55 + (i % 3) * 0.1), w * 0.12, h * 0.25); }
    ctx.globalAlpha = .9; ctx.strokeStyle = '#fff'; ctx.lineWidth = w / 80;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h / 9, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = F(800, big ? 34 : 13); ctx.fillText(name, w * 0.05, h * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, h * 0.86, w, h * 0.14); ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.04, h * 0.91, w * 0.3, h * 0.04);
  });
}
const SCREEN = {};
SCREEN.play = new THREE.MeshBasicMaterial({ map: gameScreen('В игре', ['#2BB3BE', '#0E3A40']) });
SCREEN.free = new THREE.MeshBasicMaterial({ map: ctex(160, 80, (ctx, w, h, d) => {
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, d ? '#0E3A40' : '#0B7C86'); g.addColorStop(1, d ? '#06191C' : '#04545C');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); drawLogo(ctx, w / 2 - 15, h / 2 - 22, 0.32, '#83E4EC'); ctx.fillStyle = '#CFF6F9'; ctx.font = F(700, 10); ctx.textAlign = 'center'; ctx.fillText('Свободен', w / 2, h - 12);
}) });
SCREEN.booked = new THREE.MeshBasicMaterial({ map: ctex(160, 80, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#A48CF2'); g.addColorStop(1, '#4B3B99');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = F(800, 16); ctx.textAlign = 'center'; ctx.fillText('БРОНЬ', w / 2, h / 2 + 2); ctx.font = F(600, 10); ctx.fillText('с 19:00', w / 2, h / 2 + 18);
}) });

/* ---------------- people ---------------- */
const capsule = new THREE.CapsuleGeometry(0.2, 0.32, 4, 10);
function makePerson(o, sit) {
  const g = new THREE.Group();
  const shirt = flat(o.shirt), skin = flat(o.skin), hair = flat(o.hair), pants = flat(o.pants || 0x3B4A55);
  const torso = mesh(g, capsule, shirt, 0, sit ? 0.98 : 1.18, 0); torso.scale.set(1, 1, 0.72);
  const head = mesh(g, sph(0.155), skin, 0, sit ? 1.47 : 1.67, 0);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.163, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.copy(head.position); hairM.rotation.x = 0.35; hairM.castShadow = true; g.add(hairM);
  g.userData.head = head; g.userData.hair = hairM;
  if (sit) {
    B(g, 0.36, 0.14, 0.44, pants, 0, 0.52, -0.2, 0.05);
    B(g, 0.32, 0.52, 0.14, pants, 0, 0.02, -0.38, 0.05);
    const aL = B(g, 0.09, 0.09, 0.5, shirt, -0.22, 0.93, -0.26, 0.04); const aR = B(g, 0.09, 0.09, 0.5, shirt, 0.22, 0.93, -0.26, 0.04);
    aL.rotation.x = aR.rotation.x = 0.18;
  } else {
    const legs = []; for (const sx of [-0.1, 0.1]) { const p = new THREE.Group(); p.position.set(sx, 0.78, 0); B(p, 0.14, 0.78, 0.17, pants, 0, -0.78, 0, 0.05); g.add(p); legs.push(p); }
    const arms = []; for (const sx of [-0.27, 0.27]) { const p = new THREE.Group(); p.position.set(sx, 1.42, 0); B(p, 0.09, 0.56, 0.1, shirt, 0, -0.56, 0, 0.04); g.add(p); arms.push(p); }
    g.userData.legs = legs; g.userData.arms = arms;
  }
  return g;
}

/* ---------------- world ---------------- */
const world = new THREE.Group(); scene.add(world);
const pickables = [];
function setPick(obj, data) { obj.userData.pick = data; pickables.push(obj); }
M.carpetS = std(0xFCE6EE, 0x3A2230);

// plot & street (the street runs along the entrance side, +z)
const SIDE_Z = Z_END + 1.7, ROAD_Z = Z_END + 5.2;
B(world, PLOT_W + 0.6, 1.4, PLOT_Z1 - PLOT_Z0 + 0.6, M.plotSide, PLOT_C, -1.4, (PLOT_Z0 + PLOT_Z1) / 2, 0.6);
B(world, PLOT_W, 0.02, PLOT_Z1 - PLOT_Z0, M.plot, PLOT_C, -0.02, (PLOT_Z0 + PLOT_Z1) / 2, 0.01);
B(world, PLOT_W, 0.04, 4, M.road, PLOT_C, 0, ROAD_Z, 0.01);
for (let x = PLOT_C - PLOT_W / 2 + 1.4; x < PLOT_C + PLOT_W / 2 - 1; x += 3.2) B(world, 1.6, 0.05, 0.14, M.dash, x, 0, ROAD_Z, 0.01);
B(world, PLOT_W, 0.08, 2.6, M.side, PLOT_C, 0, SIDE_Z, 0.02);
B(world, PLOT_W, 0.05, 3.0, M.grass, PLOT_C, 0, Z0 - 1.9, 0.02);
B(world, 2.6, 0.05, HALL_D, M.grass, X0 - 2.6, 0, HALL_ZC, 0.02);
B(world, 2.6, 0.05, HALL_D, M.grass, X_END + 2.6, 0, HALL_ZC, 0.02);
B(world, 1.7, 0.07, SIDE_Z - Z_END - 1.1, M.side, PX(295), 0, (Z_END + SIDE_Z - 1.3) / 2 + 0.1, 0.02);   // path to the door

function tree(x, z, s = 1, round = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  C(g, 0.09, 0.12, 0.9, M.trunk, 0, 0, 0, 8);
  if (round) mesh(g, sph(0.62, 14, 10), rnd() > 0.5 ? M.leaf : M.leaf2, 0, 1.4, 0);
  else mesh(g, new THREE.ConeGeometry(0.62, 1.4, 10), M.leaf2, 0, 1.45, 0);
  world.add(g); return g;
}
[[-12.5, -9.5], [-8.5, -10.0], [-4.5, -9.4], [-0.5, -10.0], [3.5, -9.4], [7.5, -10.0], [11.5, -9.5],
 [-10.2, -5.5], [-10.4, -1.2], [-10.1, 3.0], [10.2, -5.0], [10.4, -0.8], [10.1, 3.4],
 [-11.5, 9.6], [7.5, 9.6], [11.0, 9.6]].forEach(([x, z], i) => tree(x, z, 0.8 + rnd() * 0.35, i % 3 !== 1));
const lampHeads = [];
for (const x of [-9.5, 3.2, 10]) { C(world, 0.05, 0.07, 3.6, M.pole, x, 0, SIDE_Z + 1.0, 8); B(world, 0.9, 0.08, 0.14, M.pole, x + 0.4, 3.55, SIDE_Z + 1.0, 0.02); lampHeads.push(B(world, 0.4, 0.06, 0.2, lampMat, x + 0.7, 3.5, SIDE_Z + 1.0, 0.02)); }
for (const x of [-6, 8]) { B(world, 1.6, 0.08, 0.45, M.wood, x, 0.42, SIDE_Z + 0.75, 0.03); B(world, 0.1, 0.42, 0.4, M.steel, x - 0.65, 0, SIDE_Z + 0.75, 0.02); B(world, 0.1, 0.42, 0.4, M.steel, x + 0.65, 0, SIDE_Z + 0.75, 0.02); }
for (let i = 0; i < 3; i++) { const g = new THREE.Group(); g.position.set(4.6 + i * 0.55, 0.08, SIDE_Z - 0.6); B(g, 0.12, 0.06, 0.9, flat(0x2BA3AD), 0, 0.12, 0, 0.02); C(g, 0.025, 0.025, 1, M.dark, 0, 0.12, -0.4, 6); for (const z of [-0.38, 0.38]) { const w = mesh(g, cyl(0.11, 0.11, 0.06, 12), M.dark, 0, 0.11, z); w.rotation.z = Math.PI / 2; } world.add(g); }

function car(color, x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0.04, z); g.rotation.y = ry;
  B(g, 3.6, 0.7, 1.7, flat(color), 0, 0.3, 0, 0.22);
  B(g, 2.1, 0.55, 1.5, flat(0xffffff), -0.2, 0.95, 0, 0.18);
  B(g, 2.14, 0.38, 1.54, flat(0x6B8C99), -0.2, 1.0, 0, 0.12);
  for (const [cx, cz] of [[-1.15, 0.8], [1.15, 0.8], [-1.15, -0.8], [1.15, -0.8]]) { const w = mesh(g, cyl(0.34, 0.34, 0.24, 14), M.dark, cx, 0.34, cz); w.rotation.x = Math.PI / 2; }
  B(g, 0.06, 0.14, 0.3, glow(0xFFF1C7), 1.8, 0.62, 0.55, 0.02); B(g, 0.06, 0.14, 0.3, glow(0xFFF1C7), 1.8, 0.62, -0.55, 0.02);
  world.add(g); return g;
}
const movers = [{ o: car(0xB9A6F0, -6, ROAD_Z - 1.0, 0), v: 3.2 }, { o: car(0x7FD3D8, 4, ROAD_Z + 1.0, Math.PI), v: -2.6 }];
const MOVER_X = [PLOT_C - PLOT_W / 2 + 2, PLOT_C + PLOT_W / 2 - 2];

/* ---------------- building shell (Langame scheme: 1337 Пушкинская 217) ---------------- */
const club = new THREE.Group(); club.position.y = 0.08; world.add(club);
const wallRects = [];      // xz footprints of walls, used to find a free spot for new furniture
const wallRect = (x0, x1, z0, z1) => wallRects.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
// club floor (the black parts of the scheme are other premises)
function floorRect(x0, x1, z0, z1, mat = M.floor) { B(world, x1 - x0 + 0.2, 0.08, z1 - z0 + 0.2, mat, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.04); }
floorRect(X0, PX(328), Z0, Z_END);
floorRect(PX(328), SX, PZ(307), PZ(500));
floorRect(SX, X_END, PZ(280), PZ(500));
floorRect(PX(449), PX(501), Z0, PZ(280));
floorRect(VB[0], VB[1], VB[2], VB[3]);
M.neighbour = std(0xE3EAEB, 0x14262B);
const NEIGHBOURS = [[PX(328), SX, Z0, PZ(307)], [SX, PX(449), Z0, PZ(280)], [PX(501), X_END, Z0, PZ(280)], [VB[1], X_END, PZ(500), VB[3]], [PX(328), X_END, VB[3], Z_END]];
for (const [x0, x1, z0, z1] of NEIGHBOURS) B(world, x1 - x0 - 0.3, 0.16, z1 - z0 - 0.3, M.neighbour, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.04);

// outer walls: full height on the back (-z) and left (-x) sides, 1.5 m on the right and front-right, low at the entrance
const HW = 2.8, LOW = 0.45, PH = 1.5, T = 0.3;
function owallX(z, x0, x1, h) {   // runs along x
  const len = Math.abs(x1 - x0) + T, mx = (x0 + x1) / 2;
  B(club, len, h, T, M.wall, mx, 0, z, 0.04); if (h > 1) B(club, len, 0.08, T + 0.02, M.wallTop, mx, h, z, 0.02);
  wallRect(Math.min(x0, x1) - T / 2, Math.max(x0, x1) + T / 2, z - T / 2, z + T / 2);
}
function owallZ(x, z0, z1, h) {   // runs along z
  const len = Math.abs(z1 - z0) + T, mz = (z0 + z1) / 2;
  B(club, T, h, len, M.wall, x, 0, mz, 0.04); if (h > 1) B(club, T + 0.02, 0.08, len, M.wallTop, x, h, mz, 0.02);
  wallRect(x - T / 2, x + T / 2, Math.min(z0, z1) - T / 2, Math.max(z0, z1) + T / 2);
}
owallX(Z0, X0, PX(328), HW);                  // back wall of standart and vip a
owallZ(PX(328), Z0, PZ(307), PH);
owallX(PZ(307), PX(328), SX, HW);             // behind solo b
owallZ(SX, PZ(280), PZ(307), HW);
owallX(PZ(280), SX, PX(449), HW);
owallZ(PX(449), Z0, PZ(280), HW);             // wc
owallX(Z0, PX(449), PX(501), HW);
owallZ(PX(501), Z0, PZ(280), PH);
owallX(PZ(280), PX(501), X_END, HW);          // behind cybersport
owallZ(X_END, PZ(280), PZ(500), PH);
owallX(PZ(500), VB[1], X_END, PH);
owallZ(VB[1], PZ(500), VB[3], PH);            // vip b
owallX(VB[3], VB[0], VB[1], PH);
owallZ(VB[0], VB[3], Z_END, PH);
owallX(Z_END, X0, PX(270), LOW);              // front wall, the entrance between 270 and 320 px
owallX(Z_END, PX(320), VB[0], LOW);
owallZ(X0, Z0, Z_END, HW);                    // left wall
B(club, HALL_D - 0.6, 0.06, 0.04, LED.busy, X0 + 0.17, 2.45, HALL_ZC, 0.01).rotation.y = Math.PI / 2;
B(club, PX(328) - X0 - 0.5, 0.06, 0.04, LED.busy, (X0 + PX(328)) / 2, 2.45, Z0 + 0.17, 0.01);
B(club, PX(328) - X0 - 0.5, 0.12, 0.04, M.trim, (X0 + PX(328)) / 2, 0, Z0 + 0.17, 0.01);
B(club, 1.4, 0.02, 1.2, flat(0x2BA3AD), PX(295), 0, Z_END - 0.75, 0.01);   // door mat

// interior partitions (cut at 1.5 m so the zones stay readable)
function wallX(x, z0, z1, h = PH) { B(club, 0.1, h, Math.abs(z1 - z0), M.wall, x, 0, (z0 + z1) / 2, 0.03); B(club, 0.12, 0.04, Math.abs(z1 - z0), M.trim, x, h, (z0 + z1) / 2, 0.01); wallRect(x - 0.05, x + 0.05, z0, z1); }
function wallZ(z, x0, x1, h = PH) { B(club, Math.abs(x1 - x0), h, 0.1, M.wall, (x0 + x1) / 2, 0, z, 0.03); B(club, Math.abs(x1 - x0), 0.04, 0.12, M.trim, (x0 + x1) / 2, h, z, 0.01); wallRect(x0, x1, z - 0.05, z + 0.05); }
const ZI = Z0 + T / 2;                        // inner face of the back wall
wallX(PART, ZI, PZ(615));                     // standart | vip a and the corridor
wallZ(PZ(433.5), PART, PX(257)); wallZ(PZ(433.5), PX(302), SX);   // vip a door 257–302 px, then solo a
wallX(PX(328), PZ(307), PZ(433.5));           // vip a | solo
wallZ(PZ(368.5), PX(328), SX);           // solo b | solo a
wallX(SX, PZ(307), PZ(320)); wallX(SX, PZ(350), PZ(387)); wallX(SX, PZ(415), PZ(433.5));   // solo doors
wallX(CX, PZ(280), -2.5); wallX(CX, -1.75, PZ(433.5)); wallZ(PZ(433.5), CX, X_END);  // cybersport, door opposite the solo a door
wallZ(VB[2], VB[0], PX(387)); wallZ(VB[2], PX(440), VB[1]); wallX(VB[0], VB[2], VB[3]);                 // vip b, door at the top
wallZ(PZ(642), X0 + T / 2, PX(107)); wallZ(PZ(676), X0 + T / 2, PX(107));                               // drinks niche

// toilet: one cubicle with the door opening down into the hall
M.door = std(0xDCEAF3, 0x2E4756); M.tile = std(0xEAF3F6, 0x18303A); M.porcelain = std(0xFFFFFF, 0xC9D6DA);
const wcTex = ctex(128, 128, (ctx, w, h, d) => { ctx.fillStyle = d ? '#8FB8F5' : '#5E93E0'; rr(ctx, 8, 8, 112, 112, 20); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = F(800, 52); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('WC', 64, 68); });
const wcMat = new THREE.MeshBasicMaterial({ map: wcTex, transparent: true });
const wcDoors = [];
{
  const a = PX(449) + T / 2, b = PX(501) - T / 2, WZ = PZ(280), g0 = PX(460), g1 = PX(490);
  wallZ(WZ, a, g0); wallZ(WZ, g1, b);
  const pv = new THREE.Group(); pv.position.set(g0, 0, WZ); pv.rotation.y = -1.0; club.add(pv);
  B(pv, g1 - g0 - 0.02, 1.42, 0.04, M.door, (g1 - g0) / 2, 0.02, 0, 0.015);
  B(pv, 0.1, 0.03, 0.05, M.steel, g1 - g0 - 0.12, 0.92, 0.035, 0.01);
  plane(pv, 0.28, 0.28, wcMat, (g1 - g0) / 2, 1.08, 0.022);
  wcDoors.push(pv);
  const cx = (a + b) / 2;
  B(club, b - a - 0.04, 0.02, WZ - ZI - 0.05, M.tile, cx, 0, (WZ + ZI) / 2, 0.01).castShadow = false;
  B(club, 0.38, 0.34, 0.16, M.porcelain, cx, 0.36, ZI + 0.1, 0.04);
  C(club, 0.18, 0.13, 0.4, M.porcelain, cx, 0, ZI + 0.36, 16);
}

// zone carpets (click targets)
function carpet(zone, mat, x0, x1, z0, z1) { const m = B(club, x1 - x0, 0.02, z1 - z0, mat, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.01); m.castShadow = false; setPick(m, { type: 'zone', id: zone }); return m; }
M.carpetS = std(0xFCE6EE, 0x3A2230);
carpet('standart', M.carpetH, X0 + 0.2, PART - 0.08, ZI + 0.05, PZ(615));
carpet('vipa', M.carpetV, PART + 0.08, PX(328) - 0.08, ZI + 0.05, PZ(433.5) - 0.08);
carpet('solo', M.carpetS, PX(328) + 0.08, SX - 0.08, PZ(307) + 0.2, PZ(368.5) - 0.08);
carpet('solo', M.carpetS, PX(328) + 0.08, SX - 0.08, PZ(368.5) + 0.08, PZ(433.5) - 0.08);
carpet('cyber', M.rugC, CX + 0.08, X_END - 0.2, PZ(280) + 0.2, PZ(433.5) - 0.08);
carpet('vipb', M.carpetB, VB[0] + 0.08, VB[1] - 0.2, VB[2] + 0.08, VB[3] - 0.2);
carpet('admin', M.carpetK, X0 + 0.2, PART - 0.08, PZ(615) + 0.08, Z_END - 0.2);

// floor labels like on the scheme
const floorLabels = [];
function floorLabel(text, x, z, w, h, size, rot = 0) {
  const tex = ctex(Math.round(w * 160), Math.round(h * 160), (ctx, cw, ch, d) => {
    ctx.fillStyle = d ? 'rgba(147,174,179,.75)' : 'rgba(11,25,29,.45)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = F(800, size); ctx.fillText(text, cw / 2, ch / 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, 0.035, z); club.add(m); floorLabels.push(m); return m;
}
floorLabel('STANDART', -4.87, -2.0, 5.6, 0.9, 110, Math.PI / 2);
floorLabel('VIP A', -1.1, -1.95, 1.4, 0.4, 56);
floorLabel('VIP B', 2.3, 2.0, 1.4, 0.4, 56);
floorLabel('SOLO B', 2.32, (PZ(307) + PZ(368.5)) / 2, 1.3, 0.38, 48, Math.PI / 2);
floorLabel('SOLO A', 2.32, (PZ(368.5) + PZ(433.5)) / 2, 1.3, 0.38, 48, Math.PI / 2);
floorLabel('CYBER SPORT', 6.85, -3.5, 2.6, 0.42, 50, Math.PI / 2);
floorLabel('ВХОД', PX(295), Z_END - 1.5, 1.4, 0.45, 56);
floorLabel('НАПИТКИ', -5.05, PZ(659), 1.4, 0.36, 44, Math.PI / 2);

// signage
const wallLogo = ctex(1024, 256, (ctx, w, h, d) => drawLogo(ctx, 40, 32, 1.9, d ? '#83E4EC' : '#007681', d ? '#F4FBFC' : '#0B191D'));
plane(club, 3.4, 0.85, new THREE.MeshBasicMaterial({ map: wallLogo, transparent: true }), -4.87, 1.75, ZI + 0.01);
/* ---------------- PCs ---------------- */
function makePC(id, zone, x, z, ry, deskW = 0.94) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; club.add(g);
  const zc = ZONES[zone].c3;
  B(g, deskW, 0.05, 0.72, M.desk, 0, 0.72, 0, 0.03);
  B(g, 0.05, 0.72, 0.62, M.deskLeg, -deskW / 2 + 0.06, 0, -0.02, 0.02); B(g, 0.05, 0.72, 0.62, M.deskLeg, deskW / 2 - 0.06, 0, -0.02, 0.02);
  B(g, 0.06, 0.22, 0.06, M.dark, 0, 0.77, -0.22, 0.02); B(g, 0.26, 0.02, 0.16, M.dark, 0, 0.77, -0.22, 0.01);
  B(g, 0.82, 0.44, 0.05, M.dark, 0, 0.94, -0.25, 0.02);
  const scr = plane(g, 0.76, 0.38, SCREEN.free, 0, 1.16, -0.222); scr.userData.unmirror = true;
  B(g, 0.44, 0.025, 0.15, M.dark, 0, 0.77, 0.06, 0.01); B(g, 0.06, 0.025, 0.1, M.dark, 0.33, 0.77, 0.08, 0.01);
  B(g, 0.2, 0.44, 0.42, M.tower, deskW / 2 - 0.16, 0, -0.1, 0.04);
  B(g, 0.02, 0.28, 0.02, glow(zc), deskW / 2 - 0.16, 0.08, 0.115, 0.005);
  const led = B(g, deskW - 0.1, 0.03, 0.015, LED.free, 0, 0.705, 0.362, 0.005); led.castShadow = false;
  const ch = new THREE.Group(); ch.position.set(0, 0, 0.78); g.add(ch);
  const chairMat = flat(zc), chairDark = flat(0x34444C);
  C(ch, 0.3, 0.3, 0.05, chairDark, 0, 0, 0, 10); C(ch, 0.035, 0.035, 0.42, chairDark, 0, 0.04, 0, 8);
  B(ch, 0.56, 0.09, 0.54, chairDark, 0, 0.46, 0, 0.04);
  B(ch, 0.5, 0.02, 0.5, chairMat, 0, 0.55, 0, 0.01);
  B(ch, 0.56, 0.86, 0.11, chairDark, 0, 0.58, 0.3, 0.05);
  B(ch, 0.36, 0.6, 0.02, chairMat, 0, 0.7, 0.24, 0.01);
  B(ch, 0.06, 0.06, 0.34, chairDark, -0.3, 0.72, 0.02, 0.02); B(ch, 0.06, 0.06, 0.34, chairDark, 0.3, 0.72, 0.02, 0.02);
  setPick(g, { type: 'seat', id });
  const seat = { id, num: Number(String(id).replace(/\D+/g, '')), zone, g, scr, led, ch, person: null, state: 'off', guest: null, game: null, left: null, until: null, booked: null };
  seats.push(seat); return seat;
}
const pcId = n => 'ПК-' + String(n).padStart(2, '0');
// standart: two rows facing the left wall and the partition, aisle in the middle
const STD_Y = [242.5, 280, 320, 363.5, 402.5, 441, 479, 517.5, 556, 594];
[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].forEach((n, i) => makePC(pcId(n), 'standart', X0 + T / 2 + 0.63, PZ(STD_Y[i]), Math.PI / 2));
[20, 19, 18, 17, 16, 15, 14, 13, 12, 11].forEach((n, i) => makePC(pcId(n), 'standart', PART - 0.05 - 0.63, PZ(STD_Y[i]), -Math.PI / 2));
// vip a: one row along the partition
[[25, 248], [24, 286], [23, 325], [22, 364], [21, 402]].forEach(([n, y]) => makePC(pcId(n), 'vipa', PART + 0.05 + 0.63, PZ(y), Math.PI / 2));
// solo booths, door on the right
makePC(pcId(35), 'solo', PX(328) + 0.05 + 0.6, (PZ(307) + PZ(368.5)) / 2 + 0.06, Math.PI / 2, 1.0);
makePC(pcId(34), 'solo', PX(328) + 0.05 + 0.6, (PZ(368.5) + PZ(433.5)) / 2, Math.PI / 2, 1.0);
// cybersport: three PCs on the left wall, above the door
[[33, -4.95], [32, -4.03], [31, -3.11]].forEach(([n, z]) => makePC(pcId(n), 'cyber', CX + 0.05 + 0.63, z, Math.PI / 2));
// vip b: two desks on the left wall, two on the bottom wall, one on the top wall right of the door
makePC(pcId(30), 'vipb', VB[0] + 0.05 + 0.55, VB[2] + 0.92, Math.PI / 2);
makePC(pcId(29), 'vipb', VB[0] + 0.05 + 0.55, VB[2] + 1.92, Math.PI / 2);
makePC(pcId(28), 'vipb', 2.3, VB[3] - T / 2 - 0.63, Math.PI);
makePC(pcId(27), 'vipb', 3.3, VB[3] - T / 2 - 0.63, Math.PI);
makePC(pcId(26), 'vipb', 3.6, VB[2] + 0.05 + 0.63, 0);

// street pylon
const pylonTex = ctex(256, 640, (ctx, w, h, d) => {
  ctx.fillStyle = d ? '#0F2227' : '#FFFFFF'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = d ? '#F4FBFC' : '#0B191D'; ctx.textAlign = 'center'; ctx.font = F(800, 70); ctx.fillText('1337', w / 2, 120);
  ctx.font = F(600, 24); ctx.fillStyle = d ? '#93AEB3' : '#5A6D71'; ctx.fillText('компьютерный клуб', w / 2, 168); ctx.fillText('Пушкинская 217', w / 2, 200);
  drawLogo(ctx, w / 2 - 58, 270, 1.2, d ? '#83E4EC' : '#007681');
  ctx.fillStyle = d ? '#83E4EC' : '#007681'; rr(ctx, 30, 420, w - 60, 70, 14); ctx.fill(); ctx.fillStyle = d ? '#071317' : '#fff'; ctx.font = F(800, 24); ctx.fillText('Leetplus.ru', w / 2, 464);
  ctx.font = F(600, 21); ctx.fillStyle = d ? '#93AEB3' : '#5A6D71'; ctx.fillText('лутай бонусы', w / 2, 536); ctx.fillText('на халяву', w / 2, 564);
});
{ const g = new THREE.Group(); g.position.set(1.7, 0.08, SIDE_Z + 0.2); g.rotation.y = -0.25; world.add(g); B(g, 1.3, 3.2, 0.4, M.wall, 0, 0, 0, 0.08); B(g, 1.4, 0.1, 0.5, M.trim, 0, 0, 0, 0.03); plane(g, 1.16, 2.9, new THREE.MeshBasicMaterial({ map: pylonTex }), 0, 1.65, 0.205); }
/* ---------------- walkers ---------------- */
function walker(path, opts) {
  const p = makePerson({ shirt: opts.shirt, hair: pick(HAIRS), skin: pick(SKINS) }, false);
  p.position.set(path[0][0], 0.08, path[0][1]); world.add(p);
  return { p, path, i: 0, t: 0, speed: opts.speed || 1.3, wait: 0, pauses: opts.pauses || {} };
}
const DOOR_X = PX(295), CORR_X = (PART + PX(328)) / 2, CORR_Z = (PZ(433.5) + VB[2]) / 2;
const walkers = [
  walker([[9, SIDE_Z + 0.4], [DOOR_X, SIDE_Z + 0.4], [DOOR_X, Z_END - 0.6], [-2.9, 5.6], [-2.9, 5.6], [DOOR_X, Z_END - 0.6], [DOOR_X, SIDE_Z + 0.4]], { shirt: 0xF2A0B4, pauses: { 4: 3.5 } }),
  walker([[CORR_X, 4.6], [CORR_X, CORR_Z], [3.9, CORR_Z], [3.9, PZ(300)], [3.9, CORR_Z], [CORR_X, CORR_Z], [CORR_X, 4.6], [CORR_X, 4.6]], { shirt: 0xF5D27A, speed: 1.0, pauses: { 4: 2.5, 7: 2.5 } }),
  walker([[MOVER_X[0] - 1, SIDE_Z - 0.3], [MOVER_X[1] + 1, SIDE_Z - 0.3]], { shirt: 0x8FB8F5, speed: 1.4 })
];
/* ---------------- furniture catalog (editable items) ---------------- */
const SOFA_COLORS = { teal: [0x7FD3D8, 0x3F8F96, 'Бирюзовый'], blue: [0x8FB8F5, 0x4A6FA8, 'Голубой'], lilac: [0xB9A6F0, 0x6E5BB0, 'Лавандовый'], peach: [0xF7B48A, 0xA8684A, 'Персиковый'], graphite: [0x5B6B73, 0x34444C, 'Графит'] };
const colorMats = {};
function sofaMat(c) { const k = SOFA_COLORS[c] ? c : 'blue'; return colorMats[k] || (colorMats[k] = std(SOFA_COLORS[k][0], SOFA_COLORS[k][1])); }
Object.assign(M, { fridge: std(0xFFFFFF, 0x2C4349), fridgeIn: std(0xE3F3F5, 0x2A5961), cabinet: std(0xF4F7F7, 0x26393F), locker: std(0xE9EFF0, 0x203338) });
const GOODS = [0x2BB3BE, 0xF2A65A, 0xE86A6A, 0x9C8CF5, 0x7CC9A0, 0xF5D27A, 0x5E93E0, 0xF27896].map(flat);
const adminTex = ctex(640, 160, (ctx, w, h, d) => {
  drawLogo(ctx, 20, 18, 1.3, d ? '#83E4EC' : '#007681');
  ctx.fillStyle = d ? '#F4FBFC' : '#0B191D'; ctx.font = F(800, 70); ctx.textBaseline = 'middle'; ctx.fillText('АДМИН', 170, h / 2 + 4);
});
const adminMat = new THREE.MeshBasicMaterial({ map: adminTex, transparent: true });
const stripMat = (text, w, h) => new THREE.MeshBasicMaterial({ map: ctex(w, h, (ctx, cw, ch, d) => {
  ctx.fillStyle = d ? '#0E3A40' : '#007681'; rr(ctx, 0, 0, cw, ch, ch * 0.2); ctx.fill();
  ctx.fillStyle = '#F4FBFC'; ctx.font = F(800, Math.round(ch * 0.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cw / 2, ch / 2 + 1);
}), transparent: true });
const coldMat = stripMat('ХОЛОДНЫЕ НАПИТКИ', 384, 72), barMat = stripMat('БАР · СНЕКИ · НАПИТКИ', 512, 80);
const merchMat = new THREE.MeshBasicMaterial({ map: ctex(512, 96, (ctx, w, h, d) => {
  ctx.fillStyle = d ? '#0F2227' : '#FFFFFF'; rr(ctx, 0, 0, w, h, 16); ctx.fill();
  drawLogo(ctx, 26, 6, 0.85, d ? '#83E4EC' : '#007681', d ? '#F4FBFC' : '#0B191D');
}), transparent: true });
const tvMat = new THREE.MeshBasicMaterial({ map: gameScreen('LeetPlus', ['#2BB3BE', '#0E3A40'], true) });
const STAFF = { shirt: 0x007681, hair: 0x1d1d22, skin: 0xd39e7c };
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
function staffAt(g, x, z) { const p = makePerson(STAFF, false); p.position.set(x, 0, z); p.userData.isStaff = true; mesh(p, cyl(0.36, 0.36, 1.9, 10), hitMat, 0, 0.95, 0, false); g.add(p); g.userData.staff = p; }
function deskMonitor(g, x, z, ry = Math.PI) { const m = new THREE.Group(); m.position.set(x, 1.1, z); m.rotation.y = ry; g.add(m); B(m, 0.05, 0.18, 0.05, M.dark, 0, 0, 0, 0.02); B(m, 0.62, 0.38, 0.04, M.dark, 0, 0.16, 0, 0.02); }
function sofaBody(g, w, mat, x = 0, z = 0, ry = 0, arms = [true, true]) {
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
  B(s, w, 0.42, 0.9, mat, 0, 0, 0, 0.12); B(s, w, 0.55, 0.22, mat, 0, 0.35, -0.36, 0.1);
  if (arms[0]) B(s, 0.22, 0.6, 0.9, mat, -w / 2 + 0.11, 0, 0, 0.1);
  if (arms[1]) B(s, 0.22, 0.6, 0.9, mat, w / 2 - 0.11, 0, 0, 0.1);
  const n = Math.max(1, Math.round((w - 0.44) / 0.62)), cw = (w - 0.44) / n;
  for (let i = 0; i < n; i++) B(s, cw - 0.05, 0.1, 0.62, mat, -w / 2 + 0.22 + cw * (i + 0.5), 0.42, 0.08, 0.05);
  return s;
}
function ringSector(r0, r1, h) {
  const sh = new THREE.Shape(); sh.absarc(0, 0, r1, Math.PI, Math.PI * 2, false); sh.absarc(0, 0, r0, Math.PI * 2, Math.PI, true);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 28 }); g.rotateX(-Math.PI / 2); return g;
}
// a row of goods on a shelf: cans, bottles, snack packs, mugs, folded tees or caps
function goodsRow(g, kind, x0, x1, y, z, seed = 0) {
  const step = { can: 0.085, bottle: 0.09, pack: 0.13, mug: 0.12, tee: 0.24, cap: 0.2 }[kind];
  const n = Math.max(1, Math.floor((x1 - x0) / step)), pad = (x1 - x0 - n * step) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + pad + step * (i + 0.5), m = GOODS[(i + seed) % GOODS.length];
    if (kind === 'can') C(g, 0.032, 0.032, 0.12, m, x, y, z, 10);
    else if (kind === 'bottle') { C(g, 0.034, 0.034, 0.17, m, x, y, z, 10); C(g, 0.012, 0.03, 0.07, M.steel, x, y + 0.17, z, 8); }
    else if (kind === 'pack') B(g, 0.11, 0.16, 0.05, m, x, y, z, 0.015);
    else if (kind === 'mug') { C(g, 0.04, 0.04, 0.09, i % 2 ? M.fridge : GOODS[0], x, y, z, 12); }
    else if (kind === 'tee') { B(g, 0.2, 0.035, 0.16, i % 2 ? M.fridge : GOODS[0], x, y, z, 0.01); B(g, 0.2, 0.035, 0.16, M.dark, x, y + 0.035, z, 0.01); }
    else if (kind === 'cap') { const c = mesh(g, new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? M.dark : GOODS[0], x, y, z); B(g, 0.11, 0.008, 0.08, i % 2 ? M.dark : GOODS[0], x, y, z + 0.08, 0.003); }
  }
}
// glass-front cabinet: fridges and the merch case share this shell
function glassCase(g, w, h, d, o) {
  const t = 0.05, top = o.top, base = o.base, body = o.mat || M.fridge;
  B(g, w, h, t, body, 0, 0, -d / 2 + t / 2, 0.02);
  B(g, t, h, d, body, -w / 2 + t / 2, 0, 0, 0.02); B(g, t, h, d, body, w / 2 - t / 2, 0, 0, 0.02);
  B(g, w, base, d, body, 0, 0, 0, 0.02); B(g, w, top, d, body, 0, h - top, 0, 0.02);
  const inner = B(g, w - 2 * t, h - top - base, 0.01, o.inMat || M.fridgeIn, 0, base, -d / 2 + t + 0.006, 0); inner.castShadow = false;
  const n = o.rows.length, iy0 = base, ih = h - top - base;
  o.rows.forEach((kind, i) => {
    const y = iy0 + ih * i / n;
    if (i) B(g, w - 2 * t, 0.012, d - t - 0.03, M.steel, 0, y - 0.012, 0.0, 0.002);
    goodsRow(g, kind, -w / 2 + t + 0.02, w / 2 - t - 0.02, y, 0.02, i * 3);
  });
  const door = B(g, w - 0.02, ih + 0.02, 0.02, glass, 0, base - 0.01, d / 2 - 0.012, 0.01); door.castShadow = false;
  B(g, 0.025, Math.min(0.5, ih * 0.5), 0.03, M.steel, w / 2 - 0.07, base + ih * 0.35, d / 2 + 0.012, 0.01);
  if (o.sign) { const p = plane(g, w - 0.06, top - 0.03, o.sign, 0, h - top / 2, d / 2 + 0.003); p.userData.unmirror = true; }
}
const CATALOG = {
  sofa2: { fam: 'sofa', name: 'Диван на двоих', colors: 'teal', icon: '<rect x="4" y="9" width="24" height="12" rx="3"/><rect x="4" y="6" width="24" height="4" rx="2"/>', build: (g, it) => sofaBody(g, 1.6, sofaMat(it.color)) },
  sofa3: { fam: 'sofa', name: 'Диван на троих', colors: 'teal', icon: '<rect x="1" y="9" width="30" height="12" rx="3"/><rect x="1" y="6" width="30" height="4" rx="2"/>', build: (g, it) => sofaBody(g, 2.2, sofaMat(it.color)) },
  sofaL: { fam: 'sofa', name: 'Угловой диван', colors: 'teal', icon: '<path d="M2 7h28v8h-8v12h-8V15H2z" stroke-linejoin="round"/>', build: (g, it) => { const m = sofaMat(it.color); sofaBody(g, 2.4, m, 0, 0, 0, [true, false]); sofaBody(g, 1.5, m, 1.65, 0.75, -Math.PI / 2, [false, true]); B(g, 0.9, 0.42, 0.9, m, 1.65, 0, 0, 0.12); B(g, 0.9, 0.55, 0.22, m, 1.65, 0.35, -0.36, 0.1); } },
  armchair: { fam: 'sofa', name: 'Кресло', colors: 'teal', icon: '<rect x="9" y="9" width="14" height="13" rx="3"/><rect x="9" y="6" width="14" height="4" rx="2"/>', build: (g, it) => sofaBody(g, 0.95, sofaMat(it.color)) },
  beanbag: { fam: 'sofa', name: 'Кресло-мешок', colors: 'teal', icon: '<ellipse cx="16" cy="15" rx="10" ry="8"/>', build: (g, it) => { const m = mesh(g, sph(0.48, 16, 12), sofaMat(it.color), 0, 0.3, 0); m.scale.set(1, 0.62, 1); } },
  recStraight: { fam: 'reception', name: 'Стойка прямая', len: [1.6, 4.4, 2.4], icon: '<rect x="2" y="11" width="28" height="8" rx="2"/><circle cx="16" cy="25" r="2.5"/>', build: (g, it) => {
    const L = it.len || 2.4; B(g, L, 1.05, 0.6, M.wall, 0, 0, 0, 0.06); B(g, L + 0.16, 0.05, 0.84, M.wood, 0, 1.05, -0.08, 0.02);
    B(g, L - 0.1, 0.04, 0.02, LED.busy, 0, 0.12, 0.305, 0.01);
    plane(g, Math.min(L - 0.3, 2.4), Math.min(L - 0.3, 2.4) / 4, adminMat, 0, 0.6, 0.302).userData.unmirror = true;
    deskMonitor(g, -L / 4, -0.15); if (L > 2.2) deskMonitor(g, L / 4, -0.15);
    if (it.staff) staffAt(g, 0, -0.85);
  } },
  recL: { fam: 'reception', name: 'Стойка угловая', icon: '<path d="M3 10h26v8H11v10H3z" stroke-linejoin="round"/>', build: (g, it) => {
    B(g, 2.4, 1.05, 0.6, M.wall, 0, 0, 0, 0.06); B(g, 2.56, 0.05, 0.84, M.wood, 0, 1.05, -0.08, 0.02);
    B(g, 0.6, 1.05, 1.5, M.wall, -0.9, 0, -1.05, 0.06); B(g, 0.84, 0.05, 1.6, M.wood, -0.98, 1.05, -1.05, 0.02);
    B(g, 2.3, 0.04, 0.02, LED.busy, 0, 0.12, 0.305, 0.01); plane(g, 2.0, 0.5, adminMat, 0.1, 0.6, 0.302).userData.unmirror = true;
    deskMonitor(g, 0.2, -0.15); if (it.staff) staffAt(g, 0.3, -0.85);
  } },
  recRound: { fam: 'reception', name: 'Стойка полукруглая', icon: '<path d="M3 12a13 13 0 0 0 26 0h-6a7 7 0 0 1-14 0z" stroke-linejoin="round"/>', build: (g, it) => {
    mesh(g, ringSector(0.95, 1.3, 1.05), M.wall, 0, 0, 0); mesh(g, ringSector(0.88, 1.4, 0.05), M.wood, 0, 1.05, 0);
    plane(g, 1.0, 0.25, adminMat, 0, 0.62, 1.312).userData.unmirror = true;
    deskMonitor(g, -0.45, 0.55, Math.PI + 0.4); deskMonitor(g, 0.45, 0.55, Math.PI - 0.4); if (it.staff) staffAt(g, 0, 0.2);
  } },
  barShelf: { fam: 'bar', name: 'Барные полки с товарами', len: [1.0, 3.6, 2.1], icon: '<rect x="3" y="4" width="26" height="22" rx="2"/><path d="M3 12h26M3 19h26M8 7v3M12 7v3M17 7v3M22 7v3"/>', build: (g, it) => {
    const L = it.len || 2.1, nd = Math.max(1, Math.round(L / 0.55)), dw = L / nd;
    B(g, L, 0.9, 0.42, M.cabinet, 0, 0, 0, 0.03); B(g, L + 0.04, 0.04, 0.46, M.wood, 0, 0.9, 0, 0.01);
    for (let i = 0; i < nd; i++) B(g, dw - 0.03, 0.74, 0.012, M.wallTop, -L / 2 + dw * (i + 0.5), 0.08, 0.212, 0.005);
    B(g, L, 0.86, 0.03, M.woodDark, 0, 0.94, -0.195, 0.01);
    for (const y of [1.22, 1.5]) { B(g, L, 0.03, 0.24, M.wood, 0, y, -0.07, 0.008); const s = B(g, L - 0.04, 0.012, 0.012, LED.busy, 0, y - 0.014, 0.045, 0.002); s.castShadow = false; }
    goodsRow(g, 'pack', -L / 2 + 0.06, L / 2 - 0.06, 0.94, 0.0, 1); goodsRow(g, 'bottle', -L / 2 + 0.06, L / 2 - 0.06, 1.25, -0.08, 3); goodsRow(g, 'can', -L / 2 + 0.06, L / 2 - 0.06, 1.53, -0.08, 5);
    plane(g, Math.min(L - 0.2, 1.5), Math.min(L - 0.2, 1.5) / 6.4, barMat, 0, 0.6, 0.22).userData.unmirror = true;
  } },
  fridge: { fam: 'bar', name: 'ХО однодверный', icon: '<rect x="9" y="2" width="14" height="26" rx="2"/><path d="M9 7h14M19 12v6"/>', build: g => glassCase(g, 0.62, 1.95, 0.62, { top: 0.18, base: 0.1, rows: ['bottle', 'can', 'bottle', 'can', 'can'], sign: coldMat }) },
  fridgeBar: { fam: 'bar', name: 'ХО барный', stack: true, icon: '<rect x="7" y="10" width="18" height="16" rx="2"/><path d="M7 14h18M21 17v5"/>', build: g => glassCase(g, 0.5, 0.56, 0.48, { top: 0.06, base: 0.05, rows: ['can', 'can'] }) },
  stool: { fam: 'bar', name: 'Барный стул', colors: 'graphite', icon: '<ellipse cx="16" cy="7" rx="7" ry="3"/><path d="M16 10v16M11 27h10M12 19h8"/>', build: (g, it) => {
    C(g, 0.2, 0.22, 0.03, M.steel, 0, 0, 0, 16); C(g, 0.025, 0.025, 0.72, M.steel, 0, 0.03, 0, 8);
    const r = mesh(g, new THREE.TorusGeometry(0.15, 0.012, 6, 20), M.steel, 0, 0.3, 0); r.rotation.x = Math.PI / 2;
    C(g, 0.2, 0.18, 0.08, sofaMat(it.color || 'graphite'), 0, 0.72, 0, 18);
  } },
  lockers: { fam: 'storage', name: 'Шкафчики для одежды', colors: 'teal', icon: '<rect x="4" y="3" width="24" height="24" rx="2"/><path d="M12 3v24M20 3v24M4 15h24"/>', build: (g, it) => {
    const w = 1.2, cw = w / 3, m = sofaMat(it.color || 'teal');
    B(g, w, 1.85, 0.5, M.locker, 0, 0, 0, 0.02); B(g, w + 0.02, 0.03, 0.52, M.trim, 0, 1.85, 0, 0.01);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) {
      const x = -w / 2 + cw * (c + 0.5), y = 0.06 + r * 0.89;
      B(g, cw - 0.04, 0.85, 0.02, m, x, y, 0.255, 0.01);
      B(g, 0.03, 0.06, 0.015, M.dark, x + cw / 2 - 0.08, y + 0.42, 0.27, 0.005);
      for (let k = 0; k < 3; k++) B(g, cw * 0.5, 0.012, 0.01, M.dark, x, y + 0.66 + k * 0.045, 0.268, 0.003);
    }
  } },
  merch: { fam: 'storage', name: 'Шкафчик для мерча и продуктов', icon: '<rect x="6" y="2" width="20" height="26" rx="2"/><path d="M6 9h20M6 16h20M6 22h20M11 5h10"/>', build: g => glassCase(g, 0.9, 1.9, 0.46, { top: 0.2, base: 0.1, rows: ['pack', 'mug', 'tee', 'cap'], mat: M.cabinet, inMat: M.wallTop, sign: merchMat }) },
  merchSlim: { fam: 'storage', name: 'Узкий шкаф для мерча', icon: '<rect x="10" y="2" width="12" height="26" rx="2"/><path d="M10 9h12M10 16h12M10 22h12"/>', build: g => glassCase(g, 0.5, 1.9, 0.42, { top: 0.12, base: 0.1, rows: ['pack', 'mug', 'cap', 'tee'], mat: M.cabinet, inMat: M.wallTop }) },
  coatRack: { fam: 'storage', name: 'Напольная вешалка', len: [0.8, 2.0, 1.2], icon: '<path d="M4 6h24M6 6v20M26 6v20M3 26h6M23 26h6M11 6v14M16 6v16M21 6v14"/>', build: (g, it) => {
    const L = it.len || 1.2;
    for (const x of [-L / 2, L / 2]) { C(g, 0.018, 0.018, 1.6, M.steel, x, 0.04, 0, 8); B(g, 0.06, 0.04, 0.5, M.steel, x, 0, 0, 0.01); }
    const bar = mesh(g, cyl(0.016, 0.016, L, 8), M.steel, 0, 1.62, 0); bar.rotation.z = Math.PI / 2;
    const n = Math.max(2, Math.floor((L - 0.2) / 0.2));
    for (let i = 0; i < n; i++) { const x = -L / 2 + 0.15 + (L - 0.3) * i / (n - 1); B(g, 0.05, 0.7 - (i % 3) * 0.08, 0.38, GOODS[(i * 3) % GOODS.length], x, 0.88 + (i % 3) * 0.08, 0, 0.03); }
  } },
  foodBar: { fam: 'bar', name: 'Барная стойка для еды', len: [0.8, 3.0, 1.3], icon: '<rect x="2" y="9" width="28" height="5" rx="1.5"/><path d="M6 14v13M26 14v13M6 22h20"/>', build: (g, it) => {
    const L = it.len || 1.3;
    B(g, L, 0.05, 0.45, M.wood, 0, 1.03, 0, 0.015);
    for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) B(g, 0.05, 1.03, 0.4, M.steel, x, 0, -0.02, 0.01);
    const foot = mesh(g, cyl(0.015, 0.015, L - 0.1, 8), M.steel, 0, 0.28, 0.16); foot.rotation.z = Math.PI / 2;
    B(g, L - 0.12, 0.02, 0.02, LED.busy, 0, 1.0, 0.21, 0.005).castShadow = false;
  } },
  tv: { fam: 'other', name: 'Телевизор на стене', icon: '<rect x="3" y="6" width="26" height="16" rx="2"/><path d="M12 26h8"/>', build: g => {
    B(g, 1.25, 0.74, 0.05, M.dark, 0, 1.0, 0, 0.02);
    plane(g, 1.17, 0.66, tvMat, 0, 1.37, 0.027).userData.unmirror = true;
  } },
  table: { fam: 'other', name: 'Журнальный столик', icon: '<rect x="7" y="10" width="18" height="12" rx="2"/>', build: g => { B(g, 0.9, 0.06, 0.55, M.wood, 0, 0.38, 0, 0.02); for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) B(g, 0.05, 0.38, 0.05, M.woodDark, x, 0, z, 0.01); } },
  plant: { fam: 'other', name: 'Растение', icon: '<circle cx="16" cy="16" r="9"/><path d="M16 9v14M10 14l6 3 6-4"/>', build: g => { C(g, 0.22, 0.17, 0.42, M.pot, 0, 0, 0, 14); mesh(g, sph(0.36, 12, 9), M.leaf2, 0, 0.75, 0); mesh(g, sph(0.26, 12, 9), M.leaf, 0.14, 1.02, 0.05); } }
};
const FAMILY = { sofa: ['sofa2', 'sofa3', 'sofaL', 'armchair', 'beanbag'], reception: ['recStraight', 'recL', 'recRound'], bar: ['barShelf', 'fridge', 'fridgeBar', 'foodBar', 'stool'], storage: ['lockers', 'merch', 'merchSlim', 'coatRack'], other: ['table', 'plant', 'tv'] };
const FAMILY_TITLE = { sofa: 'диваны', reception: 'ресепшен', bar: 'бар и холодильники', storage: 'шкафы', other: 'другое' };
const RY_E = Math.PI / 2, WALL_L = X0 + T / 2, PART_E = PART + 0.05;   // items on the left wall and the partition face +x
const DEFAULT_ITEMS = [
  // reception: an L from the left wall, the admin works inside it
  { id: 'reception', type: 'recStraight', x: r2w((WALL_L - 3.1) / 2), z: 5.08, ry: Math.PI, len: r2w(-3.1 - WALL_L), staff: true },
  { id: 'reception-2', type: 'recStraight', x: -3.4, z: 5.98, ry: RY_E, len: 1.2 },
  { id: 'fridge-1', type: 'fridge', x: r2w(WALL_L + 0.33), z: r2w(PZ(659)), ry: RY_E },
  { id: 'bar-shelf', type: 'barShelf', x: r2w(WALL_L + 0.23), z: 6.2, ry: RY_E, len: 1.6 },
  { id: 'merch-1', type: 'merch', x: -6.25, z: r2w(Z_END - T / 2 - 0.25), ry: Math.PI },
  // corridor along the partition: food bar with two stools, slim merch case, sofa for two; the TV faces the sofa
  { id: 'food-bar', type: 'foodBar', x: r2w(PART_E + 0.23), z: -0.7, ry: RY_E, len: 1.3 },
  { id: 'stool-1', type: 'stool', x: r2w(PART_E + 0.75), z: -1.0, ry: 0, color: 'graphite' }, { id: 'stool-2', type: 'stool', x: r2w(PART_E + 0.75), z: -0.4, ry: 0, color: 'graphite' },
  { id: 'merch-slim', type: 'merchSlim', x: r2w(PART_E + 0.22), z: 0.55, ry: RY_E },
  { id: 'corridor-sofa', type: 'sofa2', x: r2w(PART_E + 0.47), z: 2.0, ry: RY_E, color: 'blue' },
  { id: 'tv-1', type: 'tv', x: r2w(VB[0] - 0.08), z: 2.0, ry: -RY_E },
  // floor coat rack opposite the vip b door, along the solo a wall
  { id: 'coat-rack', type: 'coatRack', x: 2.0, z: r2w(PZ(433.5) + 0.05 + 0.26), ry: 0, len: 1.2 },
  { id: 'plant-3', type: 'plant', x: -2.65, z: r2w(Z_END - 0.5), ry: 0 }
];
function r2w(v) { return Math.round(v * 100) / 100; }
// mx: mirrored left-right, mz: front-back (in the object's own axes); text planes are flipped back so they stay readable
function applyMirror(g, mx, mz) { g.scale.x = mx ? -1 : 1; g.scale.z = mz ? -1 : 1; const odd = !!mx !== !!mz; g.traverse(o => { if (o !== g && o.userData.unmirror) o.scale.x = odd ? -1 : 1; }); }
let items = [];          // [{data, g}]
function buildItem(data) {
  const g = new THREE.Group(); g.position.set(data.x, data.y || 0, data.z); g.rotation.y = data.ry || 0;
  CATALOG[data.type].build(g, data);
  g.traverse(o => { if (o.isMesh) { const basic = o.material && o.material.isMeshBasicMaterial; const tr = o.material && o.material.transparent; o.castShadow = !basic && !tr; o.receiveShadow = !basic; } });
  applyMirror(g, !!data.mx, !!data.mz);
  g.userData.editable = { kind: 'item', data };
  const fam = CATALOG[data.type].fam;
  if (fam === 'reception' || fam === 'bar') g.userData.pick = { type: 'zone', id: 'admin' };
  club.add(g); return g;
}
function addItem(data) { const it = { data, g: buildItem(data) }; items.push(it); return it; }
function removeItem(it) { club.remove(it.g); items = items.filter(x => x !== it); }
function rebuildItem(it) { const p = it.g.position; Object.assign(it.data, { x: p.x, z: p.z, ry: it.g.rotation.y, y: CATALOG[it.data.type].stack ? p.y : 0 }); const g = buildItem(it.data); club.remove(it.g); it.g = g; return it; }
seats.forEach(s => { s.def = { x: s.g.position.x, z: s.g.position.z, ry: s.g.rotation.y, mx: false, mz: false }; s.g.userData.editable = { kind: 'pc', seat: s }; });
DEFAULT_ITEMS.forEach(d => addItem(JSON.parse(JSON.stringify(d))));

/* ---------------- selection ring ---------------- */
const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x2BB3BE, transparent: true, opacity: 0.9 }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; club.add(ring);
const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x2BB3BE, transparent: true, opacity: 0.35 }));
hoverRing.rotation.x = -Math.PI / 2; hoverRing.visible = false; club.add(hoverRing);

/* ---------------- seat state ---------------- */
function seatWorld(s) { const v = new THREE.Vector3(0, 0, 0.78); s.g.localToWorld(v); return v; }
function seatState(s) { return s.state === 'busy' && s.left != null && s.left < 15 ? 'ending' : s.state; }
function applySeat(s) {
  const st = seatState(s);
  s.led.material = LED[st];
  s.scr.material = s.state === 'busy' ? SCREEN[s.game] : s.state === 'booked' ? SCREEN.booked : SCREEN.free;
  if (s.state === 'busy') {
    if (!s.person && !s.arriving) { s.person = makePerson(s.guest, true); s.person.position.set(0, 0, 0.82); s.g.add(s.person); s.person.userData.ph = rnd() * 6; }
    s.ch.rotation.y = 0;
  } else {
    if (s.person) { s.g.remove(s.person); s.person = null; }
    s.ch.rotation.y = s.state === 'free' ? ((s.num * 37) % 11 - 5) * 0.06 : 0;
  }
}
function occupy(s, until) {
  if (s.state !== 'busy') { s.guest = newGuest(); s.arriving = canWalk(); }
  s.state = 'busy'; s.game = 'play'; s.until = until; s.left = until ? Math.max(0, (until - Date.now()) / 60000) : null;
  applySeat(s);
}
function free(s) { if (s.state === 'busy') startDeparture(s, s.guest); forgetSeatInfo(s); s.state = 'free'; s.guest = null; s.game = null; s.left = null; s.until = null; applySeat(s); }
function setOff(s) { if (s.state === 'busy') startDeparture(s, s.guest); forgetSeatInfo(s); s.state = 'off'; s.guest = null; s.game = null; s.left = null; s.until = null; applySeat(s); }
seats.forEach(setOff);

function zoneSeats(z) { return seats.filter(s => s.zone === z); }
function busyCount(z) { return zoneSeats(z).filter(s => s.state === 'busy').length; }
function linkedSeats(list = seats) { return list.filter(s => s.state !== 'off'); }

/* ---------------- shadows: receive on all ---------------- */
scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial) { o.castShadow = false; o.receiveShadow = false; } });

/* ---------------- theme ---------------- */
function applyTheme() {
  const d = isDark();
  themed.forEach(m => m.color.setHex(m.userData.c[d ? 1 : 0]));
  renderer.setClearColor(new THREE.Color(css('--bg') || (d ? '#071317' : '#E9F0F0')));
  hemi.intensity = d ? 0.38 : 0.82; hemi.color.setHex(d ? 0x9fc4cf : 0xffffff); hemi.groundColor.setHex(d ? 0x0b1a1e : 0xdbe5e5);
  sun.intensity = d ? 0.22 : 0.62; sun.color.setHex(d ? 0x9ab8ff : 0xffffff);
  nightLights.forEach(l => l.intensity = d ? 1.1 : 0);
  lampMat.color.setHex(d ? 0xFFE9B0 : 0xF3F0E6);
  glass.opacity = d ? 0.18 : 0.32;
  ring.material.color.setHex(d ? 0x83E4EC : 0x007681); hoverRing.material.color.setHex(d ? 0x83E4EC : 0x007681);
  redrawTextures();
}
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------------- camera ---------------- */
const DIR = new THREE.Vector3(0.32, 0.86, 0.92).normalize();
const HOME = { t: [0, 0, 0.8], d: 44 };
const baseHomeView = () => innerWidth <= 760 ? { t: [0, 0, 0.4], d: 40 } : HOME;
const homeView = () => { const v = baseHomeView(); return EMBED && innerWidth > 760 ? Object.assign({}, v, { d: v.d * 0.76 }) : v; };
let fly = null;
function camFor(p) { const t = new THREE.Vector3(...p.t); return { t, pos: t.clone().add((p.dir ? new THREE.Vector3(...p.dir).normalize() : DIR.clone()).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot || 0).multiplyScalar(p.d * fitScale())) }; }
function fitScale() { const a = camera.aspect; return a < 0.8 ? 1.75 : a < 1.2 ? 1.3 : 1; }
function flyTo(p, instant) {
  const { t, pos } = camFor(p.zoneCam ? p : p);
  if (instant || reduced) { camera.position.copy(pos); controls.target.copy(t); controls.update(); fly = null; return; }
  fly = { t0: performance.now(), dur: 1100, fp: camera.position.clone(), ft: controls.target.clone(), tp: pos, tt: t };
}
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/* ---------------- UI: state ---------------- */
let view = { type: 'home' }; let sheetOpen = false;
const panel = $('#panel'), pbody = $('#pbody');
const isPhone = () => innerWidth <= 760;
/* KPI cards wrap on the left; the overview card keeps the top-right corner on the same line. */
const PANEL_W = 340, PANEL_COMPACT_W = 300;
function layoutChrome() {
  const st = document.getElementById('stage'), p = document.getElementById('panel');
  if (!st || !p) return;
  if (isPhone()) { st.style.removeProperty('--pw'); return; }
  const pw = p.classList.contains('home') && matchMedia('(hover: hover)').matches ? PANEL_COMPACT_W : PANEL_W;
  st.style.setProperty('--pw', pw + 'px');
}

function select(v, opts = {}) {
  view = v;
  if (v.type === 'home') { flyTo(homeView()); ring.visible = false; setAuto(!reduced && !opts.keepRot ? autoPref : false); }
  else if (v.type === 'zone') { flyTo(ZONES[v.id].cam); ring.visible = false; setAuto(false); }
  else if (v.type === 'seat') {
    const s = seats.find(x => x.id === v.id); const z = ZONES[s.zone]; const w = seatWorld(s);
    flyTo({ t: [w.x, 0, w.z - 0.4], d: 17 }); ring.visible = true; ring.position.set(w.x, 0.05, w.z); setAuto(false);
  }
  if (isPhone() && v.type !== 'home') { sheetOpen = true; }
  renderPanel(); renderCards();
}

/* ---------------- KPI tiles ---------------- */
const ICON = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.6c2.4 0 4.2 1.3 5 4"/></svg>',
  pc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
  rub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20V4h5.5a4 4 0 0 1 0 8H6M6 16h8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M12 3v2"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 12 8 12 8s5 0 5-1.2C17 4.5 13.5 5 12 8z"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4M16 16l4-4-4-4M20 12H10"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.9-3.8 3.7-5.8 7-5.8s6.1 2 7 5.8"/><path d="m12 14.7-1.3 2.3 1.3 3.5 1.3-3.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
};
let adminHL = false;
const prevK = {};
function renderKPIs() {
  const linked = linkedSeats(), pcsBusy = seats.filter(s => s.state === 'busy').length;
  const sh = shiftInfo(), r = LIVE.revenue, today = r && r.period === 'TODAY';
  const since = r && r.since ? hhmm(new Date(r.since)) : null;
  const k = [
    ['admin', 'Администратор смены', sh ? sh.short : (LIVE.loaded ? 'Смена не открыта' : '—'), sh ? `смена с ${sh.start} · ${sh.dur}` : (LIVE.loaded ? 'в Langame нет открытой смены' : 'загружаю'), ICON.badge, 'var(--accent-soft)', 'var(--accent)', true],
    ['rev', today ? 'Выручка за сегодня' : 'Выручка за смену', rubOr(r && r.total), since ? `с ${since}` : '', ICON.rub, 'var(--good-soft)', 'var(--good)', true],
    ['goods', 'Выручка: товары', rubOr(r && r.goods), r && r.goodsCount != null ? plural(r.goodsCount, 'товар', 'товара', 'товаров') : '', ICON.cup, 'var(--rose-soft)', 'var(--rose)', true],
    ['pcs', 'ПК заняты', linked.length ? `${pcsBusy} / ${linked.length}` : '—', linked.length ? Math.round(pcsBusy / linked.length * 100) + '% загрузка' : 'нет данных о ПК', ICON.pc, 'var(--lilac-soft)', 'var(--lilac)', true],
    ['guests', 'Гостей в клубе', LIVE.guests == null ? '—' : fmt.format(LIVE.guests), '', ICON.users, 'var(--accent-soft)', 'var(--accent)', true]
  ];
  $('#kpis').innerHTML = k.map(([id, l, v, sub, ic, bg, fg, mutedSub]) =>
    `<div class="kpi${id === 'admin' && adminHL ? ' hl' : ''}" data-k="${id}"${id === 'admin' && sh ? ` title="${esc(sh.full)} · смена с ${sh.start}"` : ''}><div class="kic" style="background:${bg};color:${fg}">${ic}</div><div><small>${l}</small><b class="num ${prevK[id] !== undefined && prevK[id] !== v ? 'flash' : ''}">${esc(v)}</b>${sub ? `<em class="${mutedSub ? 'muted' : ''}">${esc(sub)}</em>` : ''}</div></div>`).join('');
  k.forEach(([id, , v]) => prevK[id] = v);
  layoutChrome();
}

/* ---------------- floating cards ---------------- */
const overlay = $('#overlay'), linesSvg = $('#lines');
const cardEls = {}, pinEls = {}, lineEls = {};
for (const [id, z] of Object.entries(ZONES)) {
  const pin = document.createElement('div'); pin.className = 'pin'; pin.style.background = z.color; pin.style.color = z.color; overlay.appendChild(pin); pinEls[id] = pin;
  const card = document.createElement('button'); card.type = 'button'; card.className = 'card'; card.addEventListener('click', () => select({ type: 'zone', id }));
  overlay.appendChild(card); cardEls[id] = card;
  const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('stroke', z.color); ln.setAttribute('stroke-width', '2.4'); ln.setAttribute('stroke-dasharray', '0.1 6'); ln.setAttribute('stroke-linecap', 'round'); linesSvg.appendChild(ln); lineEls[id] = ln;
}
function cardContent(id) {
  const z = ZONES[id];
  if (id === 'admin') { const sh = shiftInfo(); return ['Админ · смена', sh ? sh.short : 'смена не открыта', `товары ${rubOr(LIVE.revenue && LIVE.revenue.goods)}`]; }
  const ss = zoneSeats(id), b = busyCount(id), end = ss.filter(s => seatState(s) === 'ending').length, ln = linkedSeats(ss).length;
  const sub = id === 'standart' ? `${end} заканчивают · ${cfgOf(z, 'Видеокарта')}` : `${cfgOf(z, 'Видеокарта')} · ${cfgOf(z, 'Монитор').replace(/^.* (\d)/, '$1')}`;
  return [`${z.name} · ${z.range}`, ln ? `${b} / ${ln} заняты` : 'нет данных', sub];
}
function renderCards() {
  for (const id of Object.keys(ZONES)) {
    const [l, v, s] = cardContent(id);
    cardEls[id].innerHTML = `<div class="cl"><i style="background:${ZONES[id].color}"></i>${l}</div><div class="cv num">${v}</div><div class="cs">${s}</div>`;
    cardEls[id].setAttribute('aria-label', `${l}: ${v}. ${s}`);
  }
}
// seat pills (zone view)
const pillEls = new Map();
function syncPills() {
  const want = new Set();
  if (!editing && (view.type === 'zone' || view.type === 'seat')) {
    const zid = view.type === 'zone' ? view.id : seats.find(s => s.id === view.id).zone;
    zoneSeats(zid).forEach(s => want.add(s.id));
  }
  for (const [id, el] of pillEls) if (!want.has(id)) { el.remove(); pillEls.delete(id); }
  for (const id of want) {
    let el = pillEls.get(id);
    if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'pill'; el.addEventListener('click', () => select({ type: 'seat', id })); overlay.appendChild(el); pillEls.set(id, el); }
    const s = seats.find(x => x.id === id); const st = seatState(s);
    const col = COL[st];
    const txt = s.state === 'busy' ? (s.left == null ? 'играет' : hm(s.left)) : s.state === 'off' ? 'нет данных' : 'свободен';
    el.innerHTML = `<i style="background:${col}"></i>${id.replace('ПК-', '')}<span class="num" style="color:var(--muted);font-weight:700">${txt}</span>`;
  }
}

const v3 = new THREE.Vector3();
function project(x, y, z) { v3.set(x, y, z); v3.project(camera); return [(v3.x + 1) / 2 * stageW, (1 - v3.y) / 2 * stageH, v3.z]; }
let stageW = 1, stageH = 1;
function rectOf(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { l: r.left - s.left, t: r.top - s.top, r: r.right - s.left, b: r.bottom - s.top }; }
const stage = $('#stage');
let obstacles = [];
function measureObstacles() { obstacles = ['#kpis', '.tools', '#panel', '.feed'].map(s => $(s)).filter(e => e && e.offsetParent !== null).map(rectOf); }
function updateOverlay() {
  const zoneMode = view.type !== 'home' || editing;
  const phone = isPhone();
  const placed = [];
  for (const id of Object.keys(ZONES)) {
    const z = ZONES[id], card = cardEls[id], pin = pinEls[id], ln = lineEls[id];
    const [ax, ay, depth] = project(...z.anchor);
    const hide = zoneMode || depth > 1;
    card.classList.toggle('hide', hide); pin.classList.toggle('hide', hide); ln.style.opacity = hide ? 0 : 1;
    if (hide) continue;
    pin.style.transform = `translate(${ax}px,${ay}px)`;
    const cw = card.offsetWidth, chh = card.offsetHeight;
    const k = phone ? 0.45 : 1;
    let cx = ax + z.off[0] * k - cw / 2, cy = ay + z.off[1] * k - chh / 2;
    const pad = 10;
    const maxR = stageW - (phone ? 16 : (obstacles.find(o => o.l > stageW * 0.5 && o.t < 40 && o.b > stageH * 0.5) ? stageW - obstacles.find(o => o.l > stageW * 0.5 && o.t < 40 && o.b > stageH * 0.5).l + 12 : 16));
    cx = Math.max(16, Math.min(cx, maxR - cw)); cy = Math.max(12, Math.min(cy, stageH - chh - 12));
    // push out of obstacles and already-placed cards
    for (let pass = 0; pass < 3; pass++) {
      for (const o of obstacles.concat(placed)) {
        if (cx < o.r + pad && cx + cw > o.l - pad && cy < o.b + pad && cy + chh > o.t - pad) {
          const down = o.b + pad - cy, up = cy + chh - (o.t - pad);
          if (down < up && o.b + pad + chh < stageH) cy = o.b + pad; else cy = o.t - pad - chh;
        }
      }
    }
    placed.push({ l: cx, t: cy, r: cx + cw, b: cy + chh });
    card.style.transform = `translate(${cx}px,${cy}px)`;
    const ex = Math.max(cx, Math.min(ax, cx + cw)), ey = Math.max(cy, Math.min(ay, cy + chh));
    ln.setAttribute('x1', ax); ln.setAttribute('y1', ay); ln.setAttribute('x2', ex); ln.setAttribute('y2', ey);
  }
  placeAttentionMarkers();
  for (const [id, el] of pillEls) {
    const s = seats.find(x => x.id === id); const w = seatWorld(s);
    const [px, py] = project(w.x, 1.9, w.z);
    el.style.left = px + 'px'; el.style.top = py + 'px';
  }
}

/* ---------------- panel ---------------- */
const STC = { free: ['Свободен', 'good'], busy: ['Играет', 'acc'], ending: ['Скоро освободится', 'warn'], booked: ['Бронь', 'lilac'], off: ['Нет в Langame', 'off'] };
const COL = { free: 'var(--good)', busy: 'var(--accent)', ending: 'var(--warn)', booked: 'var(--lilac)', off: 'var(--muted)' };
function initials(n) { return n.replace(/[^A-Za-zА-Яа-я0-9]/g, '').slice(0, 2).toUpperCase(); }
function zoneOcc(id) { if (id === 'admin') return null; return [busyCount(id), zoneSeats(id).length]; }

function cfgHtml(z) { return `<dl class="kv">${z.cfg.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`; }
function liveNote() {
  if (!STORE_ID) return 'Клуб не выбран.';
  if (LIVE.status === 'NOT_CONNECTED') return esc(LIVE.warnings[0] || 'Клуб не подключён к Langame.');
  if (!LIVE.loaded) return 'Загружаю данные Langame…';
  const at = LIVE.at ? hhmm(new Date(LIVE.at)) : '';
  return `Статусы ПК, смена и выручка из Langame, обновление каждые 20 секунд${at ? ` · последнее в ${at}` : ''}.${LIVE.warnings.length ? ' ' + LIVE.warnings.map(esc).join(' ') : ''}`;
}
function renderPanel() {
  panel.classList.toggle('home', view.type === 'home' && !editing && !EMBED);
  layoutChrome();
  if (editing) { panel.classList.toggle('collapsed', isPhone() && !sheetOpen); renderEditor(); syncPills(); return; }
  panel.classList.toggle('collapsed', isPhone() && !sheetOpen);
  $('#grab').setAttribute('aria-label', sheetOpen ? 'Свернуть панель' : 'Развернуть панель');
  let h = '';
  if (view.type === 'home' && EMBED) {
    h += attentionHomeHtml();
  } else if (view.type === 'home') {
    const linked = linkedSeats(), pcs = seats.filter(s => s.state === 'busy').length, freeN = seats.filter(s => s.state === 'free').length, ending = seats.filter(s => seatState(s) === 'ending').length;
    h += `<div class="ph"><div><div class="eyebrow">Обзор клуба</div><h2>${esc(CLUB.name)}</h2><div class="sub">Планировка по схеме бронирования Langame · ${seats.length} мест на схеме</div></div><span class="chip ${LIVE.status === 'LIVE' ? 'good' : 'off'}">${LIVE.status === 'LIVE' ? 'Live' : 'Нет данных'}</span></div>
    <div class="statgrid"><div class="stat"><small>Загрузка</small><b class="num">${linked.length ? Math.round(pcs / linked.length * 100) + '%' : '—'}</b></div><div class="stat"><small>Свободно</small><b class="num">${linked.length ? freeN : '—'}</b></div><div class="stat"><small>Заканчивают</small><b class="num">${linked.length ? ending : '—'}</b></div></div>
    <div class="sec fsec zonesec${FOLD.zones ? ' open' : ''}">${foldHead('zones', 'Зоны и компьютеры', linked.length ? `${pcs} из ${linked.length} ПК заняты · ${plural(Object.keys(ZONES).length - 1, 'зона', 'зоны', 'зон')}` : 'нет данных Langame')}<div class="fbody"><div class="fhint">Нажмите на зону, чтобы приблизить</div>${Object.keys(ZONES).map(id => {
      const z = ZONES[id], ss = id === 'admin' ? [] : zoneSeats(id), ln = linkedSeats(ss).length, b = busyCount(id);
      const val = id === 'admin' ? rubOr(LIVE.revenue && LIVE.revenue.goods) : ln ? `${b} / ${ln}` : '—';
      const pct = id === 'admin' ? (shiftInfo() ? 100 : 0) : ln ? b / ln * 100 : 0;
      return `<button class="zrow" type="button" data-zone="${id}"><span class="dot" style="background:${z.color}"></span><b>${z.name} <span style="color:var(--muted);font-weight:600;font-size:11.5px">${z.range}</span></b><span class="v num">${val}</span><span class="bar"><i style="width:${pct}%;background:${z.color}"></i></span></button>`;
    }).join('')}</div></div>${gameHtml()}${purchasesHtml()}`;
  } else if (view.type === 'zone') {
    const id = view.id, z = ZONES[id];
    h += `<button class="back" type="button" data-act="home">← Весь клуб</button>`;
    if (id !== 'admin') {
      const ss = zoneSeats(id); const c = st => ss.filter(s => seatState(s) === st).length;
      h += `<div class="ph"><div><div class="eyebrow">Зона</div><h2>${z.name}</h2><div class="sub">${z.range}${z.total && ss.length !== z.total ? ` · на схеме ${ss.length} мест` : ''}</div></div><span class="chip acc">${ss.filter(s => s.state === 'busy').length} / ${linkedSeats(ss).length || ss.length}</span></div>
      <div class="statgrid"><div class="stat"><small>Свободно</small><b class="num">${c('free')}</b></div><div class="stat"><small>Заканчивают</small><b class="num">${c('ending')}</b></div><div class="stat"><small>Играют</small><b class="num">${c('busy') + c('ending')}</b></div></div>
      <div class="sec"><h3>Места</h3><div class="seats">${ss.map(s => { const st = seatState(s); return `<button class="seat" type="button" data-seat="${s.id}" style="--sc:${COL[st]}"><b>${s.id}</b><span>${STC[st][0]}</span><span class="num">${s.state === 'busy' && s.left != null ? 'ещё ' + hm(s.left) : '&nbsp;'}</span></button>`; }).join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>играет</span><span><i style="background:var(--warn)"></i>меньше 15 мин</span><span><i style="background:var(--good)"></i>свободен</span><span><i style="background:var(--muted)"></i>нет в Langame</span></div>
      ${z.note ? `<div class="note">${esc(z.note)}</div>` : ''}</div>
      <div class="sec"><h3>Конфиг</h3>${cfgHtml(z)}</div>`;
    } else {
      const sh = shiftInfo(), r = LIVE.revenue;
      h += `<div class="ph"><div><div class="eyebrow">Админ</div><h2>Стойка и бар</h2><div class="sub">Смена, выручка и продажи товаров на стойке</div></div><span class="chip ${sh ? 'good' : 'off'}">${sh ? 'Смена открыта' : 'Смена не открыта'}</span></div>
      <div class="sec"><h3>Смена</h3><dl class="kv"><dt>Администратор</dt><dd>${sh ? esc(sh.full) : '—'}</dd><dt>Начало</dt><dd>${sh ? `${sh.start}, идёт ${sh.dur}` : '—'}</dd><dt>${r && r.period === 'TODAY' ? 'Выручка за сегодня' : 'Выручка за смену'}</dt><dd>${rubOr(r && r.total)}</dd><dt>Товары</dt><dd>${rubOr(r && r.goods)}${r && r.goodsCount != null ? ' · ' + plural(r.goodsCount, 'товар', 'товара', 'товаров') : ''}</dd></dl></div>
      <div class="statgrid"><div class="stat"><small>Товары</small><b class="num">${rubOr(r && r.goods)}</b></div><div class="stat"><small>Гостей</small><b class="num">${LIVE.guests == null ? '—' : fmt.format(LIVE.guests)}</b></div><div class="stat"><small>ПК заняты</small><b class="num">${seats.filter(s => s.state === 'busy').length}</b></div></div>${purchasesHtml()}`;
    }
  } else if (view.type === 'seat') {
    const s = seats.find(x => x.id === view.id), z = ZONES[s.zone], st = seatState(s);
    h += `<button class="back" type="button" data-zone="${s.zone}">← ${z.name}</button>
    <div class="ph"><div><div class="eyebrow">${z.name}</div><h2>${s.id}</h2><div class="sub">${cfgOf(z, 'Видеокарта')} · ${cfgOf(z, 'Монитор')}</div></div><span class="chip ${STC[st][1]}">${STC[st][0]}</span></div>`;
    if (s.state === 'busy') {
      h += seatHintsHtml(s) + seatSessionHtml(s, st);
    } else if (s.state === 'free') {
      h += `<dl class="kv"><dt>Статус</dt><dd>свободен</dd></dl>`;
    } else {
      h += `<div class="note">Компьютера с номером ${s.num} нет в Langame этого клуба, поэтому его статус неизвестен.</div>`;
    }
    h += `<div class="sec"><h3>Конфиг</h3>${cfgHtml(z)}</div>`;
  }
  if (view.type === 'home' && !EMBED) h += `<div class="more">Наведите, чтобы раскрыть</div>`;
  h += `<div class="note">${liveNote()}</div>`;
  pbody.innerHTML = h;
  syncPills();
}
pbody.addEventListener('click', e => {
  const z = e.target.closest('[data-zone]'); if (z) return select({ type: 'zone', id: z.dataset.zone });
  const s = e.target.closest('[data-seat]'); if (s) return select({ type: 'seat', id: s.dataset.seat });
  const f = e.target.closest('[data-fold]'); if (f) { toggleFold(f.dataset.fold); return renderPanel(); }
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'home') return select({ type: 'home' });
});
$('#grab').addEventListener('click', () => { sheetOpen = !sheetOpen; renderPanel(); });
$('#clubBtn').addEventListener('click', () => { if (!editing) select({ type: 'home' }); });

/* ---------------- feed ---------------- */
const feed = [];
const EVC = { star: ['var(--warn-soft)', 'var(--warn)'], cup: ['var(--good-soft)', 'var(--good)'], gift: ['var(--lilac-soft)', 'var(--lilac)'], in: ['var(--accent-soft)', 'var(--accent)'], out: ['var(--surface-2)', 'var(--muted)'], up: ['var(--accent-soft)', 'var(--accent)'] };
function addEvent(icon, text, right) {
  feed.unshift({ icon, text, right, t: now(), fresh: true }); if (feed.length > 4) feed.length = 4;
  renderFeed();
}
function renderFeed() {
  if (!feed.length) { $('#feed').innerHTML = '<div class="empty">Здесь появятся занятые и освободившиеся ПК</div>'; return; }
  $('#feed').innerHTML = feed.map(f => `<div class="ev ${f.fresh ? 'new' : ''}"><span class="eic" style="background:${EVC[f.icon][0]};color:${EVC[f.icon][1]}">${ICON[f.icon]}</span><span>${f.text}${f.right ? ` <b class="num" style="white-space:nowrap">${f.right}</b>` : ''}</span><time class="num">${f.t}</time></div>`).join('');
  feed.forEach(f => f.fresh = false);
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }

/* ---------------- live simulation ---------------- */
/* ---------------- guests walk in from the street when a session starts and out when it ends ---------------- */
const ENTRY = { side: SIDE_Z + 0.4, turn: DOOR_X, path: [[DOOR_X, Z_END - 0.7]] };
const NAV = { sig: '', cell: 0.15, w: 0, h: 0, x0: 0, z0: 0, block: null };
const NAV_R = 0.14, VISIT_MAX = 12, VISIT_SPEED = 1.45;
const visitors = [];
function navSig() {
  let s = items.length + '|';
  for (const it of items) s += it.g.position.x.toFixed(1) + ',' + it.g.position.z.toFixed(1) + ',' + it.g.rotation.y.toFixed(2) + ';';
  for (const x of seats) s += x.g.position.x.toFixed(1) + ',' + x.g.position.z.toFixed(1) + ',' + x.g.rotation.y.toFixed(2) + ';';
  return s;
}
function navBuild() {
  const sig = navSig();
  if (NAV.block && NAV.sig === sig) return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of wallRects) { x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1); z0 = Math.min(z0, r.z0); z1 = Math.max(z1, r.z1); }
  const c = NAV.cell; NAV.x0 = x0 - 1; NAV.z0 = z0 - 1;
  NAV.w = Math.ceil((x1 - x0 + 2) / c); NAV.h = Math.ceil((z1 - z0 + 2) / c);
  const block = new Uint8Array(NAV.w * NAV.h);
  const fill = (rx0, rx1, rz0, rz1) => {
    // cells whose centre lies inside the rectangle grown by the body radius
    const i0 = Math.max(0, Math.ceil((rx0 - NAV_R - NAV.x0) / c - 0.5)), i1 = Math.min(NAV.w - 1, Math.floor((rx1 + NAV_R - NAV.x0) / c - 0.5));
    const j0 = Math.max(0, Math.ceil((rz0 - NAV_R - NAV.z0) / c - 0.5)), j1 = Math.min(NAV.h - 1, Math.floor((rz1 + NAV_R - NAV.z0) / c - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j * NAV.w + i] = 1;
  };
  for (const r of wallRects) fill(r.x0, r.x1, r.z0, r.z1);
  for (const it of items) { const b = new THREE.Box3().setFromObject(it.g); if (b.max.y - b.min.y > 0.25 && b.max.y > 0.3) fill(b.min.x, b.max.x, b.min.z, b.max.z); }
  // a desk blocks the way; behind its chair one may pass if there is no other way
  const v = new THREE.Vector3();
  for (const s of seats) {
    s.g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(s.g.matrixWorld).invert();
    const b = new THREE.Box3();
    for (const [lx, lz] of [[-0.5, -0.42], [0.5, -0.42], [-0.5, 1.05], [0.5, 1.05]]) { v.set(lx, 0, lz); s.g.localToWorld(v); b.expandByPoint(v); }
    const i0 = Math.max(0, Math.floor((b.min.x - NAV_R - NAV.x0) / c)), i1 = Math.min(NAV.w - 1, Math.floor((b.max.x + NAV_R - NAV.x0) / c));
    const j0 = Math.max(0, Math.floor((b.min.z - NAV_R - NAV.z0) / c)), j1 = Math.min(NAV.h - 1, Math.floor((b.max.z + NAV_R - NAV.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      v.set(NAV.x0 + (i + 0.5) * c, 0, NAV.z0 + (j + 0.5) * c).applyMatrix4(inv);
      if (Math.abs(v.x) > 0.5 + NAV_R || v.z < -0.42 - NAV_R || v.z > 1.05 + NAV_R) continue;
      const n = j * NAV.w + i; block[n] = v.z <= 0.42 + NAV_R ? 1 : Math.max(block[n], 2);
    }
  }
  NAV.block = block; NAV.sig = sig;
}
const navCell = (x, z) => [Math.floor((x - NAV.x0) / NAV.cell), Math.floor((z - NAV.z0) / NAV.cell)];
const navFree = (i, j) => i >= 0 && j >= 0 && i < NAV.w && j < NAV.h && NAV.block[j * NAV.w + i] !== 1;
const navClear = (i, j) => i >= 0 && j >= 0 && i < NAV.w && j < NAV.h && !NAV.block[j * NAV.w + i];
const navPoint = (i, j) => [NAV.x0 + (i + 0.5) * NAV.cell, NAV.z0 + (j + 0.5) * NAV.cell];
function navNearest(i, j) {
  if (navFree(i, j)) return [i, j];
  for (let r = 1; r <= 10; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    if (navFree(i + di, j + dj)) return [i + di, j + dj];
  }
  return null;
}
function navSight(a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / (NAV.cell * 0.5));
  for (let k = 1; k < n; k++) { const [i, j] = navCell(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (!navClear(i, j)) return false; }
  return true;
}
// A* on the floor grid, then the corners that keep a clear line of sight
function navPath(from, to) {
  navBuild();
  const s = navNearest(...navCell(from[0], from[1])), g = navNearest(...navCell(to[0], to[1]));
  if (!s || !g) return null;
  const W = NAV.w, start = s[1] * W + s[0], goal = g[1] * W + g[0];
  const cost = new Float32Array(W * NAV.h).fill(Infinity), prev = new Int32Array(W * NAV.h).fill(-1), shut = new Uint8Array(W * NAV.h);
  const heap = [], hv = [];
  const push = (n, f) => { heap.push(n); hv.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= hv[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hv[p], hv[k]] = [hv[k], hv[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(), lv = hv.pop(); if (heap.length) { heap[0] = last; hv[0] = lv; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hv[l] < hv[m]) m = l; if (r < heap.length && hv[r] < hv[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hv[m], hv[k]] = [hv[k], hv[m]]; k = m; } } return top; };
  const hx = n => { const dx = Math.abs(n % W - g[0]), dz = Math.abs(((n / W) | 0) - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  cost[start] = 0; push(start, hx(start));
  while (heap.length) {
    const n = pop(); if (n === goal) break; if (shut[n]) continue; shut[n] = 1;
    const i = n % W, j = (n / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      if (!navFree(i + di, j + dj)) continue;
      if (di && dj && (!navFree(i + di, j) || !navFree(i, j + dj))) continue;
      const m = (j + dj) * W + i + di, c = cost[n] + (di && dj ? 1.414 : 1) * (NAV.block[m] === 2 ? 5 : 1);
      if (c < cost[m]) { cost[m] = c; prev[m] = n; push(m, c + hx(m)); }
    }
  }
  if (prev[goal] < 0 && goal !== start) return null;
  const cells = []; for (let n = goal; n >= 0; n = prev[n]) { cells.push(navPoint(n % W, (n / W) | 0)); if (n === start) break; }
  cells.reverse();
  const pts = [from]; let a = from;
  for (let k = 1; k < cells.length; k++) if (!navSight(a, cells[k]) ) { a = cells[k - 1]; pts.push(a); }
  pts.push(to);
  return pts;
}
function seatPoint(s, z) { const v = new THREE.Vector3(0, 0, z); s.g.localToWorld(v); return [v.x, v.z]; }
function streetIn() {
  let dir = rnd() < 0.5 ? -1 : 1, d = 6 + rnd() * 8, sx = ENTRY.turn + dir * d;
  if (sx < MOVER_X[0] + 1 || sx > MOVER_X[1] - 1) sx = ENTRY.turn - dir * d;
  sx = THREE.MathUtils.clamp(sx, MOVER_X[0] + 1, MOVER_X[1] - 1);
  return [[sx, ENTRY.side], [ENTRY.turn, ENTRY.side], ...ENTRY.path];
}
const canWalk = () => LIVE.loaded && !CALM && !editing && !reduced && document.visibilityState === 'visible' && visitors.length < VISIT_MAX;
function addVisitor(guest, pts, seat, mode) {
  const p = makePerson({ shirt: guest.shirt, hair: guest.hair, skin: guest.skin }, false);
  p.position.set(pts[0][0], 0.08, pts[0][1]); world.add(p);
  const v = { p, pts, i: 0, t: 0, seat, mode, guest }; visitors.push(v); return v;
}
function startArrival(s) {
  const street = streetIn(), door = street[street.length - 1];
  const inside = navPath(door, seatPoint(s, 1.5));
  if (!inside) { s.arriving = false; applySeat(s); return; }
  s.visitor = addVisitor(s.guest, [...street, ...inside.slice(1), seatPoint(s, 0.82)], s, 'in');
}
function leavePath(from) {
  const street = streetIn(), door = street[street.length - 1];
  const inside = navPath(from, door);
  return inside ? [...inside, ...street.slice(0, -1).reverse()] : null;
}
function startDeparture(s, guest) {
  if (s.visitor) { turnBack(s.visitor); return; }
  if (!guest || !canWalk()) return;
  const out = leavePath(seatPoint(s, 1.5));
  if (out) addVisitor(guest, [seatPoint(s, 0.82), ...out], null, 'out');
}
function turnBack(v) {
  const here = [v.p.position.x, v.p.position.z], out = leavePath(here);
  if (v.seat) { v.seat.arriving = false; v.seat.visitor = null; v.seat = null; }
  if (!out) { dropVisitor(v); return; }
  v.pts = out; v.i = 0; v.t = 0; v.mode = 'out';
}
function dropVisitor(v) { world.remove(v.p); const k = visitors.indexOf(v); if (k >= 0) visitors.splice(k, 1); }
function finishVisitor(v) {
  dropVisitor(v);
  if (v.mode === 'in' && v.seat) { const s = v.seat; s.arriving = false; s.visitor = null; applySeat(s); }
}
function finishVisitors() { for (const v of visitors.slice()) finishVisitor(v); }
function stepVisitors(dt, t) {
  for (const v of visitors.slice()) {
    const a = v.pts[v.i], b = v.pts[v.i + 1];
    if (!b) { finishVisitor(v); continue; }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
    v.t += dt * VISIT_SPEED / len;
    if (v.t >= 1) { v.t = 0; v.i++; continue; }
    v.p.position.x = a[0] + (b[0] - a[0]) * v.t; v.p.position.z = a[1] + (b[1] - a[1]) * v.t;
    if (len > 0.01) { const target = Math.atan2(b[0] - a[0], b[1] - a[1]); let d = target - v.p.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); v.p.rotation.y += d * Math.min(1, dt * 8); }
    const sw = Math.sin(t * 7 * VISIT_SPEED + v.p.id) * 0.5; v.p.userData.legs[0].rotation.x = sw; v.p.userData.legs[1].rotation.x = -sw; v.p.userData.arms[0].rotation.x = -sw * 0.7; v.p.userData.arms[1].rotation.x = sw * 0.7;
  }
}
/* ---------------- guest at a computer: GET /api/stores/:id/floor-plan/live/seats/:n ----------------
   `var`: seats are built and rendered before this part of the script runs. */
var SEAT_INFO = new Map();
var SEAT_INFO_TTL = 20000;
var LEVEL_XP = 500;
var SEG_LABEL = { active: 'Активный', new: 'Новый', repeat: 'Постоянный', risk: 'В риске', lost: 'Давно не был', quiet: 'Редко ходит' };
var SEG_TONE = { active: 'good', new: 'acc', repeat: 'lilac', risk: 'warn', lost: 'off', quiet: 'off' };
var CRM_LABEL = { WATCH: 'Наблюдать', CONTACT: 'Связаться', INVITED: 'Приглашён', LOYAL: 'Лояльный', VIP: 'VIP', PROBLEM: 'Проблема', DO_NOT_CONTACT: 'Не беспокоить' };
function seatInfo(s, want) {
  if (!SEAT_INFO || !API || !s || s.state !== 'busy' || !s.num) return null;
  const e = SEAT_INFO.get(s.num);
  if (want && !(e && e.pending) && !(e && performance.now() - e.at < SEAT_INFO_TTL)) loadSeatInfo(s.num);
  return e ? e.data : null;
}
async function loadSeatInfo(num) {
  const prev = SEAT_INFO.get(num);
  SEAT_INFO.set(num, { at: prev ? prev.at : 0, data: prev ? prev.data : null, pending: true });
  let data = null;
  try {
    const r = await fetch(`${API}/live/seats/${encodeURIComponent(num)}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (r.ok) data = await r.json();
  } catch (e) { data = null; }
  if (!SEAT_INFO.has(num)) return;
  SEAT_INFO.set(num, { at: performance.now(), data: data || (prev && prev.data && !prev.data.failed ? prev.data : { failed: true }), pending: false });
  if (!editing && view.type === 'seat') { const s = seats.find(x => x.id === view.id); if (s && s.num === num) renderPanel(); }
}
function forgetSeatInfo(s) { if (SEAT_INFO && s && s.num) SEAT_INFO.delete(s.num); }
function agoText(iso) {
  const d = new Date(iso); if (isNaN(d)) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : plural(days, 'день', 'дня', 'дней') + ' назад';
}
function sinceText(iso) {
  const d = new Date(iso); if (isNaN(d)) return null;
  return 'с ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, '') + ' ' + d.getFullYear();
}
function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'; }
function seatSessionHtml(s, st) {
  const info = seatInfo(s, true), ses = info && info.session;
  const started = ses && ses.startedAt ? new Date(ses.startedAt) : null;
  let h = `<dl class="kv"><dt>Статус</dt><dd>идёт сеанс</dd>`;
  if (started && !isNaN(started)) h += `<dt>В клубе</dt><dd class="num">${hm((Date.now() - started.getTime()) / 60000)}, с ${hhmm(started)}</dd>`;
  h += `<dt>Осталось</dt><dd class="num" style="color:${st === 'ending' ? 'var(--warn)' : 'inherit'}">${s.left == null ? 'без конца в Langame' : hm(s.left)}</dd>${s.until ? `<dt>До</dt><dd class="num">${hhmm(new Date(s.until))}</dd>` : ''}`;
  if (ses && ses.tariff) h += `<dt>Тариф</dt><dd>${esc(ses.tariff)}</dd>`;
  h += `</dl>`;
  return h + seatGuestHtml(info);
}
function seatGuestHtml(info) {
  if (!API) return '';
  if (!info) return `<div class="sec gsec"><h3>Гость</h3><div class="note">Загружаю данные гостя…</div></div>`;
  if (info.failed) return `<div class="sec gsec"><h3>Гость</h3><div class="note">Не удалось получить данные гостя, попробую ещё раз.</div></div>`;
  if (info.guestAccess !== 'AVAILABLE') return `<div class="sec gsec"><h3>Гость</h3><div class="lockn">Имя, визиты и покупки гостя видят роли с доступом к разделу «Гости».</div></div>`;
  const g = info.guest;
  if (!g) return newGuestHtml(info.newGuest);
  const tags = [];
  if (g.isStaff) tags.push(`<span class="chip off">Сотрудник</span>`);
  if (SEG_LABEL[g.segment]) tags.push(`<span class="chip ${SEG_TONE[g.segment] || 'off'}">${SEG_LABEL[g.segment]}</span>`);
  if (CRM_LABEL[g.crmStatus]) tags.push(`<span class="chip ${g.crmStatus === 'VIP' ? 'lilac' : g.crmStatus === 'PROBLEM' || g.crmStatus === 'DO_NOT_CONTACT' ? 'warn' : 'off'}">${CRM_LABEL[g.crmStatus]}</span>`);
  const since = g.since ? sinceText(g.since) : null;
  if (since) tags.push(`<span class="chip off">${since}</span>`);
  let h = `<div class="sec gsec"><h3>Гость <a class="glink" href="/guests/${encodeURIComponent(g.id)}" target="_top">Карточка гостя →</a></h3>
    <div class="gwho"><div class="gav">${esc(initials(g.displayName))}</div><div class="grow"><b>${esc(g.displayName)}</b><div class="gtags">${tags.join('')}</div></div></div>
    <div class="statgrid"><div class="stat"><small>Визитов</small><b class="num">${fmt.format(g.visitsDays)}</b></div><div class="stat"><small>Часов игры</small><b class="num">${fmt.format(Math.round(g.playHours))}</b></div><div class="stat"><small>Потратил</small><b class="num">${rub(g.totalRevenue)}</b></div></div>
    <dl class="kv">`;
  h += `<dt>Прошлый визит</dt><dd>${g.previousVisit ? `${agoText(g.previousVisit.at)}${g.previousVisit.storeName && g.previousVisit.storeName !== CLUB.name ? ', ' + esc(g.previousVisit.storeName) : ''}` : 'первый визит'}</dd>`;
  if (g.balance != null || g.bonusBalance != null) h += `<dt>Баланс · бонусы</dt><dd class="num">${rubOr(g.balance)} · ${g.bonusBalance == null ? '—' : fmt.format(Math.round(g.bonusBalance)) + ' Б'}</dd>`;
  if (g.nextAction) h += `<dt>Следующий шаг</dt><dd>${esc(g.nextAction)}</dd>`;
  h += `</dl>`;
  if (g.crmNote) h += `<div class="note">${esc(g.crmNote)}</div>`;
  h += `</div>`;
  h += guestBuysHtml(g.purchases);
  if (g.gameAccess === 'AVAILABLE') {
    const gm = g.game;
    if (!gm) h += `<div class="sec"><h3>Игровой модуль</h3><div class="note">Гость ещё не в игре.</div></div>`;
    else {
      const pct = Math.round((LEVEL_XP - Math.min(LEVEL_XP, gm.xpToNextLevel)) / LEVEL_XP * 100);
      h += `<div class="sec"><h3>Игровой модуль</h3><dl class="kv"><dt>Уровень ${fmt.format(gm.level)}</dt><dd class="num">ещё ${fmt.format(gm.xpToNextLevel)} XP</dd></dl><span class="gbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>
      <dl class="kv"><dt>Не забрал наград</dt><dd class="num">${fmt.format(gm.pendingRewards)}${gm.rewardsExpiringSoon ? ` · ${fmt.format(gm.rewardsExpiringSoon)} скоро сгорит` : ''}</dd>${gm.nearestRewardExpiresAt && gm.pendingRewards ? `<dt>Ближайшая сгорает</dt><dd class="num">${new Date(gm.nearestRewardExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</dd>` : ''}<dt>Получил наград</dt><dd class="num">${fmt.format(gm.rewardsPaidTotal)}</dd></dl></div>`;
    }
  }
  if (g.recommendedAction) h += `<div class="gtip"><b>Подсказка админу</b>${esc(g.recommendedAction.label)}${g.recommendedAction.reason ? `: ${esc(g.recommendedAction.reason)}` : ''}</div>`;
  return h;
}
function guestBuysHtml(list) {
  const when = LIVE.revenue && LIVE.revenue.period === 'TODAY' ? 'за сегодня' : 'за смену';
  return `<div class="sec"><h3>Купил ${when}</h3>${list && list.length ? `<div class="list buys">${list.map(p => {
    const qty = p.quantity && p.quantity !== 1 ? ` × ${fmt.format(p.quantity)}` : '';
    return `<div class="li"><span class="t num">${p.at ? hhmm(new Date(p.at)) : '—'}</span><span class="grow"><b title="${esc(p.title)}">${esc(p.title)}${qty}</b></span><span class="r num">${rub(p.sum)}</span></div>`;
  }).join('')}</div>` : `<div class="note">Пока ничего не покупал.</div>`}</div>`;
}
/* A guest registered after the nightly guest sync: no LeetPlus card yet. */
function newGuestHtml(ng) {
  if (!ng) return `<div class="sec gsec"><h3>Гость</h3><div class="note">Гость ещё не загружен из Langame, данные появятся после синхронизации.</div></div>`;
  const name = ng.displayName || 'Гость Langame';
  return `<div class="sec gsec"><h3>Гость</h3>
    <div class="gwho"><div class="gav">${esc(initials(name))}</div><div class="grow"><b>${esc(name)}</b><div class="gtags"><span class="chip acc">Новый гость</span></div></div></div>
    <div class="note">Карточки гостя в LeetPlus ещё нет: справочник гостей приходит из Langame ночью, тогда появятся визиты, баланс и ссылка на карточку.</div></div>` + guestBuysHtml(ng.purchases);
}
function seatTipHtml(s) {
  let h = `<b>${s.id}</b> · играет${s.left != null ? ` · ещё <span class="num">${hm(s.left)}</span>` : ''}`;
  const info = seatInfo(s, false), g = info && info.guest;
  if (!g && info && info.newGuest && info.newGuest.displayName) h += `<br><span class="gtipn">${esc(info.newGuest.displayName)} · новый гость</span>`;
  if (g) h += `<br><span class="gtipn">${esc(g.displayName)}${g.game ? ` · ур. ${fmt.format(g.game.level)}` : ''}${SEG_LABEL[g.segment] ? ' · ' + SEG_LABEL[g.segment].toLowerCase() : ''}</span>`;
  return h;
}
var tipSeatNum = null, tipSeatTimer = 0;
function hoverSeatInfo(s) {
  const num = s && s.state === 'busy' ? s.num : null;
  if (num === tipSeatNum) return;
  tipSeatNum = num; clearTimeout(tipSeatTimer);
  if (num) tipSeatTimer = setTimeout(() => { if (tipSeatNum === num) seatInfo(s, true); }, 350);
}
/* ---------------- attention: GET /api/stores/:id/floor-plan/live/attention ----------------
   Hints over the computers (what to pay attention to about the guest) and the
   guests' messages. `var`: the scene is built before this part of the script runs,
   and CLUB / editing are declared further down, so only callbacks touch them. */
var ATTN = { data: null, pending: false, failed: false, off: new Set(), busy: new Set(), timer: 0, back: 0 };
var ATTN_POLL_MS = 15000;
var ATTN_TONES = ['ALERT', 'TODAY', 'OFFER', 'NEW', 'KNOW'];
var ATTN_TONE_LABEL = { ALERT: 'Обращения', TODAY: 'Сегодня', OFFER: 'Предложить', NEW: 'Новые', KNOW: 'Знай гостя' };
var ATTN_SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
var ATTN_ICON = {
  GUEST_MESSAGE: ATTN_SVG('<path d="M12 5v9M12 18.5v.5"/>'),
  REWARD_EXPIRING: ICON.gift, REWARDS_WAITING: ICON.gift,
  TIME_ENDING: ATTN_SVG('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'),
  TASK: ATTN_SVG('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  NOT_IN_GAME: ICON.star, GAME_IDLE: ICON.star, BONUS_IDLE: ICON.rub, NO_PURCHASES: ICON.cup,
  FIRST_VISIT: ATTN_SVG('<path d="M12 5v14M5 12h14"/>'),
  VIP: ICON.badge, RETURNED: ATTN_SVG('<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5"/>')
};
var attnMarkers = new Map();

function attnDayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function attnDoneKey() { return `lp-attn-done:${STORE_ID}:${attnDayKey()}`; }
function attnDone() {
  try { const v = JSON.parse(localStorage.getItem(attnDoneKey()) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); }
}
function attnMarkDone(id) {
  const done = attnDone(); done.add(id);
  try { localStorage.setItem(attnDoneKey(), JSON.stringify([...done].slice(-300))); } catch (e) { /* private mode: hidden until reload */ }
  ATTN.hidden = ATTN.hidden || new Set(); ATTN.hidden.add(id);
}
function attnHintId(seat, hint) { return `${seat.number}:${seat.guestId || ''}:${hint.key}`; }
function attnIsDone(seat, hint, done) { const id = attnHintId(seat, hint); return done.has(id) || (ATTN.hidden && ATTN.hidden.has(id)); }
/* Hints of a seat that are still open and pass the tone filter, most urgent first. */
function attnOpenHints(seat, done) {
  return seat.hints.filter(h => !ATTN.off.has(h.tone) && (h.key === 'GUEST_MESSAGE' || !attnIsDone(seat, h, done)));
}
function attnSceneSeat(num) { return seats.find(x => x.num === num) || null; }
function attnAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!isFinite(m)) return '';
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : `${Math.floor(m / 60)} ч ${m % 60} мин назад`;
}

async function loadAttention() {
  if (!API || ATTN.pending || document.hidden) return;
  ATTN.pending = true;
  try {
    const r = await fetch(`${API}/live/attention`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (r.ok) { ATTN.data = await r.json(); ATTN.failed = false; } else ATTN.failed = true;
  } catch (e) { ATTN.failed = true; }
  ATTN.pending = false;
  attnRefreshPanel();
}
function attnRefreshPanel() {
  if (typeof editing === 'undefined' || editing) return;
  if ((view.type === 'home' && EMBED) || view.type === 'seat') renderPanel();
}
function startAttention() {
  if (!API) return;
  loadAttention();
  clearInterval(ATTN.timer);
  ATTN.timer = setInterval(loadAttention, ATTN_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAttention(); });
}

async function setAlertStatus(id, status) {
  if (!API || ATTN.busy.has(id)) return;
  ATTN.busy.add(id); attnRefreshPanel();
  let ok = false, msg = null;
  try {
    const r = await fetch(`${API}/live/alerts/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ status }) });
    ok = r.ok;
    if (!ok) { const d = await r.json().catch(() => null); msg = d && typeof d.message === 'string' ? d.message : null; if (r.status === 403) msg = 'Нет прав менять обращения'; if (r.status === 409) msg = msg || 'Обращение уже изменили'; }
  } catch (e) { ok = false; }
  ATTN.busy.delete(id);
  if (ok && ATTN.data) {
    const a = ATTN.data.alerts.find(x => x.id === id); if (a) a.status = status;
    if (status === 'RESOLVED') for (const s of ATTN.data.seats) s.hints = s.hints.filter(h => !(h.key === 'GUEST_MESSAGE' && h.alertId === id));
  }
  toast(ok ? (status === 'RESOLVED' ? 'Обращение решено' : 'Отметили, что вы идёте') : (msg || 'Не получилось изменить обращение'));
  attnRefreshPanel();
  loadAttention();
}

/* ---------------- markers over the heads of the guests ---------------- */
function placeAttentionMarkers() {
  const d = ATTN.data;
  const show = d && typeof editing !== 'undefined' && !editing && view.type !== 'seat';
  const want = new Set();
  const placed = [];
  if (show) {
    const done = attnDone();
    const rows = [];
    for (const seat of d.seats) {
      const open = attnOpenHints(seat, done);
      const s = attnSceneSeat(seat.number);
      if (!open.length || !s || s.state !== 'busy') continue;
      let w;
      if (s.person && s.person.userData.head) { w = s.person.userData.head.getWorldPosition(new THREE.Vector3()); w.y += 0.42; }
      else { w = seatWorld(s); w.y = 1.9; }
      const [x, y, depth] = project(w.x, w.y, w.z);
      if (depth > 1) continue;
      rows.push({ seat, s, top: open[0], more: open.length - 1, x, y });
    }
    rows.sort((a, b) => ATTN_TONES.indexOf(a.top.tone) - ATTN_TONES.indexOf(b.top.tone) || b.y - a.y);
    for (const r of rows) {
      const key = String(r.seat.number); want.add(key);
      let el = attnMarkers.get(key);
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'amk';
        el.addEventListener('click', () => { const s = attnSceneSeat(Number(el.dataset.n)); if (s) select({ type: 'seat', id: s.id }); });
        overlay.appendChild(el); attnMarkers.set(key, el);
      }
      el.dataset.n = key;
      const wide = r.top.tone === 'ALERT';
      const sig = `${r.top.tone}|${r.top.key}|${r.more}|${wide ? r.top.title : ''}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.className = `amk t-${r.top.tone}${wide ? ' wide' : ''}`;
        el.innerHTML = `<i>${ATTN_ICON[r.top.key] || ''}</i><span>${wide ? 'Обращение' : esc(r.s.num)}</span>${r.more > 0 ? `<em>+${r.more}</em>` : ''}`;
        el.setAttribute('aria-label', `ПК ${r.seat.number}${r.seat.guestName ? ', ' + r.seat.guestName : ''}: ${r.top.title}`);
        el.title = `ПК ${r.seat.number} · ${r.top.title}`;
      }
      const w = el.offsetWidth || 40, h = el.offsetHeight || 24;
      // Nearest free spot: above the head, then beside it, then one row higher.
      const hits = (x, y) => placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 3 && Math.abs(p.y - y) < h + 2);
      const side = w + 4, up = h + 3;
      const spots = [[0, 0], [side * 0.6, 0], [-side * 0.6, 0], [0, -up], [side * 0.6, -up], [-side * 0.6, -up], [side * 1.2, 0], [-side * 1.2, 0], [0, -2 * up]];
      let x = r.x, y = r.y;
      for (const [dx, dy] of spots) if (!hits(r.x + dx, r.y + dy)) { x = r.x + dx; y = r.y + dy; break; }
      placed.push({ x, y, w });
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
    }
  }
  for (const [key, el] of attnMarkers) if (!want.has(key)) { el.remove(); attnMarkers.delete(key); }
}

/* ---------------- panel: the hall on «Моя смена» ---------------- */
function attnChipsHtml(d, done) {
  const count = {};
  for (const seat of d.seats) for (const h of seat.hints) if (h.key !== 'GUEST_MESSAGE' && !attnIsDone(seat, h, done)) count[h.tone] = (count[h.tone] || 0) + 1;
  count.ALERT = d.alerts.filter(a => a.status !== 'RESOLVED').length;
  return `<div class="achips" role="group" aria-label="Что показывать на схеме">${ATTN_TONES.map(t => `<button type="button" class="achip" data-tone="${t}" aria-pressed="${ATTN.off.has(t) ? 'false' : 'true'}"><i class="t-${t}"></i>${ATTN_TONE_LABEL[t]}<em class="num">${count[t] || 0}</em></button>`).join('')}</div>`;
}
function attnAlertHtml(a) {
  const busy = ATTN.busy.has(a.id);
  const seat = a.number != null ? attnSceneSeat(a.number) : null;
  const who = `${a.number != null ? `ПК ${a.number}` : 'Не за ПК'}${a.guestName ? ' · ' + esc(a.guestName) : ''}`;
  const acts = a.status === 'RESOLVED' ? `<span class="adone">Решено</span>`
    : `${a.status === 'NEW' ? `<button type="button" class="abtn" data-alert="${esc(a.id)}" data-status="IN_PROGRESS"${busy ? ' disabled' : ''}>Иду</button>` : `<span class="aprog">Администратор идёт</span>`}<button type="button" class="abtn pri" data-alert="${esc(a.id)}" data-status="RESOLVED"${busy ? ' disabled' : ''}>Решено</button>`;
  return `<div class="arow s-${a.status}"${seat ? ` data-seat="${esc(seat.id)}" role="button" tabindex="0"` : ''}><div class="atop"><b>${who}</b><time>${a.channel === 'TELEGRAM' ? 'Telegram' : 'Приложение'} · ${attnAgo(a.lastActivityAt || a.createdAt)}</time></div><q>${esc(a.text)}</q><div class="aacts">${acts}</div></div>`;
}
function attentionHomeHtml() {
  const linked = linkedSeats(), busyN = seats.filter(s => s.state === 'busy').length;
  let h = `<div class="ph"><div><div class="eyebrow">Сейчас в зале</div><h2>${esc(CLUB.name)}</h2><div class="sub">${linked.length ? `${busyN} из ${linked.length} ПК заняты` : 'Нет данных Langame о компьютерах'}</div></div><span class="chip ${LIVE.status === 'LIVE' ? 'good' : 'off'}">${LIVE.status === 'LIVE' ? 'Live' : 'Нет данных'}</span></div>`;
  const d = ATTN.data;
  if (!d) return h + `<div class="note">${ATTN.failed ? 'Не удалось получить подсказки, попробую ещё раз.' : 'Загружаю подсказки по гостям…'}</div>`;
  const done = attnDone();
  h += attnChipsHtml(d, done);
  if (d.guestAccess === 'AVAILABLE') {
    const open = d.alerts.filter(a => a.status !== 'RESOLVED').length;
    const alerts = ATTN.off.has('ALERT') ? [] : d.alerts;
    h += `<div class="sec asec"><h3>Обращения гостей <span class="acnt${open ? ' red' : ''}">${open}</span></h3>${alerts.length ? `<div class="alist">${alerts.map(attnAlertHtml).join('')}</div>` : `<div class="aempty">${ATTN.off.has('ALERT') ? 'Обращения скрыты фильтром' : 'Новых обращений нет'}</div>`}</div>`;
  }
  const rows = [];
  for (const seat of d.seats) {
    const open = attnOpenHints(seat, done).filter(x => x.key !== 'GUEST_MESSAGE');
    if (open.length) rows.push({ seat, open });
  }
  rows.sort((a, b) => ATTN_TONES.indexOf(a.open[0].tone) - ATTN_TONES.indexOf(b.open[0].tone) || a.seat.number - b.seat.number);
  h += `<div class="sec"><h3>На что обратить внимание <span class="acnt">${rows.length}</span></h3>${rows.length ? `<div class="alist">${rows.map(({ seat, open }) => {
    const s = attnSceneSeat(seat.number), top = open[0];
    return `<div class="lrow"${s ? ` data-seat="${esc(s.id)}" role="button" tabindex="0"` : ''}><span class="apc t-${top.tone}">${seat.number}</span><span class="lt"><b>${seat.guestName ? esc(seat.guestName) + ' · ' : ''}${esc(top.title)}</b><span>${esc(top.hint)}${open.length > 1 ? ` · ещё ${open.length - 1}` : ''}</span></span><button type="button" class="aok" data-done="${esc(attnHintId(seat, top))}" aria-label="Готово: ${esc(top.title)}">Готово</button></div>`;
  }).join('')}</div>` : `<div class="aempty">Сейчас подсказок нет. Метки появятся над ПК, когда будет повод.</div>`}</div>`;
  if (d.guestAccess !== 'AVAILABLE') h += `<div class="lockn">Подсказки по гостям и обращения видят роли с доступом к разделу «Гости». Сейчас видно только, у кого заканчивается время.</div>`;
  return h;
}
/* Hints of the guest at the selected computer, above the session block. */
function seatHintsHtml(s) {
  const d = ATTN.data;
  if (!d || !s || s.state !== 'busy') return '';
  const seat = d.seats.find(x => x.number === s.num);
  if (!seat || !seat.hints.length) return '';
  const done = attnDone();
  const items = seat.hints.map(hint => {
    const isDone = hint.key !== 'GUEST_MESSAGE' && attnIsDone(seat, hint, done);
    const alert = hint.key === 'GUEST_MESSAGE' && hint.alertId ? d.alerts.find(a => a.id === hint.alertId) : null;
    let acts = '';
    if (alert && alert.status !== 'RESOLVED') {
      const busy = ATTN.busy.has(alert.id);
      acts = `<div class="aacts">${alert.status === 'NEW' ? `<button type="button" class="abtn" data-alert="${esc(alert.id)}" data-status="IN_PROGRESS"${busy ? ' disabled' : ''}>Иду</button>` : `<span class="aprog">Администратор идёт</span>`}<button type="button" class="abtn pri" data-alert="${esc(alert.id)}" data-status="RESOLVED"${busy ? ' disabled' : ''}>Решено</button></div>`;
    } else if (!isDone && hint.key !== 'GUEST_MESSAGE') {
      acts = `<div class="aacts"><button type="button" class="aok" data-done="${esc(attnHintId(seat, hint))}">Готово</button></div>`;
    }
    return `<li class="${isDone ? 'isdone' : ''}"><i class="t-${hint.tone}"></i><div><b>${esc(hint.title)}</b><span class="say">${esc(hint.hint)}</span>${acts}</div></li>`;
  }).join('');
  return `<div class="sec ahints"><h3>На что обратить внимание</h3><ul>${items}</ul></div>`;
}

/* Buttons inside the panel run before the panel's own click handler, which
   would open the computer of the row. */
pbody.addEventListener('click', e => {
  const tone = e.target.closest('[data-tone]');
  const done = e.target.closest('[data-done]');
  const alert = e.target.closest('[data-alert]');
  if (!tone && !done && !alert) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (tone) { const t = tone.dataset.tone; if (ATTN.off.has(t)) ATTN.off.delete(t); else ATTN.off.add(t); renderPanel(); return; }
  if (done) { attnMarkDone(done.dataset.done); toast('Подсказка скрыта до конца дня'); renderPanel(); return; }
  if (alert && !alert.disabled) setAlertStatus(alert.dataset.alert, alert.dataset.status);
}, true);
pbody.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-seat][role="button"]')) { e.preventDefault(); e.target.click(); }
});

/* On «Моя смена» the hall goes back to its place 20 seconds after the last touch. */
if (EMBED) {
  controls.addEventListener('end', () => {
    clearTimeout(ATTN.back);
    ATTN.back = setTimeout(() => { if (view.type === 'home' && !fly && !(typeof editing !== 'undefined' && editing)) flyTo(homeView()); }, 20000);
  });
}
/* Calm hall: no cars and no people in the street. */
if (CALM) {
  for (const m of movers) m.o.visible = false;
  for (const w of walkers) w.p.visible = false;
}
/* ---------------- other clubs of the network with a drawn hall (full screen only) ---------------- */
async function loadClubNav() {
  if (window.parent !== window || !STORE_ID) return;
  let data = null;
  try { const r = await fetch('/api/stores/floor-plans', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }); if (!r.ok) return; data = await r.json(); } catch (e) { return; }
  const clubs = (data && Array.isArray(data.clubs) ? data.clubs : []).filter(c => c && c.id && c.id !== STORE_ID && /^[a-z0-9-]+$/.test(c.template || ''));
  if (!clubs.length) return;
  const nav = $('#clubNav');
  nav.innerHTML = clubs.map(c => {
    const p = new URLSearchParams({ store: c.id }); if (CAN_EDIT) p.set('edit', '1'); if (Q.get('theme')) p.set('theme', Q.get('theme'));
    const street = String(c.address || '').replace(/^\s*(г\.|город)\s*[^,]+,\s*/iu, '').trim();
    return `<a class="club" href="../${c.template}/index.html?${p}" title="Схема клуба ${esc(c.name)}" aria-label="Схема клуба ${esc(c.name)}"><span class="ic">${esc(clubInitials(c.name))}</span><span><b>${esc(c.name)}</b><span>${esc(street || 'Схема клуба')}</span></span></a>`;
  }).join('');
  nav.hidden = false;
}
loadClubNav();
function refresh() { renderKPIs(); renderCards(); if (editing) return; renderPanel(); }
let pollTimer = null, pollBusy = false;
const POLL_MS = 20000, POLL_HIDDEN_MS = 60000;
function setStatus(textValue, kind) {
  const el = $('#dataStatus'); el.textContent = textValue; el.classList.toggle('warn', kind === 'warn');
  const badge = $('#liveBadge'); badge.classList.toggle('stale', kind === 'warn'); badge.classList.toggle('off', kind === 'off');
}
function applyLive(data) {
  const before = new Map(seats.map(s => [s.id, s.state]));
  LIVE.status = data.status; LIVE.at = data.generatedAt; LIVE.guests = data.guests; LIVE.shift = data.shift; LIVE.revenue = data.revenue; LIVE.purchases = Array.isArray(data.purchases) ? data.purchases : null; LIVE.game = data.game && typeof data.game === 'object' ? data.game : null; LIVE.warnings = Array.isArray(data.warnings) ? data.warnings : []; LIVE.failed = false;
  const byNum = new Map();
  for (const pc of Array.isArray(data.pcs) ? data.pcs : []) if (pc && pc.number != null && !byNum.has(pc.number)) byNum.set(pc.number, pc);
  for (const s of seats) {
    const pc = byNum.get(s.num);
    if (!pc) setOff(s);
    else if (pc.busy) occupy(s, pc.busyUntil ? Date.parse(pc.busyUntil) : null);
    else free(s);
  }
  if (LIVE.loaded) for (const s of seats) {
    const was = before.get(s.id);
    if (s.arriving && !s.visitor) startArrival(s);
    if (was !== 'busy' && s.state === 'busy') addEvent('in', `${s.id} занят`, ZONES[s.zone].name);
    else if (was === 'busy' && s.state === 'free') addEvent('out', `${s.id} освободился`, ZONES[s.zone].name);
  }
  LIVE.loaded = true;
  const at = data.generatedAt ? new Date(data.generatedAt) : new Date();
  $('#clock').textContent = hhmm(at);
  if (data.status === 'NOT_CONNECTED') setStatus(LIVE.warnings[0] || 'Клуб не подключён к Langame', 'off');
  else if (data.status === 'UNAVAILABLE') setStatus('Langame сейчас не отвечает', 'warn');
  else if (LIVE.warnings.length) setStatus('Langame · часть данных недоступна', 'warn');
  else setStatus('Данные Langame · обновлено в ' + hhmm(at) + ':' + pad2(at.getSeconds()));
  $('#dataStatus').title = LIVE.warnings.join(' ');
  refresh();
}
async function poll() {
  clearTimeout(pollTimer); pollTimer = null;
  if (!API || pollBusy) return;
  pollBusy = true;
  try {
    const r = await fetch(API + '/live', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (r.status === 401) { setStatus('Сессия истекла, обновите страницу', 'warn'); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    applyLive(await r.json());
  } catch (e) {
    LIVE.failed = true;
    setStatus(LIVE.loaded ? 'Нет связи, показываю данные на ' + (LIVE.at ? hhmm(new Date(LIVE.at)) : '—') : 'Не удалось загрузить данные клуба', 'warn');
  } finally {
    pollBusy = false;
    if (!pollTimer) pollTimer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
function minuteTick() {
  for (const s of seats) if (s.state === 'busy' && s.until) { s.left = Math.max(0, (s.until - Date.now()) / 60000); applySeat(s); }
  refresh();
}

/* ---------------- picking & hover ---------------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const tip = $('#tip');
function hit(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(pickables.concat(items.map(i => i.g)), true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.pick) o = o.parent; if (o) return { data: o.userData.pick, x: e.clientX - r.left, y: e.clientY - r.top }; }
  return null;
}
let downAt = null;
const hintEl = $('#hint'); if (matchMedia('(pointer: coarse)').matches) hintEl.textContent = 'Один палец двигает карту, двумя пальцами вращение и масштаб';
setTimeout(() => hintEl.classList.add('gone'), 9000);
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, performance.now()]; clickStart = [e.clientX, e.clientY]; userTouched(); hintEl.classList.add('gone'); });
let clickStart = [0, 0];
canvas.addEventListener('pointerup', e => {
  if (editing) { downAt = null; return; }
  if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6) return;
  if (staffHit(e)) { select({ type: 'zone', id: 'admin' }); staffTipUntil = performance.now() + 6000; setAdminHL(true); return; }
  const h = hit(e); if (!h) return;
  if (h.data.type === 'seat') select({ type: 'seat', id: h.data.id }); else select({ type: 'zone', id: h.data.id });
});
canvas.addEventListener('pointermove', e => {
  if (editing) { const g = e.pointerType === 'mouse' && !dragging ? editableAt(e) : null; canvas.classList.toggle('pointer', !!g); return; }
  if (e.pointerType === 'touch' || downAt) { if (!staffTipUntil) tip.hidden = true; setAdminHL(false); return; }
  staffTipUntil = 0;
  const sh = staffHit(e);
  if (sh) {
    setAdminHL(true); canvas.classList.add('pointer'); hoverRing.visible = true; hoverRing.position.set(sh.p.x, 0.05, sh.p.z);
    tip.hidden = false; tip.style.left = sh.x + 'px'; tip.style.top = sh.y + 'px'; tip.innerHTML = staffTipHtml();
    return;
  }
  setAdminHL(false);
  const h = hit(e);
  canvas.classList.toggle('pointer', !!h);
  if (h && h.data.type === 'seat') {
    const s = seats.find(x => x.id === h.data.id); const w = seatWorld(s); hoverRing.visible = true; hoverRing.position.set(w.x, 0.05, w.z);
    tip.hidden = false; tip.style.left = h.x + 'px'; tip.style.top = h.y + 'px';
    hoverSeatInfo(s);
    tip.innerHTML = s.state === 'busy' ? seatTipHtml(s) : `<b>${s.id}</b> · ${s.state === 'free' ? 'свободен' : 'нет данных Langame'}`;
  } else if (h) { hoverRing.visible = false; tip.hidden = false; tip.style.left = h.x + 'px'; tip.style.top = h.y + 'px'; tip.innerHTML = `<b>${ZONES[h.data.id].name}</b> · открыть`; }
  else { hoverRing.visible = false; tip.hidden = true; }
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; hoverRing.visible = false; setAdminHL(false); });
let staffTipUntil = 0;
addEventListener('pointerup', () => { if (!editing) setTimeout(() => { downAt = null; }, 0); });
function staffTipHtml() { const s = shiftInfo(), r = LIVE.revenue; if (!s) return `<b>Администратор</b><span class="tl">${LIVE.loaded ? 'в Langame нет открытой смены' : 'загружаю смену'}</span>`; return `<b>${esc(s.full)}</b> · администратор смены<span class="tl">смена с ${s.start}, идёт ${s.dur} · товары ${rubOr(r && r.goods)}${r && r.goodsCount != null ? ', ' + plural(r.goodsCount, 'товар', 'товара', 'товаров') : ''} · выручка ${rubOr(r && r.total)}</span>`; }
// after a tap on the admin model the tip follows the model while the camera flies
const stv = new THREE.Vector3();
function updateStaffTip() {
  if (!staffTipUntil) return;
  const p = staffList()[0];
  if (!p || editing || performance.now() > staffTipUntil) { staffTipUntil = 0; tip.hidden = true; setAdminHL(false); return; }
  p.getWorldPosition(stv); stv.y += 1.95; stv.project(camera);
  tip.hidden = false; tip.style.left = (stv.x + 1) / 2 * stageW + 'px'; tip.style.top = (1 - stv.y) / 2 * stageH + 'px'; tip.innerHTML = staffTipHtml();
}
function staffList() { return items.map(i => i.g.userData.staff).filter(Boolean); }
function staffHit(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(staffList(), true); if (!hits.length) return null;
  let o = hits[0].object; while (o && !o.userData.isStaff) o = o.parent;
  return { p: o.getWorldPosition(new THREE.Vector3()), x: e.clientX - r.left, y: e.clientY - r.top };
}
function setAdminHL(on) { if (adminHL === on) return; adminHL = on; const el = $('#kpis .kpi[data-k="admin"]'); if (el) el.classList.toggle('hl', on); }
// the admin tile points at the admin model and opens the admin zone
$('#kpis').addEventListener('pointerover', e => { if (editing || !e.target.closest('[data-k="admin"]')) return; const p = staffList()[0]; if (p) { const w = p.getWorldPosition(new THREE.Vector3()); hoverRing.visible = true; hoverRing.position.set(w.x, 0.05, w.z); } });
$('#kpis').addEventListener('pointerout', e => { if (e.target.closest('[data-k="admin"]') && !e.relatedTarget?.closest?.('[data-k="admin"]')) hoverRing.visible = false; });
$('#kpis').addEventListener('click', e => { if (!editing && e.target.closest('[data-k="admin"]')) select({ type: 'zone', id: 'admin' }); });

/* ---------------- tools ---------------- */
let autoPref = !reduced && !CALM;
function setAuto(on) { controls.autoRotate = on; $('#rot').setAttribute('aria-pressed', String(on)); }
function userTouched() { fly = null; if (controls.autoRotate) setAuto(false); }
controls.addEventListener('start', userTouched);
function zoomBy(f) { const off = camera.position.clone().sub(controls.target); const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance); fly = { t0: performance.now(), dur: 450, fp: camera.position.clone(), ft: controls.target.clone(), tp: controls.target.clone().add(off.setLength(d)), tt: controls.target.clone() }; }
$('#zin').addEventListener('click', () => zoomBy(0.75));
$('#zout').addEventListener('click', () => zoomBy(1.33));
$('#rot').addEventListener('click', () => { autoPref = !controls.autoRotate; setAuto(autoPref); });
$('#home').addEventListener('click', () => select({ type: 'home' }));
addEventListener('keydown', e => { if (editing) { if (e.key === 'Escape') { deselect(); renderPanel(); } return; } if (e.key === 'Escape') { if (view.type === 'seat') { const s = seats.find(x => x.id === view.id); select({ type: 'zone', id: s.zone }); } else select({ type: 'home' }); } });

/* ---------------- layout editor ---------------- */
const CLUB = { name: 'Клуб' };

let editing = false, selected = null, dirty = false, dragging = null, savedLayout = null;
let store = { revision: 0, status: 'Загружаю сохранённую схему…', loading: true, failed: false };
const boxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x007681); boxHelper.visible = false; scene.add(boxHelper);
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
const otb = document.createElement('div'); otb.className = 'otb'; otb.hidden = true; $('#stage').appendChild(otb);
const r2 = v => Math.round(v * 100) / 100;
const snap = v => Math.round(v / 0.05) * 0.05;
const deg = ry => { let d = Math.round(ry * 180 / Math.PI) % 360; if (d < 0) d += 360; return d; };

function currentLayout() {
  const pcs = {};
  for (const s of seats) { const p = s.g.position, d = s.def; if (Math.abs(p.x - d.x) > 0.01 || Math.abs(p.z - d.z) > 0.01 || Math.abs(s.g.rotation.y - d.ry) > 0.01 || !!s.mx !== !!d.mx || !!s.mz !== !!d.mz) pcs[s.id] = { x: r2(p.x), z: r2(p.z), ry: +s.g.rotation.y.toFixed(4), mx: !!s.mx, mz: !!s.mz }; }
  return { template: TEMPLATE, v: 2, items: items.map(it => { const o = { ...it.data, x: r2(it.g.position.x), z: r2(it.g.position.z), ry: +it.g.rotation.y.toFixed(4) }; if (it.g.position.y > 0.005) o.y = r2(it.g.position.y); else delete o.y; if (!o.mx) delete o.mx; if (!o.mz) delete o.mz; return o; }), pcs };
}
function applyLayout(layout) {
  deselect();
  items.slice().forEach(removeItem);
  const list = layout && Array.isArray(layout.items) ? layout.items : DEFAULT_ITEMS;
  list.filter(d => d && CATALOG[d.type]).forEach(d => addItem(JSON.parse(JSON.stringify(d))));
  const pcs = (layout && layout.pcs) || {};
  for (const s of seats) { const o = pcs[s.id] || s.def; s.g.position.x = o.x; s.g.position.z = o.z; s.g.rotation.y = o.ry; s.mx = !!o.mx; s.mz = !!o.mz; applyMirror(s.g, s.mx, s.mz); }
}
function markDirty() { if (!dirty) { dirty = true; } renderPanel(); }

/* persistence: the club floor plan in LeetPlus */
function savedAtText(iso) { return iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
async function loadPlan() {
  if (!API) { store.loading = false; store.status = 'Клуб не выбран'; return; }
  try {
    const r = await fetch(API, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    CLUB.name = data.storeName || CLUB.name; $('#clubName').textContent = CLUB.name; $('#clubIc').textContent = clubInitials(CLUB.name); document.title = 'Схема клуба · ' + CLUB.name;
    const plan = data.plan && data.plan.layout && data.plan.layout.template === TEMPLATE ? data.plan : null;
    store.revision = data.plan ? data.plan.revision : 0;
    savedLayout = plan ? plan.layout : null;
    if (!dirty && !dragging) { applyLayout(savedLayout); }
    store.status = plan ? `Схема сохранена ${savedAtText(plan.updatedAt)}` : 'Исходная схема Langame · ещё не сохраняли';
  } catch (e) {
    store.failed = true; store.status = 'Сохранённую схему не удалось загрузить, показываю исходную';
  } finally {
    store.loading = false; refresh(); if (editing) renderPanel();
  }
}
let saving = false;
async function saveLayout() {
  if (!API || saving) return;
  saving = true;
  const layout = currentLayout();
  try {
    const r = await fetch(API, { method: 'PATCH', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ layout, revision: store.revision }) });
    const data = await r.json().catch(() => null);
    if (!r.ok) { toast((data && typeof data.message === 'string' && data.message) || (r.status === 403 ? 'Нет прав менять схему клуба' : 'Не получилось сохранить схему')); return; }
    store.revision = data.plan ? data.plan.revision : store.revision + 1;
    savedLayout = data.plan ? data.plan.layout : layout; dirty = false;
    store.status = `Схема сохранена ${savedAtText(data.plan && data.plan.updatedAt)}`;
    toast('Схема сохранена для всех, кто открывает страницу');
    window.parent && window.parent !== window && window.parent.postMessage({ type: 'leetplus:floor-plan-saved', storeId: STORE_ID }, location.origin);
  } catch (e) {
    toast('Не получилось сохранить: нет связи с сервером');
  } finally {
    saving = false; renderPanel();
  }
}

/* selection */
function select3d(g) { selected = g; boxHelper.setFromObject(g); boxHelper.visible = true; otb.hidden = false; renderOtb(); renderPanel(); }
function deselect() { selected = null; boxHelper.visible = false; otb.hidden = true; }
function selItem() { return selected && selected.userData.editable.kind === 'item' ? items.find(i => i.g === selected) : null; }
function selSeat() { return selected && selected.userData.editable.kind === 'pc' ? selected.userData.editable.seat : null; }
function renderOtb() {
  const it = selItem();
  otb.innerHTML = `<button type="button" data-o="rl" title="Повернуть влево (Shift+R)" aria-label="Повернуть влево">${SVG.rl}</button><button type="button" data-o="rr" title="Повернуть вправо (R)" aria-label="Повернуть вправо">${SVG.rr}</button><button type="button" data-o="mx" title="Отразить слева направо (M)" aria-label="Отразить слева направо">${SVG.mx}</button><button type="button" data-o="mz" title="Отразить сверху вниз (Shift+M)" aria-label="Отразить сверху вниз">${SVG.mz}</button>` +
    (it ? `<button type="button" data-o="dup" title="Копия" aria-label="Сделать копию">${SVG.dup}</button><button type="button" data-o="del" title="Удалить (Delete)" aria-label="Удалить" class="danger">${SVG.del}</button>` : '');
}
const SVG = {
  mx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7 3 17h6z"/><path d="M15 7l6 10h-6z"/></svg>',
  mz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18" stroke-dasharray="2 3"/><path d="M7 9 17 3v6z"/><path d="M7 15l10 6v-6z"/></svg>',
  rl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v4h4"/></svg>',
  rr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>'
};
otb.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) objAction(b.dataset.o); });
function objAction(a) {
  if (!selected) return;
  if (a === 'rl' || a === 'rr') { selected.rotation.y += (a === 'rr' ? -1 : 1) * Math.PI / 12; boxHelper.setFromObject(selected); markDirty(); return; }
  // mirror across the plan axes: left-right (mx) or top-bottom (mz); the turn angle changes sign
  if (a === 'mx' || a === 'mz') { const i = selItem(), h = i ? i.data : selSeat(); if (!h) return; h[a] = !h[a]; selected.rotation.y = -selected.rotation.y; applyMirror(selected, h.mx, h.mz); boxHelper.setFromObject(selected); markDirty(); return; }
  const it = selItem(); if (!it) return;
  if (a === 'del') { removeItem(it); deselect(); markDirty(); return; }
  if (a === 'dup') { const d = { ...it.data, id: it.data.type + '-' + Date.now().toString(36), x: r2(clampX(it.g.position.x + 0.6)), z: r2(clampZ(it.g.position.z + 0.6)), y: it.g.position.y, ry: it.g.rotation.y }; const n = addItem(d); const sp = findFreeSpot(n.g, d.x, d.z); if (sp && !CATALOG[d.type].stack) { n.g.position.x = d.x = sp[0]; n.g.position.z = d.z = sp[1]; } select3d(n.g); markDirty(); }
}
const clampX = x => THREE.MathUtils.clamp(x, X0 + 0.3, X_END - 0.3), clampZ = z => THREE.MathUtils.clamp(z, Z0 + 0.3, Z_END - 0.3);

/* free spot search: walls, other furniture and PCs block a spot; toilets and the service room are off limits */
for (const [x0, x1, z0, z1] of NEIGHBOURS.concat([[PX(449), PX(501), Z0, PZ(280)]])) wallRects.push({ x0, x1, z0, z1, noSnap: true });
function rectOf3(obj) { const b = new THREE.Box3().setFromObject(obj); return { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z }; }
function findFreeSpot(g, cx, cz) {
  g.updateMatrixWorld(true);
  const b = rectOf3(g), px = g.position.x, pz = g.position.z, m = 0.08;
  const hx0 = b.x0 - px, hx1 = b.x1 - px, hz0 = b.z0 - pz, hz1 = b.z1 - pz;
  const occ = wallRects.concat(items.filter(i => i.g !== g).map(i => rectOf3(i.g)), seats.map(s => rectOf3(s.g)));
  const fits = (x, z) => {
    const x0 = x + hx0 - m, x1 = x + hx1 + m, z0 = z + hz0 - m, z1 = z + hz1 + m;
    if (x0 < X0 + 0.15 || x1 > X_END - 0.15 || z0 < Z0 + 0.15 || z1 > Z_END - 0.15) return false;
    for (const o of occ) if (x0 < o.x1 && x1 > o.x0 && z0 < o.z1 && z1 > o.z0) return false;
    return true;
  };
  for (let rad = 0; rad <= 30; rad += 0.25) {
    const n = rad === 0 ? 1 : Math.ceil(2 * Math.PI * rad / 0.3);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = snap(cx + Math.cos(a) * rad), z = snap(cz + Math.sin(a) * rad); if (fits(x, z)) return [r2(x), r2(z)]; }
  }
  return null;
}
/* items that can stand on a counter, a table or a PC desk */
const downRay = new THREE.Raycaster(), RAY_UP = new THREE.Vector3(), RAY_DOWN = new THREE.Vector3(0, -1, 0);
function surfaceY(g) {
  RAY_UP.set(g.position.x, 4, g.position.z); downRay.set(RAY_UP, RAY_DOWN);
  const hits = downRay.intersectObjects(items.filter(i => i.g !== g).map(i => i.g).concat(seats.map(s => s.g)), true);
  for (const h of hits) { if (h.object.material && h.object.material.transparent) continue; let o = h.object, person = false; while (o) { if (o.userData.isStaff || o === g) person = true; o = o.parent; } if (person) continue; if (h.face && h.face.normal.y > 0.9 && h.point.y - 0.08 <= 1.2) return r2(h.point.y - 0.08); }
  return 0;
}
function settle(g) { const it = items.find(i => i.g === g); if (it && CATALOG[it.data.type].stack) g.position.y = surfaceY(g); }

/* add a catalog item: free spot near the centre of the view, then the camera flies to it */
function spawn(type) {
  const cat = CATALOG[type], c = controls.target;
  const d = { id: type + '-' + Date.now().toString(36), type, x: r2(snap(clampX(c.x))), z: r2(snap(clampZ(c.z))), ry: 0 };
  if (cat.colors) d.color = cat.colors;
  if (cat.len) d.len = cat.len[2];
  if (cat.fam === 'reception') d.staff = true;
  const it = addItem(d);
  const sp = findFreeSpot(it.g, d.x, d.z);
  if (sp) { it.g.position.x = d.x = sp[0]; it.g.position.z = d.z = sp[1]; }
  else toast('Рядом нет свободного места: поставил в центр, передвиньте предмет');
  select3d(it.g); markDirty();
  flyTo({ t: [it.g.position.x, 0, it.g.position.z + 0.3], d: isPhone() ? 11 : 14, dir: EDIT_VIEW.dir });
}

/* dragging objects (capture phase, so the camera does not pan underneath) */
function floorAt(e) {
  const r = canvas.getBoundingClientRect(); const m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(m, camera); const p = new THREE.Vector3(); return rc.ray.intersectPlane(floorPlane, p) ? p : null;
}
function editableAt(e) {
  const r = canvas.getBoundingClientRect(); const m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(m, camera);
  const hits = rc.intersectObjects(items.map(i => i.g).concat(seats.map(s => s.g)), true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.editable) o = o.parent; if (o) return o; }
  return null;
}
canvas.addEventListener('pointerdown', e => {
  if (!editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const g = editableAt(e); if (!g) return;
  const p = floorAt(e); if (!p) return;
  controls.enabled = false; e.stopPropagation();
  dragging = { g, off: g.position.clone().sub(p).setY(0), moved: false, id: e.pointerId, start: g.position.clone(), ext: extentsOf(g), targets: snapTargets(g) };
  canvas.setPointerCapture(e.pointerId);
  if (selected !== g) select3d(g);
}, { capture: true });
/* snapping: walls (contact), other furniture and PCs (contact, same edge line, same centre line) */
let snapOn = true; try { snapOn = localStorage.getItem('leetplus-floor-plan-snap') !== 'off'; } catch (e) { }
const SNAP_T = 0.25;
function extentsOf(g) { g.updateMatrixWorld(true); const b = rectOf3(g), p = g.position; return { hx0: b.x0 - p.x, hx1: b.x1 - p.x, hz0: b.z0 - p.z, hz1: b.z1 - p.z }; }
function snapTargets(g) {
  return wallRects.filter(r => !r.noSnap).map(r => ({ ...r, wall: true }))
    .concat(items.filter(i => i.g !== g).map(i => rectOf3(i.g)), seats.filter(s => s.g !== g).map(s => rectOf3(s.g)));
}
// best shift (|d| < SNAP_T) of the range [lo, hi] on one axis; the guide is drawn along the other axis
function snapAxis(lo, hi, axis, targets, olo, ohi) {
  let best = null;
  const mid = (lo + hi) / 2;
  for (const t of targets) {
    const t0 = axis === 'x' ? t.x0 : t.z0, t1 = axis === 'x' ? t.x1 : t.z1, o0 = axis === 'x' ? t.z0 : t.x0, o1 = axis === 'x' ? t.z1 : t.x1;
    const gap = Math.max(0, o0 - ohi, olo - o1);
    const cand = [];
    if (t.wall) {
      if (gap > 0.01) continue;
      if (lo < t1 && hi > t0) {                      // inside a wall: push out to the nearer face
        const dn = t0 - hi, up = t1 - lo, d = Math.abs(dn) < Math.abs(up) ? dn : up;
        if (Math.abs(d) < 0.8 && (!best || best.score > -1)) best = { d, c: d === dn ? t0 : t1, score: -1, axis, s0: Math.min(olo, o0), s1: Math.max(ohi, o1) };
        continue;
      }
      cand.push([t0 - hi, t0, 2], [t1 - lo, t1, 2]);
    }
    else {
      if (gap > 4) continue;
      if (gap < 0.5) cand.push([t0 - hi, t0, 2], [t1 - lo, t1, 2]);
      cand.push([t0 - lo, t0, 1], [t1 - hi, t1, 1], [(t0 + t1) / 2 - mid, (t0 + t1) / 2, 1]);
    }
    for (const [d, c, w] of cand) {
      const score = Math.abs(d) - (w === 2 ? 0.04 : 0);       // contact wins a near tie over alignment
      if (Math.abs(d) < SNAP_T && (!best || score < best.score)) best = { d, c, score, axis, s0: Math.min(olo, o0), s1: Math.max(ohi, o1) };
    }
  }
  return best;
}
const guideMat = new THREE.LineDashedMaterial({ color: 0xE8558A, dashSize: 0.16, gapSize: 0.1, depthTest: false, transparent: true });
function mkGuide() { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(g, guideMat); l.visible = false; l.renderOrder = 20; l.frustumCulled = false; scene.add(l); return l; }
const guideX = mkGuide(), guideZ = mkGuide();
function showGuide(l, s) {
  if (!s) { l.visible = false; return; }
  const a = l.geometry.attributes.position, y = 0.14, pad = 0.4;
  if (s.axis === 'x') { a.setXYZ(0, s.c, y, s.s0 - pad); a.setXYZ(1, s.c, y, s.s1 + pad); } else { a.setXYZ(0, s.s0 - pad, y, s.c); a.setXYZ(1, s.s1 + pad, y, s.c); }
  a.needsUpdate = true; l.computeLineDistances(); l.visible = true;
}
canvas.addEventListener('pointermove', e => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const p = floorAt(e); if (!p) return;
  let nx = clampX(p.x + dragging.off.x), nz = clampZ(p.z + dragging.off.z), sx = null, sz = null;
  if (snapOn && !e.altKey) {
    const x = dragging.ext;
    sx = snapAxis(nx + x.hx0, nx + x.hx1, 'x', dragging.targets, nz + x.hz0, nz + x.hz1); if (sx) nx += sx.d;
    sz = snapAxis(nz + x.hz0, nz + x.hz1, 'z', dragging.targets, nx + x.hx0, nx + x.hx1); if (sz) nz += sz.d;
  }
  if (!sx) nx = snap(nx); if (!sz) nz = snap(nz);
  nx = r2(clampX(nx)); nz = r2(clampZ(nz));
  showGuide(guideX, sx); showGuide(guideZ, sz);
  if (nx !== dragging.g.position.x || nz !== dragging.g.position.z) { dragging.g.position.x = nx; dragging.g.position.z = nz; settle(dragging.g); dragging.moved = true; boxHelper.setFromObject(dragging.g); }
});
function endDrag(e) {
  if (!dragging || (e && e.pointerId !== dragging.id)) return;
  const moved = dragging.moved; dragging = null; controls.enabled = true; showGuide(guideX, null); showGuide(guideZ, null);
  if (moved) markDirty();
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('click', e => { if (editing && Math.hypot(e.clientX - clickStart[0], e.clientY - clickStart[1]) < 6 && !editableAt(e) && !dragging) { deselect(); renderPanel(); } });
addEventListener('keydown', e => {
  if (!editing || e.target.closest('input,select,textarea')) return;
  if (!selected) return;
  if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') { objAction(e.shiftKey ? 'rl' : 'rr'); e.preventDefault(); }
  else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { objAction(e.shiftKey ? 'mz' : 'mx'); e.preventDefault(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { objAction('del'); e.preventDefault(); }
  else if (e.key.startsWith('Arrow')) {
    const st = e.shiftKey ? 0.5 : 0.05; const p = selected.position;
    if (e.key === 'ArrowLeft') p.x = clampX(p.x - st); if (e.key === 'ArrowRight') p.x = clampX(p.x + st);
    if (e.key === 'ArrowUp') p.z = clampZ(p.z - st); if (e.key === 'ArrowDown') p.z = clampZ(p.z + st);
    settle(selected); boxHelper.setFromObject(selected); markDirty(); e.preventDefault();
  }
});

/* mode switch */
const EDIT_VIEW = { t: [1.7, 0, 0.6], d: 62, dir: [0.06, 1.7, 0.6] };
function setEditing(on) {
  editing = on; document.body.classList.toggle('editing', on); if (on) finishVisitors();
  $('#editBtn').setAttribute('aria-pressed', String(on)); $('#editBtn span').textContent = on ? 'Готово' : 'Редактор схемы';
  if (on) { view = { type: 'home' }; ring.visible = false; setAuto(false); flyTo(isPhone() ? { t: [3.4, 0, 0], d: 30, rot: 1.12, dir: EDIT_VIEW.dir } : EDIT_VIEW); if (isPhone()) sheetOpen = true; syncPills(); }
  else { deselect(); select({ type: 'home' }); }
  tip.hidden = true; hoverRing.visible = false;
  renderPanel(); renderCards();
}
$('#editBtn').hidden = !CAN_EDIT;
$('#editBtn').addEventListener('click', () => { if (CAN_EDIT) setEditing(!editing); });

/* editor panel */
function catBtn(type) { const c = CATALOG[type]; return `<button class="cat" type="button" data-add="${type}"><svg viewBox="0 0 32 30" fill="none" stroke="currentColor" stroke-width="1.8">${c.icon}</svg><span>${c.name}</span></button>`; }
function renderEditor() {
  let h = `<div class="ph"><div><div class="eyebrow">Редактор схемы</div><h2>${esc(CLUB.name)}</h2><div class="sub">${matchMedia('(pointer: coarse)').matches ? 'Тяните объект пальцем. Пустое место двигает карту, двумя пальцами масштаб и поворот.' : 'Тяните объект мышью. Пустое место двигает карту, колесо меняет масштаб, правая кнопка вращает.'}</div></div><span class="chip ${dirty ? 'warn' : 'good'}">${dirty ? 'Не сохранено' : 'Сохранено'}</span></div>`;
  const it = selItem(), s = selSeat();
  if (it) {
    const c = CATALOG[it.data.type], fam = FAMILY[c.fam];
    h += `<div class="sec selbox"><h3>Выбрано <span>${deg(it.g.rotation.y)}°${it.data.mx || it.data.mz ? ' · зеркально' : ''}</span></h3><b class="selname">${c.name}</b>
      ${fam.length > 1 ? `<div class="seg" role="group" aria-label="Вариант">${fam.map(t => `<button type="button" data-variant="${t}" aria-pressed="${t === it.data.type}">${CATALOG[t].name}</button>`).join('')}</div>` : ''}
      ${c.colors ? `<div class="sw" role="group" aria-label="Цвет">${Object.entries(SOFA_COLORS).map(([k, v]) => `<button type="button" data-color="${k}" title="${v[2]}" aria-label="${v[2]}" aria-pressed="${(it.data.color || 'blue') === k}" style="--c:#${v[0].toString(16).padStart(6, '0')}"></button>`).join('')}</div>` : ''}
      ${c.len ? `<label class="rng" for="lenRange">Длина <b class="num" id="lenVal">${(it.data.len || c.len[2]).toFixed(1)} м</b><input id="lenRange" type="range" min="${c.len[0]}" max="${c.len[1]}" step="0.1" value="${it.data.len || c.len[2]}"></label>` : ''}
      ${c.stack ? `<div class="note">${it.g.position.y > 0.005 ? `Стоит на поверхности, высота ${it.g.position.y.toFixed(2)} м.` : 'Перетащите на стойку, стол или компьютерный стол, и он встанет сверху.'}</div>` : ''}
      ${c.fam === 'reception' ? `<label class="chk" for="staffChk"><input id="staffChk" type="checkbox" ${it.data.staff ? 'checked' : ''}> Администратор за стойкой</label>` : ''}
      <div class="acts"><button class="btn ghost" type="button" data-oa="rl">↺ 15°</button><button class="btn ghost" type="button" data-oa="rr">↻ 15°</button><button class="btn ghost" type="button" data-oa="mx" title="Слева направо">⇆ Отразить</button><button class="btn ghost" type="button" data-oa="mz" title="Сверху вниз">⇅ Отразить</button><button class="btn ghost" type="button" data-oa="dup">Копия</button><button class="btn ghost danger" type="button" data-oa="del">Удалить</button></div></div>`;
  } else if (s) {
    h += `<div class="sec selbox"><h3>Выбрано <span>${deg(s.g.rotation.y)}°${s.mx || s.mz ? ' · зеркально' : ''}</span></h3><b class="selname">${s.id} · ${ZONES[s.zone].name}</b>
      <div class="note">ПК приходят из Langame, поэтому их можно двигать и поворачивать, но не удалять.</div>
      <div class="acts"><button class="btn ghost" type="button" data-oa="rl">↺ 15°</button><button class="btn ghost" type="button" data-oa="rr">↻ 15°</button><button class="btn ghost" type="button" data-oa="mx" title="Слева направо">⇆ Отразить</button><button class="btn ghost" type="button" data-oa="mz" title="Сверху вниз">⇅ Отразить</button><button class="btn ghost" type="button" data-oa="pcreset">Вернуть как на схеме</button></div></div>`;
  } else {
    h += `<div class="note">Нажмите на диван, стойку или ПК, чтобы выбрать${matchMedia('(pointer: coarse)').matches ? '' : '. Клавиши: R поворот, M и Shift+M отражение, стрелки сдвиг, Delete удалить'}. Новый предмет встаёт на свободное место рядом с центром экрана. При перетаскивании предметы прилипают к стенам и выравниваются по соседям${matchMedia('(pointer: coarse)').matches ? '' : ', Alt временно отключает привязку'}.</div>`;
  }
  h += Object.keys(FAMILY).map(f => `<div class="sec"><h3>Добавить · ${FAMILY_TITLE[f]}</h3><div class="cats">${FAMILY[f].map(catBtn).join('')}</div></div>`).join('') + `
<div class="sec"><label class="chk" for="snapChk"><input id="snapChk" type="checkbox" ${snapOn ? 'checked' : ''}> Привязка к стенам и предметам</label><div class="acts"><button class="btn" type="button" data-ed="save" ${dirty ? '' : 'disabled'}>Сохранить схему</button><button class="btn ghost" type="button" data-ed="revert" ${dirty ? '' : 'disabled'}>Отменить правки</button></div>
    <button class="linkbtn" type="button" data-ed="reset">${resetArmed ? 'Точно вернуть исходную схему Langame? Нажмите ещё раз' : 'Вернуть исходную схему Langame'}</button>
    <div class="note">${esc(store.status)}</div></div>`;
  pbody.innerHTML = h;
}
let resetArmed = false;
pbody.addEventListener('click', e => {
  if (!editing) return;
  const add = e.target.closest('[data-add]'); if (add) return spawn(add.dataset.add);
  const oa = e.target.closest('[data-oa]');
  if (oa) { if (oa.dataset.oa === 'pcreset') { const s = selSeat(); if (s) { s.g.position.x = s.def.x; s.g.position.z = s.def.z; s.g.rotation.y = s.def.ry; s.mx = s.mz = false; applyMirror(s.g, false, false); renderPanel(); boxHelper.setFromObject(s.g); markDirty(); } return; } return objAction(oa.dataset.oa); }
  const it = selItem();
  const v = e.target.closest('[data-variant]'); if (v && it) { const nc = CATALOG[v.dataset.variant]; it.data.type = v.dataset.variant; it.data.x = it.g.position.x; it.data.z = it.g.position.z; it.data.ry = it.g.rotation.y; if (nc.len) it.data.len = THREE.MathUtils.clamp(it.data.len || nc.len[2], nc.len[0], nc.len[1]); if (nc.colors && !it.data.color) it.data.color = nc.colors; if (nc.fam === 'reception' && it.data.staff == null) it.data.staff = true; it.data.y = nc.stack ? it.g.position.y : 0; rebuildItem(it); settle(it.g); select3d(it.g); markDirty(); return; }
  const c = e.target.closest('[data-color]'); if (c && it) { it.data.color = c.dataset.color; it.data.x = it.g.position.x; it.data.z = it.g.position.z; it.data.ry = it.g.rotation.y; rebuildItem(it); select3d(it.g); markDirty(); return; }
  const ed = e.target.closest('[data-ed]'); if (!ed) return;
  if (ed.dataset.ed === 'save') saveLayout();
  if (ed.dataset.ed === 'revert') { applyLayout(savedLayout); dirty = false; renderPanel(); toast('Правки отменены'); }
  if (ed.dataset.ed === 'reset') { if (!resetArmed) { resetArmed = true; renderPanel(); setTimeout(() => { resetArmed = false; if (editing) renderPanel(); }, 4000); return; } resetArmed = false; applyLayout(null); markDirty(); toast('Вернул исходную схему. Сохраните, чтобы применить для всех'); }
});
pbody.addEventListener('input', e => {
  const it = selItem(); if (!editing || !it) return;
  if (e.target.id === 'lenRange') { it.data.len = +e.target.value; $('#lenVal').textContent = it.data.len.toFixed(1) + ' м'; it.data.x = it.g.position.x; it.data.z = it.g.position.z; it.data.ry = it.g.rotation.y; rebuildItem(it); selected = it.g; boxHelper.setFromObject(it.g); dirty = true; }
});
pbody.addEventListener('change', e => { if (e.target.id === 'snapChk') { snapOn = e.target.checked; try { localStorage.setItem('leetplus-floor-plan-snap', snapOn ? 'on' : 'off'); } catch (er) { } } });
pbody.addEventListener('change', e => {
  const it = selItem(); if (!editing || !it) return;
  if (e.target.id === 'lenRange') renderPanel();
  if (e.target.id === 'staffChk') { it.data.staff = e.target.checked; it.data.x = it.g.position.x; it.data.z = it.g.position.z; it.data.ry = it.g.rotation.y; rebuildItem(it); select3d(it.g); markDirty(); }
});
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
const v3o = new THREE.Vector3();
function updateEditorOverlay() {
  if (!editing || !selected) { otb.hidden = true; return; }
  const b = new THREE.Box3().setFromObject(selected); v3o.set((b.min.x + b.max.x) / 2, b.max.y + 0.3, (b.min.z + b.max.z) / 2).project(camera);
  otb.hidden = false; otb.style.transform = `translate(${(v3o.x + 1) / 2 * stageW}px,${(1 - v3o.y) / 2 * stageH}px) translate(-50%, -100%)`;
}

/* ---------------- resize ---------------- */
function resize() {
  stageW = stage.clientWidth; stageH = stage.clientHeight;
  renderer.setSize(stageW, stageH, false);
  camera.aspect = stageW / stageH;
  const panelW = isPhone() ? 0 : (innerWidth > 760 ? 340 + 16 : 0);
  const shiftY = isPhone() ? stageH * 0.12 : 0;
  camera.setViewOffset(stageW, stageH, panelW / 2, shiftY, stageW, stageH);
  camera.updateProjectionMatrix();
  linesSvg.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
  measureObstacles();
  renderPanel();
}
addEventListener('resize', () => { resize(); if (view.type === 'home') flyTo(homeView(), true); });

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (fly) {
    const k = Math.min(1, (performance.now() - fly.t0) / fly.dur), e = ease(k);
    camera.position.lerpVectors(fly.fp, fly.tp, e); controls.target.lerpVectors(fly.ft, fly.tt, e);
    if (k >= 1) fly = null;
  }
  // clamp target
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, X0 - 2, X_END + 2); controls.target.z = THREE.MathUtils.clamp(controls.target.z, Z0 - 2, Z_END + 4); controls.target.y = 0;
  controls.update();
  if (!reduced && !CALM) {
    for (const s of seats) if (s.person) { const ph = s.person.userData.ph; s.person.userData.head.position.y = 1.47 + Math.sin(t * 2 + ph) * 0.012; s.person.userData.hair.position.y = s.person.userData.head.position.y; s.person.rotation.y = Math.sin(t * 0.5 + ph) * 0.06; }
    items.forEach((it, i) => { const p = it.g.userData.staff; if (p) p.rotation.y = Math.sin(t * 0.3 + i) * 0.35; });
    for (const m of movers) { m.o.position.x += m.v * dt; if (m.o.position.x > MOVER_X[1]) m.o.position.x = MOVER_X[0]; if (m.o.position.x < MOVER_X[0]) m.o.position.x = MOVER_X[1]; }
    for (const w of walkers) {
      if (w.wait > 0) { w.wait -= dt; w.p.userData.legs.forEach(l => l.rotation.x *= 0.85); continue; }
      const a = w.path[w.i], b = w.path[(w.i + 1) % w.path.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
      w.t += dt * w.speed / len;
      if (w.t >= 1) { w.t = 0; w.i = (w.i + 1) % w.path.length; if (w.pauses[w.i]) w.wait = w.pauses[w.i]; continue; }
      w.p.position.x = a[0] + (b[0] - a[0]) * w.t; w.p.position.z = a[1] + (b[1] - a[1]) * w.t;
      if (len > 0.01) { const target = Math.atan2(b[0] - a[0], b[1] - a[1]); let d = target - w.p.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); w.p.rotation.y += d * Math.min(1, dt * 8); }
      const sw = Math.sin(t * 7 * w.speed) * 0.5; w.p.userData.legs[0].rotation.x = sw; w.p.userData.legs[1].rotation.x = -sw; w.p.userData.arms[0].rotation.x = -sw * 0.7; w.p.userData.arms[1].rotation.x = sw * 0.7;
    }
    stepVisitors(dt, t);
    ring.scale.setScalar(0.75 + Math.sin(t * 4) * 0.05);
  }
  if (selected && editing) boxHelper.setFromObject(selected);
  renderer.render(scene, camera);
  updateOverlay(); updateEditorOverlay(); updateStaffTip();
  requestAnimationFrame(animate);
}

/* ---------------- boot ---------------- */
applyTheme();
resize();
renderKPIs(); renderCards();
renderFeed();
select({ type: 'home' });
flyTo(homeView(), true);
setAuto(autoPref);
requestAnimationFrame(() => { measureObstacles(); });
animate();

loadPlan().then(poll);
startAttention();
setInterval(minuteTick, 30000);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { redrawTextures(); measureObstacles(); });
window.__club = { select, seats, camera, controls, sel: () => selected, items: () => items, select3d, settle, Box3: THREE.Box3 };
})();
