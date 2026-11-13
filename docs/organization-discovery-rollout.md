# Organization discovery: staging and rollout requirements

This feature is NOT deployed by this change. Do not deploy it to production or
assume that Node mocks prove Firestore authorization. Organization creation,
search and requests fail closed until a trusted registry migration is complete.
The separate `organizations` Functions codebase is intentional: do **not**
deploy the unrelated public-report codebase or enable public financial reads.

## Behavior and limits

* Signed-in users can search for the **full** registered name, not browse or
  autocomplete a directory. A result contains only the name and organization
  ID. An owner must opt in; existing and new organizations start private.
* A pending request does not create a member. An owner must explicitly approve
  it and select a role (reviewer by default), or reject it. The requester uses
  Refresh my requests and Add to my workspaces after approval. Requesters should
  be verified by owners through a trusted channel; a name/email is not proof.
* Existing invite links intentionally still grant their configured role on
  redemption, without a second approval. Treat them as access credentials.
* Names are NFKC-normalized, whitespace-collapsed and lowercased with JavaScript
  Unicode lowercase; confusable characters and every language's full Unicode
  case folding are not resolved. Registration of an occupied private name
  necessarily reveals that the name is unavailable. Names are globally
  reserved even when private. Search and requests require connectivity.
* The registered team name is distinct from the financial report's editable
  organization name. In-app team renaming and deletion are not implemented;
  the registered name remains reserved. Manual admin changes are not safe.
* Join request lists are manually refreshed and limited to 100 entries. The
  simple per-account rate limits deter casual abuse, not coordinated scraping;
  evaluate App Check, quotas, retention, monitoring, and abuse response before
  production. No email or push notification is provided.

## Before rollout

1. Back up and independently verify every workspace and Firestore data. Close
   old clients, stop all team creation/rename/admin writers, and plan a
   coordinated maintenance window. Existing team snapshot conflict and
   account-isolation cautions in `team-sync-rollout.md` still apply.
2. In an isolated Firebase test project first, deploy and test the *new rules*
   and only the `organizations` functions with real multi-account clients and
   the Firestore emulator. Confirm old clients cannot create or rename orgs,
   members and invites continue to work, pending users cannot read snapshots,
   simultaneous normalized name creation has one winner, private search is
   hidden, and approval/rejection/removal races do not grant extra access.
   Verify offline/reconnect, retries, function failures, role changes, rate
   limits, iOS/Android, and account/workspace switching. Test against the rules
   actually deployed, not merely checked-in files.
3. With all writers stopped and the new rules in place, run the migration audit
   with administrative credentials in the intended project:
   `GCLOUD_PROJECT=PROJECT node organization-functions/migrate.cjs`.
   It reports invalid and duplicate names without choosing a winner. Resolve
   each conflict with affected owners through a separately reviewed maintenance
   procedure, then repeat the audit. Do not print or publish private names.
4. Only after reviewing the audit and project ID, run the same command with
   `--apply --writers-stopped --confirm-project=PROJECT` (substitute the exact
   `GCLOUD_PROJECT` value). The flags are explicit human attestations, not proof
   that writers are stopped or backups exist. It writes name reservations and
   marks existing orgs private;
   the ready marker is written last. It can be retried if interrupted before
   the marker, but **only** while all writers remain stopped. Check the registry
   and marker, rules, functions and updated app clients before resuming edits.
   Do not run migration on an active system: scanning and writes are not one
   global transaction. A partially migrated system must remain unavailable.
5. Deploy the client, functions and rules as one coordinated release. Old app
   shells cannot create organizations under the new rules. Rolling back rules
   would allow unreserved names and invalidate uniqueness; plan recovery and a
   fresh audit before any rollback. Do not mark migration ready by hand.

No production migration, Firebase deployment, App Check setup, live-account
security validation, or physical-device test is performed by these changes.

## Automated emulator test suite

`emulator-tests/firestore.test.cjs` exercises checked-in Firestore rules with
real emulator clients and the organization service against the same emulator,
including unauthorized writes, invitations, role revocation, concurrent name
reservation and approval, and the migration audit/apply path. It is fixed to
the `demo-pondo-security` project and refuses to run without a loopback emulator.
Run `npm ci --prefix emulator-tests --ignore-scripts` followed by
`npm --prefix emulator-tests run test:firestore`; Java 21 and network access
to obtain the Firebase emulator are required. The pull-request workflow runs
only these demo emulator checks, with no Firebase credentials or deployments.
A passing emulator run does not replace tests with multiple actual accounts,
real deployed rules, Firebase Functions, App Check, offline and devices.
