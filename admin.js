/* =========================================================
   KRIDIA — Admin dashboard (schema-driven; see schema.js)
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.');
    ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = v;
  }

  /* ---------- API (Firebase-backed; see store.js) ---------- */
  function api(method, url, body, raw) {
    return KAdmin.call(method, url, body, raw);
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  /* ---------- modals (2 levels) ---------- */
  function showModal(level, title, body) {
    const m = $('#modal' + level);
    m.replaceChildren(h('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', 'aria-label': 'Close', onclick: () => closeModal(level) }, '✕')),
      h('div', { class: 'modal-body' }, body)));
    m.hidden = false;
  }
  function closeModal(level) { const m = $('#modal' + level); m.hidden = true; m.replaceChildren(); }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#modal2').hidden) closeModal(2); else if (!$('#modal1').hidden) closeModal(1);
  });

  /* ---------- state ---------- */
  let SCHEMA, DATA, ORDERS = null;   // ORDERS: every customer's orders, loaded from Firestore on demand
  const view = $('#view');
  const NAV_EXTRA = [['settings', 'Website text & images'], ['images', 'Image library'], ['security', 'Security']];

  /* ---------- uploads ---------- */
  async function prepare(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { return file; }
    const max = 2400, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.8 * 1024 * 1024) { if (bmp.close) bmp.close(); return file; }
    const w = Math.round(bmp.width * scale), hh = Math.round(bmp.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
    if (bmp.close) bmp.close();
    const type = file.type === 'image/png' ? 'image/webp' : file.type;
    const blob = await new Promise(res => c.toBlob(res, type, 0.88));
    if (!blob || (scale === 1 && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg'), { type });
  }
  async function uploadFile(file) {
    if (!/^image\//.test(file.type)) throw new Error(file.name + ' is not an image.');
    const f = await prepare(file);
    if (f.size > 15 * 1024 * 1024) throw new Error(file.name + ' is too large (max 15 MB).');
    const d = await api('POST', 'api/admin/upload', undefined, {
      body: f, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }
    });
    return d.path;
  }
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

  /* ---------- library picker ---------- */
  async function openLibrary(multi, cb) {
    let images;
    try { images = (await api('GET', 'api/admin/images')).images; } catch (e) { return toast(e.message, true); }
    const sel = new Set();
    const count = h('span', { class: 'help' }, '');
    const grid = h('div', { class: 'lib-grid' });
    images.forEach(im => {
      const c = h('button', {
        type: 'button', class: 'lib-item', title: im.name,
        onclick: () => {
          if (!multi) { closeModal(2); cb([im.path]); return; }
          sel.has(im.path) ? sel.delete(im.path) : sel.add(im.path);
          c.classList.toggle('sel', sel.has(im.path));
          count.textContent = sel.size + ' selected';
        }
      }, h('img', { src: im.thumb, alt: im.label || im.name, loading: 'lazy' }));
      grid.append(c);
    });
    const body = images.length ? h('div', null, grid) : h('p', { class: 'noimg' }, 'The image library is empty. Upload an image first.');
    if (multi && images.length) body.append(h('div', { class: 'form-foot' }, count,
      h('button', { type: 'button', class: 'btn primary', onclick: () => { closeModal(2); cb([...sel]); } }, 'Add selected')));
    showModal(2, 'Choose from library', body);
  }

  /* ---------- field widgets ---------- */
  function imagePicker(f, val) {
    const multi = f.type === 'images';
    let list = multi ? [...(val || [])] : (val ? [val] : []);
    const grid = h('div', { class: 'thumbs' });
    const msg = h('small', { class: 'help' });
    const file = h('input', { type: 'file', accept: ACCEPT, multiple: multi, hidden: true });
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); };
    function draw() {
      grid.replaceChildren();
      if (!list.length) grid.append(h('p', { class: 'noimg' }, 'No image yet.'));
      list.forEach((p, i) => grid.append(h('div', { class: 'thumb' + (multi && i === 0 ? ' main' : '') },
        h('img', { src: KAdmin.thumb(p), alt: '' }),
        multi && i === 0 ? h('span', { class: 'badge' }, 'Main') : null,
        h('div', { class: 'tb' },
          multi ? h('button', { type: 'button', title: 'Move earlier', onclick: () => move(i, -1) }, '◀') : null,
          multi ? h('button', { type: 'button', title: 'Move later', onclick: () => move(i, 1) }, '▶') : null,
          h('button', { type: 'button', title: 'Remove', onclick: () => { list.splice(i, 1); draw(); } }, '✕')))));
    }
    function add(paths) {
      if (multi) { paths.forEach(p => { if (!list.includes(p) && list.length < (f.max || 12)) list.push(p); }); }
      else if (paths[0]) list = [paths[0]];
      draw();
    }
    file.addEventListener('change', async () => {
      const files = [...file.files]; file.value = '';
      if (!files.length) return;
      msg.textContent = 'Uploading…';
      try {
        const up = [];
        for (const fl of files) up.push(await uploadFile(fl));
        add(up); msg.textContent = '';
      } catch (e) { msg.textContent = e.message; }
    });
    draw();
    const el = h('div', { class: 'imgs' }, grid,
      h('div', { class: 'bar' },
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => file.click() }, multi ? '⬆ Upload images' : '⬆ Upload image'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => openLibrary(multi, add) }, 'Choose from library'),
        msg), file);
    return { el, get: () => (multi ? [...list] : (list[0] || '')) };
  }

  function rowsEditor(f, val) {
    const rows = (val || []).map(r => ({ ...r }));
    const wrap = h('div', { class: 'rows' });
    function draw() {
      wrap.replaceChildren();
      rows.forEach((r, i) => {
        const line = h('div', { class: 'row-line' });
        f.fields.forEach(sf => {
          const inp = sf.type === 'textarea'
            ? h('textarea', { rows: 2, placeholder: sf.label, maxlength: sf.max })
            : h('input', { type: 'text', placeholder: sf.label, maxlength: sf.max });
          inp.value = r[sf.key] || '';
          inp.addEventListener('input', () => { r[sf.key] = inp.value; });
          line.append(inp);
        });
        line.append(h('button', { type: 'button', class: 'x', title: 'Remove row', onclick: () => { rows.splice(i, 1); draw(); } }, '✕'));
        wrap.append(line);
      });
      if (rows.length < (f.max || 24)) wrap.append(h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { rows.push({}); draw(); } }, '+ Add row'));
    }
    draw();
    return { el: wrap, get: () => rows.map(r => ({ ...r })) };
  }

  function buildField(f, val) {
    let input, get;
    switch (f.type) {
      case 'text':
        input = h('input', { type: 'text', maxlength: f.max, placeholder: f.placeholder }); input.value = val == null ? '' : val; get = () => input.value; break;
      case 'textarea':
        input = h('textarea', { rows: f.rows || 4, maxlength: f.max }); input.value = val == null ? '' : val; get = () => input.value; break;
      case 'number':
        input = h('input', { type: 'number', step: 'any', min: f.min }); input.value = val == null ? '' : val; get = () => input.value; break;
      case 'bool': {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = val === undefined ? !!f.default : !!val;
        input = h('label', { class: 'check' }, cb, f.checkLabel || 'Yes'); get = () => cb.checked; break;
      }
      case 'ref': {
        const sel = h('select');
        sel.append(h('option', { value: '' }, '— None —'));
        const target = SCHEMA.collections[f.ref];
        (DATA.collections[f.ref] || []).forEach(it => sel.append(h('option', { value: String(it.id) }, it[target.title])));
        sel.value = val == null ? '' : String(val);
        input = sel; get = () => sel.value; break;
      }
      case 'image': case 'images': { const w = imagePicker(f, val); input = w.el; get = w.get; break; }
      case 'rows': { const w = rowsEditor(f, val); input = w.el; get = w.get; break; }
      default: input = h('span', null, 'Unsupported field'); get = () => undefined;
    }
    const wrapTag = ['text', 'textarea', 'number', 'ref'].includes(f.type) ? 'label' : 'div';
    const row = h(wrapTag, { class: 'field' }, h('span', { class: 'lbl' }, f.label), input, f.help ? h('small', { class: 'help' }, f.help) : null);
    return { row, get };
  }

  /* ---------- routing ---------- */
  function setHead(title, ...actions) {
    $('#pageTitle').textContent = title;
    $('#pageActions').replaceChildren(...actions.filter(Boolean));
  }
  function buildNav(cur) {
    const toCheck = ORDERS ? ORDERS.filter(o => o.status === 'payment_submitted').length : 0;
    const items = [['overview', 'Overview'], ...Object.entries(SCHEMA.collections).map(([k, d]) => [k, d.label, DATA.collections[k].length]), null,
      ['orders', 'Orders', toCheck || null], ['payments', 'Payment settings'], ...NAV_EXTRA];
    $('#nav').replaceChildren(...items.map(it => it
      ? h('a', { href: '#' + it[0], class: it[0] === cur ? 'on' : '' }, it[1], it[2] != null ? h('span', { class: 'count' + (it[0] === 'orders' ? ' alert' : ''), title: it[0] === 'orders' ? 'Payments waiting to be verified' : null }, it[2]) : null)
      : h('hr')));
  }
  function route() {
    const name = location.hash.slice(1) || 'overview';
    buildNav(name);
    view.replaceChildren();
    if (SCHEMA.collections[name]) viewCollection(name);
    else if (name === 'settings') viewSettings();
    else if (name === 'images') viewImages();
    else if (name === 'orders') viewOrders();
    else if (name === 'payments') viewPayments();
    else if (name === 'security') viewSecurity();
    else viewOverview();
    window.scrollTo(0, 0);
  }
  const refresh = async () => { DATA = await api('GET', 'api/admin/data'); route(); };

  /* ---------- overview ---------- */
  function viewOverview() {
    setHead('Overview', h('a', { class: 'btn ghost', href: 'index.html', target: '_blank', rel: 'noopener' }, 'View website ↗'));
    view.append(
      h('div', { class: 'note' }, h('b', null, 'Welcome. '), 'Everything on the website is managed here and saved to your Firebase database (images included). Start with ', h('a', { href: '#categories' }, 'categories'),
        ', then add ', h('a', { href: '#listings' }, 'listings'), '.'),
      h('div', { class: 'cards' }, ...Object.entries(SCHEMA.collections).map(([k, d]) =>
        h('a', { class: 'card stat', href: '#' + k }, h('strong', null, DATA.collections[k].length), h('span', null, d.label))), ...overviewOrderStats()));
  }

  /* ---------- collection list ---------- */
  function cellText(def, item, key) {
    const f = def.fields.find(x => x.key === key);
    const v = item[key];
    if (!f) return '';
    if (f.type === 'ref') { const t = (DATA.collections[f.ref] || []).find(i => i.id === v); return t ? t[SCHEMA.collections[f.ref].title] : '—'; }
    if (f.type === 'bool') return h('span', { class: 'pill ' + (v ? 'on' : 'off') }, v ? 'Visible' : 'Hidden');
    if (f.money) return v == null ? '—' : money(v);
    return v == null || v === '' ? '—' : String(v);
  }
  function viewCollection(name) {
    const def = SCHEMA.collections[name];
    const items = DATA.collections[name];
    setHead(def.label, h('button', { class: 'btn primary', onclick: () => openEditor(name, null) }, '+ Add ' + def.singular.toLowerCase()));
    if (!items.length) {
      view.append(h('div', { class: 'empty' }, 'No ' + def.label.toLowerCase() + ' yet.', h('br'),
        h('button', { class: 'btn primary', style: 'margin-top:1rem', onclick: () => openEditor(name, null) }, '+ Add ' + def.singular.toLowerCase())));
      return;
    }
    const head = h('tr', null, def.thumb ? h('th') : null, ...def.cols.map(k => h('th', null, def.fields.find(f => f.key === k).label)), h('th'));
    const body = items.map((it, i) => {
      let thumb = null;
      if (def.thumb) {
        const t = it[def.thumb]; const src = Array.isArray(t) ? t[0] : t;
        thumb = h('td', { class: 'thumbcell' }, src ? h('img', { src: KAdmin.thumb(src), alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }));
      }
      return h('tr', null, thumb,
        ...def.cols.map((k, ci) => h('td', { class: ci === 0 ? 'strong' : 'clip' }, cellText(def, it, k))),
        h('td', { class: 'acts' },
          h('button', { title: 'Move up', disabled: i === 0, onclick: () => reorder(name, it.id, -1) }, '↑'),
          h('button', { title: 'Move down', disabled: i === items.length - 1, onclick: () => reorder(name, it.id, 1) }, '↓'),
          h('button', { onclick: () => openEditor(name, it) }, 'Edit'),
          h('button', { class: 'del', onclick: () => del(name, it) }, 'Delete')));
    });
    view.append(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', null, head), h('tbody', null, body))));
  }
  async function reorder(name, id, dir) {
    try { await api('POST', `api/admin/c/${name}/${id}/move`, { dir }); await refresh(); } catch (e) { toast(e.message, true); }
  }
  async function del(name, it) {
    const def = SCHEMA.collections[name];
    if (!confirm(`Delete this ${def.singular.toLowerCase()} (“${it[def.title]}”)? This cannot be undone.`)) return;
    try { await api('DELETE', `api/admin/c/${name}/${it.id}`); await refresh(); toast('Deleted'); } catch (e) { toast(e.message, true); }
  }

  /* ---------- editor ---------- */
  function openEditor(name, item) {
    const def = SCHEMA.collections[name];
    const form = h('form', { class: 'form', novalidate: true });
    const getters = [];
    def.fields.forEach(f => {
      const fb = buildField(f, item ? item[f.key] : undefined);
      getters.push([f.key, fb.get]); form.append(fb.row);
    });
    const err = h('p', { class: 'form-err', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn primary' }, 'Save');
    form.append(err, h('div', { class: 'form-foot' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => closeModal(1) }, 'Cancel'), save));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const body = {};
      getters.forEach(([k, g]) => { body[k] = g(); });
      err.textContent = ''; save.disabled = true;
      try {
        if (item) await api('PUT', `api/admin/c/${name}/${item.id}`, body);
        else await api('POST', `api/admin/c/${name}`, body);
        closeModal(1);
        await refresh();
        toast('Saved');
      } catch (ex) { err.textContent = ex.message; save.disabled = false; }
    });
    showModal(1, (item ? 'Edit ' : 'New ') + def.singular.toLowerCase(), form);
    const first = form.querySelector('input[type=text]'); if (first) first.focus();
  }

  /* ---------- website text & images ---------- */
  function viewSettings() {
    const getters = [];
    const save = h('button', { class: 'btn primary' }, 'Save changes');
    setHead('Website text & images', save);
    view.append(h('div', { class: 'note' }, 'Edit the wording and images used across the home page, header and footer. Sections for categories, artisans, reviews and journal appear automatically once you add them.'));
    SCHEMA.settings.forEach((g, gi) => {
      const body = h('div', { class: 'form' });
      g.fields.forEach(f => {
        const fb = buildField(f, getPath(DATA.settings, f.key));
        getters.push([f.key, fb.get]); body.append(fb.row);
      });
      view.append(h('details', { class: 'card', open: gi === 0 }, h('summary', null, g.label), body));
    });
    save.addEventListener('click', async () => {
      const out = {};
      getters.forEach(([k, g]) => setPath(out, k, g()));
      save.disabled = true;
      try { const d = await api('PUT', 'api/admin/settings', out); DATA.settings = d.settings; toast('Saved'); }
      catch (e) { toast(e.message, true); }
      save.disabled = false;
    });
  }

  /* ---------- image library ---------- */
  function usageCount(path) { return JSON.stringify(DATA).split('"' + path + '"').length - 1; }
  async function viewImages() {
    const file = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true });
    const upBtn = h('button', { class: 'btn primary', onclick: () => file.click() }, '⬆ Upload images');
    setHead('Image library', upBtn, file);
    const msg = h('p', { class: 'help' });
    const drop = h('div', { class: 'dropzone' }, 'Drag images here, or use “Upload images”. Photos are resized in your browser and saved to your Firebase database.', msg);
    const grid = h('div', { class: 'gallery-grid' });
    view.append(drop, grid);

    async function upload(files) {
      files = [...files]; if (!files.length) return;
      let n = 0;
      for (const f of files) {
        msg.textContent = `Uploading ${++n} of ${files.length}…`;
        try { await uploadFile(f); } catch (e) { toast(e.message, true); }
      }
      msg.textContent = ''; load();
    }
    file.addEventListener('change', () => { const f = file.files; upload(f); file.value = ''; });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => upload(e.dataTransfer.files));

    async function load() {
      let images;
      try { images = (await api('GET', 'api/admin/images')).images; } catch (e) { return toast(e.message, true); }
      grid.replaceChildren();
      if (!images.length) { grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'No images uploaded yet.')); return; }
      images.forEach(im => {
        const used = usageCount(im.path);
        grid.append(h('div', { class: 'gcard' },
          h('img', { src: im.thumb, alt: '', loading: 'lazy' }),
          h('div', { class: 'meta' }, im.label || im.name, h('br'), (im.size / 1024).toFixed(0) + ' KB · ' + (used ? 'used ' + used + '×' : 'not used')),
          h('div', { class: 'row' }, h('span'), h('button', {
            class: 'btn danger sm', onclick: async () => {
              if (!confirm(used ? `This image is used ${used} time(s) on the site. Deleting it removes it from those places. Continue?` : 'Delete this image?')) return;
              try { await api('DELETE', 'api/admin/images/' + encodeURIComponent(im.name)); DATA = await api('GET', 'api/admin/data'); buildNav('images'); load(); toast('Deleted'); }
              catch (e) { toast(e.message, true); }
            }
          }, 'Delete'))));
      });
    }
    load();
  }

  /* ---------- orders (UPI payments are verified by hand here) ---------- */
  const when = ms => (ms ? new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  const statusPill = s => h('span', { class: 'pill s-' + (s || 'pending') }, KPay.statusLabel(s));
  const onRoute = name => (location.hash.slice(1) || 'overview') === name;
  const toVerify = o => o.status === 'payment_submitted';
  const ORDER_FILTERS = [
    ['verify', 'Needs verification', toVerify],
    ['awaiting', 'Awaiting payment', o => o.status === 'awaiting_payment'],
    ['approved', 'To ship', o => o.status === 'approved'],
    ['shipped', 'Shipped', o => o.status === 'shipped'],
    ['delivered', 'Delivered', o => o.status === 'delivered'],
    ['rejected', 'Not approved', o => o.status === 'rejected'],
    ['all', 'All', () => true]
  ];
  let ordersFilter = null, ordersQuery = '', ordersAt = 0;

  async function loadOrders(force) {
    if (ORDERS && !force) return ORDERS;
    ORDERS = (await api('GET', 'api/admin/orders')).orders;
    ordersAt = Date.now();
    return ORDERS;
  }
  const paidTotal = () => ORDERS.filter(o => KPay.isPaid(o.status)).reduce((s, o) => s + (Number(o.total) || 0), 0);
  function overviewOrderStats() {
    if (!ORDERS) return [];
    return [
      h('a', { class: 'card stat', href: '#orders' }, h('strong', null, ORDERS.filter(toVerify).length), h('span', null, 'Payments to verify')),
      h('a', { class: 'card stat', href: '#orders' }, h('strong', null, ORDERS.filter(o => o.status === 'approved').length), h('span', null, 'Orders to ship')),
      h('a', { class: 'card stat', href: '#orders' }, h('strong', null, ORDERS.length), h('span', null, 'Orders')),
      h('a', { class: 'card stat', href: '#orders' }, h('strong', null, money(paidTotal())), h('span', null, 'Approved sales'))
    ];
  }

  /** Does an order match the search box? (order no., name, phone, email, UTR, city, item names) */
  function matchesQuery(o, q) {
    if (!q) return true;
    const c = o.customer || {}, s = o.shipping || {};
    const hay = [KPay.orderRef(o), c.name, c.phone, c.email, o.utr, o.tracking, s.city, s.pin, ...(o.items || []).map(i => i.name)].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }
  const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  /** Download the orders currently listed (filter + search) as a spreadsheet-friendly CSV. */
  function exportCsv(list) {
    const head = ['Order', 'Placed', 'Status', 'Customer', 'Mobile', 'Email', 'Items', 'Total (INR)', 'UTR', 'Paid marked', 'Address', 'City', 'State', 'PIN', 'Tracking'];
    const rows = list.map(o => {
      const c = o.customer || {}, s = o.shipping || {};
      return [KPay.orderRef(o), o.createdAt ? new Date(o.createdAt).toISOString() : '', KPay.statusLabel(o.status), c.name, c.phone, c.email,
        (o.items || []).map(i => i.name + ' x' + i.qty).join('; '), o.total, o.utr, o.paidAt ? new Date(o.paidAt).toISOString() : '',
        [s.line1, s.line2].filter(Boolean).join(', '), s.city, s.state, s.pin, o.tracking];
    });
    const csv = '\ufeff' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'kridia-orders-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Printable packing slip / delivery label in a new window. */
  function printSlip(o) {
    const s = o.shipping || {}, c = o.customer || {};
    const addr = [s.line1, s.line2, [s.city, s.state].filter(Boolean).join(', '), s.pin].filter(Boolean).map(escHtml).join('<br>');
    const rows = (o.items || []).map(i => `<tr><td>${escHtml(i.name)}</td><td class="r">${Number(i.qty) || 0}</td><td class="r">${escHtml(money(i.price * i.qty))}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print the slip', true);
    w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Order ${escHtml(KPay.orderRef(o))}</title>
<style>body{font:15px/1.5 Georgia,serif;color:#222;max-width:680px;margin:2rem auto;padding:0 1rem}h1{font-size:1.6rem;margin:0}small{color:#666}
table{width:100%;border-collapse:collapse;margin:1rem 0}td,th{padding:.4rem .5rem;border-bottom:1px solid #ccc;text-align:left}.r{text-align:right}
.box{border:1.5px solid #222;padding:1rem;margin:1rem 0}h2{font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;margin:0 0 .4rem}</style></head><body>
<h1>KRIDIA</h1><small>Order ${escHtml(KPay.orderRef(o))} \u00b7 ${escHtml(when(o.createdAt))}</small>
<div class="box"><h2>Deliver to</h2><strong>${escHtml(s.name || c.name)}</strong><br>${addr}<br>Mobile: ${escHtml(s.phone || c.phone)}</div>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>${rows}
<tr><td><strong>Total (paid)</strong></td><td></td><td class="r"><strong>${escHtml(money(o.total))}</strong></td></tr></tbody></table>
${s.notes ? `<p><strong>Customer notes:</strong> ${escHtml(s.notes)}</p>` : ''}
<script>addEventListener('load',function(){setTimeout(function(){print()},250)})<\/script></body></html>`);
    w.document.close();
  }

  async function viewOrders() {
    const refreshBtn = h('button', {
      class: 'btn ghost', onclick: async () => {
        try { await loadOrders(true); } catch (e) { return toast(e.message, true); }
        route(); toast('Orders refreshed');
      }
    }, '↻ Refresh');
    let shown = [];   // the orders currently listed (filter + search), used by the CSV export
    const csvBtn = h('button', { class: 'btn ghost', onclick: () => (shown.length ? exportCsv(shown) : toast('No orders to export', true)) }, '\u2b07 Export CSV');
    setHead('Orders', csvBtn, refreshBtn);
    if (!ORDERS) {
      view.append(h('p', { class: 'help' }, 'Loading orders…'));
      try { await loadOrders(); } catch (e) {
        if (!onRoute('orders')) return;
        view.replaceChildren(h('div', { class: 'note' }, h('b', null, 'Could not load orders. '), e.message,
          ' If you have just updated the site, publish the latest ', h('code', null, 'firestore.rules'), ' (see SETUP.md).'));
        return;
      }
      if (!onRoute('orders')) return;
      buildNav('orders');
      view.replaceChildren();
    }
    if (!ordersFilter) ordersFilter = ORDERS.some(toVerify) ? 'verify' : 'all';
    const current = ORDER_FILTERS.find(x => x[0] === ordersFilter) || ORDER_FILTERS[ORDER_FILTERS.length - 1];
    view.append(h('div', { class: 'chips' }, ...ORDER_FILTERS.map(([k, label, test]) =>
      h('button', { class: 'chip' + (k === ordersFilter ? ' on' : ''), onclick: () => { ordersFilter = k; route(); } }, label, h('span', null, ORDERS.filter(test).length)))));
    const search = h('input', { type: 'search', class: 'search', placeholder: 'Search order no., name, phone, UTR, city, item\u2026', value: ordersQuery });
    const out = h('div');
    view.append(search, out);
    const drawList = () => {
    const list = ORDERS.filter(current[2]).filter(o => matchesQuery(o, ordersQuery));
    shown = list;
    out.replaceChildren();
    if (!list.length) { out.append(h('div', { class: 'empty' }, ORDERS.length ? 'No orders in this view.' : 'No orders yet.')); return; }
    const head = h('tr', null, ...['Order', 'Placed', 'Customer', 'Items', 'Total', 'UTR', 'Status', ''].map(t => h('th', null, t)));
    const body = list.map(o => {
      const c = o.customer || {};
      const count = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
      return h('tr', null,
        h('td', { class: 'strong nowrap' }, KPay.orderRef(o)),
        h('td', { class: 'nowrap' }, when(o.createdAt)),
        h('td', null, c.name || '—', h('small', { class: 'sub' }, c.phone || c.email || '')),
        h('td', { class: 'clip' }, count + (count === 1 ? ' piece' : ' pieces') + ' · ' + (o.items || []).map(i => i.name).join(', ')),
        h('td', { class: 'nowrap' }, money(o.total)),
        h('td', { class: 'nowrap' }, o.utr || '—'),
        h('td', null, statusPill(o.status)),
        h('td', { class: 'acts' }, h('button', { onclick: () => openOrder(o) }, toVerify(o) ? 'Review' : 'View')));
    });
    out.append(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', null, head), h('tbody', null, body))));
    };
    search.addEventListener('input', () => { ordersQuery = search.value.trim(); drawList(); });
    drawList();
  }

  function openOrder(o) {
    const s = o.shipping || {}, c = o.customer || {}, ref = KPay.orderRef(o);
    const addr = [s.line1, s.line2, [s.city, s.state].filter(Boolean).join(', ') + (s.pin ? ' ' + s.pin : '')].filter(Boolean);
    const dl = rows => h('dl', { class: 'kv' }, ...rows.filter(r => r[1] != null && r[1] !== '').flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    const items = h('table', { class: 'tbl mini' }, h('tbody', null,
      ...(o.items || []).map(i => h('tr', null, h('td', null, i.name), h('td', { class: 'num' }, '× ' + i.qty), h('td', { class: 'num' }, money(i.price * i.qty)))),
      h('tr', { class: 'sum' }, h('td', null, 'Total'), h('td'), h('td', { class: 'num' }, money(o.total)))));

    const note = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Reason shown to the customer if you reject (optional)' });
    note.value = o.status === 'rejected' ? (o.reviewNote || '') : '';
    const track = h('input', { type: 'text', maxlength: 200, placeholder: 'Courier and tracking number (optional)' });
    track.value = o.tracking || '';
    const err = h('p', { class: 'form-err', role: 'alert' });
    const foot = h('div', { class: 'form-foot' });
    const act = async (status, ask) => {
      if (ask && !confirm(ask)) return;
      const btns = [...foot.querySelectorAll('button')];
      btns.forEach(b => { b.disabled = true; });
      err.textContent = '';
      try {
        await api('PUT', `api/admin/orders/${encodeURIComponent(o.uid)}/${encodeURIComponent(o.id)}`, { status, note: note.value, tracking: track.value });
        o.status = status; o.reviewedAt = Date.now(); o.reviewNote = status === 'rejected' ? note.value.trim() : '';
        o.tracking = (status === 'shipped' || status === 'delivered') ? track.value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
        closeModal(1); route();
        toast(status === 'approved' ? 'Approved — the customer’s page now shows it as approved' : 'Order updated');
      } catch (e) { err.textContent = e.message; btns.forEach(b => { b.disabled = false; }); }
    };
    foot.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => closeModal(1) }, 'Close'));
    const paid = KPay.isPaid(o.status);
    if (paid) foot.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => printSlip(o) }, 'Print slip'));
    if (o.status === 'approved') foot.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => act('payment_submitted', `Undo the approval of ${ref}? It goes back to “Verifying payment” for the customer.`) }, 'Undo approval'));
    if (o.status === 'shipped') foot.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => act('approved', `Move ${ref} back to “Approved” (not yet shipped)?`) }, 'Undo shipping'));
    if (!paid && o.status !== 'rejected') foot.append(h('button', { type: 'button', class: 'btn danger', onclick: () => act('rejected') }, 'Reject'));
    if (!paid) foot.append(h('button', { type: 'button', class: 'btn primary', onclick: () => act('approved', `Approve ${ref}? Only do this once ${money(o.total)} has actually arrived in your UPI / bank app.`) }, 'Approve payment'));
    if (o.status === 'approved') foot.append(h('button', { type: 'button', class: 'btn primary', onclick: () => act('shipped') }, 'Mark as shipped'));
    if (o.status === 'shipped') foot.append(h('button', { type: 'button', class: 'btn primary', onclick: () => act('delivered') }, 'Mark as delivered'));
    if (o.status === 'shipped' || o.status === 'delivered') foot.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => act(o.status, null) }, 'Save tracking'));

    const verify = toVerify(o) || o.status === 'awaiting_payment' || o.status === 'rejected';
    showModal(1, 'Order ' + ref, h('div', { class: 'order-detail' },
      h('div', { class: 'od-top' }, statusPill(o.status), h('span', { class: 'help' }, 'Placed ' + when(o.createdAt))),
      verify ? h('div', { class: 'note' }, h('b', null, 'To verify: '), 'look for ', h('b', null, money(o.total)), ' in your UPI / bank app, with the note ', h('b', null, 'Order ' + ref),
        o.utr ? [' or transaction ID ', h('b', null, o.utr)] : '', '.') : null,
      h('h3', null, 'Customer'),
      dl([['Name', c.name], ['Mobile', c.phone ? h('a', { href: KPay.telHref(c.phone) }, c.phone) : ''], ['Email', c.email]]),
      h('h3', null, 'Delivery address'),
      s.line1 ? h('p', { class: 'od-addr' }, ...addr.flatMap((l, i) => (i ? [h('br'), l] : [l]))) : h('p', { class: 'help' }, 'No address on this order.'),
      s.notes ? h('p', { class: 'od-note' }, h('b', null, 'Customer notes: '), s.notes) : null,
      h('h3', null, 'Items'),
      items,
      h('h3', null, 'Payment'),
      dl([['Amount', money(o.total)], ['Shipping details', o.tracking], ['Transaction ID (UTR)', o.utr], ['Marked as paid', o.paidAt ? when(o.paidAt) : ''], ['Last reviewed', o.reviewedAt ? when(o.reviewedAt) : ''], ['Note to customer', o.reviewNote]]),
      !paid ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Rejection note'), note) : null,
      paid ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Shipping details (shown to the customer once shipped)'), track) : null,
      err, foot));
  }

  /* ---------- payment settings ---------- */
  async function viewPayments() {
    setHead('Payment settings');
    view.append(h('p', { class: 'help' }, 'Loading…'));
    let cur;
    try { cur = (await api('GET', 'api/admin/payment')).payment; }
    catch (e) {
      if (!onRoute('payments')) return;
      view.replaceChildren(h('div', { class: 'note' }, 'Could not load payment settings: ' + e.message));
      return;
    }
    if (!onRoute('payments')) return;

    const getters = [];
    const form = h('form', { class: 'form card', novalidate: true });
    SCHEMA.payment.forEach(f => { const fb = buildField(f, cur[f.key]); getters.push([f.key, fb.get]); form.append(fb.row); });
    const err = h('p', { class: 'form-err', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn primary' }, 'Save payment settings');
    form.append(err, h('div', { class: 'form-foot' }, save));

    const preview = h('div', { class: 'card qr-preview' });
    function drawPreview(p) {
      const box = h('div', { class: 'qr-box' });
      if (!p.upiId) box.append(h('p', { class: 'help' }, 'Save a UPI ID to see a test QR code here.'));
      else {
        try {
          box.innerHTML = KPay.qrSvg(KPay.upiLink({ upiId: p.upiId, name: p.payeeName, amount: 1, note: 'Test QR' }));
          box.append(h('p', { class: 'help' }, 'Scan this with a UPI app to check the payee name and UPI ID. It shows ₹1.00 — just cancel the payment screen.'));
        } catch (e) { box.append(h('p', { class: 'help' }, 'The QR library could not load, so the preview is unavailable.')); }
      }
      preview.replaceChildren(h('h3', null, 'Test your QR code'), box);
    }

    form.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = ''; save.disabled = true;
      const body = {};
      getters.forEach(([k, g]) => { body[k] = g(); });
      try { const d = await api('PUT', 'api/admin/payment', body); cur = d.payment; drawPreview(cur); toast('Saved'); }
      catch (ex) { err.textContent = ex.message; }
      save.disabled = false;
    });

    view.replaceChildren(
      h('div', { class: 'note' }, h('b', null, 'How payments work. '), 'There is no payment gateway. At checkout, customers see a QR code with the bill amount already filled in, your UPI ID, and the call-us number below. When a customer says they have paid, the order shows up under ',
        h('a', { href: '#orders' }, 'Orders'), ' as “Needs verification”. Check your UPI / bank app, then approve it — the customer’s page changes to Approved.'),
      h('div', { class: 'pay-grid' }, form, preview));
    drawPreview(cur);
  }

  /* ---------- security ---------- */
  function viewSecurity() {
    setHead('Security');
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'form-err', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn primary' }, 'Change password');
    const form = h('form', { class: 'form card', style: 'max-width:480px', novalidate: true },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Current password'), cur),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'New password'), n1, h('small', { class: 'help' }, 'At least 8 characters. Use something long and unique.')),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Repeat new password'), n2), err, btn);
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      if (n1.value !== n2.value) { err.textContent = 'The new passwords do not match.'; return; }
      btn.disabled = true;
      try { await api('POST', 'api/admin/password', { current: cur.value, next: n1.value }); form.reset(); toast('Password changed'); }
      catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });
    view.append(form, h('p', { class: 'help', style: 'margin-top:1rem' }, 'You are signed in with your Firebase admin account. The session ends when you close this browser tab.'));
  }

  /* ---------- boot ---------- */
  $('#logout').addEventListener('click', async () => {
    try { await api('POST', 'api/admin/logout'); } catch (e) { /* ignore */ }
    location.href = 'index.html';
  });
  (async function boot() {
    try {
      SCHEMA = await api('GET', 'api/admin/schema');
      DATA = await api('GET', 'api/admin/data');
    } catch (e) {
      if (e.message !== 'Signed out') document.body.textContent = 'Could not load the admin: ' + e.message;
      return;
    }
    try { await loadOrders(); } catch (e) { ORDERS = null; }   // not fatal: the Orders page shows the error
    addEventListener('hashchange', route);
    route();
  })();
})();
