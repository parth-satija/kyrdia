/* =========================================================
   KRIDIA — Listing details page  (listing.html?id=N)
   ========================================================= */
(async function () {
  const root = $('#detail');
  const ok = await kridiaReady;
  const id = new URLSearchParams(location.search).get('id');
  const p = ok ? byId(id) : null;

  if (!p) {
    root.innerHTML = `<div class="d-missing">
      <h1>${ok ? 'This piece is no longer available' : 'We couldn’t load this page'}</h1>
      <p>${ok ? 'It may have been removed or is not currently on display.' : 'Please try again shortly.'}</p>
      <a href="index.html#bridal" class="btn btn-gold">Back to Bridal Wear</a></div>`;
    return;
  }

  const imgs = imagesOf(p);
  const cat = catById(p.categoryId);
  const maker = artisanById(p.artisanId);
  document.title = `${p.name} — ${sv('brand.name', 'Kridia')}`;
  const md = $('meta[name="description"]');
  if (md) md.setAttribute('content', p.shortDescription || `${p.name} — ${sv('brand.name', 'Kridia')} bridal wear.`);

  const specs = [
    ['Collection', cat && cat.name],
    ['Fabric', p.fabric],
    ...(p.specs || []).map(s => [s.label, s.value]),
    ['Made by', maker && maker.name]
  ].filter(r => r[0] && r[1]);

  root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="index.html">Home</a><i>/</i><a href="index.html#bridal">Bridal Wear</a>
      ${cat ? `<i>/</i><a href="index.html?cat=${cat.id}#bridal">${esc(cat.name)}</a>` : ''}
      <i>/</i><span>${esc(p.name)}</span>
    </nav>
    <div class="detail-grid">
      <div class="gallery">
        <div class="g-main">
          <div class="g-main-in" id="gMain">${visual(imgs[0] || '', p.name)}</div>
          ${imgs.length > 1 ? `<button class="g-nav g-prev" id="gPrev" aria-label="Previous image">←</button><button class="g-nav g-next" id="gNext" aria-label="Next image">→</button>` : ''}
        </div>
        ${imgs.length > 1 ? `<div class="g-thumbs" id="gThumbs">${imgs.map((src, i) =>
          `<button class="g-thumb${i ? '' : ' active'}" data-i="${i}" aria-label="Show image ${i + 1}">${visual(src, '')}</button>`).join('')}</div>` : ''}
      </div>
      <div class="d-info">
        ${p.soldOut ? `<span class="d-tag">Sold out</span>` : (p.tag ? `<span class="d-tag">${esc(p.tag)}</span>` : '')}
        <p class="p-cat">${esc([cat && cat.name, p.fabric].filter(Boolean).join(' · '))}</p>
        <h1>${esc(p.name)}</h1>
        <div class="d-price">${fmt(p.price)}</div>
        ${p.shortDescription ? `<p class="d-short">${esc(p.shortDescription)}</p>` : ''}
        <div class="d-actions">
          ${p.soldOut
            ? `<span class="btn btn-ghost d-sold">Currently unavailable</span>`
            : `<button class="btn btn-gold" id="dAdd">Add to Bag</button>`}
          <a href="index.html#bridal" class="btn btn-ghost">Continue Browsing</a>
        </div>
        ${paragraphs(p.description).length ? `<div class="d-block d-desc"><h2>About this piece</h2>${
          paragraphs(p.description).map(t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
        ${specs.length ? `<div class="d-block"><h2>Details</h2><dl class="specs">${
          specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
        ${maker ? `<div class="d-block d-maker">
          <div class="portrait">${safeImg(maker.image) ? `<img src="${esc(maker.image)}" alt="${esc(maker.name)}">` : `<span>${esc((maker.name || '?').trim()[0] || '?').toUpperCase()}</span>`}</div>
          <div><span class="p-cat">Made by</span><h3>${esc(maker.name)}</h3>${maker.craft ? `<p class="craft">${esc(maker.craft)}</p>` : ''}
          ${maker.bio ? `<p>${esc(maker.bio)}</p>` : ''}</div></div>` : ''}
      </div>
    </div>`;

  /* Gallery */
  let cur = 0;
  const main = $('#gMain');
  function show(i) {
    cur = (i + imgs.length) % imgs.length;
    main.innerHTML = visual(imgs[cur], p.name);
    $$('.g-thumb').forEach((t, k) => t.classList.toggle('active', k === cur));
  }
  if (imgs.length > 1) {
    $('#gPrev').addEventListener('click', () => show(cur - 1));
    $('#gNext').addEventListener('click', () => show(cur + 1));
    $('#gThumbs').addEventListener('click', e => { const t = e.target.closest('.g-thumb'); if (t) show(+t.dataset.i); });
    document.addEventListener('keydown', e => {
      if (e.target.closest('input,textarea')) return;
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
  }

  const add = $('#dAdd');
  if (add) add.addEventListener('click', () => addToCart(p.id));

  /* Related pieces: same category first, then others */
  const others = PRODUCTS.filter(x => x.id !== p.id);
  const related = [...others.filter(x => x.categoryId === p.categoryId), ...others.filter(x => x.categoryId !== p.categoryId)].slice(0, 4);
  if (related.length) {
    $('#relatedGrid').innerHTML = related.map((x, i) => productCard(x, i)).join('');
    $('#related').hidden = false;
  }
})();
