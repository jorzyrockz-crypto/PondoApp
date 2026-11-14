# Organization discovery: Firebase Auth + Firestore

Organization creation, search, owner visibility and approval-based joining
use only Firebase Authentication and Firestore. No organization Cloud
Functions, separate name registry, or initialization script is needed for a
new, empty project. This code is not deployed just by changing the repository.
Firestore security rules and the client must be published together.

## How names and privacy work

The organization document ID is its name, lowercased for ASCII A–Z with repeated spaces
collapsed. Firestore rules require that ID to match the lowercased display name
and atomically create the first owner. A document cannot be created twice, so
concurrent registration of the same name has one winner. New organizations are
private, and only their owner can change discoverability. Slash and control
characters are not accepted in names; surrounding and repeated whitespace is
normalized. Unicode names are supported, but Unicode normalization and
visual lookalikes are **not** folded together. For example, a full-width letter
and an ordinary letter can be distinct names. Unicode casing may differ by
platform for unusual characters; test intended languages in staging.

Anyone signed in who knows an exact public name may read its small profile
(name, creator ID, creation time and discoverability), not the financial data.
Private profiles are member-only, but attempting to register a known name can
reveal that it is taken. Direct name-based IDs can also reveal a name to anyone
who is separately given the ID. The app does not list all organizations. Owners
must verify requesters out of band: a displayed name or email is supplied by
the requester and is not proof of identity. Existing invite links continue to
grant their configured role without a second approval.

Firestore-only access has no server-side per-user search/request rate limits.
Authentication is not a substitute for abuse controls. Review Firebase usage,
quotas, billing, App Check and monitoring before exposing the service broadly.
Receipt attachments and logos remain device-local and are not cloud-synced.

## Deploy safely

1. Confirm the target project truly has **no existing organizations** before
   using this design. Organizations created by the previous functions-based
   implementation use different IDs and would require a separate, carefully
   designed migration; this change does not migrate or reconcile them. Never
   run the old registry initialization script for the new design.
2. Test the client and rules together in a separate Firebase project first.
   The checked-in app and unmodified Vercel previews point to production
   `russapps-pondo`. Use a disposable staging-only copy with its entire Firebase
   web configuration replaced, a separate origin, clean browser profiles,
   staging-only accounts and synthetic data. Verify the target project before
   signing in or writing. Don't deploy the unrelated public-report functions.
3. Update the production Firestore rules to this branch's `firestore.rules`
   and publish the matching app in a coordinated window. The currently deployed
   older rules and app expect Cloud Functions; they are incompatible with this
   Firestore-only client. Do not publish only one half and assume it works.
   Close old tabs and update installed PWAs. Applying rules requires access to
   Firebase Console or an authenticated administrator; repo changes alone do
   not update Firestore. No Firebase settings or data are changed by CI.
4. Verify with separate real accounts: same-name concurrent creation, private
   and public search, owner-only visibility, rejection and approval, reviewer
   read-only access, removal, invite redemption, offline/reconnect, device
   switching and snapshot conflict recovery. Keep old clients closed during
   verification. If validation fails, stop and investigate before inviting users.

## Automated security tests

`npm ci --prefix emulator-tests --ignore-scripts` and
`npm --prefix emulator-tests run test:firestore` run the actual client module
and checked-in security rules against a loopback-only demo Firestore emulator.
Java and emulator download access are required. The GitHub workflow performs
these tests without Firebase credentials or deployment. Passing emulator tests
is not a substitute for testing the deployed rules and real accounts/devices.
