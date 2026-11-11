# Team sync hardening: rollout and limitations

These changes are not a production-readiness certification. Do not deploy the
public-report functions or enable public reads. Test in a separate Firebase
project first; the checked-in rules are not necessarily the rules currently
running in production.

The new client compares both the last server-confirmed snapshot and its
revision inside a Firestore transaction. Legacy snapshots without a revision
are treated as revision 0; the first successful new-client write adds revision
1. The checked-in rules require subsequent writes to increment that revision,
require the authenticated writer ID, and deny snapshot deletion. They reject
old clients' unconditional writes, so old installed PWAs and open tabs must be
updated or closed. An authorized client can still deliberately issue a blind
write with a guessed current revision: security rules cannot establish that a
write was performed through the intended transaction. This is not protection
against malicious authorized editors.

## Before any rollout

1. Export and independently verify backups of each workspace on the devices
   holding them, including local-only receipt images and logos. Team snapshots
   do not contain these images. Stop team edits and close old clients.
2. In a non-production Firebase project, test the rules and app together with
   the Firestore emulator and actual clients, including concurrent writes,
   transaction retries, offline/reconnect, legacy documents, stale app shells,
   permission changes, storage quota failures, and recovery after reload.
3. Plan the app/rules deployment as a coordinated maintenance window. There is
   no zero-downtime compatibility between old and new clients and the new
   rules: old clients cannot write with the new rules, and new-client safety
   cannot be guaranteed while old clients can write under the old rules. Confirm
   the deployed rules and app version and verify all clients have updated
   before resuming edits. Keep verified backups and a rollback plan; rolling
   back rules reopens the old unconditional-write risk.
4. A conflict or failed write stops sync rather than merging financial records.
   The device stores an unconfirmed draft in localStorage when possible. After
   reload, Settings → Team offers a download and an explicit discard option.
   Verify the downloaded draft before discarding it; reconcile its records
   manually with the team copy. Browser storage may be unavailable or evicted;
   this draft is not a substitute for an independent backup.

Account isolation, actual Firebase rule enforcement, device recovery, and
end-to-end multi-user behavior still require review and validation before any
production release. Node tests use mocks and are not emulator security tests.
