(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (server.js)
  else root.KSchema = api;                                                  // Browser (GitHub Pages)
})(this, function () {
'use strict';
/* =========================================================
   KRIDIA — content schema
   Single source of truth for: the admin forms, server-side
   validation, and the default website text.
   ========================================================= */

const text = (key, label, o = {}) => ({ key, label, type: 'text', max: 200, ...o });
const area = (key, label, o = {}) => ({ key, label, type: 'textarea', max: 4000, rows: 4, ...o });
const image = (key, label, o = {}) => ({ key, label, type: 'image', ...o });
const rowsOf = (key, label, fields, def = [], o = {}) => ({ key, label, type: 'rows', fields, default: def, max: 24, ...o });

/* ---------- Collections (stored as data/<name>.json) ---------- */
const COLLECTIONS = {
  listings: {
    label: 'Listings', singular: 'Listing', title: 'name', thumb: 'images',
    cols: ['name', 'categoryId', 'price', 'published'],
    fields: [
      text('name', 'Name', { required: true, max: 140 }),
      { key: 'categoryId', label: 'Category', type: 'ref', ref: 'categories' },
      { key: 'price', label: 'Price (₹)', type: 'number', required: true, min: 0, max: 100000000, money: true },
      text('fabric', 'Fabric / material', { max: 120 }),
      text('tag', 'Badge', { max: 30, help: 'Small label on the card, e.g. New, Bestseller, Limited.' }),
      area('shortDescription', 'Short description', { max: 300, rows: 2, help: 'Shown at the top of the details page.' }),
      area('description', 'Full description', { max: 8000, rows: 7, help: 'Leave a blank line between paragraphs.' }),
      rowsOf('specs', 'Details', [text('label', 'Label (e.g. Work)', { max: 60 }), text('value', 'Value (e.g. Zardozi embroidery)', { max: 300 })], [],
        { help: 'Extra rows shown in the “Details” table on the listing page, e.g. Work, Lining, Care.' }),
      { key: 'artisanId', label: 'Made by', type: 'ref', ref: 'artisans' },
      { key: 'images', label: 'Images', type: 'images', max: 12, help: 'The first image is the main image. Use the arrows to reorder.' },
      { key: 'soldOut', label: 'Sold out', type: 'bool', default: false, checkLabel: 'Mark as sold out' },
      { key: 'published', label: 'Visibility', type: 'bool', default: true, checkLabel: 'Visible on the website' }
    ]
  },
  categories: {
    label: 'Categories', singular: 'Category', title: 'name', thumb: 'image',
    cols: ['name', 'blurb'],
    fields: [
      text('name', 'Name', { required: true, max: 80 }),
      text('blurb', 'Short line', { max: 120, help: 'Shown under the category card.' }),
      image('image', 'Image')
    ]
  },
  artisans: {
    label: 'Artisans', singular: 'Artisan', title: 'name', thumb: 'image',
    cols: ['name', 'craft'],
    fields: [
      text('name', 'Name', { required: true, max: 80 }),
      text('craft', 'Craft & place', { max: 100, help: 'e.g. Zardozi · Lucknow' }),
      area('bio', 'Short story', { max: 500, rows: 3 }),
      image('image', 'Portrait (optional)')
    ]
  },
  reviews: {
    label: 'Reviews', singular: 'Review', title: 'author', thumb: null,
    cols: ['author', 'quote'],
    fields: [
      area('quote', 'Review', { required: true, max: 500, rows: 4 }),
      text('author', 'Name', { required: true, max: 80 }),
      text('location', 'City / place', { max: 80 })
    ]
  },
  journal: {
    label: 'Journal', singular: 'Story', title: 'title', thumb: 'image',
    cols: ['title', 'tag'],
    fields: [
      text('title', 'Title', { required: true, max: 140 }),
      text('tag', 'Tag', { max: 30, help: 'e.g. Style, Craft, Care' }),
      area('body', 'Story', { max: 12000, rows: 10, help: 'Leave a blank line between paragraphs. If empty, no “Read story” link is shown.' }),
      image('image', 'Image')
    ]
  }
};

/* ---------- Website text & images (stored as data/settings.json) ---------- */
const SETTINGS_GROUPS = [
  {
    id: 'header', label: 'Announcement bar & brand',
    fields: [
      text('announce.a1', 'Announcement 1', { default: 'Complimentary insured shipping across India' }),
      text('announce.a2', 'Announcement 2', { default: 'Handcrafted · Artisan signed' }),
      text('announce.a3', 'Announcement 3', { default: 'Made-to-measure bridal fittings' }),
      text('brand.name', 'Brand name', { default: 'Kridia', max: 40 }),
      text('brand.sub', 'Brand tagline (under logo)', { default: 'Bridal Couture', max: 40 })
    ]
  },
  {
    id: 'hero', label: 'Home — hero',
    fields: [
      text('hero.eyebrow', 'Small heading', { default: 'Bridal couture' }),
      text('hero.title1', 'Title — first part', { default: 'The bride,' }),
      text('hero.titleEm', 'Title — highlighted word', { default: 'adorned' }),
      text('hero.title2', 'Title — second line', { default: 'in gold & silk' }),
      area('hero.lead', 'Intro paragraph', { rows: 4, max: 500, default: 'Kridia is devoted to the bride. Each bridal piece is designed with care, embroidered by skilled artisans and finished with fine gold detailing, made for the day you will remember forever.' }),
      text('hero.btn1', 'Button 1', { default: 'Shop Bridal Wear', max: 40 }),
      text('hero.btn2', 'Button 2', { default: 'Explore Collections', max: 40 }),
      area('hero.badge', 'Round badge text', { rows: 2, max: 60, default: 'Handcrafted\nbridal couture', help: 'Use a new line to break the text.' }),
      image('hero.image1', 'Hero image — centre (large arch)'),
      image('hero.image2', 'Hero image — left'),
      image('hero.image3', 'Hero image — right')
    ]
  },
  {
    id: 'collections', label: 'Home — Collections section',
    fields: [
      text('collections.deva', 'Hindi label', { default: 'दुल्हन', max: 30 }),
      text('collections.eyebrow', 'Small heading', { default: 'The Collections' }),
      text('collections.title', 'Title', { default: 'Find your bridal collection' })
    ]
  },
  {
    id: 'listings', label: 'Home — Bridal wear (listings) section',
    fields: [
      text('listings.deva', 'Hindi label', { default: 'विशेष', max: 30 }),
      text('listings.eyebrow', 'Small heading', { default: 'The Edit' }),
      text('listings.title', 'Title', { default: 'Bridal wear worthy of an heirloom' }),
      text('listings.empty', 'Message when there are no listings', { default: 'Our bridal collection is being prepared. Please check back soon.', max: 200 })
    ]
  },
  {
    id: 'anatomy', label: 'Home — Anatomy section',
    fields: [
      text('anatomy.deva', 'Hindi label', { default: 'शिल्प', max: 30 }),
      text('anatomy.eyebrow', 'Small heading', { default: 'Anatomy of a Kridia bridal piece' }),
      text('anatomy.title', 'Title', { default: 'Every stitch, considered' }),
      rowsOf('anatomy.parts', 'Cards', [text('title', 'Title', { max: 60 }), area('text', 'Text', { max: 300, rows: 2 })], [
        { title: 'Silhouette', text: 'The shape that frames the bride, tailored to her measurements and the way she moves.' },
        { title: 'Embroidery', text: 'Hand-worked gold thread and beadwork across the bodice, border and veil.' },
        { title: 'Fabric', text: 'Silks, velvets and tulle chosen for their drape, weight and glow.' },
        { title: 'Finish', text: 'Linings, trims and fastenings completed by hand before the piece reaches you.' }
      ], { max: 8, help: 'Leave empty to hide this whole section.' })
    ]
  },
  {
    id: 'heritage', label: 'Home — Our story section',
    fields: [
      text('heritage.deva', 'Hindi label', { default: 'विरासत', max: 30 }),
      text('heritage.eyebrow', 'Small heading', { default: 'Our Story' }),
      text('heritage.title', 'Title — first part', { default: 'A bridal legacy,' }),
      text('heritage.titleEm', 'Title — highlighted part', { default: 'crafted by hand' }),
      area('heritage.p1', 'Paragraph 1', { rows: 4, default: 'Kridia was created for the moment a bride walks in and the room goes quiet. Every piece is designed around the occasion, with a deep love for craft and detail.' }),
      area('heritage.p2', 'Paragraph 2', { rows: 4, default: 'We work closely with skilled artisans, paying fairly and documenting every maker, so the piece you wear arrives with the story of the hands that made it.' }),
      rowsOf('heritage.pillars', 'Highlights', [text('title', 'Title', { max: 60 }), area('text', 'Text', { max: 300, rows: 2 })], [
        { title: 'Handcrafted detail', text: 'Embroidered, beaded and finished by skilled hands.' },
        { title: 'Considered materials', text: 'Fine silks, real zari and quality trims, never shortcuts.' },
        { title: 'Signed by the maker', text: 'Each piece carries its artisan’s name and story.' }
      ], { max: 6 }),
      text('heritage.button', 'Button text', { default: 'Meet the Artisans', max: 40 }),
      image('heritage.image1', 'Image — left arch'),
      image('heritage.image2', 'Image — centre arch (tallest)'),
      image('heritage.image3', 'Image — right arch')
    ]
  },
  {
    id: 'artisans', label: 'Home — Artisans section',
    fields: [
      text('artisans.deva', 'Hindi label', { default: 'कारीगर', max: 30 }),
      text('artisans.eyebrow', 'Small heading', { default: 'The Hands Behind Kridia' }),
      text('artisans.title', 'Title', { default: 'Master artisans' })
    ]
  },
  {
    id: 'journal', label: 'Home — Journal section',
    fields: [
      text('journal.deva', 'Hindi label', { default: 'पत्रिका', max: 30 }),
      text('journal.eyebrow', 'Small heading', { default: 'The Journal' }),
      text('journal.title', 'Title', { default: 'Stories from the atelier' })
    ]
  },
  {
    id: 'newsletter', label: 'Newsletter box',
    fields: [
      text('newsletter.title', 'Title', { default: 'Enter the Maison' }),
      area('newsletter.text', 'Text', { rows: 2, max: 300, default: 'Private previews, artisan stories and first access to limited-edition bridal pieces.' }),
      text('newsletter.placeholder', 'Email placeholder', { default: 'Your email address', max: 60 }),
      text('newsletter.button', 'Button', { default: 'Subscribe', max: 30 }),
      text('newsletter.success', 'Thank-you message', { default: 'Welcome to the Maison. Your invitation is on its way.', max: 200 })
    ]
  },
  {
    id: 'footer', label: 'Footer & bag',
    fields: [
      text('footer.tagline', 'Footer tagline', { default: 'Luxury bridal wear, crafted in gold and ivory.', max: 160 }),
      area('footer.address', 'Visit / address', { rows: 4, max: 300, default: 'Kridia Atelier\nVisits by appointment', help: 'One line per row.' }),
      text('footer.credit', 'Footer credit line', { default: 'Made with devotion', max: 80 }),
      text('footer.rights', 'Copyright line', { default: '© 2026 Kridia. All rights reserved.', max: 120 }),
      text('cart.note', 'Note in the shopping bag', { default: 'Insured shipping included.', max: 120 })
    ]
  }
];

/* ---------- Helpers ---------- */
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, p, v) {
  const keys = p.split('.');
  let o = obj;
  keys.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = v;
}
const isImg = s => typeof s === 'string' && /^images\/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(s);

function defaultFor(f) {
  if (f.default !== undefined) return JSON.parse(JSON.stringify(f.default));
  if (f.type === 'rows' || f.type === 'images') return [];
  if (f.type === 'bool') return false;
  return f.type === 'number' || f.type === 'ref' ? null : '';
}

function cleanValue(f, raw, ctx) {
  switch (f.type) {
    case 'text':
    case 'textarea': {
      let s = raw == null ? '' : String(raw);
      s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
      if (f.type === 'text') s = s.replace(/\n+/g, ' ');
      s = s.trim();
      if (s.length > f.max) throw new Error(`“${f.label}” is too long (max ${f.max} characters).`);
      if (s && f.pattern && !f.pattern.test(s)) throw new Error(f.patternMsg || `“${f.label}” is not valid.`);
      if (f.required && !s) throw new Error(`“${f.label}” is required.`);
      return s;
    }
    case 'number': {
      if (raw === '' || raw == null) {
        if (f.required) throw new Error(`“${f.label}” is required.`);
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`“${f.label}” must be a number.`);
      if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) throw new Error(`“${f.label}” is out of range.`);
      return Math.round(n * 100) / 100;
    }
    case 'bool':
      return raw === undefined ? !!f.default : (raw === true || raw === 'true' || raw === 1);
    case 'ref': {
      if (raw === '' || raw == null) return null;
      const id = Number(raw);
      return Number.isInteger(id) && ctx.hasId(f.ref, id) ? id : null;
    }
    case 'image':
      if (!raw) return '';
      if (!isImg(raw)) throw new Error(`“${f.label}”: invalid image.`);
      return raw;
    case 'images': {
      if (raw == null) return [];
      if (!Array.isArray(raw)) throw new Error(`“${f.label}”: invalid images.`);
      const out = [];
      for (const r of raw) {
        if (!isImg(r)) throw new Error(`“${f.label}”: invalid image.`);
        if (!out.includes(r)) out.push(r);
      }
      if (out.length > f.max) throw new Error(`“${f.label}”: at most ${f.max} images.`);
      return out;
    }
    case 'rows': {
      if (raw == null) return [];
      if (!Array.isArray(raw)) throw new Error(`“${f.label}”: invalid rows.`);
      const out = [];
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const o = {};
        let any = false;
        for (const sf of f.fields) {
          const v = cleanValue({ ...sf, required: false }, row[sf.key], ctx);
          o[sf.key] = v;
          if (v) any = true;
        }
        if (any) out.push(o);
      }
      if (out.length > f.max) throw new Error(`“${f.label}”: at most ${f.max} rows.`);
      return out;
    }
    default:
      throw new Error('Unknown field type');
  }
}

function cleanItem(name, input, ctx) {
  const out = {};
  for (const f of COLLECTIONS[name].fields) out[f.key] = cleanValue(f, (input || {})[f.key], ctx);
  return out;
}

function cleanSettings(input, ctx, lenient) {
  const out = {};
  for (const g of SETTINGS_GROUPS) {
    for (const f of g.fields) {
      const raw = getPath(input || {}, f.key);
      let v;
      try { v = raw === undefined ? defaultFor(f) : cleanValue(f, raw, ctx); }
      catch (e) { if (!lenient) throw e; v = defaultFor(f); }
      setPath(out, f.key, v);
    }
  }
  return out;
}

/* ---------- Payment settings (stored in Firestore at site/payment; edited under Admin → Payment settings) ---------- */
const PAYMENT_FIELDS = [
  text('upiId', 'UPI ID', {
    max: 100, placeholder: 'yourname@bank',
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}@[A-Za-z][A-Za-z0-9.-]{1,63}$/,
    patternMsg: '“UPI ID” should look like name@bank (letters, numbers, dots, dashes).',
    help: 'Customers pay to this UPI ID. The QR code on the payment page is generated from it, with the order amount filled in.'
  }),
  text('payeeName', 'Name shown in UPI apps', { max: 60, default: 'Kridia', help: 'The payee name customers see when they scan the QR code.' }),
  text('phone', 'Call-us number', {
    max: 20, placeholder: '+91 98765 43210',
    pattern: /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/,
    patternMsg: '“Call-us number” should contain only digits, spaces, + ( ) and -.',
    help: 'Shown under the UPI ID on the payment page so customers can call you about their payment.'
  })
];
function cleanPayment(input, lenient) {
  const out = {};
  for (const f of PAYMENT_FIELDS) {
    const raw = (input || {})[f.key];
    try { out[f.key] = raw === undefined ? defaultFor(f) : cleanValue(f, raw, { hasId: () => false }); }
    catch (e) { if (!lenient) throw e; out[f.key] = defaultFor(f); }
  }
  return out;
}

const defaultSettings = () => cleanSettings({}, { hasId: () => false }, true);

return { COLLECTIONS, SETTINGS_GROUPS, PAYMENT_FIELDS, cleanItem, cleanSettings, cleanPayment, defaultSettings, getPath, setPath, isImg };
});
