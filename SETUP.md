# Kridia — Admin, content & Firebase setup

## Admin page, content and images

Run `node server.js`, then open http://localhost:3000.

**Signing in to the admin:** click the account icon, type `Admin` in the **Email** field, enter the admin password, and press Sign in. You are taken to `/admin.html`. The page and its API only respond to a signed-in admin session (HttpOnly cookie, 8 hours, login locks for 15 minutes after 5 wrong tries). The first-run password is `123o123o123` — **change it under Admin → Security**. It is stored only as a salted scrypt hash in `data/admin-auth.json` (git-ignored). To reset it, delete that file and restart the server.

**What you can manage:** Listings (multiple images, details table, maker, sold-out/visibility), Categories, Artisans, Reviews, Journal stories, all website text (hero, headings, anatomy cards, our story, newsletter, footer…), and the Image library.

**Where things are stored**

| Path | Contents |
|---|---|
| `data/listings.json`, `categories.json`, `artisans.json`, `reviews.json`, `journal.json` | Each collection (`{ nextId, items: [...] }`) |
| `data/settings.json` | Website text and the hero / story images |
| `images/` | Every uploaded image (JPG, PNG, WebP, GIF, AVIF, up to 15 MB; large photos are resized in the browser) |
| `data/admin-auth.json` | Hashed admin password |

Each listing has its own details page: `listing.html?id=<id>`.

Notes: the server listens on `127.0.0.1` only by default (set `HOST=0.0.0.0` to expose it, ideally behind HTTPS). Firebase Hosting serves static files only, so the admin and JSON storage need `node server.js` (or any Node host) rather than `firebase deploy`. Sign-in, bag sync and orders still use Firebase as described below.

---

# Firebase setup (Sign in + Firestore backend)

Everything runs in the browser with the Firebase web SDK loaded from Google's CDN.
No npm install or build step is needed to run the site.

## What was added

| File | Purpose |
|---|---|
| `firebase-config.js` | Your Firebase project keys (you fill this in) |
| `auth.js` | Sign in / sign up / Google / password reset, bag sync, orders, newsletter |
| `auth.css` | Account button + sign-in modal styles |
| `firestore.rules` | Security rules for the database |
| `firebase.json` | Firebase CLI config (rules + hosting) |
| `index.html` | Edited: account button in the header, sign-in modal, new script tags |

`script.js` and `styles.css` are unchanged.

## What it does

- **Sign in / Create account** with email + password, or **Continue with Google**
- **Forgot password** email
- **Bag sync**: signed-in users' bags are saved to Firestore and follow them across devices. A guest bag is merged in at sign-in and cleared on sign-out.
- **Checkout** creates an order in Firestore with status `pending` (no payment yet)
- **Your orders** list in the account modal
- **Newsletter** sign-ups are saved to Firestore (duplicates are ignored)

If `firebase-config.js` is not filled in, the site works exactly as before and the account button shows a hint.

## Firestore data model

```
users/{uid}
  displayName, email, cart: [{id, qty}], createdAt, updatedAt
users/{uid}/orders/{orderId}
  items: [{id, name, price, qty}], total, currency: "INR", status: "pending", createdAt
subscribers/{email}
  email, createdAt, uid?
```

## Setup steps

### 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it (e.g. `kridia`). Google Analytics is optional.

### 2. Register the web app and copy the config
1. Project overview → click the **`</>` Web** icon → name the app → **Register app**
   (skip "Firebase Hosting" for now, you can add it later).
2. Copy the `firebaseConfig` values into `firebase-config.js`, replacing every `YOUR_...` placeholder.

### 3. Turn on Authentication
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab:
   - Enable **Email/Password**.
   - Enable **Google**, choose a public-facing name, pick a support email, and save.
3. **Settings → Authorized domains**: `localhost` is already there. Add your live domain when you deploy.

### 4. Create the Firestore database
1. **Build → Firestore Database → Create database**.
2. Choose a location close to your customers: `asia-south1` (Mumbai) or `asia-south2` (Delhi). This cannot be changed later.
3. Start in **production mode** (the rules below will open exactly what's needed).

### 5. Publish the security rules
Pick one:

**A. Console (quickest):** Firestore → **Rules** tab → paste the contents of `firestore.rules` → **Publish**.

**B. CLI:**
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # choose your project
firebase deploy --only firestore:rules
```

### 6. Run it locally
The site now runs on its own small Node server (no `npm install` needed, Node 16+). It also stores your content and images, so use it instead of `npx serve`:

```bash
cd D:\kyrdia
node server.js
```
Open http://localhost:3000 (change the port with `PORT=3001 node server.js`).

### 7. Test checklist
1. Click the person icon → **Create account** → you should see your initial in the header.
2. Firebase Console → Authentication → Users shows the new user; Firestore shows `users/{uid}`.
3. Add a saree to the bag → after a second, `users/{uid}.cart` updates.
4. Reload, or sign in from another browser: the bag is restored.
5. **Proceed to Checkout** → a `pending` order appears under `users/{uid}/orders`, and in "Your orders".
6. Subscribe with an email in the newsletter box → `subscribers/{email}` appears.
7. **Sign out** → the bag empties on this device.

### 8. Deploy (optional)
```bash
firebase init hosting   # only if you want to re-run it; firebase.json already has hosting configured
firebase deploy --only hosting
```
Then add your live domain to **Authentication → Settings → Authorized domains** if it isn't the default `*.web.app` / `*.firebaseapp.com` one.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Add your Firebase config…" toast | `firebase-config.js` still has `YOUR_...` placeholders |
| `auth/operation-not-allowed` | Enable that provider in Authentication → Sign-in method |
| `auth/unauthorized-domain` | Add the domain in Authentication → Settings → Authorized domains |
| "Missing or insufficient permissions" in the console | Rules not published yet (step 5), or Firestore not created (step 4) |
| Google pop-up blocked | Allow pop-ups for the site |
| Nothing works when opening `index.html` by double-click | Serve over HTTP (step 6) |

## Important: before taking real money

This is a solid account + data foundation, but **checkout is not payment-ready**:

- Order prices are computed in the browser. Anyone can alter them with dev tools, so treat `pending` orders as *requests*, and **recompute totals server-side** before charging.
- Add a payment provider (Razorpay or Stripe) and a **Cloud Function** that creates the payment, verifies the product prices from a trusted source, and sets order status (`paid`, `shipped`). The rules already forbid clients from changing an order after creation, so only the Admin SDK can do this.
- Consider **email verification** (`sendEmailVerification`) and **Firebase App Check** to reduce abuse of sign-ups and the newsletter.
- Cloud Functions require the Blaze (pay-as-you-go) plan. Auth and Firestore for a small store fit within the free tier.
