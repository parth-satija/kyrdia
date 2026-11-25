/* =========================================================
   KRIDIA — Home page
   All content comes from the admin-managed JSON (see common.js)
   ========================================================= */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const rail = $('#rail'), filters = $('#filters'), grid = $('#products');

/* ---------- Hero ---------- */
function renderHero() {
  const h1 = $('#heroTitle');
  h1.textContent = '';
  const em = document.createElement('em');
  em.textContent = sv('hero.titleEm');
  h1.append(sv('hero.title1') + ' ', em, document.createElement('br'), sv('hero.title2'));

  $('#heroMain').innerHTML = visual(safeImg(sv('hero.image1')), '');
  $('#heroL').innerHTML = visual(safeImg(sv('hero.image2')), '');
  $('#heroR').innerHTML = visual(safeImg(sv('hero.image3')), '');

  const stats = [
    [CATS.length, 'Collections'],
    [PRODUCTS.length, 'Bridal pieces'],
    [ARTISANS.length, 'Master artisans']
  ].filter(s => s[0] > 0);
  const ul = $('#heroStats');
  ul.innerHTML = stats.map(s => `<li><strong>${s[0]}</strong><span>${s[1]}</span></li>`).join('');
  ul.hidden = !stats.length;
}

/* ---------- Marquee ---------- */
function renderMarquee() {
  const row = CATS.map(c => `<span>${esc(c.name)}</span><i>✦</i>`).join('');
  $('#marqueeTrack').innerHTML = row + row;
}

/* ---------- Category rail ---------- */
const thumb = $('#railThumb');
function updateProgress() {
  const max = rail.scrollWidth, vis = rail.clientWidth;
  thumb.style.width = Math.min(100, (vis / max) * 100) + '%';
  thumb.style.left = (rail.scrollLeft / max) * 100 + '%';
}
function renderRail() {
  rail.innerHTML = CATS.map((c, i) => {
    const n = PRODUCTS.filter(p => p.categoryId === c.id).length;
    return `<a href="#bridal" class="cat reveal" data-filter="${c.id}" style="--d:${Math.min(i, 4) * .08}s" draggable="false">
      <div class="cat-shadow"><div class="cat-arch"><div class="in">
        ${visual(safeImg(c.image), c.name)}
        <div class="cat-label"><span class="cat-n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(c.name)}</h3><small>${n} ${n === 1 ? 'piece' : 'pieces'}</small></div>
      </div></div></div>
      ${c.blurb ? `<p class="cat-blurb">${esc(c.blurb)}</p>` : ''}
    </a>`;
  }).join('');
  updateProgress();
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

/* ---------- Filters + listings ---------- */
function renderFilters() {
  const used = CATS.filter(c => PRODUCTS.some(p => p.categoryId === c.id));
  filters.innerHTML = `<button class="chip active" data-filter="All">All</button>` +
    used.map(c => `<button class="chip" data-filter="${c.id}">${esc(c.name)}</button>`).join('');
  filters.hidden = !PRODUCTS.length;
}
function renderProducts(filter = 'All') {
  const list = PRODUCTS.filter(p => filter === 'All' || String(p.categoryId) === String(filter));
  if (!list.length) {
    const msg = PRODUCTS.length ? 'No pieces in this collection yet.' : sv('listings.empty');
    grid.innerHTML = `<p class="empty-note">${esc(msg)}</p>`;
    return;
  }
  grid.innerHTML = list.map((p, i) => productCard(p, i)).join('');
}
function setFilter(f) {
  $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === String(f)));
  renderProducts(f);
}
filters.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) setFilter(c.dataset.filter); });
rail.addEventListener('click', e => { const c = e.target.closest('.cat'); if (c) setFilter(c.dataset.filter); });

/* ---------- Anatomy ---------- */
function renderAnatomy() {
  const parts = sv('anatomy.parts', []) || [];
  const wrap = $('#anatomyGrid');
  wrap.style.setProperty('--cols', Math.min(parts.length, 4) || 4);
  wrap.innerHTML = parts.map((p, i) => `<article class="part reveal" style="--d:${i * .1}s">
    <span class="num">${ROMAN[i] || i + 1}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('');
}

/* ---------- Heritage ---------- */
function renderHeritage() {
  const h2 = $('#heritageTitle');
  h2.textContent = '';
  const em = document.createElement('em');
  em.textContent = sv('heritage.titleEm');
  h2.append(sv('heritage.title') + ' ', em);
  $('#heritagePillars').innerHTML = (sv('heritage.pillars', []) || []).map(p =>
    `<li><svg viewBox="0 0 100 60"><use href="#lotus"/></svg><div><h4>${esc(p.title)}</h4><span>${esc(p.text)}</span></div></li>`).join('');
  [1, 2, 3].forEach(n => { $('#hArt' + n).innerHTML = visual(safeImg(sv('heritage.image' + n)), ''); });
}

/* ---------- Artisans ---------- */
function renderArtisans() {
  const wrap = $('#artisanGrid');
  wrap.style.maxWidth = ARTISANS.length < 3 ? (ARTISANS.length === 1 ? '420px' : '860px') : '';
  wrap.style.marginInline = 'auto';
  wrap.innerHTML = ARTISANS.map((a, i) => `<article class="artisan reveal" style="--d:${(i % 3) * .1}s">
    <div class="portrait">${safeImg(a.image) ? `<img src="${esc(a.image)}" alt="${esc(a.name)}" loading="lazy" decoding="async">` : `<span>${esc((a.name || '?').trim()[0] || '?').toUpperCase()}</span>`}</div>
    <h3>${esc(a.name)}</h3>
    ${a.craft ? `<p class="craft">${esc(a.craft)}</p>` : ''}
    ${a.bio ? `<p>${esc(a.bio)}</p>` : ''}
  </article>`).join('');
}

/* ---------- Reviews ---------- */
let qIdx = 0, qTimer;
function showReview(i) {
  qIdx = i;
  const r = REVIEWS[i];
  $('#qText').textContent = '“' + r.quote + '”';
  $('#qCite').textContent = '— ' + r.author + (r.location ? ', ' + r.location : '');
  $$('#qDots button').forEach((b, k) => b.classList.toggle('on', k === i));
}
function renderReviews() {
  clearInterval(qTimer);
  if (!REVIEWS.length) return;
  $('#qDots').innerHTML = REVIEWS.length > 1
    ? REVIEWS.map((_, i) => `<button type="button" data-i="${i}" aria-label="Review ${i + 1}"></button>`).join('') : '';
  showReview(0);
  if (REVIEWS.length > 1) qTimer = setInterval(() => showReview((qIdx + 1) % REVIEWS.length), 8000);
}
$('#qDots').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  clearInterval(qTimer); showReview(+b.dataset.i);
});

/* ---------- Journal ---------- */
function renderJournal() {
  const wrap = $('#journalGrid');
  wrap.style.maxWidth = JOURNAL.length < 3 ? (JOURNAL.length === 1 ? '420px' : '860px') : '';
  wrap.style.marginInline = 'auto';
  wrap.innerHTML = JOURNAL.map((p, i) => `<article class="post reveal" style="--d:${(i % 3) * .1}s">
    <div class="post-img"><div>${visual(safeImg(p.image), p.title)}</div></div>
    ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
    <h3>${esc(p.title)}</h3>
    ${p.body ? `<a href="#journal" data-story="${p.id}">Read story →</a>` : ''}
  </article>`).join('');
}
const storyModal = $('#storyModal'), authOverlay = $('#authOverlay');
function openStory(p) {
  $('#storyTitle').textContent = p.title;
  $('#storyTag').textContent = p.tag || '';
  const img = safeImg(p.image);
  $('#storyImg').innerHTML = img ? `<img src="${esc(img)}" alt="${esc(p.title)}">` : '';
  $('#storyBody').innerHTML = paragraphs(p.body).map(t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
  storyModal.classList.add('open'); storyModal.setAttribute('aria-hidden', 'false');
  authOverlay.classList.add('show');
}
function closeStory() {
  storyModal.classList.remove('open'); storyModal.setAttribute('aria-hidden', 'true');
  if (!$('#authModal').classList.contains('open')) authOverlay.classList.remove('show');
}
$('#journalGrid').addEventListener('click', e => {
  const a = e.target.closest('[data-story]'); if (!a) return;
  e.preventDefault();
  const p = JOURNAL.find(x => x.id === +a.dataset.story);
  if (p) openStory(p);
});
$('#storyClose').addEventListener('click', closeStory);
authOverlay.addEventListener('click', closeStory);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && storyModal.classList.contains('open')) closeStory(); });

/* ---------- Newsletter ---------- */
$('#newsForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#newsEmail').value.trim(), msg = $('#newsMsg');
  if (!/^\S+@\S+\.\S+$/.test(v)) { msg.textContent = 'Please enter a valid email address.'; return; }
  msg.textContent = sv('newsletter.success', 'Thank you for subscribing.');
  e.target.reset();
});

/* ---------- Boot ---------- */
(async function () {
  const ok = await kridiaReady;
  if (!ok) {
    grid.innerHTML = `<p class="empty-note">We couldn’t load the collection right now. Please try again shortly.</p>`;
    observeReveals();
    return;
  }
  renderHero(); renderMarquee(); renderRail(); renderFilters(); renderProducts();
  renderAnatomy(); renderHeritage(); renderArtisans(); renderReviews(); renderJournal();

  const cat = new URLSearchParams(location.search).get('cat');
  if (cat && CATS.some(c => String(c.id) === cat)) {
    setFilter(cat);
    if (location.hash === '#bridal') setTimeout(() => $('#bridal').scrollIntoView(), 50);
  }
  observeReveals();
  updateProgress();
})();
