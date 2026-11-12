# Google sign-in rollback and Android limitation

The same-origin Vercel Firebase Auth change introduced a Google
`redirect_uri_mismatch` error during desktop sign-in. The redirect in the
reported error was `https://pondoapp.vercel.app/__/auth/handler`. Because the
active Google OAuth web client could not be independently verified, this change
rolls back the Vercel auth-domain override and reverse proxy. Pondo again uses
`russapps-pondo.firebaseapp.com` as its Firebase auth domain on all hosts.
This does not modify Firebase project data, local data, or Google Cloud settings.

## After deployment

1. Use the installed app's Update action if offered, then close and reopen the
   app so the updated service worker takes control. Test desktop popup sign-in
   and sign-out with the same account. This rollback restores the previous
   configuration, but actual sign-in still depends on Firebase/Google settings
   and must be tested; success is not guaranteed.
2. Do not clear site data or uninstall the app to troubleshoot: local-only
   records, logos and receipts may be lost. Back up anything worth keeping.
3. Android installed-app sign-in still uses a cross-origin redirect. It can
   return without a session when third-party storage is restricted. This rollback
   does not solve that problem. The ordinary browser popup may work, but an
   installed app and browser may not share a session on every device.

## Before attempting the Android fix again

- Identify the exact Google OAuth web client used by Firebase Authentication in
  `russapps-pondo`; do not change another project's client or share secrets.
  The Firebase Authentication authorized domains list and the Google OAuth
  client's authorized redirect URIs are separate settings. Confirm the exact
  URI in Google error details is saved on the correct OAuth client; retain
  existing authorized URIs. Resolve any Google Cloud validation error first.
- If returning to a same-origin approach, consult Firebase's documented reverse
  proxy setup: https://firebase.google.com/docs/auth/web/redirect-best-practices#proxy-requests
  Test the transparent proxy, OAuth callback, service worker, browser popup and
  installed Android sign-in/sign-out/sign-in flow on real devices *before*
  production rollout. A mock unit test or Vercel deployment status is not proof
  that Google authentication works. Do not enable the incomplete public-report
  backend or change Firestore rules as part of sign-in troubleshooting.
