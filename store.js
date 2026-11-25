/* =========================================================
   KRIDIA — Firebase data layer (no server needed → works on GitHub Pages)

   Firestore layout
     site/settings              website text + image references
     listings|categories|artisans|reviews|journal / {id}
     imageThumbs/{imageId}      small preview  (data URL)  — shown on cards, admin
     imageFull/{imageId}        large version  (data URL)  — hero, gallery
   Images are referenced everywhere as  "images/<imageId>"  (same as before).

   Exposes:
     window.KStore  — used by the public pages (loadPublic, image, admin sign-in)
     window.KAdmin  — used by admin.js (same "API" routes as the old server)
   Loads after firebase-config.js and schema.js.
   ========================================================= */
(function () {
  'use strict';

  const FIREBASE_VERSION = '10.14.1';
  const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const S = window.KSchema;
  const cfg = window.KRIDIA_FIREBASE_CONFIG || {};
  const ADMIN_EMAIL = String(window.KRIDIA_ADMIN_EMAIL || '').trim().toLowerCase();
  const COLS = Object.keys(S.COLLECTIONS);
  const ord = (a, b) => ((a.order != null ? a.order : a.id) - (b.order != null ? b.order : b.id)) || (a.id - b.id);
  const isAdminUser = u => !!(u && ADMIN_EMAIL && String(u.email || '').toLowerCase() === ADMIN_EMAIL);

  /* ---------- Firebase (loaded once, on demand) ---------- */
  let fbPromise = null;
  function fb() {
    if (!fbPromise) {
      fbPromise = (async () => {
        if (!cfg.apiKey || !cfg.projectId || /^YOUR_/.test(cfg.apiKey)) throw new Error('Firebase is not configured (see firebase-config.js).');
        const [appM, A, F] = await Promise.all([
          import(CDN + 'firebase-app.js'),
          import(CDN + 'firebase-auth.js'),
          import(CDN + 'firebase-firestore.js')
        ]);
        const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(cfg);
        return { app, A, F, auth: A.getAuth(app), db: F.getFirestore(app) };
      })();
      fbPromise.catch(() => { fbPromise = null; });
    }
    return fbPromise;
  }

  /* =========================================================
     PUBLIC (storefront)
     ========================================================= */
  async function loadPublic() {
    const { F, db } = await fb();
    const read = n => (n === 'listings'
      ? F.getDocs(F.query(F.collection(db, n), F.where('published', '==', true)))
      : F.getDocs(F.collection(db, n)));
    const [sSnap, pSnap, ...snaps] = await Promise.all([F.getDoc(F.doc(db, 'site', 'settings')), F.getDoc(F.doc(db, 'site', 'payment')), ...COLS.map(read)]);
    const out = {
      settings: S.cleanSettings(sSnap.exists() ? sSnap.data() : {}, { hasId: () => true }, true),
      payment: S.cleanPayment(pSnap.exists() ? pSnap.data() : {}, true)   // UPI ID, payee name, call-us number
    };
    COLS.forEach((n, i) => {
      out[n] = snaps[i].docs.map(d => d.data()).filter(x => Number.isInteger(x.id)).sort(ord);
    });
    return out;
  }

  const imgCache = new Map();
  /** Resolve "images/<id>" to a data URL. kind: 'thumb' | 'full'. Returns '' if missing. */
  function image(path, kind) {
    kind = kind === 'full' ? 'full' : 'thumb';
    const key = kind + ':' + path;
    if (!imgCache.has(key)) {
      imgCache.set(key, (async () => {
        if (!S.isImg(path)) return '';
        try {
          const { F, db } = await fb();
          const s = await F.getDoc(F.doc(db, kind === 'full' ? 'imageFull' : 'imageThumbs', path.slice(7)));
          return s.exists() && typeof s.data().data === 'string' ? s.data().data : '';
        } catch (e) { console.warn('Kridia: could not load image', path, e); return ''; }
      })());
    }
    return imgCache.get(key);
  }

  const AUTH_ERRORS = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/invalid-email': 'Incorrect email or password.',
    'auth/missing-password': 'Please enter your password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in the Firebase console.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/unauthorized-domain': 'This website address is not authorised. Add it in Firebase → Authentication → Settings → Authorized domains.'
  };
  /** "Admin" + password → Firebase Authentication (session only: signs out when the tab closes). */
  async function signInAdmin(pass) {
    if (!ADMIN_EMAIL) throw new Error('Admin email is not set in firebase-config.js.');
    const { A, auth } = await fb();
    try { await A.setPersistence(auth, A.browserSessionPersistence); } catch (e) { /* use default */ }
    try {
      await A.signInWithEmailAndPassword(auth, ADMIN_EMAIL, pass);
    } catch (e) {
      throw new Error(AUTH_ERRORS[e && e.code] || 'Could not sign in. Please try again.');
    }
  }

  window.KStore = { loadPublic, image, signInAdmin, isAdminUser, fb };

  /* =========================================================
     ADMIN (dashboard) — mirrors the old /api/admin/* routes
     ========================================================= */
  const cols = {};          // in-memory copy of every collection (loaded once)
  let settings = null;      // current settings object
  const THUMBS = new Map(); // "images/<id>" → thumbnail data URL
  let imageList = null;     // [{name,path,thumb,size,mtime,label}]
  let adminP = null;

  function whenAdmin() {
    if (!adminP) {
      adminP = (async () => {
        const { A, auth } = await fb();
        const user = await new Promise(res => { const off = A.onAuthStateChanged(auth, u => { off(); res(u); }); });
        if (!isAdminUser(user)) { location.replace('index.html'); throw new Error('Signed out'); }
        return user;
      })();
    }
    return adminP;
  }
  const ctx = () => ({ hasId: (c, id) => (cols[c] || []).some(i => i.id === id) });
  const ref = (F, db, n, id) => F.doc(db, n, String(id));

  async function loadAll() {
    const { F, db } = await fb();
    if (!settings) {
      const [sSnap, ...snaps] = await Promise.all([F.getDoc(F.doc(db, 'site', 'settings')), ...COLS.map(n => F.getDocs(F.collection(db, n)))]);
      settings = S.cleanSettings(sSnap.exists() ? sSnap.data() : {}, { hasId: () => true }, true);
      COLS.forEach((n, i) => { cols[n] = snaps[i].docs.map(d => d.data()).filter(x => Number.isInteger(x.id)).sort(ord); });
    }
    await loadImages();
  }
  async function loadImages() {
    if (imageList) return imageList;
    const { F, db } = await fb();
    const snap = await F.getDocs(F.collection(db, 'imageThumbs'));
    imageList = snap.docs.map(d => {
      const x = d.data();
      THUMBS.set('images/' + d.id, x.data || '');
      return { name: d.id, label: x.label || d.id, path: 'images/' + d.id, thumb: x.data || '', size: x.size || 0, mtime: x.createdAt || 0 };
    }).sort((a, b) => b.mtime - a.mtime);
    return imageList;
  }

  /* ---------- Image processing (resize + compress in the browser) ---------- */
  const WEBP = (() => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { return false; } })();
  function encode(bmp, maxDim, quality, maxChars) {
    let dim = maxDim;
    for (let round = 0; round < 6; round++) {
      const scale = Math.min(1, dim / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (!WEBP) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
      g.drawImage(bmp, 0, 0, w, h);
      for (let q = quality; q >= 0.4; q -= 0.1) {
        const url = WEBP ? c.toDataURL('image/webp', q) : c.toDataURL('image/jpeg', q);
        if (url.length <= maxChars) return url;
      }
      dim = Math.round(dim * 0.8);
    }
    throw new Error('That image is too detailed to store. Try a smaller photo.');
  }
  async function processImage(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error(file.name + ' could not be read as an image.'); }
    try {
      return { full: encode(bmp, 1500, 0.82, 900000), thumb: encode(bmp, 640, 0.74, 110000) };
    } finally { if (bmp.close) bmp.close(); }
  }

  async function scrubImage(rel) {
    const { F, db } = await fb();
    const batch = F.writeBatch(db);
    let n = 0;
    for (const [cn, def] of Object.entries(S.COLLECTIONS)) {
      for (const it of cols[cn]) {
        const patch = {};
        for (const f of def.fields) {
          if (f.type === 'image' && it[f.key] === rel) patch[f.key] = '';
          else if (f.type === 'images' && Array.isArray(it[f.key]) && it[f.key].includes(rel)) patch[f.key] = it[f.key].filter(x => x !== rel);
        }
        if (Object.keys(patch).length) { Object.assign(it, patch); batch.update(ref(F, db, cn, it.id), patch); n++; }
      }
    }
    let sChanged = false;
    for (const g of S.SETTINGS_GROUPS) for (const f of g.fields) {
      if (f.type === 'image' && S.getPath(settings, f.key) === rel) { S.setPath(settings, f.key, ''); sChanged = true; }
    }
    if (sChanged) { batch.set(F.doc(db, 'site', 'settings'), settings); n++; }
    if (n) await batch.commit();
  }

  async function call(method, url, body, raw) {
    await whenAdmin();
    const { A, F, auth, db } = await fb();
    let m;

    if (url === 'api/admin/schema') return { collections: S.COLLECTIONS, settings: S.SETTINGS_GROUPS, payment: S.PAYMENT_FIELDS };
    if (url === 'api/admin/data') {
      await loadAll();
      return { settings, collections: Object.fromEntries(COLS.map(n => [n, cols[n]])) };
    }
    if (url === 'api/admin/logout') { await A.signOut(auth); return { ok: true }; }

    /* ---- Payments + orders (no need to load the whole catalogue for these) ---- */
    if (url === 'api/admin/payment') {
      const pref = F.doc(db, 'site', 'payment');
      if (method === 'GET') {
        const s = await F.getDoc(pref);
        return { payment: S.cleanPayment(s.exists() ? s.data() : {}, true) };
      }
      if (method === 'PUT') {
        const clean = S.cleanPayment(body, false);
        await F.setDoc(pref, clean);
        return { payment: clean };
      }
    }
    if (url === 'api/admin/orders' && method === 'GET') {
      // Every customer's orders live at users/{uid}/orders/{id}; the admin reads them as a collection group.
      const snap = await F.getDocs(F.collectionGroup(db, 'orders'));
      const ms = t => (t && t.toMillis ? t.toMillis() : 0);
      const orders = snap.docs.map(d => {
        const x = d.data();
        return { ...x, id: d.id, uid: d.ref.parent.parent.id, createdAt: ms(x.createdAt), paidAt: ms(x.paidAt), reviewedAt: ms(x.reviewedAt) };
      }).sort((a, b) => b.createdAt - a.createdAt);
      return { orders };
    }
    if ((m = /^api\/admin\/orders\/([^/]+)\/([^/]+)$/.exec(url)) && method === 'PUT') {
      const status = body && body.status;
      if (!['awaiting_payment', 'payment_submitted', 'approved', 'rejected', 'shipped', 'delivered'].includes(status)) throw new Error('Unknown order status.');
      const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
      const note = status === 'rejected' ? clean(body.note).slice(0, 300) : '';
      const patch = { status, reviewedAt: F.serverTimestamp(), reviewNote: note };
      // Courier / tracking details are kept while the order is shipped or delivered, and cleared otherwise.
      if (status === 'shipped' || status === 'delivered') patch.tracking = clean(body.tracking).slice(0, 200);
      else patch.tracking = '';
      await F.updateDoc(F.doc(db, 'users', decodeURIComponent(m[1]), 'orders', decodeURIComponent(m[2])), patch);
      return { ok: true };
    }

    await loadAll();

    if (url === 'api/admin/settings' && method === 'PUT') {
      const clean = S.cleanSettings(body, ctx(), false);
      await F.setDoc(F.doc(db, 'site', 'settings'), clean);
      settings = clean;
      return { settings: clean };
    }

    if ((m = /^api\/admin\/c\/([a-z]+)(?:\/(\d+))?(?:\/(move))?$/.exec(url))) {
      const name = m[1];
      if (!S.COLLECTIONS[name]) throw new Error('Unknown collection');
      const id = m[2] ? Number(m[2]) : null;
      const list = cols[name];

      if (!id && method === 'POST') {
        const clean = S.cleanItem(name, body, ctx());
        let nid = Date.now();
        while (list.some(i => i.id === nid)) nid++;
        const now = new Date().toISOString();
        const item = { id: nid, ...clean, order: nid, createdAt: now, updatedAt: now };
        await F.setDoc(ref(F, db, name, nid), item);
        list.push(item); list.sort(ord);
        return { item };
      }
      if (id && !m[3] && method === 'PUT') {
        const idx = list.findIndex(i => i.id === id);
        if (idx < 0) throw new Error('Not found');
        const clean = S.cleanItem(name, body, ctx());
        const item = { ...list[idx], ...clean, id, updatedAt: new Date().toISOString() };
        await F.setDoc(ref(F, db, name, id), item);
        list[idx] = item;
        return { item };
      }
      if (id && !m[3] && method === 'DELETE') {
        const idx = list.findIndex(i => i.id === id);
        if (idx < 0) throw new Error('Not found');
        const batch = F.writeBatch(db);
        batch.delete(ref(F, db, name, id));
        for (const [cn, def] of Object.entries(S.COLLECTIONS)) {
          const refs = def.fields.filter(f => f.type === 'ref' && f.ref === name);
          for (const it of cols[cn]) {
            const patch = {};
            refs.forEach(f => { if (it[f.key] === id) patch[f.key] = null; });
            if (Object.keys(patch).length) { Object.assign(it, patch); batch.update(ref(F, db, cn, it.id), patch); }
          }
        }
        await batch.commit();
        list.splice(idx, 1);
        return { ok: true };
      }
      if (id && m[3] === 'move' && method === 'POST') {
        const i = list.findIndex(x => x.id === id);
        const j = i + (body && body.dir === -1 ? -1 : 1);
        if (i < 0) throw new Error('Not found');
        if (j >= 0 && j < list.length) {
          const a = list[i], b = list[j];
          const oa = a.order != null ? a.order : a.id, ob = b.order != null ? b.order : b.id;
          const batch = F.writeBatch(db);
          batch.update(ref(F, db, name, a.id), { order: ob });
          batch.update(ref(F, db, name, b.id), { order: oa });
          await batch.commit();
          a.order = ob; b.order = oa;
          list.sort(ord);
        }
        return { ok: true };
      }
      throw new Error('Unsupported request');
    }

    if (url === 'api/admin/upload' && method === 'POST') {
      const file = raw && raw.body;
      if (!file || !/^image\//.test(file.type || '')) throw new Error('Only image files are allowed.');
      let label = '';
      try { label = decodeURIComponent((raw.headers && raw.headers['X-Filename']) || ''); } catch (e) { /* ignore */ }
      const { full, thumb } = await processImage(file);
      const base = label.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
      const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('');
      const id = `${Date.now().toString(36)}-${rnd}-${base}`;
      const createdAt = Date.now(), size = Math.round(full.length * 0.75);
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'imageThumbs', id), { data: thumb, label: label || id, size, createdAt });
      batch.set(F.doc(db, 'imageFull', id), { data: full, createdAt });
      await batch.commit();
      const path = 'images/' + id;
      THUMBS.set(path, thumb);
      imageList.unshift({ name: id, label: label || id, path, thumb, size, mtime: createdAt });
      return { name: id, path, size };
    }
    if (url === 'api/admin/images' && method === 'GET') return { images: imageList };
    if ((m = /^api\/admin\/images\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url)) && method === 'DELETE') {
      const id = m[1], path = 'images/' + id;
      const batch = F.writeBatch(db);
      batch.delete(F.doc(db, 'imageThumbs', id));
      batch.delete(F.doc(db, 'imageFull', id));
      await batch.commit();
      THUMBS.delete(path);
      imageList = imageList.filter(x => x.name !== id);
      await scrubImage(path);
      return { ok: true };
    }

    if (url === 'api/admin/password' && method === 'POST') {
      const cur = body && typeof body.current === 'string' ? body.current : '';
      const next = body && typeof body.next === 'string' ? body.next : '';
      if (next.length < 8 || next.length > 200) throw new Error('Choose a new password of at least 8 characters.');
      const user = auth.currentUser;
      try {
        await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, cur));
      } catch (e) {
        throw new Error(e && e.code === 'auth/too-many-requests' ? AUTH_ERRORS['auth/too-many-requests'] : 'Your current password is incorrect.');
      }
      await A.updatePassword(user, next);
      return { ok: true };
    }

    throw new Error('Unsupported request');
  }

  window.KAdmin = { call, thumb: p => THUMBS.get(p) || '' };
})();
