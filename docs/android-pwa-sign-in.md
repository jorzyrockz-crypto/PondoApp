# Android installed-app Google sign-in

Pondo uses Firebase Google sign-in. Installed Android PWAs now use the same
popup flow as the normal browser. This avoids the cross-origin redirect-storage
dependency that can cause `signInWithRedirect()` to return to the app without a
session on some Android tablets. In a regular browser, if the popup is blocked
or unsupported, Pondo still attempts a cross-origin redirect, which can encounter
the same storage restriction. Installed PWAs do not automatically redirect on
those popup errors.

## After deployment

1. Use the installed app's Update action if offered, then close and reopen the
   app so the updated page is loaded. Test sign-in, sign-out, and sign-in again.
2. Test the ordinary browser and an installed Android phone and tablet. The
   browser path should continue to use the same Firebase project and account.
3. If Android blocks the popup in standalone mode, Pondo shows an **Open in
   browser** fallback. You can try signing in there, then returning to Pondo;
   installed and browser sessions may not share authentication on every device.
   Do not clear site data or uninstall while troubleshooting because local-only
   records, logos, and receipts may be lost.

The Firebase configuration intentionally remains
`russapps-pondo.firebaseapp.com`. A same-origin Firebase Auth proxy is still
required if the app is changed back to redirect sign-in; it also requires the
corresponding Firebase authorized domain and Google OAuth redirect URI. Do not
change Firestore rules or the public-report backend as part of this fix.

Mock unit tests do not verify actual Google sign-in. Real-device testing on
Android, including sign-out and sign-in again, is still needed.
