# Firebase project switch: rollout checklist

Pondo's web configuration now targets Firebase project `russapps-pondo` rather
than `class-scheduler-63968`. This changes the backend used by the app **after
this client is deployed and updated**. It does not configure the Firebase
project, deploy rules, migrate data, or turn the incomplete public-report
feature on. The public-report viewer points to the same new project only to
avoid contacting the old project; do not deploy its backend or enable public
reads.

## Before switching users

1. Inventory and independently verify backups of anything worth preserving in
   the old project and on each device. This includes team workspaces, personal
   browser records, unconfirmed team drafts, receipts, logos and preferences.
   The user has said no real financial records have been entered yet; verify any
   test or organization data separately rather than assuming it is disposable.
   Do not clear browser storage, uninstall, or overwrite old data to test.
2. A Firebase project is a separate identity and database boundary: old Auth
   users, user profiles, team memberships, invites and Firestore documents do
   not automatically move. The same Google account can have a different UID in
   the new project. Recreate test organizations and invites, or plan a separate
   verified migration; old links need not work.
3. Local tracker storage and personal-workspace caches are **not fully scoped by
   Firebase project or signed-in account**. Changing this configuration does
   not create a clean local workspace or provide account isolation; the same
   browser can show existing local data under the new login. Never assume that
   a new login means a blank or isolated personal workspace. Test with a separate
   browser profile and account, and do not put real financial data in the app
   until account isolation and recovery have been implemented and verified.
4. Initialize Firestore in the intended project, enable Google as a sign-in
   provider, and authorize the exact hosting domains in Firebase Authentication
   (e.g. the GitHub Pages host; any additional Vercel/custom domains require
   separate authorization). Confirm that the web app registration and Auth
   setup belong to the intended Firebase project. PWA sign-in may require
   browser-specific testing and redirect-domain configuration.
5. Use a **non-production Firebase project** and the Firestore emulator first to
   test the checked-in rules and app. Verify deployed rules separately before
   any real use: changing client configuration does not deploy `firestore.rules`.
   Do not loosen rules to make sign-in or sync work. See `team-sync-rollout.md`
   for concurrent edits, recovery, security limitations and coordinated rollout.
6. Keep the old project and verified backups available until a deliberate
   cutover and recovery plan has been tested. Old installed PWAs and open tabs
   can continue using the old Firebase project until updated; prevent mixed
   client use and verify the actual app version and target on each device.

The provided measurement ID is included in the web configuration, but Firebase
Analytics is not imported or initialized; this change does not enable analytics
or tracking. If analytics is desired, design consent and privacy disclosures
before enabling it. Firebase web API keys are client-visible identifiers, not a
substitute for Auth and enforced Firestore rules.
