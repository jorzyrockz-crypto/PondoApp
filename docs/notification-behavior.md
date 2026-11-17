# Notification behavior and limitations

Notifications are best-effort, **not a guaranteed delivery or payment system**.
They are generated on this device from confirmed snapshots of the active team
workspace. There is no backend push service, email, or SMS. An operating-system
notification needs browser permission and an open app window; support varies by
browser. Open each team workspace to catch up. The bell and its read state are
local to this account, workspace, and browser profile; they do not sync between
devices. A notification that a refund payment was *recorded* is not proof that
the recipient received funds.

## Covered events

- Existing pending refund and linked-record deletion requests are surfaced to
  owners and disbursing officers; new requests appear after confirmed sync.
- The identified requester is notified when a request is approved or rejected.
  They are also notified when another teammate records or voids a payment for
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
