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
  let SCHEMA, DATA;
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
        input = h('input', { type: 'text', maxlength: f.max }); input.value = val == null ? '' : val; get = () => input.value; break;
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
    const items = [['overview', 'Overview'], ...Object.entries(SCHEMA.collections).map(([k, d]) => [k, d.label, DATA.collections[k].length]), null, ...NAV_EXTRA];
    $('#nav').replaceChildren(...items.map(it => it
      ? h('a', { href: '#' + it[0], class: it[0] === cur ? 'on' : '' }, it[1], it[2] != null ? h('span', { class: 'count' }, it[2]) : null)
      : h('hr')));
  }
  function route() {
    const name = location.hash.slice(1) || 'overview';
    buildNav(name);
    view.replaceChildren();
    if (SCHEMA.collections[name]) viewCollection(name);
    else if (name === 'settings') viewSettings();
    else if (name === 'images') viewImages();
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
        ', then add ', h('a', { href: '#listings' }, 'listings'), '. Remember to change the admin password under ', h('a', { href: '#security' }, 'Security'), '.'),
      h('div', { class: 'cards' }, ...Object.entries(SCHEMA.collections).map(([k, d]) =>
        h('a', { class: 'card stat', href: '#' + k }, h('strong', null, DATA.collections[k].length), h('span', null, d.label)))));
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
    addEventListener('hashchange', route);
    route();
  })();
})();
