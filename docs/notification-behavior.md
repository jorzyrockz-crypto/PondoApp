# Notification behavior and limitations

Notifications are best-effort, **not a guaranteed delivery or payment system**.
They are generated on this device from confirmed snapshots of the active team
workspace. There is no backend push service, email, or SMS. An operating-system
notification needs browser permission and an open app window; support varies by
browser. Open each team workspace to catch up. The bell and its read state are
local to this account, workspace, and browser profile; they do not sync between
devices. A notification that a refund payment was *recorded* is not proof that
the recipient received funds.

## Alerts while Pondo is open

New eligible bell entries show a temporary, dismissible in-app banner while the
page is visible. The Faculty Fund retains its own notice. The banner opens the
existing bell destination and does not independently approve or pay anything.
When several alerts arrive together, the newest banner replaces the previous
one; all remain in the bell. A best-effort sound uses the app's configured
sound pack and volume; sound can be disabled in Settings and is rate-limited.
Mobile autoplay restrictions may require a prior tap, and silent mode, device
volume and audio focus can still prevent sound. The banner does not require OS
notification permission.

Account approval, join-request and removal inbox entries are announced once per
account and browser profile, including unread entries seen on initial load.
A bounded local cursor suppresses repeats, but storage clearing or eviction can
cause catch-up alerts again. Already read entries do not alert.

The app first tries a regular browser notification; if the constructor is not
supported (as on many Android browsers), it asks the Pondo service worker to
show one. An active Pondo worker and notification permission are required.
Tapping it targets only the originating open window and rechecks the account,
workspace, role and notification before navigation; if that window has closed,
the alert is simply dismissed. Phone settings, browser notification channels,
Do Not Disturb, battery optimizations, and browser lifecycle can suppress OS
alerts or sound. This is still not server push: an open tab can be suspended,
and events in unopened workspaces may not be detected until opened again.

## Team profiles and navigation

Team activity alerts show the relevant confirmed member’s profile photo when
available, or their initials. Photos are loaded only from approved Google
profile-image hosts; missing, removed, unavailable or untrusted profiles use a
neutral fallback. The stored feed contains the member UID, not a copy of the
photo; the profile is resolved from the current workspace’s confirmed members.
Older alerts without an actor UID use the neutral fallback.

Browser/OS alerts use local category icons for due and overdue contribution
reminders, backup reminders, refund requests and related payments, and reliably
identified contribution, income, expense, donation and Death Aid activity.
Generic attributed team updates may use the confirmed member's approved Google
profile photo instead. Photos are loaded from that host (without a referrer)
when an alert is generated; this can disclose the request to the photo host.
A failed or slow preload uses the local category or Pondo icon. The current
recipient, membership, role, workspace and photo are checked again before
asynchronous delivery. Unknown or ambiguous events without a safely resolved actor use the Pondo icon;
older alerts are not reclassified by their editable title. Images are not stored in the
notification feed. The browser or OS may fetch a photo again, crop, replace or
ignore an icon, and a successful preload cannot guarantee later OS rendering.
Local icons are included in the offline app shell. Permission and an open app
window are still required; this feature does not add background push.

Click or keyboard-activate an alert to open its destination in the **currently
active** workspace. When a newly observed contribution payment can be matched
unambiguously to one activity and monthly period, it opens that activity;
ambiguous or no-longer-available records open the contributions workspace
instead. Donation and Death Aid alerts retain their transactions destination;
review and reminder destinations are unchanged. Older team alerts use their
summary to choose a workspace, or the dashboard if it is unclear. Alerts do
not switch organizations. If a dialog is open, close it and activate the alert
again; the alert is not marked read until navigation can proceed.

## Covered events

- Existing pending refund and linked-record deletion requests in the shared
  snapshot are surfaced to owners and disbursing officers after confirmed sync.
  Confirmed pending submissions in the separate member refund inbox also notify
  owners and disbursing officers once per account, workspace and browser profile.
  Existing pending items can notify on first confirmed load; open Refund History
  → Active refund requests or the dashboard review queue to act. The pending listener
  is capped at 100 items and shows a lower-bound count if more exist.
- The identified requester is notified when a request is approved or rejected.
  For Viewer-submitted member requests, rejections are detected from the separate
  server-confirmed inbox and alert only the submitting UID. The client catches
  up on rejections from the last seven days, including on first use of this
  feature; only the latest 100 inbox entries are watched, so older entries may
  be missed. Alerts are device-local and can be repeated after storage loss.
  Approvals continue to use the shared audit notification. The requester is
  also notified when another teammate records or voids a payment for
  their refund, or cancels/voids their refund. Notifications identify the
  submitter by recorded UID, not by the free-text reimbursement name. A different
  payee, or an older record without a requester UID, cannot be safely targeted.
- When a non-cash refund credit is granted or voided, the identified requester
  and owners/disbursing officers can receive a generic alert. A cash transaction
  or ordinary contribution payment void also alerts owners/disbursing officers;
  this includes a fund-funded Death Aid payment void with a linked expense.
  These messages omit names, amounts, dates and reasons; authorized users can
  open the record for details. A requester who is also an officer receives only
  one targeted alert for a refund cash-payment void. Names alone cannot identify
  an affected member, and older credits without requester IDs cannot be targeted.
  A separate generic team-update alert may still appear for the same sync.
- A member gets a notification when their confirmed team role changes. A missing
  member or permission-denied listener cannot reliably distinguish removal from
  a connection/rules failure; the app instead reports the sync/access error.
- One-time contribution activities with tracked due dates produce local due-soon,
  due-today and overdue reminders. Monthly activities have no tracked monthly
  due dates, so cannot generate those reminders. Backup reminders use the active
  account and workspace; an export is not proof of a verified restorable backup.

Review decisions, payments, financial safety events and role changes are not replayed on the first
confirmed snapshot on a particular device; that initial snapshot seeds the local
cursor. Later confirmed changes can be detected when returning, provided the
local cursor and the necessary records remain available. Catch-up is bounded to
1,000 recent decision/payment or reversal entries per category. Credit alerts use the audit log, so a pruned or overwritten audit entry cannot be recovered. A payment made
and voided while the workspace was closed may only produce the void alert;
cascading deletion and overwritten audit history can also erase context. The
feed retains at most 60 entries per account/workspace. Multiple open devices may
independently notify; local storage eviction, quota errors, browser lifecycle,
permissions, and sync conflicts can delay or lose alerts. Older unscoped
notifications are left in storage but hidden because their account and workspace
cannot be identified safely.

Before release, verify with two real accounts and devices: role changes,
request submission/decision, credit grant and void, transaction and contribution voids, partial payment, workspace switching,
offline catch-up, notification permissions, storage errors and sign-out. Node
unit tests use mocks and do not substitute for Firestore emulator or browser
multi-device tests. Firestore rules do not independently enforce the app's
financial approval checks; see `team-sync-rollout.md`. Do not deploy the
incomplete public-report backend.

## Faculty Fund (requires matching deployed backend and rules)

In a confirmed team workspace, server-confirmed Faculty Fund snapshots can
notify the addressed President of a pending remittance or correction, and the
submitting AO of a subsequent acceptance or decline. Messages are generic and
omit names, amounts and absence dates. Clicking one opens the Faculty Fund in
the same workspace. Cursor state is local to the account/workspace; existing
pending items may alert on first confirmed load, but historical decisions are
not replayed on first load. These are best-effort alerts, not evidence of a
handover or a replacement for checking the register. The Faculty Fund backend
is disabled until separately deployed and explicitly enabled after testing.
