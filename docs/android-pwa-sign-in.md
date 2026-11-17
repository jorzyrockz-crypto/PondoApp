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

## Invitations opened inside Messenger

Firebase's hosted auth page may report “missing initial state” if sign-in is
started in an in-app browser and the temporary state is lost or partitioned.
That error alone does not establish whether an invitation is valid or whether
membership was created. Go back to the **original invitation in the chat**,
copy it, paste it into Chrome or Safari, and sign in there with Google. The
error page's own URL is a Firebase sign-in URL, not the invitation. Check the
team workspace afterward; do not use offline mode to join.

Pondo now recognizes common Facebook/Messenger and Instagram user-agent
markers and shows a copyable Pondo link instead of starting Google sign-in in
those browsers. The copied link preserves the invitation parameter and omits
unrelated query parameters and fragments. When clipboard access fails, the
field can be selected manually. This detection is best-effort: user agents and
browser menus can change, and this does not fix every browser's Firebase auth
storage behavior. Treat invitation links as credentials; send them privately.

Test the full flow with real invitee accounts and devices in Messenger on
Android and iOS, including copy/manual selection and browser sign-in, before
relying on this guidance. Do not clear site data, as local records may be lost.
