/* =========================================================
   KYRDIA — Saree storefront
   Saree "photographs" are generated as SVG: hung, folded and flowing
   ========================================================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = n => '₹' + n.toLocaleString('en-IN');

/* ---------- Colour helper ---------- */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ---------- Weave patterns ---------- */
function patDef(type, id, c, s = 1) {
  const head = (w, h, extra = '') =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="scale(${s}) ${extra}">`;
  switch (type) {
    case 'bandhani':
      return head(20, 20) + `<g fill="${c}"><circle cx="10" cy="5" r="1.7"/><circle cx="10" cy="15" r="1.7"/><circle cx="5" cy="10" r="1.7"/><circle cx="15" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.2"/><circle cx="0" cy="0" r="1.2"/><circle cx="20" cy="0" r="1.2"/><circle cx="0" cy="20" r="1.2"/><circle cx="20" cy="20" r="1.2"/></g></pattern>`;
    case 'leheriya':
      return head(30, 30, 'rotate(-30)') + `<path d="M0 6Q7.5 0 15 6T30 6" fill="none" stroke="${c}" stroke-width="5"/><path d="M0 20Q7.5 14 15 20T30 20" fill="none" stroke="${c}" stroke-width="2.2" opacity=".7"/></pattern>`;
    case 'kota':
      return head(16, 16) + `<path d="M0 0H16M0 0V16" stroke="${c}" stroke-width="1.1" fill="none"/><rect x="7" y="7" width="2" height="2" fill="${c}"/></pattern>`;
    case 'gota':
      return head(28, 28) + `<path d="M14 3L21 14L14 25L7 14Z" fill="none" stroke="${c}" stroke-width="1.3"/><circle cx="14" cy="14" r="2" fill="${c}"/><circle cx="0" cy="0" r="1.4" fill="${c}"/><circle cx="28" cy="28" r="1.4" fill="${c}"/><circle cx="28" cy="0" r="1.4" fill="${c}"/><circle cx="0" cy="28" r="1.4" fill="${c}"/></pattern>`;
    case 'block':
      return head(30, 30) + `<g fill="${c}"><ellipse cx="15" cy="15" rx="6" ry="1.8"/><ellipse cx="15" cy="15" rx="6" ry="1.8" transform="rotate(60 15 15)"/><ellipse cx="15" cy="15" rx="6" ry="1.8" transform="rotate(120 15 15)"/><circle cx="15" cy="15" r="1.8"/><circle cx="0" cy="0" r="1.6"/><circle cx="30" cy="30" r="1.6"/><circle cx="30" cy="0" r="1.6"/><circle cx="0" cy="30" r="1.6"/></g></pattern>`;
    case 'banarasi':
      return head(30, 36) + `<path d="M15 5C25 8 27 20 19 29C14 34 7 29 10 22C12 17 18 18 17 22" fill="${c}" fill-opacity=".85" stroke="${c}" stroke-width="1"/><circle cx="4" cy="4" r="1.5" fill="${c}"/><circle cx="26" cy="32" r="1.5" fill="${c}"/></pattern>`;
    case 'chanderi':
      return head(26, 26) + `<circle cx="13" cy="13" r="3" fill="${c}"/><circle cx="13" cy="13" r="6" fill="none" stroke="${c}" stroke-width=".8"/><circle cx="0" cy="0" r="1.6" fill="${c}"/><circle cx="26" cy="26" r="1.6" fill="${c}"/><circle cx="26" cy="0" r="1.6" fill="${c}"/><circle cx="0" cy="26" r="1.6" fill="${c}"/></pattern>`;
    case 'bagru':
    default:
      return head(24, 24) + `<path d="M0 12H24" stroke="${c}" stroke-width="2.2"/><circle cx="6" cy="4" r="2" fill="${c}"/><circle cx="18" cy="20" r="2" fill="${c}"/><path d="M18 3l3 3-3 3-3-3z" fill="${c}"/><path d="M6 15l3 3-3 3-3-3z" fill="${c}"/></pattern>`;
  }
}

/* ---------- Shared art pieces ---------- */
const WALLS = [['#f8ecd2', '#dcbc86'], ['#f3dccf', '#d6a58b'], ['#5a2e1a', '#1a0c06']];
const wallDefs = (id, w) => `<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WALLS[w][0]}"/><stop offset="1" stop-color="${WALLS[w][1]}"/></linearGradient>
  <radialGradient id="${id}g" cx=".5" cy=".35" r=".65"><stop offset="0" stop-color="#fff6dc" stop-opacity="${w === 2 ? .38 : .65}"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient>`;
const wallRects = id => `<rect width="300" height="375" fill="url(#${id}w)"/><rect width="300" height="375" fill="url(#${id}g)"/>`;
const foldDefs = id => `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="0">${
  [[0, .3, 0], [.07, .14, 1], [.17, .22, 0], [.3, .12, 1], [.43, .24, 0], [.56, .12, 1], [.7, .22, 0], [.82, .14, 1], [.93, .24, 0], [1, .32, 0]]
    .map(([o, a, l]) => `<stop offset="${o}" stop-color="${l ? '#fff' : '#000'}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const sparkle = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-8L2-2L8 0L2 2L0 8L-2 2L-8 0L-2-2Z" fill="#fff3cf" opacity=".85"/>`;
const blurDef = id => `<filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>`;

/* ---------- VIEW 1: hung from a gold rod ---------- */
function hung(p, id) {
  const wave = `M52 50H248V336q-12.25 14-24.5 0${'t-24.5 0'.repeat(7)}Z`;
  const tri = Array.from({ length: 13 }, (_, i) => `M${52 + i * 16} 270l8 13l8-13z`).join('');
  return `<defs>${wallDefs(id, p.wall)}${foldDefs(id)}${blurDef(id)}${patDef(p.type, id + 'p', p.motif, 1)}${patDef(p.type, id + 'q', p.motif, 1.7)}
    <clipPath id="${id}c"><path d="${wave}"/></clipPath></defs>
    ${wallRects(id)}
    <g transform="translate(10 10)" opacity=".32" filter="url(#${id}b)"><path d="${wave}" fill="#000"/></g>
    <g clip-path="url(#${id}c)">
      <rect x="52" y="50" width="196" height="300" fill="${p.base}"/>
      <rect x="52" y="50" width="196" height="300" fill="url(#${id}p)"/>
      <rect x="52" y="262" width="196" height="90" fill="${shade(p.base, -.3)}"/>
      <rect x="52" y="270" width="196" height="82" fill="url(#${id}q)"/>
      <path d="${tri}" fill="url(#goldGrad)"/>
      <rect x="52" y="262" width="196" height="8" fill="url(#goldGrad)"/>
      <rect x="52" y="322" width="196" height="6" fill="url(#goldGrad)"/>
      <rect x="52" y="50" width="16" height="300" fill="url(#goldGrad)"/>
      <rect x="232" y="50" width="16" height="300" fill="url(#goldGrad)"/>
      <path d="M72 50V350M228 50V350" stroke="#fff3cf" stroke-opacity=".7" stroke-width="1"/>
      <rect x="52" y="50" width="196" height="300" fill="url(#${id}f)"/>
      <rect x="52" y="50" width="196" height="46" fill="#000" opacity=".14"/>
    </g>
    <rect x="36" y="40" width="228" height="9" rx="4.5" fill="url(#goldGrad)"/>
    <circle cx="36" cy="44.5" r="7" fill="url(#goldGrad)"/><circle cx="264" cy="44.5" r="7" fill="url(#goldGrad)"/>
    ${sparkle(26, 120, .8)}${sparkle(278, 210, 1)}${sparkle(30, 290, .6)}`;
}

/* ---------- VIEW 2: neatly folded stack ---------- */
function fold(p, id) {
  const cols = [p.base, shade(p.base, -.2), shade(p.base, .14), shade(p.base, -.36)];
  const layer = (k) => {
    const y = 122 + k * 50, x = 40 + (k % 2) * 6, w = 220 - (k % 2) * 12, c = cols[k];
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="50" rx="3" fill="${c}"/>
      <rect x="${x}" y="${y}" width="${w}" height="50" rx="3" fill="url(#${id}p)"/>
      <rect x="${x}" y="${y}" width="${w}" height="6" fill="url(#goldGrad)"/>
      <rect x="${x}" y="${y + 44}" width="${w}" height="6" fill="url(#goldGrad)"/>
      <path d="M${x} ${y + 12}H${x + w}" stroke="#fff3cf" stroke-opacity=".6"/>
      <rect x="${x}" y="${y}" width="${w}" height="50" rx="3" fill="url(#${id}f)" opacity=".8"/>
      <rect x="${x}" y="${y + 50}" width="${w}" height="3" fill="#000" opacity=".25"/>
    </g>`;
  };
  return `<defs>${wallDefs(id, p.wall)}${foldDefs(id)}${blurDef(id)}${patDef(p.type, id + 'p', p.motif, .85)}
    <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8733a"/><stop offset="1" stop-color="#4f2f14"/></linearGradient></defs>
    ${wallRects(id)}
    <rect y="322" width="300" height="53" fill="url(#${id}t)"/><rect y="322" width="300" height="2" fill="url(#goldGrad)"/>
    <ellipse cx="150" cy="326" rx="125" ry="9" fill="#000" opacity=".4" filter="url(#${id}b)"/>
    ${layer(3)}${layer(2)}${layer(1)}${layer(0)}
    <path d="M40 122L260 122L248 98L52 98Z" fill="${shade(p.base, .1)}"/>
    <path d="M40 122L260 122L248 98L52 98Z" fill="url(#${id}p)"/>
    <path d="M40 122L260 122L248 98L52 98Z" fill="none" stroke="url(#goldGrad)" stroke-width="2.4"/>
    <ellipse cx="150" cy="110" rx="16" ry="6" fill="url(#goldGrad)"/>
    <path d="M40 122L260 122L248 98L52 98Z" fill="#000" opacity=".06"/>
    <rect x="40" y="122" width="14" height="200" fill="#000" opacity=".1"/>
    ${sparkle(36, 70, 1)}${sparkle(262, 60, .7)}${sparkle(274, 150, .6)}`;
}

/* ---------- VIEW 3: flowing diagonal drape ---------- */
function flow(p, id) {
  const d = 'M-40 330C70 345 110 240 150 200S230 90 340 40';
  const edge = shade(p.base, -.1);
  return `<defs>${wallDefs(id, p.wall)}${blurDef(id)}${patDef(p.type, id + 'p', p.motif, 1.1)}</defs>
    ${wallRects(id)}
    <path d="${d}" transform="translate(12 14)" fill="none" stroke="#000" stroke-width="112" opacity=".28" filter="url(#${id}b)"/>
    <path d="${d}" fill="none" stroke="url(#goldGrad)" stroke-width="120"/>
    <path d="${d}" fill="none" stroke="#fff3cf" stroke-opacity=".65" stroke-width="104"/>
    <path d="${d}" fill="none" stroke="${p.base}" stroke-width="100"/>
    <path d="${d}" fill="none" stroke="url(#${id}p)" stroke-width="100"/>
    <path d="${d}" transform="translate(-24 6)" fill="none" stroke="#fff" stroke-width="9" opacity=".2"/>
    <path d="${d}" transform="translate(-6 2)" fill="none" stroke="#000" stroke-width="7" opacity=".18"/>
    <path d="${d}" transform="translate(20 -5)" fill="none" stroke="#fff" stroke-width="10" opacity=".16"/>
    <path d="${d}" transform="translate(34 -8)" fill="none" stroke="#000" stroke-width="9" opacity=".2"/>
    <path d="${d}" fill="none" stroke="${edge}" stroke-width="1" opacity=".0"/>
    ${sparkle(48, 80, 1)}${sparkle(256, 300, .9)}${sparkle(30, 170, .6)}${sparkle(270, 140, .7)}`;
}

const VIEWS = { hung, fold, flow };
let UID = 0;
function art(p, viewOverride) {
  const id = 's' + (++UID);
  return `<svg viewBox="0 0 300 375" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${p.name}">${VIEWS[viewOverride || p.view](p, id)}</svg>`;
}

/* ---------- Category art (vertical swatch) ---------- */
function catArt(c, scale = 1.4) {
  const id = 'c' + (++UID);
  return `<svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>${patDef(c.key, id + 'p', c.motif, scale)}${foldDefs(id)}
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#1a0c06" stop-opacity="0"/><stop offset="1" stop-color="#1a0c06" stop-opacity=".82"/></linearGradient></defs>
    <rect width="200" height="280" fill="${c.base}"/>
    <rect width="200" height="280" fill="url(#${id}p)"/>
    <rect y="196" width="200" height="8" fill="url(#goldGrad)"/>
    <rect y="210" width="200" height="3" fill="url(#goldGrad)"/>
    <rect width="200" height="280" fill="url(#${id}f)"/>
    <rect width="200" height="280" fill="url(#${id}s)"/>
  </svg>`;
}

/* ---------- Data ---------- */
const CATS = [
  { key: 'bandhani', name: 'Bandhani', blurb: 'Tie-dyed in thousands of knots', base: '#b3262b', motif: '#f6d58f' },
  { key: 'leheriya', name: 'Leheriya', blurb: 'Waves dyed on the desert wind', base: '#e0823a', motif: '#8c1f5a' },
  { key: 'kota', name: 'Kota Doria', blurb: 'Featherlight khat-checked weave', base: '#efe0bd', motif: '#c9983f' },
  { key: 'gota', name: 'Gota Patti', blurb: 'Gold appliqué for the bridal drape', base: '#7a1d33', motif: '#f0cf7a' },
  { key: 'block', name: 'Block Print', blurb: 'Teak blocks, mud-resist and indigo', base: '#f1e5cb', motif: '#b8453a' },
  { key: 'banarasi', name: 'Banarasi', blurb: 'Katan silk brocaded in real zari', base: '#4b1230', motif: '#e6c883' },
  { key: 'chanderi', name: 'Chanderi', blurb: 'Sheer silk-cotton with coin buttis', base: '#2f6f8f', motif: '#f2dca2' },
  { key: 'bagru', name: 'Bagru', blurb: 'Natural dye, hand-pressed motifs', base: '#1f3d63', motif: '#e9dcc0' }
];
const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));

const PRODUCTS = [
  { id: 1,  name: 'Jaipur Sunset Bandhani',      type: 'bandhani', fabric: 'Pure Georgette',   price: 14500, base: '#c2402f', motif: '#f6d58f', view: 'hung', wall: 0, tag: 'Bestseller' },
  { id: 2,  name: 'Marwar Gajji Silk Bandhani',  type: 'bandhani', fabric: 'Gajji Silk',       price: 18900, base: '#1f5c4a', motif: '#f3dca0', view: 'fold', wall: 1, tag: '' },
  { id: 3,  name: 'Rani Leheriya Chiffon',       type: 'leheriya', fabric: 'Pure Chiffon',     price: 11200, base: '#e07a3a', motif: '#8c1f5a', view: 'flow', wall: 0, tag: 'New' },
  { id: 4,  name: 'Mothra Leheriya Silk',        type: 'leheriya', fabric: 'Habutai Silk',     price: 16400, base: '#b0306a', motif: '#f2b84b', view: 'hung', wall: 2, tag: '' },
  { id: 5,  name: 'Ivory Kota Doria Zari',       type: 'kota',     fabric: 'Silk-Cotton',      price: 9800,  base: '#f1e3c6', motif: '#c9983f', view: 'hung', wall: 1, tag: '' },
  { id: 6,  name: 'Marigold Kota Khat',          type: 'kota',     fabric: 'Cotton-Silk',      price: 8600,  base: '#e8a82e', motif: '#fff3cf', view: 'fold', wall: 2, tag: 'New' },
  { id: 7,  name: 'Bridal Gota Patti Georgette', type: 'gota',     fabric: 'Pure Georgette',   price: 27500, base: '#7a1d33', motif: '#f0cf7a', view: 'flow', wall: 2, tag: 'Bridal' },
  { id: 8,  name: 'Emerald Gota Border Saree',   type: 'gota',     fabric: 'Chinon Silk',      price: 22000, base: '#14543f', motif: '#f0cf7a', view: 'fold', wall: 0, tag: '' },
  { id: 9,  name: 'Sanganeri Floral Block Print', type: 'block',   fabric: 'Mulmul Cotton',    price: 6900,  base: '#f1e5cb', motif: '#b8453a', view: 'fold', wall: 1, tag: '' },
  { id: 10, name: 'Royal Banarasi Katan',        type: 'banarasi', fabric: 'Katan Silk',       price: 64000, base: '#4b1230', motif: '#e6c883', view: 'hung', wall: 2, tag: 'Signature' },
  { id: 11, name: 'Peacock Chanderi Buti',       type: 'chanderi', fabric: 'Chanderi Silk',    price: 12800, base: '#2f6f8f', motif: '#f2dca2', view: 'flow', wall: 1, tag: '' },
  { id: 12, name: 'Indigo Bagru Mulmul',         type: 'bagru',    fabric: 'Mulmul Cotton',    price: 7400,  base: '#1f3d63', motif: '#e9dcc0', view: 'hung', wall: 0, tag: 'Limited' }
];
const byId = id => PRODUCTS.find(p => p.id === id);

/* ---------- Render category rail ---------- */
const rail = $('#rail');
rail.innerHTML = CATS.map((c, i) => {
  const n = PRODUCTS.filter(p => p.type === c.key).length;
  return `<a href="#sarees" class="cat reveal" data-filter="${c.key}" style="--d:${Math.min(i, 4) * .08}s" draggable="false">
    <div class="cat-shadow"><div class="cat-arch"><div class="in">
      ${catArt(c)}
      <div class="cat-label"><span class="cat-n">${String(i + 1).padStart(2, '0')}</span><h3>${c.name}</h3><small>${n} ${n === 1 ? 'saree' : 'sarees'}</small></div>
    </div></div></div>
    <p class="cat-blurb">${c.blurb}</p>
  </a>`;
}).join('');

/* Horizontal drag / arrows / progress */
const thumb = $('#railThumb');
function updateProgress() {
  const max = rail.scrollWidth, vis = rail.clientWidth;
  thumb.style.width = Math.min(100, (vis / max) * 100) + '%';
  thumb.style.left = (rail.scrollLeft / max) * 100 + '%';
}
rail.addEventListener('scroll', updateProgress, { passive: true });
addEventListener('resize', updateProgress);
$('#railPrev').addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * .6, behavior: 'smooth' }));
$('#railNext').addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * .6, behavior: 'smooth' }));

let down = false, sx = 0, sl = 0, moved = 0;
rail.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') return;
  down = true; moved = 0; sx = e.clientX; sl = rail.scrollLeft;
});
addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
  if (moved > 5) { rail.classList.add('drag'); rail.scrollLeft = sl - dx; }
});
addEventListener('pointerup', () => { down = false; rail.classList.remove('drag'); });
rail.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
rail.addEventListener('dragstart', e => e.preventDefault());

/* ---------- Render filters + products ---------- */
const filters = $('#filters');
filters.innerHTML = `<button class="chip active" data-filter="All">All</button>` +
  CATS.map(c => `<button class="chip" data-filter="${c.key}">${c.name}</button>`).join('');

const grid = $('#products');
function renderProducts(filter = 'All') {
  const list = PRODUCTS.filter(p => filter === 'All' || p.type === filter);
  grid.innerHTML = list.map((p, i) => `
    <article class="product" style="animation-delay:${i * 0.06}s">
      <div class="p-visual">
        ${p.tag ? `<span class="p-tag">${p.tag}</span>` : ''}
        <div class="p-arch"><div class="p-face">${art(p)}</div></div>
        <button class="p-add" data-id="${p.id}">Add to Bag</button>
      </div>
      <span class="p-cat">${CAT[p.type].name} · ${p.fabric}</span>
      <h3>${p.name}</h3>
      <div class="p-price">${fmt(p.price)}</div>
    </article>`).join('');
}
function setFilter(f) {
  $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
  renderProducts(f);
}
renderProducts();
filters.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) setFilter(c.dataset.filter); });
rail.addEventListener('click', e => { const c = e.target.closest('.cat'); if (c) setFilter(c.dataset.filter); });

/* ---------- Hero / heritage / journal art ---------- */
$('#heroMain').innerHTML = art(byId(10));
$('#heroL').innerHTML = art(byId(3));
$('#heroR').innerHTML = art(byId(9));
$('#hArt1').innerHTML = art(byId(1), 'hung');
$('#hArt2').innerHTML = art(byId(7), 'hung');
$('#hArt3').innerHTML = art(byId(11), 'hung');
$('#jArt1').innerHTML = art(byId(2));
$('#jArt2').innerHTML = art(byId(4), 'flow');
$('#jArt3').innerHTML = art(byId(5), 'fold');

/* ---------- Cart ---------- */
let cart = [];
try { cart = JSON.parse(localStorage.getItem('kyrdia-saree-cart')) || []; } catch (e) { cart = []; }
cart = cart.filter(i => byId(i.id));

const drawer = $('#drawer'), overlay = $('#overlay');
const openCart = () => { drawer.classList.add('open'); overlay.classList.add('show'); drawer.setAttribute('aria-hidden', 'false'); };
const closeCart = () => { drawer.classList.remove('open'); overlay.classList.remove('show'); drawer.setAttribute('aria-hidden', 'true'); };
$('#cartOpen').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
overlay.addEventListener('click', closeCart);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
const save = () => { try { localStorage.setItem('kyrdia-saree-cart', JSON.stringify(cart)); } catch (e) {} };

function renderCart() {
  const wrap = $('#cartItems');
  if (!cart.length) {
    wrap.innerHTML = `<div class="empty">Your bag is empty<small>Discover a saree crafted for a lifetime.</small></div>`;
  } else {
    wrap.innerHTML = cart.map(item => {
      const p = byId(item.id);
      return `<div class="c-item">
        <div class="c-thumb">${art(p)}</div>
        <div><h4>${p.name}</h4>
          <div class="qty"><button data-act="dec" data-id="${p.id}" aria-label="Decrease">−</button><span>${item.qty}</span><button data-act="inc" data-id="${p.id}" aria-label="Increase">+</button></div>
        </div>
        <div style="text-align:right"><div class="c-price">${fmt(p.price * item.qty)}</div><button class="c-remove" data-act="rm" data-id="${p.id}">Remove</button></div>
      </div>`;
    }).join('');
  }
  $('#cartCount').textContent = cart.reduce((s, i) => s + i.qty, 0);
  $('#cartTotal').textContent = fmt(cart.reduce((s, i) => s + i.qty * byId(i.id).price, 0));
  save();
}
function addToCart(id) {
  const f = cart.find(i => i.id === id);
  f ? f.qty++ : cart.push({ id, qty: 1 });
  renderCart();
  const b = $('#cartCount'); b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 300);
  toast(byId(id).name + ' added to your bag');
}
grid.addEventListener('click', e => { const b = e.target.closest('.p-add'); if (b) addToCart(+b.dataset.id); });
$('#cartItems').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const item = cart.find(i => i.id === +b.dataset.id);
  if (b.dataset.act === 'inc') item.qty++;
  if (b.dataset.act === 'dec') item.qty = Math.max(0, item.qty - 1);
  if (b.dataset.act === 'rm') item.qty = 0;
  cart = cart.filter(i => i.qty > 0);
  renderCart();
});
$('#checkoutBtn').addEventListener('click', () => toast(cart.length ? 'Checkout coming soon — thank you for choosing Kyrdia' : 'Your bag is empty'));

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Header / menu ---------- */
const header = $('.site-header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30), { passive: true });
const menuBtn = $('#menuBtn'), mobileMenu = $('#mobileMenu');
menuBtn.addEventListener('click', () => { menuBtn.classList.toggle('open'); mobileMenu.classList.toggle('open'); });
$$('#mobileMenu a').forEach(a => a.addEventListener('click', () => { menuBtn.classList.remove('open'); mobileMenu.classList.remove('open'); }));

/* ---------- Scroll reveal ---------- */
const io = new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
}, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal').forEach(el => io.observe(el));

/* ---------- Newsletter ---------- */
$('#newsForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#newsEmail').value.trim(), msg = $('#newsMsg');
  if (!/^\S+@\S+\.\S+$/.test(v)) { msg.textContent = 'Please enter a valid email address.'; return; }
  msg.textContent = 'Welcome to the Maison. Your invitation is on its way.';
  e.target.reset();
});

renderCart();
updateProgress();
