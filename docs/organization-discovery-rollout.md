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

## Release gate and evidence checklist

The PR must remain a draft until the release owner has recorded the results
below. A green preview or emulator check is not evidence that the live backend
is ready. Do not put credentials, private organization names, user data or
backup files in this repository, PR comments, or CI logs.

### Isolated staging setup

- [ ] Create a separate, non-production Firebase project and register its own
  web app. Confirm its project ID, Auth domain, API key and app ID in the
  Firebase console. Enable Firestore and Google sign-in there and configure
  only the staging host as an authorized domain.
- [ ] **The checked-in `index.html` targets `russapps-pondo`. Vercel and
  GitHub preview deployments of this branch also target that project unless
  their app configuration is replaced.** Do not sign in or test write flows
  on an unmodified preview believing it is staging. Deployment previews are
  separate hosts, not separate Firebase projects.
- [ ] Produce a disposable staging-only copy of the app with the *entire*
  `firebaseConfig` replaced by the staging web app's configuration. Host it
  on a distinct origin, never the production Pages or production Vercel origin.
  The public-report viewer has its own configuration; exclude that unfinished
  feature from this test and do not deploy its backend. Never commit staging
  credentials or config changes to the production app by mistake.
- [ ] Use clean browser profiles and staging-only accounts and synthetic data.
  Local workspace data, drafts, images, service workers and authentication
  caches can persist by origin and are not fully account/project scoped. Do
  not use, clear, or overwrite real users' browser data. Check the loaded
  client source, Firebase console project and network requests before testing;
  stop immediately if any client connects to production.
- [ ] Explicitly select and verify the staging project before deploying only
  the organization functions and Firestore rules. Verify the deployed rules
  and function targets against the reviewed commit. The registry is not ready
  until the audit and migration complete; the staging test must exercise those
  steps, including an initially empty and a representative existing registry.

### Real-account test evidence

Record date, reviewed commit, environment/project ID, app origin and version,
rule/function versions, tester, pass/fail and a private issue link. Use at
least an owner, requester, reviewer and editor in separate clean profiles.

- [ ] Confirm private and public exact-name searches, normalized-name collision,
  owner-only visibility and absence of private data in directory results.
- [ ] Confirm pending and rejected requesters cannot read snapshots, roles
  cannot be escalated, approval grants only its chosen role, and removal or
  role changes take effect. Test invite creation/redemption and exhaustion.
- [ ] Test two owners deciding the same request and two users registering the
  same normalized name at once; check stored records and access, not just UI.
- [ ] Test legacy and current clients, offline/reconnect, stale tabs, concurrent
  snapshot edits, draft export/recovery, account switching and mobile devices.
  Verify backups restore in an isolated environment before any cutover.
- [ ] Verify callable failures and rate limits are understandable to users;
  review App Check, monitoring, abuse response and operational ownership.

### Production go/no-go

- [ ] Release owner approves the maintenance window, verified independent
  backups (including device-local attachments), conflict-resolution plan,
  communications, access controls and recovery plan.
- [ ] Stop old clients and all organization/snapshot writers; independently
  verify the intended production project and audit results. The migration's
  confirmation flags are attestations, not enforcement of the maintenance.
- [ ] Coordinate new rules, organization functions, migration and app release;
  confirm the registry marker, deployed targets, app version and actual access
  with designated accounts before resuming edits. Merging to `main` publishes
  GitHub Pages, so merge timing is part of this release, not a harmless step.
- [ ] On any failed check, keep maintenance in place and investigate. Reverting
  rules alone can reopen legacy writes and invalidate uniqueness; do not resume
  service or clear the ready marker as an improvised rollback. Reconcile data
  with verified backups and re-audit under an explicitly reviewed recovery plan.
