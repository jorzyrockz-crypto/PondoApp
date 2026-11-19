# Member-submitted refund requests

**Implemented in this branch; rules and app are not deployed or verified against a Firestore emulator here.** Before release, exercise the actual client and rules in the emulator and in a separate staging project with multiple accounts, then coordinate app and rules deployment. Checked-in rules are not evidence of the live rules. Do not broaden reviewer access to the ordinary financial snapshot.

Confirmed online Viewer / Reviewer team members can submit a request from Overview or Refund History. Their request uses a separate Firestore inbox; it does not edit cash, project allocations, or the shared financial snapshot. Owner and Disbursing Officer can review member requests in the dashboard review queue or under Active refund requests in Refund History. Approval atomically marks the request approved and adds an unpaid, unassigned refund plus an audit entry to the current server snapshot, checking the snapshot baseline and revision. Rejection records a reason in the inbox without creating a payable. Payment can use uncommitted cash without a project, or an assigned project’s unspent fund allocation. Existing Project Manager and approver refund workflows remain separate.


## Requester payment history

Refund History includes a read-only **My refund requests** section for confirmed
team members. It matches the current account UID to member inbox submissions or
ledger requester/creator IDs, never a free-text payee. A requester can submit for
another person; the recorded person to reimburse is displayed separately. Older
entries without a reliable UID are not attributed by name.

The view joins by request/payable ID to the existing snapshot transactions and
non-cash credits; it does not create a second expense or modify financial data.
It shows partial and complete cash payments, non-cash settlements, and audited
payment or credit reversals, including bulk-cleared transactions. Removed or
rejected obligations are derived from their inbox decision or void/rejection
audit record. An approved inbox item whose matching ledger record is missing or
conflicting shows payment details unavailable, not an assumed unpaid balance.
Confirmation of receipt is not collected; a recorded payment does not prove that
money reached the payee.

The section clears while the current team/account, financial snapshot or local
changes are unconfirmed, offline, dirty, or in a sync error. The independently
loaded inbox may still be incomplete; the interface warns about this and lets
members load older workspace inbox pages. Those pages contain all members'
requests and are filtered locally by requester UID, so several pages may be
needed. Entries lacking identity or missing from the existing data cannot be
recovered by this view. Requester notifications link to the matching item when
available, but remain best-effort local alerts; initial snapshots seed existing
payment events and do not guarantee notifications for activity missed before
first use. No rules changes or new private-profile reads are required.

## Recipient identity and transparency review

A team refund form can optionally link the reimbursed person to a current team
member. The link is an explicit user selection; editing the name clears it.
Unlinked free-text recipients remain supported and are never matched to an
account by name. The member ID and payment-recorder IDs are user-entered or
client-recorded metadata, not independent verification of the recipient,
payment, or review. The selector does not transfer money or grant permissions.

Refund History has a read-only **Refund transparency** filter: requester is the
linked recipient, payment recorded by the linked recipient (including a later
void), or recipient not linked. It displays payment and reversal details from
the existing transaction/audit records, with a warning for unconfirmed or
incomplete data. It does not store a review decision or imply independent
approval, and an absent flag does not prove a refund was independently reviewed.
Historical unlinked refunds remain visible under the unlinked filter. All current
workspace members can already read these records. Shared-snapshot editors can
modify the financial data, so this is not a tamper-proof control.

Viewer/Reviewer requests use a separate immutable inbox. An optional recipient
UID is validated against current workspace membership by the updated Firestore
rules and retained during approval; older submissions without it still work.
Rules must be reviewed, emulator-tested and deployed to the intended project
**before** app clients submit linked Viewer/Reviewer requests. Otherwise those
submissions will fail and their local uncertain drafts must be kept for safe
retry. No rules are deployed by the app or by these changes. Upgrade approvers
too: an older approver may omit the new recipient link when converting an inbox
request to a payable; the review view treats differing inbox/ledger links as
unconfirmed, not as a verified flag. Existing project allocations, roles,
manual payment, receipt and backup safeguards remain unchanged.

## Funding and payment

Approval records an unpaid obligation even if there is no funding. It neither
reserves cash nor records a payment. An authorized user can record a payment
without assigning a project, using a selected fund's **uncommitted cash**:
current fund cash minus unspent project allocations. Allocated project funds
remain protected. A project may instead be assigned before recording a payment;
then payment must use that project's allocation. Supplier expenses still require
a project. Adding money never pays a refund automatically.

A payment without a project is recorded as a fund expense linked to the refund,
with no project. Partial payments and multiple fund sources are supported, one
payment at a time. Once any cash payment is linked, changing or assigning the
refund's project is blocked until those payments are individually voided, to
preserve consistent payment and refund records. The standalone transaction
link-to-project control also excludes linked payable payments. These checks are
client-side; avoid editing the same workspace simultaneously in older app
versions, which do not contain this protection.

Active refunds show an informational funding indication from the current
workspace snapshot. A project-free refund uses uncommitted cash; a refund with a
project uses that project's unspent allocations and fund cash. An unconfirmed,
offline, dirty or failed team sync shows funding as unavailable rather than
asserting a zero balance. Amounts are point-in-time comparisons, not reservations;
other obligations may depend on the same money, and payment-date and later-balance
checks can reduce what is payable. Indicators do not change a stored status.

Approvers may explicitly reject a request with “No available funds,” but the
confirmation warns that rejection closes the request. An approved unpaid refund
is the appropriate choice when it remains a valid obligation and should wait for
funding. Partial payments remain possible when an eligible amount is available.

The requester receives confirmation only after the server transaction succeeds. An uncertain attempt is retained as a local, account-and-workspace-scoped draft with a stable ID, so retry checks the same server record instead of making another request. The form can check the server for that ID; discarding a draft after an absent check requires confirmation because an earlier in-flight attempt might still complete. Browser storage can be evicted or unavailable, so this is not an independent backup. Requests and decisions are retained in the separate team inbox and **are not included in the current JSON financial backup**. Confirmed decisions are displayed in the Refund log, deduplicated against matching ledger audit entries; that display does not copy the inbox into the backup. The log initially displays decisions from the latest 100 inbox entries with older-page loading; up to 100 separately queried pending requests appear alongside other active refunds. Dashboard counts and the approver queue include those confirmed pending items. A “+” means there are more than 100; reviewing the displayed pending items makes room for others. A pending count is unavailable rather than zero if its server query cannot be confirmed. Pending requests do not affect cash or approved refund balances. Owners and disbursing officers receive a local best-effort notification for confirmed pending items (including existing items on first load); notifications are not server push and are scoped to the account and workspace. The confirmed inbox also notifies the requester about rejections from the last seven days (only within the latest 100 requests); approvals continue to use the shared audit alert. The rejection reason is shown in the refund log, not the lock-screen message. All current workspace members can read inbox details; removed members lose server access, but data they already saw or copied cannot be recalled.

Optional refund receipt images can be shared in separate bounded Firestore documents, for both reviewer submissions and editor-created refunds. See [refund-itemization.md](refund-itemization.md) for image processing, integrity checks, deployment and backup limitations. Other types of attachment remain device-local.

The rules constrain member-created documents and limit decisions to Owner/Disbursing Officer. They do not prove that an authorized editor used the intended approval transaction: as with the existing team snapshot, malicious authorized editors can modify financial data directly. There is no server-side per-member rate limit. The app guards confirmed membership, current workspace, connection, recovery state, and snapshot consistency, but multi-device and offline edge cases require live validation.

## Release checks

- Run the ordinary workspace Firestore emulator suite for each intended rules variant, including unauthorized/forged writes, member removal, role changes, and competing decisions. Unit mocks do not prove security rules.
- Test requester and approver on separate real staging accounts/devices, with permission changes, network loss before and after commit, local draft recovery, old/updated clients, pagination and snapshot conflicts. Verify approval never pays cash and cannot duplicate a refund.
- Plan coordinated app and rules rollout; existing deployments will deny the new inbox until matching rules are deployed. Verify the exact target rules and database, keep backups and a rollback plan. Do not deploy unrelated experimental rules or assume the app deployment also deploys rules.
