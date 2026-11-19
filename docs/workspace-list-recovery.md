# Workspace-list recovery

The workspace switcher is an account-owned list, not the authorization source.
A team membership may still exist when an interrupted creation/join or a stale
profile leaves that team out of the list. The exact cause of any particular
missing entry must be investigated; this repair does not prove deletion.

On sign-in and reconnection, the client scans up to 1,000 account-owned
organization request/creation records in pages of 100, and checks candidates
missing from either the local list or the server profile. A server transaction
rechecks the signed-in user's membership and the organization, and adds only
confirmed memberships to the profile using an atomic array union. It never
creates a membership, changes a role or active workspace, or writes financial
records. Account changes, denied reads, removed memberships and unconfirmed
legacy profile migrations do not authorize a repair. Partial/offline failures
are reported in Team; the manual **Refresh my requests** option remains.

Only workspaces referenced in the account's request/creation records can be
discovered by this mechanism. Older memberships or invite-only memberships
without a corresponding record cannot be automatically enumerated under the
current security rules. They may need a valid existing invite or a separate,
verified recovery procedure. The feature does not migrate workspaces from a
previous Firebase project. Reopening the app on the same account and project is
required after this client is released. Never clear storage or recreate a
workspace as a recovery shortcut.

Mock tests do not replace emulator testing with deployed-equivalent rules, nor
real two-device/account verification. No Firestore rules are changed by this
client-only recovery.

## Workspace preloading

The Team list and both header switchers show a checking status during the initial profile and workspace lookup rather than presenting the list as complete. Workspace reads run in parallel and publish together; later refreshes retain the last known labels if a read fails. These labels are session-only display hints, not evidence of access. A missing membership is removed from the profile index only after a transactional recheck; the active pointer is cleared in that transaction if it still points to a removed membership. A failed check keeps the entry, and the user can reconnect to retry. Cached missing organization snapshots do not by themselves cause a removal. Account changes invalidate in-flight initialization and listeners so old results cannot populate the next account's list.

## Workspace display names

An online, confirmed owner can set a shared workspace display name after the updated Firestore rules are deployed. The original registered name and ID stay unchanged: exact search and suggestions continue to use the registered name, and invitations, memberships, financial records, and links are not migrated. This avoids collisions and accidental orphaning, but is not a registered-name change. Permanent deletion remains unavailable; removing only the root document would leave subcollections, member indexes and invites behind.
