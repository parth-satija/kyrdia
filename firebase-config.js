/* =========================================================
   KRIDIA — Firebase web config
   Paste the values from: Firebase Console → Project settings →
   General → Your apps → Web app → SDK setup and configuration.

   These values identify your project; they are not secrets.
   Access is protected by Authentication + firestore.rules.
   ========================================================= */
window.KRIDIA_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB9g-WRt1iAgcHumk2EyDZDzIpZ-BYVTws',
  authDomain: 'kridia.firebaseapp.com',
  projectId: 'kridia',
  storageBucket: 'kridia.firebasestorage.app',
  messagingSenderId: '110079257065',
  appId: '1:110079257065:web:b07024229784990a0ec378'
};

/* Admin sign-in: typing "Admin" as the email on the website's sign-in window signs in
   to this Firebase Authentication account (Email/Password). Create it once in
   Firebase Console → Authentication → Users → Add user, and use the SAME address in
   firestore.rules (function isAdmin). See SETUP.md → "GitHub Pages". */
window.KRIDIA_ADMIN_EMAIL = 'admin@kridia.in';
