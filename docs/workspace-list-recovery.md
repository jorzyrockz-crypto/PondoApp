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
