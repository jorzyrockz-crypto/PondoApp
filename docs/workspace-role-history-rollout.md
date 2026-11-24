# Workspace role history rollout

The existing owner-managed role selector records changes under `organizations/{orgId}/roleHistory`. Each entry is written in the same transaction as the member role update, with a server timestamp. The existing manual handover remains two separate changes: promote the new owner, then have that owner change the previous owner's role. Multiple owners remain supported.

## Deployment

Deploy the matching Firestore rules and app release together, after reviewing the currently deployed rules and any external/admin integrations. Deploying these rules first prevents older app versions from changing roles without history; they must update before changing roles. Deploying the app first causes its role-change transactions to fail until the matching rules are live. Schedule a short role-change interruption, deploy the rules and app, then verify on a test workspace using an updated client. Do not assume an existing browser has updated automatically. Other workspace functionality does not require migrating historical data.

The rules protect normal Firestore client writes; privileged Admin SDK operations bypass Firestore rules and must not change member roles without separately preserving the audit invariant. Check any such integrations before rollout. Do not overwrite deployed rules without checking for unrelated changes.

History only covers role changes made after the matching app and rules are active. It does not backfill earlier changes or record invitations or removals. The Team panel shows the most recent 100 entries, online, to workspace members. Historical names fall back to user IDs when a person is no longer in the member list. These records are stored in Firestore, not in the app's JSON backups; include them separately in any workspace backup or retention plan. Workspace members can read this history, so it should not contain sensitive details beyond the recorded identities and roles.
