# Spark workspace cleanup experiment — NOT deployable

This isolated prototype explores a Firestore-only owner freeze and resumable, bounded cleanup. It is **not connected to the app**, is not part of `firebase.json`, and must not be deployed or used on real workspaces. Starting the experiment irreversibly locks a workspace; it intentionally has no finalization or parent-deletion path.

The candidate rules freeze discoverability and ordinary workspace access for members, stop invite redemption and writes, and permit only the initiating owner to enumerate and delete a small fixed list of direct collections and matching invites. The owner membership and parent remain so cleanup can resume. The experimental client clears one server-confirmed batch at a time and, after known groups are empty, reports only `awaiting-verification`, **not** deletion success. Retrying an interrupted batch is safe for the listed paths; account and workspace changes stop further batches. Security is enforced by the candidate rules, not the client checks.

Important blockers before any real use:

- The experiment does not enumerate unknown/nested collections, historical or experimental Faculty Fund data, server-only backups, or any previously used variants. An administrator's [read-only inventory](../../docs/workspace-deletion-inventory.md) is needed, but is not by itself a complete external-record audit.
- Account-owned workspace indexes, notices, public report copies, Storage files and other external records are not cleaned. Existing offline/downloaded copies cannot be revoked. Server clients bypass rules and must be disabled or coordinated separately.
- The candidate rules cover only the ordinary ruleset, not the real-account Faculty Fund rules variants used by the app. It has no recoverable UI, no finalization proof, no fully tested concurrency and quota strategy, no storage cleanup and no safe registered-name reuse. Firestore rules cannot prove that client-side collection cleanup is complete.
- Its tests use synthetic emulator data, never production. Keep the UI disabled and the production rules unchanged. Actual rollout needs completed implementation, explicit data inventory, security review, emulator and staging tests, coordinated rules/client deployment, and a recovery plan.
