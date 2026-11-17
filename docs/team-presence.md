# Team member updates and presence

Settings → Team listens to the active organization's members collection. A
server-confirmed membership change is rendered without manually refreshing. The
workspace switcher also refreshes while open. Cached/incomplete member
snapshots do not prove that the signed-in user was removed. Signing in or
opening an invitation does not by itself prove that membership was created;
automatic invitation join failures are now shown, and the original URL remains
available for a retry. If a member is missing, verify the active organization,
account, join status and sync errors on both devices.

The header displays a stack of recently active members instead of the account
name while an organization is active. The account/workspace menu remains
available on small screens. The stack is accessible by keyboard and opens Team
settings; on very narrow screens it shows one avatar and a +N count to keep
other controls visible. It shows only members in the confirmed member list who
have a recent confirmed presence timestamp. It is not a list of all members.

## Presence semantics and privacy

When a confirmed member opens an organization, their client writes one
server-generated `lastSeen` timestamp to `organizations/{orgId}/presence/{uid}`
and renews it approximately every 60 seconds while the app remains active.
All organization members may read these timestamps; outsiders cannot. Members
may write only their own timestamp. No financial data or activity history is
stored in presence. Each member has at most one presence document per
organization, even across tabs; historical values are overwritten. Stale
documents are retained until an owner or the user deletes them. Presence
reveals recent workspace use to other members; treat this as personal data.

Only a server-confirmed listener snapshot is used; cached or pending writes
are not shown as confirmed presence. After 150 seconds without a heartbeat a
member is considered no longer recently active (the visible stack is refreshed
at most 30 seconds later). On a normal connection a new heartbeat arrives
without a page reload, but network latency and Firestore availability mean it
is not guaranteed to be instant. Closing a tab or switching accounts does not
immediately remove presence because another tab may still be open. Background
tab throttling, sleeping devices, network failure, clock skew and old clients
can cause false positives or false negatives. Presence is not proof of active
attention or a substitute for synchronized financial records. If the listener
is offline or denied, the header says team presence is unavailable, not that
members are offline.

Each active device may write around 60 timestamps per hour and the presence
collection listener reads changes for the active workspace. Large teams,
multiple tabs, reconnects and longer sessions increase Firestore usage and
cost; review quota/billing and privacy requirements before enabling widely.
Existing installed apps must be updated before their heartbeats are visible.

## Deployment and validation

Presence needs the new `firestore.rules` **and** the matching client deployed;
merging the repository alone does not deploy Firestore rules. Until rules are
published, presence fails closed without blocking financial sync. Validate the
rules with the Firestore emulator and test in a separate staging Firebase
project with two accounts, multiple tabs, sign-out, switching workspaces,
network interruption, member removal, reviewer access, and sleeping devices.
The normal Node tests use mocks; browser layout tests do not verify real
Firebase sign-in or presence delivery.
