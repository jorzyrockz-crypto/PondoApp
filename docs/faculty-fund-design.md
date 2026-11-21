> **Retired:** Faculty Fund is no longer active in the app. This document is historical; see [retirement and data preservation](faculty-fund-retirement.md) for scope and remaining deployment considerations.

# Faculty Fund — implementation and rollout status

**Not production-ready or deployed.** The repository contains an in-app
Faculty Fund workspace and a separate server codebase. The callable functions
are disabled unless `PONDO_FACULTY_FUND_ENABLED=true` is explicitly configured
in the deployment environment. Do not enable them or use real money until the
Firestore emulator, real multi-account tests, accounting review, backup and
rollout checks below are complete. This is not an official accounting system.

## Workflow

- In a confirmed, online team workspace, open **Funds → Faculty Fund**. An
  owner designates a current team member as Faculty President. The designation
  is separate from their normal app role; a reviewer can still be President.
- An owner or disbursing officer (AO) registers faculty members explicitly.
  Same-name people have distinct IDs; verify identity before selecting one.
  Record a payment after actual cash is received, with member, absence and
  payment dates, and amount (default ₱250). One active cash payment per
  member/absence date is supported. Partial-installment and duplicate-name
  exception workflows still require review before production.
- The AO selects collected payments and submits a remittance. Only the
  **currently assigned President addressed by that submission** can accept
  or decline it. Acceptance uses the server clock. The AO may cancel a pending
  submission with a reason; this frees payments for a corrected submission.
  Reassigning the office does not transfer consent for an existing submission.
- Only funds from accepted remittances can be used for recorded Faculty Fund
  expenses. The user enters the actual expense date and time in Philippine time;
  the server checks it against acceptance timestamps. The entry is not proof of
  when the money actually changed hands.
- After acceptance the AO may preview individual member acknowledgments, up
  to 200 currently unprinted member receipts at a time, and a separate
  remittance acknowledgment. Printing itself does not change state. The AO
  explicitly confirms what printed; receipts can be reprinted. The batch print
  confirmation is tied to the last preview, not newly arrived payments.
- To correct an accepted handover, an AO requests a correction with a reason;
  the current President approves or declines it. Approval is blocked when the
  accepted funds are needed to support recorded expenses. Original acceptance
  and correction remain in the audit record. Receipt generation is blocked
  during a pending correction. Pending payments and accepted handovers cannot
  be directly voided. Expense voids and unremitted payment voids need reasons.
- Team notifications are best-effort and device-local. The President can be
  alerted to pending remittances and correction requests; the submitting AO can
  be alerted to later acceptance/decline. Notification text omits member
  names, amounts and absence dates. Initial snapshots do not replay historical
  decisions. OS notifications require permission and an open app.

## Accounting scope

The Faculty Fund is a **separate server-protected cash ledger** from MOOE and
from the existing editable Pondo fund sources. A received absence payment is
one cash IN; an actual activity expense is one cash OUT. A remittance is a
handover, not a second receipt or an expense. Integer centavos and date/time
checks prevent double counting and spending unaccepted cash.

In this branch, confirmed Faculty cash appears once in Overview, the regular
fund-source list, unified Transactions and the cash financial report, while
Faculty remains in its protected ledger. Unavailable data is explicitly
excluded and labeled. The Faculty Fund also retains its own report and audit.
Project allocations, payables, generic income and other normal-fund actions
still cannot use this protected Faculty ledger. Do not manually duplicate the
same payment as a regular-fund transaction. There is no opening-balance import:
confirm a migration and reconciliation plan before using this for an existing
fund. Non-cash refund credits never create a cash receipt; their treatment in
an actual Faculty Fund remittance has not been established. The test feature
and candidate rules are not a production deployment.

## Security, reliability and limitations

The normal team client replaces its whole editable `data/snapshot`. President
acceptance is therefore kept in separate server-owned documents, not the
editable snapshot. Proposed Firestore rules deny client writes to Faculty Fund
state, recovery snapshots and operation records. The callable backend checks
current workspace membership and role inside its transaction, derives actor and
time server-side, and maintains a protected revision. The browser retains a
per-user, per-workspace request ID for uncertain writes; it must retry the same
operation rather than submit another. No changes are available offline.

The Faculty Fund backend is a **separate Firebase Functions codebase** from the
incomplete public-report backend; never deploy the latter as part of this work.
`firebase.json` now names the Faculty Fund codebase. The service uses a bounded
single state document and refuses further changes before its capacity limit;
archival and scaling remain future work. The Firestore security emulator workflow passed in GitHub Actions for PR #103
(run 44088014997), including the protected-record rules and concurrent server
transactions. The local sandbox could not run the emulator because Java and
the official emulator download were unavailable. Unit/browser tests use an
in-memory database; neither those tests nor the emulator establish behavior
of the deployed Firebase project, real account sessions, or offline devices.

All confirmed workspace members can read the Faculty Fund state, including
names and absence dates; this is not a confidential attendance system. Backups
contain sensitive information. A normal Pondo JSON backup does not contain this
separate ledger. An owner can download a separate diagnostic export. Its
checksum detects accidental modification, **not authenticity**; an uploaded
JSON file cannot authorize restoring acceptance. A protected server recovery
point may restore a *missing* state only if its protected revision matches
exactly. It never overwrites live state or reinstates an old President
assignment. A stale backup, lost control document or later changes require
manual recovery. Recovery UI and deployment must be tested before use.

## Before enabling

1. Independently back up existing Pondo data and keep all clients on matching
   versions. Review how existing Faculty Fund cash and older payments will be
   migrated and reconciled; there is no opening-balance workflow yet.
2. Keep `node --test tests/*.test.cjs` and the Firestore emulator suite in
   `emulator-tests/` passing on the release commit. The added rules tests
   verify that owners, AOs, Presidents and outsiders cannot write protected
   state or forge acceptance. Test the callable service with a **real**
   emulator, including simultaneous spending, membership changes, retries,
   offline/disconnect, recovery and interrupted prints.
3. Test with actual AO and President accounts in a **separate Firebase project**
   on multiple devices: assignment, payment, remittance, acceptance/decline,
   printing and confirmation, expenses, corrections, notifications, backup,
   restore, sign-out and workspace switching. Verify no mismatched balances.
4. Coordinate rules, app shell and the isolated Faculty Fund codebase. The
   environment flag must remain off until all checks pass. Deploying only the
   app or only the rules will not make this workflow usable. Have a verified
   backup and rollback plan; never deploy the incomplete public-report backend.

### Optional mocked browser check

`tests/faculty-fund-ui.browser.cjs` drives the workspace with the real domain
and server adapter against an in-memory transaction double. Install
`playwright-core` outside the repository, set `NODE_PATH` and `CHROMIUM_PATH`,
then run `node tests/faculty-fund-ui.browser.cjs`. It covers a 390px AO/
President payment-to-expense flow, but it is **not** a Firebase or rules test.
