/* =========================================================
   KRIDIA — shared code (home page + listing page)
   Loads site content from the local server (data/*.json),
   and provides helpers, the shopping bag, header and toasts.
   ========================================================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeImg = p => (typeof p === 'string' && /^data:image\/(?:webp|jpeg|png);base64,/.test(p)) ? p : '';
const paragraphs = t => String(t || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

/* ---------- Content (filled once the data has loaded) ---------- */
let SITE = {}, CATS = [], PRODUCTS = [], ARTISANS = [], REVIEWS = [], JOURNAL = [], PAYMENT = {};
const sv = (path, fb = '') => {
  let o = SITE;
  for (const k of path.split('.')) { if (o == null) return fb; o = o[k]; }
  return o == null ? fb : o;
};
const byId = id => PRODUCTS.find(p => p.id === Number(id));
const catById = id => CATS.find(c => c.id === Number(id));
const artisanById = id => ARTISANS.find(a => a.id === Number(id));
const imagesOf = p => (p.images || []).map(safeImg).filter(Boolean);
const mainImage = p => imagesOf(p)[0] || '';

/* ---------- Images ---------- */
function placeholder() {
  return `<svg viewBox="0 0 300 375" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="300" height="375" fill="#eadcb9"/>
    <rect width="300" height="375" fill="url(#jaali)" style="color:#b8893b" opacity=".2"/>
    <use href="#lotus" x="105" y="160" width="90" height="54" style="color:#b8893b"/></svg>`;
}
const visual = (src, alt) => src
  ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`
  : placeholder();

/* ---------- Product card (used on the home and listing pages) ---------- */
function productCard(p, i = 0) {
  const cat = catById(p.categoryId);
  const meta = [cat && cat.name, p.fabric].filter(Boolean).join(' · ');
  const tag = p.soldOut ? 'Sold out' : p.tag;
  const href = 'listing.html?id=' + p.id;
  return `<article class="product" style="animation-delay:${i * 0.06}s">
    <div class="p-visual">
      ${tag ? `<span class="p-tag">${esc(tag)}</span>` : ''}
      <a class="p-link" href="${href}" aria-label="${esc(p.name)}"><div class="p-arch"><div class="p-face">${visual(mainImage(p), p.name)}</div></div></a>
      ${p.soldOut ? '' : `<button class="p-add" data-id="${p.id}">Add to Bag</button>`}
    </div>
    <span class="p-cat">${esc(meta)}</span>
    <h3><a href="${href}">${esc(p.name)}</a></h3>
    <div class="p-price">${fmt(p.price)}</div>
  </article>`;
}

/* ---------- Bind editable text from the server ---------- */
function bindText() {
  $$('[data-s]').forEach(el => { el.textContent = sv(el.dataset.s); });
  $$('[data-s-lines]').forEach(el => {
    el.textContent = '';
    String(sv(el.dataset.sLines)).split('\n').forEach((line, i) => {
      if (i) el.append(document.createElement('br'));
      el.append(line);
    });
  });
  $$('[data-s-ph]').forEach(el => { el.placeholder = sv(el.dataset.sPh); });
  const name = sv('brand.name');
  if (name) $$('.brand').forEach(el => el.setAttribute('aria-label', name + ' home'));
}
function applyVisibility() {
  const has = {
    categories: CATS.length, artisans: ARTISANS.length, reviews: REVIEWS.length,
    journal: JOURNAL.length, anatomy: (sv('anatomy.parts', []) || []).length
  };
  $$('[data-show-if]').forEach(el => { el.hidden = !has[el.dataset.showIf]; });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Shopping bag ---------- */
let cart = [];
try { cart = JSON.parse(localStorage.getItem('kridia-cart')) || []; } catch (e) { cart = []; }

const drawer = $('#drawer'), overlay = $('#overlay');
const openCart = () => { drawer.classList.add('open'); overlay.classList.add('show'); drawer.setAttribute('aria-hidden', 'false'); };
const closeCart = () => { drawer.classList.remove('open'); overlay.classList.remove('show'); drawer.setAttribute('aria-hidden', 'true'); };
$('#cartOpen').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
overlay.addEventListener('click', closeCart);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
const saveCart = () => { try { localStorage.setItem('kridia-cart', JSON.stringify(cart)); } catch (e) {} };

function renderCart() {
  const wrap = $('#cartItems');
  if (!cart.length) {
    wrap.innerHTML = `<div class="empty">Your bag is empty<small>Discover bridal wear crafted for a lifetime.</small></div>`;
  } else {
    wrap.innerHTML = cart.map(item => {
      const p = byId(item.id);
      if (!p) return '';
      return `<div class="c-item">
        <div class="c-thumb">${visual(mainImage(p), p.name)}</div>
        <div><h4>${esc(p.name)}</h4>
          <div class="qty"><button data-act="dec" data-id="${p.id}" aria-label="Decrease">−</button><span>${item.qty}</span><button data-act="inc" data-id="${p.id}" aria-label="Increase">+</button></div>
        </div>
        <div style="text-align:right"><div class="c-price">${fmt(p.price * item.qty)}</div><button class="c-remove" data-act="rm" data-id="${p.id}">Remove</button></div>
      </div>`;
    }).join('');
  }
  $('#cartCount').textContent = cart.reduce((s, i) => s + i.qty, 0);
  $('#cartTotal').textContent = fmt(cart.reduce((s, i) => s + i.qty * ((byId(i.id) || {}).price || 0), 0));
  document.dispatchEvent(new Event('kridia:cart'));   // lets the checkout page re-draw the bill
  saveCart();
}
function addToCart(id) {
  const p = byId(id);
  if (!p || p.soldOut) return;
  const f = cart.find(i => i.id === id);
  f ? f.qty++ : cart.push({ id, qty: 1 });
  renderCart();
  const b = $('#cartCount'); b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 300);
  toast(p.name + ' added to your bag');
}
document.addEventListener('click', e => { const b = e.target.closest('.p-add'); if (b) addToCart(+b.dataset.id); });
$('#cartItems').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const item = cart.find(i => i.id === +b.dataset.id); if (!item) return;
  if (b.dataset.act === 'inc') item.qty = Math.min(99, item.qty + 1);
  if (b.dataset.act === 'dec') item.qty = Math.max(0, item.qty - 1);
  if (b.dataset.act === 'rm') item.qty = 0;
  cart = cart.filter(i => i.qty > 0);
  renderCart();
});
$('#checkoutBtn').addEventListener('click', () => {
  if (!cart.length) return toast('Your bag is empty');
  location.href = 'checkout.html';   // auth.js swaps this for a version that asks guests to sign in first
});

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
const observeReveals = () => $$('.reveal:not(.in)').forEach(el => io.observe(el));

/* ---------- Load content from Firebase (see store.js) ---------- */
/* Images are stored in Firestore and referenced as "images/<id>". Before the page is
   drawn they are swapped for data URLs: small thumbnails for cards, full size for
   the hero / story pictures and the listing gallery. */
const IS_HOME = !!document.getElementById('rail');
const isRef = v => typeof v === 'string' && /^images\//.test(v);

async function resolveImages() {
  const jobs = [];
  const swap = (obj, key, kind) => {
    if (!obj || !isRef(obj[key])) return;
    jobs.push(KStore.image(obj[key], kind).then(u => { obj[key] = u; }));
  };
  PRODUCTS.forEach(p => {
    p.imagePaths = (p.images || []).filter(isRef);        // kept for the full-size gallery
    const first = p.imagePaths[0];
    p.images = [];
    if (first) jobs.push(KStore.image(first, 'thumb').then(u => { p.images = u ? [u] : []; }));
  });
  ARTISANS.forEach(a => swap(a, 'image', 'thumb'));
  if (IS_HOME) {
    CATS.forEach(c => swap(c, 'image', 'thumb'));
    JOURNAL.forEach(j => swap(j, 'image', 'thumb'));
    ['hero.image1', 'hero.image2', 'hero.image3', 'heritage.image1', 'heritage.image2', 'heritage.image3'].forEach(k => {
      const [g, n] = k.split('.');
      swap(SITE[g], n, 'full');
    });
  }
  await Promise.all(jobs);
}
/* Listing page: swap a listing's thumbnail for all of its full-size images. */
async function loadFullImages(p) {
  const paths = p.imagePaths || [];
  if (!paths.length) return;
  const urls = await Promise.all(paths.map(async x => (await KStore.image(x, 'full')) || (await KStore.image(x, 'thumb'))));
  p.images = urls.filter(Boolean);
}

window.kridiaReady = (async () => {
  try {
    const d = await KStore.loadPublic();
    SITE = d.settings || {}; CATS = d.categories || []; PRODUCTS = d.listings || [];
    PAYMENT = d.payment || {};
    ARTISANS = d.artisans || []; REVIEWS = d.reviews || []; JOURNAL = d.journal || [];
    await resolveImages();
    cart = cart.filter(i => byId(i.id));
    bindText();
    applyVisibility();
    return true;
  } catch (e) {
    console.error('Kridia: could not load site content (check firebase-config.js, Firestore rules and your connection).', e);
    return false;
  } finally {
    renderCart();
  }
})();
