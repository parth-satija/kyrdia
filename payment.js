/* =========================================================
   KRIDIA — Payment helpers (shared by the shop, checkout and admin pages)

   No payment gateway: the customer pays by scanning a UPI QR code (amount
   pre-filled) and the admin verifies the payment by hand.

   Order status flow
     awaiting_payment  → order created, customer has not confirmed payment yet
     payment_submitted → customer says they paid (optional UTR); admin must verify
     approved          → admin verified the payment
     shipped           → admin handed the order to the courier (optional tracking details)
     delivered         → order reached the customer
     rejected          → admin could not verify it (customer can pay / submit again)
     pending           → orders placed before UPI payments existed

   The QR is drawn with qrcode-generator (loaded from a CDN with an integrity
   hash on checkout.html and admin.html). qrSvg() throws if it isn't loaded.
   ========================================================= */
(function (root) {
  'use strict';

  const STATUS = {
    awaiting_payment: 'Awaiting payment',
    payment_submitted: 'Verifying payment',
    approved: 'Approved',
    shipped: 'Shipped',
    delivered: 'Delivered',
    rejected: 'Not approved',
    pending: 'Pending'
  };
  const statusLabel = s => STATUS[s] || STATUS.pending;

  /** Short, human-friendly order number, also used as the UPI payment note. */
  const orderRef = o => (o && o.orderNo) || 'KR-' + String((o && o.id) || '').slice(0, 6).toUpperCase();
  function makeOrderNo() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(2)), b => abc[b % abc.length]).join('');
    return 'KR-' + Date.now().toString(36).toUpperCase() + rnd;
  }

  /** upi://pay deep link. Everything is percent-encoded except "@", which UPI apps expect raw. */
  const enc = s => encodeURIComponent(s).replace(/%40/g, '@');
  function upiLink(o) {
    const q = ['pa=' + enc(o.upiId)];
    if (o.name) q.push('pn=' + enc(o.name));
    q.push('am=' + Number(o.amount).toFixed(2), 'cu=INR');
    if (o.note) q.push('tn=' + enc(o.note));
    return 'upi://pay?' + q.join('&');
  }

  /** QR code as an SVG string (black on white, 4-module quiet zone, error correction M). */
  function qrSvg(text, margin) {
    if (typeof root.qrcode !== 'function') throw new Error('QR library not loaded');
    margin = margin == null ? 4 : margin;
    const qr = root.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), size = n + margin * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + margin) + ' ' + (r + margin) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="UPI payment QR code">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  const telHref = n => 'tel:' + String(n || '').replace(/[^\d+]/g, '');

  /** Payment confirmed by the admin (approved, or already on its way / delivered). */
  const isPaid = s => s === 'approved' || s === 'shipped' || s === 'delivered';

  root.KPay = { STATUS, statusLabel, isPaid, orderRef, makeOrderNo, upiLink, qrSvg, telHref };
})(window);
