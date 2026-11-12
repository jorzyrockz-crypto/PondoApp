# Android installed-app Google sign-in on Vercel

The installed mobile app uses Firebase's redirect flow. When Pondo is served
from `pondoapp.vercel.app` but Firebase's auth helpers are on
`russapps-pondo.firebaseapp.com`, the browser may block cross-site storage and
return from sign-in without a session. The message does not prove this is the
cause: an interrupted redirect, provider setup, or other errors can also fail.

For this exact HTTPS production host, Pondo uses `pondoapp.vercel.app` as its
Firebase `authDomain`, and `vercel.json` transparently rewrites `/__/auth/*` to
the same Firebase project's helpers. The service worker does not intercept or
cache those paths, and Vercel is configured to return `Cache-Control: no-store`
for the helper responses. This implements Firebase's reverse proxy approach:
https://firebase.google.com/docs/auth/web/redirect-best-practices#proxy-requests

## Required before deploying

1. In Firebase Authentication for **russapps-pondo**, enable Google sign-in and
   add `pondoapp.vercel.app` to Authentication → Settings → Authorized domains.
2. In Google Cloud Console for the same project, APIs & Services → Credentials,
   find the OAuth 2.0 Web client used by the Firebase Google sign-in provider.
   Add the exact **authorized redirect URI**
   `https://pondoapp.vercel.app/__/auth/handler` without removing existing URIs.
   This is separate from Firebase's authorized domain setting. Confirm the
   correct OAuth client in the Firebase provider settings; don't change another
   project's client. No secrets need to be placed in Pondo's source code.
3. Deploy the app and Vercel rewrite together. Older installed service workers
   may cache auth helpers; use the app's Update action when offered, then close
   and reopen Pondo so the new service worker controls it before testing.
   Don't clear site data or uninstall: local-only records, logos and receipts
   may be lost. Back up any data worth keeping before testing.
4. Test on an actual Android phone and tablet: sign in, sign out, then sign in
   again from the installed app, including account chooser, cancellation and
   offline/retry cases. Also test Chrome browser and desktop sign-in. Confirm
   the helper `/__/auth/iframe` is served at the Pondo origin by a transparent
   rewrite, not an HTTP redirect or cached copy; test with real Firebase/Google
   credentials. Mock tests do not establish that Vercel or OAuth is configured.

The proxy and `authDomain` override apply only to `https://pondoapp.vercel.app`.
Preview URLs, custom domains and GitHub Pages continue to use the original
Firebase auth domain; redirect sign-in there can still hit the same storage
problem and requires separate domain/proxy/OAuth setup. The static Vercel
rewrite is present on preview deployments, but preview clients don't use it.
Do not enable incomplete public-report backend or change Firestore rules as
part of this fix. App account isolation and backup precautions still apply; see
`firebase-project-switch.md` and `team-sync-rollout.md`.
