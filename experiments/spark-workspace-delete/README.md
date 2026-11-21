# Spark workspace cleanup experiment — NOT deployable

This isolated prototype explores a Firestore-only owner freeze and bounded, resumable cleanup. It is **not connected to the app**, is not part of `firebase.json`, and must not be deployed or used on real workspaces. Starting it irreversibly locks a workspace; it intentionally has no finalization or parent-deletion path.

The candidate rules freeze ordinary workspace access and invitations, and permit the initiating owner to enumerate and delete only listed direct collections and matching invites. Member and request cleanup also removes the corresponding account index without granting access to unrelated profile fields. The owner membership and parent remain. A returned `awaiting-verification` state is **not** confirmation of deletion.

The experiment cannot enumerate unknown or nested data, external indexes, notices, public reports, Storage, server-only backups, or downloaded copies. An administrator's [read-only inventory](../../docs/workspace-deletion-inventory.md) is necessary but is not a complete external-record audit. Synthetic tests do not establish parity with deployed rules. Server clients bypass rules and need separate coordination. Do not deploy the prototype: safe rollout requires a full inventory, security review, emulator and staging tests, recovery plan, and coordinated client and rules changes.
