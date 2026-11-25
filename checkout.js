/* =========================================================
   KRIDIA — Checkout  (checkout.html)

   bag (bill) → delivery details → UPI payment page

   No payment gateway. The customer pays by scanning a UPI QR code (the amount
   is already filled in), then taps "I've paid". The admin checks the payment
   in their own UPI / bank app and approves the order from the admin page;
   this page listens to the order live, so it flips to "Approved" by itself.

   Firestore: users/{uid}/orders/{id}
     orderNo, items[{id,name,price,qty}], total, currency, status,
     customer{name,phone,email}, shipping{...}, createdAt,
     utr?, paidAt?, reviewedAt?, reviewNote?
   Rules: firestore.rules.  Loads after common.js + payment.js, before auth.js.
   ========================================================= */
(function () {
  'use strict';

  const body = $('#coBody'), stepsEl = $('#steps');

  const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
    'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
  const PHONE_RE = /^[6-9]\d{9}$/, PIN_RE = /^[1-9]\d{5}$/, UTR_RE = /^\d{12}$/;
  const UPI_LIMIT = 100000;   // many banks cap a single UPI payment at ₹1,00,000

  const round2 = n => Math.round(n * 100) / 100;
  const digits = s => String(s || '').replace(/\D/g, '');
  function normPhone(s) {
    let d = digits(s);
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  }

  /* ---------- State ---------- */
  let auth = (window.KAuth && KAuth.state) || null;   // { user, admin } — set by auth.js
  let ready = false;                                  // site data loaded
  let step = 'bill';                                  // bill | delivery | pay
  let order = null;                                   // the order shown on the payment step
  let orderId = new URLSearchParams(location.search).get('order');
  let form = {};                                      // delivery fields, kept while moving between steps
  let utrDraft = '';
  let unwatch = null;
  let busy = false;

  /* ---------- Saved delivery address (this browser only) ---------- */
  const addrKey = () => 'kridia-addr-' + auth.user.uid;
  function savedAddress() { try { return JSON.parse(localStorage.getItem(addrKey())) || {}; } catch (e) { return {}; } }
  function saveAddress(v) { try { const { notes, ...rest } = v; localStorage.setItem(addrKey(), JSON.stringify(rest)); } catch (e) { /* ignore */ } }

  /* ---------- Bag helpers ---------- */
  const lines = () => cart.map(i => ({ p: byId(i.id), qty: i.qty })).filter(l => l.p);
  const totalOf = ls => round2(ls.reduce((s, l) => s + l.p.price * l.qty, 0));

  /* ---------- Small view helpers ---------- */
  const show = html => { body.innerHTML = html; };
  function setSteps(allDone) {
    const idx = allDone ? 3 : { bill: 0, delivery: 1, pay: 2 }[step];
    stepsEl.hidden = false;
    stepsEl.innerHTML = ['Your bag', 'Delivery', 'Payment'].map((n, i) =>
      `<li class="step${i === idx ? ' on' : i < idx ? ' done' : ''}"><b>${i < idx ? '✓' : i + 1}</b><span>${n}</span></li>`).join('');
  }
  const notice = (cls, html) => `<div class="co-alert ${cls || ''}">${html}</div>`;
  const msg = text => { const el = $('#coMsg'); if (el) el.textContent = text || ''; };
  const setBusy = (b, sel) => { busy = b; const el = $(sel); if (el) el.disabled = b; };

  /** "Call us" line — the number is set under Admin → Payment settings. */
  function callUs(lead) {
    const ph = PAYMENT.phone;
    if (!ph) return '';
    return `<p class="call-us">${esc(lead || 'Need help?')} <span>Call us</span><a href="${esc(KPay.telHref(ph))}">${esc(ph)}</a></p>`;
  }

  function summaryHTML(items, total, title) {
    return `<aside class="co-card co-side"><h2>${esc(title || 'Order summary')}</h2>
      <ul class="sum-lines">${items.map(i => `<li><span>${esc(i.name)} <small>× ${i.qty}</small></span><strong>${fmt(i.price * i.qty)}</strong></li>`).join('')}</ul>
      <div class="sum-row"><span>Subtotal</span><span>${fmt(total)}</span></div>
      <div class="sum-row"><span>Shipping</span><span>Included</span></div>
      <div class="sum-total"><span>Total</span><strong>${fmt(total)}</strong></div></aside>`;
  }
  function deliveryHTML(o) {
    const s = o.shipping;
    if (!s) return '';
    const addr = [s.line1, s.line2, [s.city, s.state].filter(Boolean).join(', ') + (s.pin ? ' ' + s.pin : '')].filter(Boolean);
    return `<aside class="co-card co-side"><h2>Delivering to</h2>
      <p class="addr"><strong>${esc(s.name)}</strong><br>${addr.map(esc).join('<br>')}<br>${esc(s.phone)}</p>
      ${s.notes ? `<p class="addr-note">${esc(s.notes)}</p>` : ''}</aside>`;
  }

  /* =========================================================
     Gate / loading / errors
     ========================================================= */
  const viewLoading = () => { stepsEl.hidden = true; show('<p class="empty-note">Loading…</p>'); };
  function viewGate() {
    stepsEl.hidden = true;
    show(`<div class="co-grid single"><section class="co-card co-state">
      <svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
      <h2>Sign in to check out</h2>
      <p>Your bag and orders are saved to your account, so you can come back to your payment at any time.</p>
      <button class="btn btn-gold" data-act="signin">Sign in or create account</button></section></div>`);
  }
  function viewAdmin() {
    stepsEl.hidden = true;
    show(`<div class="co-grid single"><section class="co-card co-state">
      <svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
      <h2>You are signed in as the admin</h2>
      <p>The admin account can’t place orders. Sign out, then sign in with a customer account to try the checkout.</p>
      <a class="btn btn-gold" href="admin.html#orders">Go to Orders</a></section></div>`);
  }
  function viewFail(title, text) {
    stepsEl.hidden = true;
    show(`<div class="co-grid single"><section class="co-card co-state">
      <svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
      <h2>${esc(title)}</h2><p>${esc(text)}</p>${callUs('')}
      <a class="btn btn-gold" href="index.html#bridal">Back to Bridal Wear</a></section></div>`);
  }

  /* =========================================================
     Step 1 — the bill
     ========================================================= */
  function viewBill() {
    step = 'bill';
    setSteps();
    const ls = lines();
    if (!ls.length) {
      return show(`<div class="co-grid single"><section class="co-card co-state">
        <svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
        <h2>Your bag is empty</h2><p>Discover bridal wear crafted for a lifetime.</p>
        <a class="btn btn-gold" href="index.html#bridal">Shop Bridal Wear</a></section></div>`);
    }
    const total = totalOf(ls);
    const gone = ls.filter(l => l.p.soldOut);
    const blocked = gone.length || !PAYMENT.upiId || !(total > 0);
    let alerts = '';
    if (gone.length) alerts += notice('warn', `<strong>${esc(gone.map(l => l.p.name).join(', '))}</strong> is no longer available. Please remove it from your bag to continue.`);
    if (!PAYMENT.upiId) alerts += notice('warn', `<strong>Online payment isn’t set up yet.</strong> Please call us to place your order.${callUs('')}`);
    show(`<div class="co-grid single"><section class="co-card">
      <h2>Your bill</h2>
      <ul class="bill-lines">${ls.map(l => `<li class="bill-line">
        <div class="bill-thumb">${visual(mainImage(l.p), l.p.name)}</div>
        <div class="bill-info"><h3><a href="listing.html?id=${l.p.id}">${esc(l.p.name)}</a></h3>
          <small>${esc([(catById(l.p.categoryId) || {}).name, l.p.fabric].filter(Boolean).join(' · '))}</small>
          <span>Qty ${l.qty} × ${fmt(l.p.price)}</span></div>
        <strong class="bill-amt">${fmt(l.p.price * l.qty)}</strong></li>`).join('')}</ul>
      <div class="sum-row"><span>Subtotal</span><span>${fmt(total)}</span></div>
      <div class="sum-row"><span>Shipping</span><span>Included</span></div>
      <div class="sum-total"><span>Total to pay</span><strong>${fmt(total)}</strong></div>
      ${alerts}
      <div class="co-actions">
        <button type="button" class="btn btn-ghost" data-act="edit-bag">Edit bag</button>
        <button type="button" class="btn btn-gold" data-act="to-delivery"${blocked ? ' disabled' : ''}>Continue to delivery</button>
      </div></section></div>`);
  }

  /* =========================================================
     Step 2 — delivery details → creates the order
     ========================================================= */
  function fieldHTML(name, label, o) {
    o = o || {};
    const attrs = `id="f_${name}" name="${name}" maxlength="${o.max || 100}"` + (o.ac ? ` autocomplete="${o.ac}"` : '') +
      (o.mode ? ` inputmode="${o.mode}"` : '') + (o.ph ? ` placeholder="${esc(o.ph)}"` : '');
    const val = esc(form[name] || '');
    const input = o.area ? `<textarea ${attrs} rows="3">${val}</textarea>` : `<input type="${o.type || 'text'}" ${attrs} value="${val}">`;
    return `<label class="co-field${o.wide ? ' wide' : ''}"><span>${label}</span>${input}</label>`;
  }
  function sideHTML() {
    const ls = lines();
    return summaryHTML(ls.map(l => ({ name: l.p.name, price: l.p.price, qty: l.qty })), totalOf(ls));
  }
  const renderSide = () => { const el = $('#coSide'); if (el) el.innerHTML = sideHTML(); };

  function viewDelivery() {
    step = 'delivery';
    if (!lines().length) return viewBill();
    if (!form.name && !form.line1) form = { name: auth.user.displayName || '', ...savedAddress() };
    setSteps();
    show(`<div class="co-grid">
      <form class="co-card" id="addrForm" novalidate>
        <h2>Delivery details</h2>
        <p class="co-lead">Where should we send your order? We’ll use your mobile number to confirm delivery.</p>
        <div class="co-fields">
          ${fieldHTML('name', 'Full name', { ac: 'name', wide: true })}
          ${fieldHTML('phone', 'Mobile number', { type: 'tel', ac: 'tel-national', mode: 'numeric', max: 15, ph: '10-digit number' })}
          <label class="co-field"><span>Email</span><input type="email" value="${esc(auth.user.email || '')}" readonly tabindex="-1"></label>
          ${fieldHTML('line1', 'Address', { ac: 'address-line1', max: 150, wide: true, ph: 'House / flat no., street' })}
          ${fieldHTML('line2', 'Area, landmark (optional)', { ac: 'address-line2', max: 150, wide: true })}
          ${fieldHTML('city', 'City', { ac: 'address-level2', max: 80 })}
          <label class="co-field"><span>State</span><select id="f_state" name="state" autocomplete="address-level1">
            <option value="">Select state</option>${STATES.map(s => `<option${s === form.state ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          ${fieldHTML('pin', 'PIN code', { ac: 'postal-code', mode: 'numeric', max: 6, ph: '6 digits' })}
          ${fieldHTML('notes', 'Notes for us (optional)', { area: true, max: 300, wide: true, ph: 'Delivery instructions, fitting or measurement details…' })}
        </div>
        <p class="co-msg" id="coMsg" role="alert"></p>
        <div class="co-actions">
          <button type="button" class="btn btn-ghost" data-act="to-bill">Back</button>
          <button type="submit" class="btn btn-gold" id="addrSubmit">Continue to payment</button>
        </div>
      </form>
      <div id="coSide">${sideHTML()}</div></div>`);
  }

  async function submitAddress() {
    if (busy) return;
    const ls = lines();
    if (!ls.length) return viewBill();
    const v = {
      name: (form.name || '').trim(), phone: normPhone(form.phone), line1: (form.line1 || '').trim(), line2: (form.line2 || '').trim(),
      city: (form.city || '').trim(), state: form.state || '', pin: digits(form.pin), notes: (form.notes || '').trim()
    };
    const err = !v.name ? 'Please enter the recipient’s full name.'
      : !PHONE_RE.test(v.phone) ? 'Please enter a valid 10-digit mobile number.'
      : !v.line1 ? 'Please enter your address.'
      : !v.city ? 'Please enter your city.'
      : !v.state ? 'Please choose your state.'
      : !PIN_RE.test(v.pin) ? 'Please enter a valid 6-digit PIN code.'
      : ls.some(l => l.p.soldOut) ? 'An item in your bag is no longer available. Please go back and remove it.'
      : !PAYMENT.upiId ? 'Online payment isn’t available right now. Please call us to place your order.'
      : !(totalOf(ls) > 0) ? 'This order has no payable amount. Please call us.' : '';
    if (err) return msg(err);
    msg('');
    setBusy(true, '#addrSubmit');
    try {
      const { F, db } = await KStore.fb();
      const u = auth.user;
      const ref = await F.addDoc(F.collection(db, 'users', u.uid, 'orders'), {
        orderNo: KPay.makeOrderNo(),
        items: ls.map(l => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty })),
        total: totalOf(ls),
        currency: 'INR',
        status: 'awaiting_payment',
        customer: { name: v.name, phone: v.phone, email: u.email || '' },
        shipping: v,
        createdAt: F.serverTimestamp()
      });
      saveAddress(v);
      busy = false;
      orderId = ref.id;                       // set first, so the empty-bag redraw below is ignored
      history.replaceState(null, '', 'checkout.html?order=' + encodeURIComponent(orderId));
      cart = [];
      renderCart();                           // the bag is now an order; auth.js syncs the empty bag
      watchOrder(orderId);
    } catch (e) {
      console.error('Kridia: order failed', e);
      msg('We couldn’t place your order. Please check your details and try again.');
      setBusy(false, '#addrSubmit');
    }
  }

  /* =========================================================
     Step 3 — payment / order status (live)
     ========================================================= */
  function stopWatch() { if (unwatch) { unwatch(); unwatch = null; } }
  async function watchOrder(id) {
    stopWatch();
    step = 'pay';
    setSteps();
    show('<p class="empty-note">Loading your order…</p>');
    try {
      const { F, db } = await KStore.fb();
      unwatch = F.onSnapshot(F.doc(db, 'users', auth.user.uid, 'orders', id), snap => {
        if (!snap.exists()) { order = null; return viewFail('We couldn’t find this order', 'It may belong to a different account. Sign in with the account you used to place it.'); }
        order = { id: snap.id, ...snap.data() };
        viewPay();
      }, err => {
        console.error('Kridia: could not read order', err);
        stopWatch();
        viewFail('We couldn’t open this order', 'It may belong to a different account. Sign in with the account you used to place it.');
      });
    } catch (e) {
      console.error('Kridia: could not read order', e);
      viewFail('We couldn’t open this order', 'Please try again shortly.');
    }
  }

  function payHTML(ref, total) {
    const p = PAYMENT;
    if (!p.upiId) {
      return `<section class="co-card co-state"><svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
        <p class="eyebrow">Order ${esc(ref)}</p><h2>Payment details unavailable</h2>
        <p>We can’t show the payment QR code right now. Please call us and we’ll complete your order.</p>${callUs('')}</section>`;
    }
    const link = KPay.upiLink({ upiId: p.upiId, name: p.payeeName, amount: total, note: 'Order ' + ref });
    const rejected = order.status === 'rejected';
    return `<section class="co-card co-pay">
      ${rejected ? notice('bad', `<strong>We couldn’t verify this payment.</strong>${order.reviewNote ? `<p>${esc(order.reviewNote)}</p>` : ''}<p>If you have paid, enter the correct transaction ID below. Otherwise, please pay again with the QR code.</p>`) : ''}
      <p class="eyebrow">Pay with any UPI app</p>
      <div class="pay-amount">${fmt(total)}</div>
      <div class="qr-frame" id="qrBox" data-link="${esc(link)}"></div>
      <p class="qr-hint">Scan with Google Pay, PhonePe, Paytm, BHIM or any UPI app. The amount is already filled in.</p>
      <a class="btn btn-ghost upi-open" href="${esc(link)}">Open in UPI app</a>
      <div class="upi-id"><span>UPI ID</span><code>${esc(p.upiId)}</code><button type="button" class="copy" data-act="copy-upi">Copy</button></div>
      ${callUs('Trouble paying?')}
      ${total > UPI_LIMIT ? `<p class="co-fine">Some banks limit a single UPI payment to ${fmt(UPI_LIMIT)}. If yours declines, please call us and we’ll arrange another way.</p>` : ''}
      <form class="paid-form" id="paidForm" novalidate>
        <h3>Paid already?</h3>
        <p>Once the payment has gone through, let us know. Adding the 12-digit transaction ID (UTR) from your UPI app helps us verify it faster.</p>
        <label class="co-field"><span>Transaction ID / UTR (optional)</span>
          <input id="utr" name="utr" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="12 digits" value="${esc(utrDraft)}"></label>
        <p class="co-msg" id="coMsg" role="alert"></p>
        <button type="submit" class="btn btn-gold full" id="paidSubmit">I’ve paid</button>
      </form></section>`;
  }
  function submittedHTML(ref, total) {
    return `<section class="co-card co-state">
      <svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
      <p class="eyebrow">Order ${esc(ref)}</p>
      <h2>Payment submitted</h2>
      <p>Thank you. We have your payment details for <strong>${fmt(total)}</strong>${order.utr ? ` (transaction ID ${esc(order.utr)})` : ''}. We check every payment by hand, and this page will change to <strong>Approved</strong> as soon as it is confirmed. You can safely close it and come back from your account.</p>
      ${callUs('Questions?')}
      <a class="btn btn-ghost" href="index.html#bridal">Continue shopping</a></section>`;
  }
  function approvedHTML(ref, total) {
    const st = order.status;
    const first = String((order.customer && order.customer.name) || '').trim().split(/\s+/)[0] || 'there';
    const phone = order.shipping && order.shipping.phone ? ` on ${esc(order.shipping.phone)}` : '';
    const title = st === 'delivered' ? 'Order delivered' : st === 'shipped' ? 'Your order is on its way' : 'Payment approved';
    const lead = st === 'delivered'
      ? `Thank you, ${esc(first)}. Your order has been delivered. We hope you love it.`
      : st === 'shipped'
        ? `Thank you, ${esc(first)}. Your payment of <strong>${fmt(total)}</strong> was verified and your order has been shipped.`
        : `Thank you, ${esc(first)}. Your payment of <strong>${fmt(total)}</strong> has been verified and your order is confirmed. We’ll be in touch${phone} about delivery.`;
    const track = order.tracking && st !== 'approved'
      ? `<p class="track"><span>Shipping details</span>${esc(order.tracking)}</p>` : '';
    return `<section class="co-card co-state ok">
      <div class="state-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <p class="eyebrow">Order ${esc(ref)}</p>
      <h2>${title}</h2>
      <p>${lead}</p>${track}
      ${callUs('Questions?')}
      <a class="btn btn-gold" href="index.html#bridal">Continue shopping</a></section>`;
  }
  function pendingHTML(ref) {
    return `<section class="co-card co-state"><svg class="state-lotus" viewBox="0 0 100 60" aria-hidden="true"><use href="#lotus"/></svg>
      <p class="eyebrow">Order ${esc(ref)}</p><h2>Order received</h2>
      <p>We’ll be in touch to confirm this order.</p>${callUs('Questions?')}
      <a class="btn btn-ghost" href="index.html#bridal">Continue shopping</a></section>`;
  }

  function viewPay() {
    if (!order) return;
    step = 'pay';
    const st = order.status || 'pending';
    const ref = KPay.orderRef(order), total = Number(order.total) || 0;
    document.title = `Order ${ref} — Kridia`;
    setSteps(KPay.isPaid(st));
    const main = KPay.isPaid(st) ? approvedHTML(ref, total)
      : st === 'payment_submitted' ? submittedHTML(ref, total)
      : (st === 'awaiting_payment' || st === 'rejected') ? payHTML(ref, total)
      : pendingHTML(ref);
    show(`<div class="co-grid">${main}<div class="co-stack">
      ${summaryHTML(order.items || [], total, 'Order ' + ref)}${deliveryHTML(order)}
      <p class="co-status">Status <span class="order-status s-${esc(st)}">${esc(KPay.statusLabel(st))}</span></p></div></div>`);
    const box = $('#qrBox');
    if (box) {
      try { box.innerHTML = KPay.qrSvg(box.dataset.link); }
      catch (e) {
        console.error('Kridia: QR code could not be drawn', e);
        document.body.classList.add('qr-failed');   // shows the "Open in UPI app" button on desktop too
        box.classList.add('failed');
        box.textContent = 'The QR code couldn’t be shown. Use the UPI ID below, or the “Open in UPI app” button on your phone.';
      }
    }
  }

  async function submitPaid() {
    if (busy || !order) return;
    const utr = ($('#utr').value || '').replace(/\s/g, '');
    if (utr && !UTR_RE.test(utr)) return msg('The transaction ID (UTR) has 12 digits. Leave it empty if you’re not sure.');
    msg('');
    setBusy(true, '#paidSubmit');
    try {
      const { F, db } = await KStore.fb();
      await F.updateDoc(F.doc(db, 'users', auth.user.uid, 'orders', order.id), { status: 'payment_submitted', utr, paidAt: F.serverTimestamp() });
      utrDraft = '';
      busy = false;                           // the live listener now redraws the page
      toast('Thank you — we’ll verify your payment shortly');
    } catch (e) {
      console.error('Kridia: could not submit payment', e);
      msg('We couldn’t record that just now. Please try again, or call us.');
      setBusy(false, '#paidSubmit');
    }
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  /* =========================================================
     Wiring
     ========================================================= */
  function render() {
    if (!ready) return;
    if (!auth) return viewLoading();
    if (auth.admin || !auth.user) { stopWatch(); order = null; return auth.admin ? viewAdmin() : viewGate(); }
    if (orderId) { if (!unwatch) watchOrder(orderId); return; }
    if (step === 'delivery') return viewDelivery();
    viewBill();
  }

  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'signin') $('#acctOpen').click();
    else if (act === 'edit-bag') $('#cartOpen').click();
    else if (act === 'to-delivery') viewDelivery();
    else if (act === 'to-bill') viewBill();
    else if (act === 'copy-upi') copyText(PAYMENT.upiId).then(ok => toast(ok ? 'UPI ID copied' : 'Press and hold the UPI ID to copy it'));
  });
  body.addEventListener('input', e => {
    const t = e.target;
    if (t.form && t.form.id === 'addrForm' && t.name) form[t.name] = t.value;
    if (t.id === 'utr') utrDraft = t.value;
  });
  body.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'addrForm') submitAddress();
    else if (e.target.id === 'paidForm') submitPaid();
  });

  document.addEventListener('kridia:auth', e => { auth = e.detail; render(); });
  document.addEventListener('kridia:cart', () => {
    if (!ready || !auth || !auth.user || orderId) return;
    if (step === 'bill') viewBill();
    else if (step === 'delivery') { if (lines().length) renderSide(); else viewBill(); }
  });

  (async function boot() {
    const ok = await kridiaReady;
    if (!ok) return viewFail('We couldn’t load checkout', 'Please check your connection and try again shortly.');
    ready = true;
    render();
  })();
})();
