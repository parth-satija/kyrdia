/* =========================================================
   KRIDIA — Sign in + Firestore backend
   Loads AFTER script.js (shares its `cart`, `renderCart`, `byId`, `toast`).
   Uses the Firebase v10 modular SDK from Google's CDN — no build step.

   Firestore data model
     users/{uid}                 profile + synced bag
     users/{uid}/orders/{id}     placed orders (status: 'pending')
     subscribers/{email}         newsletter sign-ups
   ========================================================= */
(function () {
  'use strict';

  const FIREBASE_VERSION = '10.14.1';
  const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

  const $ = (s, el = document) => el.querySelector(s);
  const cfg = window.KRIDIA_FIREBASE_CONFIG;
  const configured = !!(cfg && cfg.apiKey && cfg.projectId && !/^YOUR_/.test(cfg.apiKey) && !/^YOUR_/.test(cfg.projectId));

  /* ---------- DOM ---------- */
  const acctBtn = $('#acctOpen');
  const overlay = $('#authOverlay');
  const modal = $('#authModal');
  const guestView = $('#authGuest');
  const userView = $('#authUser');
  const form = $('#authForm');
  const msg = $('#authMsg');
  const submitBtn = $('#authSubmit');
  const nameField = $('#authNameField');
  const nameInput = $('#authName');
  const emailInput = $('#authEmail');
  const passInput = $('#authPass');
  const forgotBtn = $('#authForgot');
  const googleBtn = $('#authGoogle');
  const titleEl = $('#authTitle');
  const subEl = $('#authSub');

  /* ---------- State ---------- */
  let A = null;            // firebase-auth module
  let F = null;            // firebase-firestore module
  let auth = null, db = null;
  let user = null;
  let ready = false;
  let mode = 'signin';
  let pendingName = '';    // display name captured during sign-up
  let freshSignIn = false; // true when the user just typed credentials / used Google
  let cloudReady = false;  // true once the cloud bag has been merged
  let applying = false;    // true while we write the cart ourselves (avoid echo)
  let prevUid = null;
  let pushTimer;

  /* ---------- Modal helpers ---------- */
  function setMsg(text, ok) {
    msg.textContent = text || '';
    msg.classList.toggle('ok', !!ok);
  }
  function setBusy(b) {
    [submitBtn, googleBtn, forgotBtn].forEach(el => { el.disabled = b; });
    submitBtn.classList.toggle('busy', b);
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.auth-tab').forEach(t => {
      const on = t.dataset.mode === m;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const signup = m === 'signup';
    nameField.hidden = !signup;
    forgotBtn.hidden = signup;
    submitBtn.textContent = signup ? 'Create account' : 'Sign in';
    passInput.autocomplete = signup ? 'new-password' : 'current-password';
    titleEl.textContent = signup ? 'Join the Maison' : 'Welcome back';
    subEl.textContent = signup
      ? 'Create an account to save your bag and follow your orders.'
      : 'Sign in to open your saved bag and your orders.';
    setMsg('');
  }
  function openModal(m) {
    if (!user) setMode(m || 'signin');
    renderAccountUI();
    modal.classList.add('open');
    overlay.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const target = user ? $('#authSignOut') : (mode === 'signup' ? nameInput : emailInput);
      if (target) target.focus();
    }, 60);
  }
  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    setMsg('');
  }

  /* ---------- Friendly errors ---------- */
  const ERRORS = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/weak-password': 'Please choose a stronger password (8 characters or more).',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-disabled': 'This account has been disabled. Please contact us.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled yet in the Firebase console.',
    'auth/unauthorized-domain': 'This domain isn’t authorised. Add it in Firebase → Authentication → Settings → Authorized domains.',
    'auth/popup-blocked': 'Your browser blocked the Google pop-up. Please allow pop-ups and try again.'
  };
  const friendly = err => ERRORS[err && err.code] || 'Something went wrong. Please try again.';

  /* ---------- Cart helpers (cart / byId come from script.js) ---------- */
  const serializeCart = list =>
    list.filter(i => byId(i.id)).map(i => ({ id: i.id, qty: i.qty }));

  function mergeCarts(a, b) {
    const map = new Map();
    [...a, ...b].forEach(i => {
      const id = Number(i && i.id), qty = Math.floor(Number(i && i.qty));
      if (!byId(id) || !(qty > 0)) return;
      map.set(id, Math.min(99, Math.max(map.get(id) || 0, qty)));
    });
    return [...map].map(([id, qty]) => ({ id, qty }));
  }
  function setLocalCart(next) {
    applying = true;
    cart = next;
    renderCart();
    applying = false;
  }

  /* Wrap renderCart so every cart change is synced while signed in. */
  const originalRenderCart = renderCart;
  renderCart = function () {
    const r = originalRenderCart.apply(this, arguments);
    if (!applying) queuePush();
    return r;
  };

  function queuePush() {
    if (!user || !cloudReady) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushCart, 700);
  }
  async function pushCart() {
    if (!user || !cloudReady) return;
    try {
      await F.setDoc(F.doc(db, 'users', user.uid),
        { cart: serializeCart(cart), updatedAt: F.serverTimestamp() }, { merge: true });
    } catch (e) { console.error('Kridia: bag sync failed', e); }
  }

  /* ---------- Firestore: profile + bag ---------- */
  async function ensureProfile(u) {
    const ref = F.doc(db, 'users', u.uid);
    const snap = await F.getDoc(ref);
    if (snap.exists()) return snap.data();
    const data = {
      displayName: u.displayName || pendingName || '',
      email: u.email || '',
      cart: serializeCart(cart),
      createdAt: F.serverTimestamp(),
      updatedAt: F.serverTimestamp()
    };
    await F.setDoc(ref, data);
    return { ...data, cart: data.cart };
  }

  async function syncCartDown(profile) {
    const remote = Array.isArray(profile.cart) ? profile.cart : [];
    // Fresh sign-in: combine the guest bag with the saved one.
    // Session restore (page reload): the saved bag is the source of truth.
    const next = freshSignIn ? mergeCarts(cart, remote) : mergeCarts([], remote);
    freshSignIn = false;
    setLocalCart(next);
    cloudReady = true;
    pushCart();
  }

  /* ---------- Account UI ---------- */
  function initialOf(u) {
    return ((u.displayName || u.email || '?').trim()[0] || '?').toUpperCase();
  }
  function renderAccountUI() {
    const signedIn = !!user;
    guestView.hidden = signedIn;
    userView.hidden = !signedIn;
    acctBtn.classList.toggle('signed-in', signedIn);
    acctBtn.setAttribute('aria-label', signedIn ? 'Your account' : 'Sign in');
    $('.acct-initial', acctBtn).textContent = signedIn ? initialOf(user) : '';
    if (signedIn) {
      $('#authAvatar').textContent = initialOf(user);
      $('#authUserName').textContent = user.displayName || 'Welcome';
      $('#authUserEmail').textContent = user.email || '';
      loadOrders();
    }
  }

  async function loadOrders() {
    const list = $('#orderList');
    const uid = user && user.uid;
    list.textContent = 'Loading your orders…';
    try {
      const q = F.query(F.collection(db, 'users', uid, 'orders'), F.orderBy('createdAt', 'desc'), F.limit(10));
      const snap = await F.getDocs(q);
      if (!user || user.uid !== uid) return;
      list.textContent = '';
      if (snap.empty) { list.textContent = 'No orders yet. Your first bridal piece awaits.'; return; }
      snap.forEach(d => {
        const o = d.data();
        const when = o.createdAt && o.createdAt.toDate
          ? o.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        const count = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
        const row = document.createElement('div');
        row.className = 'order-row';
        const left = document.createElement('div');
        const t = document.createElement('strong');
        t.textContent = `${count} ${count === 1 ? 'piece' : 'pieces'} · ${fmt(o.total || 0)}`;
        const s = document.createElement('small');
        s.textContent = (o.items || []).map(i => i.name).join(', ');
        left.append(t, s);
        const right = document.createElement('div');
        right.className = 'order-meta';
        const st = document.createElement('span');
        st.className = 'order-status';
        st.textContent = o.status || 'pending';
        const dt = document.createElement('small');
        dt.textContent = when;
        right.append(st, dt);
        row.append(left, right);
        list.append(row);
      });
    } catch (e) {
      console.error('Kridia: could not load orders', e);
      list.textContent = 'We couldn’t load your orders right now.';
    }
  }

  /* ---------- Auth actions ---------- */
  /* ---------- Admin sign-in (email "Admin" + admin password) ---------- */
  async function adminLogin(pass) {
    setMsg('');
    if (!pass) return setMsg('Please enter your password.');
    setBusy(true);
    try {
      await KStore.signInAdmin(pass);
      setMsg('Welcome, Admin. Opening the dashboard…', true);
      location.href = 'admin.html';
    } catch (err) {
      setMsg(err.message || 'Incorrect email or password.');
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    const pass = passInput.value;
    const name = nameInput.value.trim();
    if (mode === 'signin' && email.toLowerCase() === 'admin') return adminLogin(pass);
    if (!ready) return setMsg('Sign in is not available right now. Please try again shortly.');
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('Please enter a valid email address.');
    if (mode === 'signup') {
      if (!name) return setMsg('Please tell us your name.');
      if (pass.length < 8) return setMsg('Please choose a password of at least 8 characters.');
    } else if (!pass) {
      return setMsg('Please enter your password.');
    }
    setBusy(true);
    try {
      freshSignIn = true;
      if (mode === 'signup') {
        pendingName = name;
        const cred = await A.createUserWithEmailAndPassword(auth, email, pass);
        await A.updateProfile(cred.user, { displayName: name });
        user = auth.currentUser;
        renderAccountUI();
      } else {
        await A.signInWithEmailAndPassword(auth, email, pass);
      }
      form.reset();
      closeModal();
      toast(mode === 'signup' ? 'Welcome to Kridia' : 'Welcome back');
    } catch (err) {
      freshSignIn = false;
      setMsg(friendly(err));
    } finally {
      pendingName = '';
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!ready) return;
    setMsg('');
    setBusy(true);
    try {
      freshSignIn = true;
      await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      closeModal();
      toast('Welcome to Kridia');
    } catch (err) {
      freshSignIn = false;
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') setMsg(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot() {
    if (!ready) return;
    const email = emailInput.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('Enter your email above, then tap “Forgot password”.');
    setBusy(true);
    try {
      await A.sendPasswordResetEmail(auth, email);
      setMsg('If an account exists for that email, a reset link is on its way.', true);
    } catch (err) {
      // Don’t reveal whether the account exists.
      if (err.code === 'auth/network-request-failed' || err.code === 'auth/too-many-requests') setMsg(friendly(err));
      else setMsg('If an account exists for that email, a reset link is on its way.', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      clearTimeout(pushTimer);
      await pushCart();
      await A.signOut(auth);
      closeModal();
      toast('You’ve been signed out');
    } catch (err) {
      toast('Could not sign out. Please try again.');
    }
  }

  /* ---------- Checkout (creates a pending order) ---------- */
  function wireCheckout() {
    const old = $('#checkoutBtn');
    const btn = old.cloneNode(true);   // drops script.js’s “coming soon” handler
    old.replaceWith(btn);
    btn.addEventListener('click', async () => {
      if (!cart.length) return toast('Your bag is empty');
      if (!user) {
        closeCart();
        openModal('signin');
        setMsg('Please sign in to place your order.');
        return;
      }
      btn.disabled = true;
      try {
        const items = cart.map(i => {
          const p = byId(i.id);
          return { id: p.id, name: p.name, price: p.price, qty: i.qty };
        });
        const total = items.reduce((s, i) => s + i.price * i.qty, 0);
        await F.addDoc(F.collection(db, 'users', user.uid, 'orders'), {
          items, total, currency: 'INR', status: 'pending', createdAt: F.serverTimestamp()
        });
        clearTimeout(pushTimer);
        cart = [];
        renderCart();
        closeCart();
        toast('Order received — we’ll be in touch to confirm');
      } catch (err) {
        console.error('Kridia: order failed', err);
        toast('We couldn’t place your order. Please try again.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Newsletter → Firestore ---------- */
  function wireNewsletter() {
    const old = $('#newsForm');
    const f = old.cloneNode(true);     // drops script.js’s local-only handler
    old.replaceWith(f);
    const out = $('#newsMsg');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#newsEmail').value.trim().toLowerCase();
      if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(email)) { out.textContent = 'Please enter a valid email address.'; return; }
      const btn = $('button', f);
      btn.disabled = true;
      try {
        const data = { email, createdAt: F.serverTimestamp() };
        if (user) data.uid = user.uid;
        await F.setDoc(F.doc(db, 'subscribers', email), data);
        out.textContent = sv('newsletter.success', 'Thank you for subscribing.');
        f.reset();
      } catch (err) {
        // Rules block overwriting an existing subscriber, which surfaces as permission-denied.
        out.textContent = err.code === 'permission-denied'
          ? 'You’re already on our list. Thank you!'
          : 'We couldn’t subscribe you right now. Please try again.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Wiring ---------- */
  acctBtn.addEventListener('click', () => openModal());
  $('#authClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  form.addEventListener('submit', handleSubmit);
  googleBtn.addEventListener('click', () => (ready ? handleGoogle() : setMsg('Sign in is not available right now. Please try again shortly.')));
  forgotBtn.addEventListener('click', () => (ready ? handleForgot() : setMsg('Sign in is not available right now. Please try again shortly.')));
  $('#authSignOut').addEventListener('click', handleSignOut);
  setMode('signin');

  /* ---------- Boot ---------- */
  if (!configured) {
    console.warn('Kridia: Firebase isn’t configured yet. Fill in firebase-config.js (see SETUP.md).');
    return;
  }

  (async function init() {
    try {
      await window.kridiaReady;   // product data must be loaded before the bag is synced
      const [appM, authM, fsM] = await Promise.all([
        import(CDN + 'firebase-app.js'),
        import(CDN + 'firebase-auth.js'),
        import(CDN + 'firebase-firestore.js')
      ]);
      A = authM; F = fsM;
      const app = appM.initializeApp(cfg);
      auth = A.getAuth(app);
      db = F.getFirestore(app);
      ready = true;
      wireCheckout();
      wireNewsletter();

      A.onAuthStateChanged(auth, async u => {
        if (KStore.isAdminUser(u)) {   // the admin signs in here too, but is not a shopper: no bag/profile sync
          user = null; cloudReady = false; clearTimeout(pushTimer);
          renderAccountUI();
          return;
        }
        user = u;
        renderAccountUI();
        if (u) {
          prevUid = u.uid;
          try {
            const profile = await ensureProfile(u);
            if (user && user.uid === u.uid) await syncCartDown(profile);
          } catch (err) {
            console.error('Kridia: profile/bag sync failed', err);
            toast('Signed in, but we couldn’t sync your bag');
          }
        } else {
          cloudReady = false;
          clearTimeout(pushTimer);
          if (prevUid) { setLocalCart([]); prevUid = null; }  // don’t leave a signed-out user’s bag behind
        }
      });
    } catch (err) {
      console.error('Kridia: could not load Firebase', err);
      toast('Sign in is unavailable right now');
    }
  })();
})();
