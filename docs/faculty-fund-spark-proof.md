# Faculty Fund on the free Firebase plan: security proof

**Experiment only: not enabled, not deployed, and not a complete workflow.**
The production app still uses the disabled callable backend and the existing
production rules still deny direct Faculty Fund writes. Never paste or publish
`emulator-tests/fixtures/faculty-spark-proof.rules` as production rules; it is
an isolated test fixture, not a replacement for the application's rules.

This experiment checks whether the most important part of a Spark-plan design
can be enforced using authenticated clients, Firestore transactions and rules:

* Only a current workspace owner assigns a current member as President.
* An AO creates immutable faculty roster records and separate payments linked
  to a registered person. The document ID prevents another payment for the
  same faculty ID and absence date in this proof (including after a void).
* A draft remittance accumulates payments one at a time. A payment lock and
  matching increment of the draft's amount and count and an immutable history line must be committed together;
  the rules verify both sides. This avoids trusting an arbitrary list total.
* A pending remittance is addressed to the current President. Only that same
  current President can accept or decline; the decision uses `request.time`.
* Acceptance and the corresponding increment of the accepted balance must be
  atomic. Expenses and the matching decrement must be atomic and cannot make
  the accepted balance negative, including when clients race.
* A cancelled or declined batch releases its payments individually while its
  history lines remain immutable. A corrected acceptance requires an AO request
  and a President decision. The proof allows approval only if no expense has
  ever been recorded; this restriction is not the final product behavior.
* Member and remittance receipt confirmations are separate immutable records,
  only available after acceptance and not during a pending correction. A new
  acceptance after correction has its own member receipt confirmation.
* Existing records cannot be erased in the proof. No client may substitute its
  own actor identity or acceptance time.

Tests intentionally try direct forged writes, partial transactions, altered
amounts, repeated acceptance, unauthorized roles, removal and concurrent
spending. The Firestore emulator runs them in GitHub Actions. An emulator pass
is evidence about this fixture, not a security certification or a deployment.

## Important unfinished work

The fixture does not implement the complete user workflow: robust roster/name
validation, genuine calendar dates, Philippine-time payment dates, a complete
interruption/release UI, expense/payment voids, complete audit, receipt
rendering, reports, notifications, recovery, offline handling and UI integration
are missing. The current expense rule is deliberately conservative: an entered
expense time must not precede the most recent acceptance or a previous expense.
That rejects some legitimate historical expenses, and the proof will not allow
correction once any expense has been recorded. A more flexible history-safe
design must be developed and independently tested before rollout. It has no opening balance import. It supports assembling a
batch through multiple transactions, so interruption and retries need an
explicit, tested resume/cancel protocol. A prototype passing its tests must not
be enabled for real records.

Before any rollout the full production rules must be integrated without
breaking existing team rules, exercised in the official emulator with malicious
client and concurrency tests, and published by the Firebase project owner in
its console. Real multi-account testing with fictitious records is still needed.
Spark quotas apply; free usage is not unlimited. A Firebase admin remains able
to override rules, and a normal exported JSON backup is not proof of an
acceptance. No billing upgrade is required to test this approach.

## Separate historical-expense experiment

The independent `faculty-spark-wallet-proof.rules` fixture explores one
alternative to the conservative timestamp restriction: allocate each expense
portion to a particular accepted remittance, and require the expense's actual
claimed time to be no earlier than that remittance's acceptance. Each atomic
allocation decrements that remittance's unspent amount. Emulator tests cover
late-entered and out-of-order expenses, rejection of spending a later
acceptance at an earlier time, and competing allocations. The tests seed the
accepted-remittance balances using rules-disabled setup: **they do not prove
that a client cannot forge creation or correction of those balances**.

This experiment does not yet connect acceptance, corrections, reports, refunds,
voids, app UI, or fully validated multi-remittance expense grouping. In
particular, a shared expense-group label is not an authoritative grouping or
proof that a multi-part expense completed. It is not integrated with the first
prototype, and neither fixture may be published as production rules. No claim
of a complete or audited accounting workflow follows from the tests.

## Integrated acceptance-and-allocation experiment

The separate `faculty-spark-integrated-proof.rules` fixture now tests the two
mechanisms together rather than seeding accepted wallets: President acceptance
and the creation of the corresponding accepted-funds wallet are an atomic
write. Each expense draft is funded by atomic allocations from one or more
wallets; the rules require each allocation's wallet to have been accepted by
that expense's claimed occurrence time. A draft cannot be recorded until its
allocations add up to its amount. If interrupted, a draft can be cancelled and
its individual allocations released once each, with an immutable release record.
A pending remittance correction freezes new allocations from that wallet; the
President can approve the correction only when that wallet is fully unspent.

The experimental `faculty-fund-spark-client.js` demonstrates retries after a
committed response is lost. The integrated fixture supports recorded-expense
voids with reason and server-stamped, individually released allocations;
server-confirmed inspection can resume an interrupted reversal. Payment slots
preserve void history while preventing two active payments for a member/date.
Remittance drafts retain their immutable selected-payment plan, and cannot be
submitted until every selection is linked. Emulator tests exercise these paths,
competing expenses, forged allocation pairs, correction races, receipt locks,
and partial-draft releases.

`faculty-fund-spark-projection.js` checks relationships and reconciles accepted,
spent, reserved and unremitted cash from provided records, exposing unfinished
actions rather than treating draft spending as completed. It is not a security
boundary. The newer isolated `faculty-spark-versioned-proof.rules` fixture
requires each client financial write to atomically advance a shared revision.
The experimental reader checks this revision before and after bounded,
server-confirmed collection reads, rejects changed workspaces and inconsistent
records, and validates the current President against immutable assignment
history. Emulator tests exercise concurrent changes and valid calendar dates.
Administrative SDK writes bypass these rules and this consistency guarantee;
extra reads and the shared revision also have free-tier quota and contention
costs that need measurement.

Experimental receipt, CSV/printable report, diagnostic export and read-only UI
adapter modules are tested against the versioned emulator fixture. The adapter
has no write API and deliberately refuses incomplete multi-step operations that
the existing UI cannot yet resume. The diagnostic export checksum detects
accidental changes, not authenticity, and **cannot restore President
acceptances**. The normal app backup does not include this separate data.

The experimental `faculty-fund-spark-write-adapter.js` also translates UI
operations to deterministic, retryable client operations. Its cancellation
helper does not treat a missing record as cancelled: an earlier request may
still arrive. It distinguishes an already accepted remittance or recorded
expense from a cancellation, and must finish releasing reserved records before
reporting cancellation. Acceptance or finalization can race with cancellation;
a failed cancellation must be retried and reconciled against the server. The
adapter is loaded only by the disabled demo-project app wiring described below.

The isolated `faculty-fund-spark-recovery.js` prototype discovers existing drafts,
partial cancellations and voids, and cancelled/declined/voided remittances with
payments still attached from the versioned server reader. It can resume a
supported draft as its original collector, or let an authorized collector
cancel a draft and finish releasing reserved amounts. It returns a fresh status
and whether recovery remains; callers must distinguish `accepted` or `recorded`
from `cancelled`. Emulator tests exercise a second device with no local token,
other collectors finishing reversals, changed workspaces and lost responses.
This listing is not a lock; writes and final reconciliation can still fail or
race and need retry. The experimental `faculty-fund-spark-pending.js` inspector
compares an original local remittance or expense request against a revision-checked
server record. It does not permit treating a missing record or unfinished release
as safe to clear, and reports the actual status of a matching completed record.
The optional bounded `faculty-fund-spark-pending-reader.js` fetches only that
request's parent, revision and (when release must be checked) its selected
payments; it still depends on matching rules and is not a full-ledger audit.
The isolated `faculty-fund-spark-history.js` supports bounded payment or expense
pages and rejects changes between pages, but does not establish a balance or a
complete report. In the disabled demo wiring, the UI can inspect pending
remittance and expense tokens against the discovery namespace, and clear them
only when the inspector confirms a safe status. Other pending operation types
still rely on their original retry. Only records already visible on the server
can be found:
a missing draft does not prove an earlier request cannot still arrive. Nor can
this discover a completed operation's original browser intent if its local token
was lost. This remains dependent on the experimental rules, bounded full
collection reads and shared revision. The illustrative calculation in
`faculty-fund-spark-quota.md` shows that a modest hypothetical history can
exhaust the daily free-read quota after only 23 full refreshes, even before
rule and other app costs; actual project usage and contention remain unmeasured.

The newer `faculty-spark-discovery-proof.rules` and `faculty-fund-spark-discovery.js`
experiment use a separate `sparkDiscovery*` namespace, a protected linked-payment
counter and a release-needed flag to page recovery work without scanning all
historical records. `faculty-fund-spark-discovery-recovery.js` can resume a
remittance draft, cancel a draft, and finish releasing a remittance or reversing
an expense using targeted server reads. The optional experimental
`faculty-fund-spark-expense-resume.js` can resume a draft for its original
collector, paging through eligible accepted wallets, using deterministic
allocation IDs and enforcing the expense's claimed occurrence time. It checks
protected wallet/remittance state again before each transaction; a rules race or
lost response leaves a draft to reconcile, not a confirmed expense. A response
lost after a mutation remains unconfirmed until another server read; the resolver
distinguishes an already accepted or recorded transaction from a cancellation.
A bounded wallet scan can return an unfinished status and a continuation hint
for the same account, workspace, draft and server revision. Another write
invalidates that hint. It is only a scan position, not evidence that all earlier
wallets remain unavailable; a full restart may still be necessary. The isolated
screen offers an in-memory continuation, but durable cursor storage and behavior
under sustained contention are not implemented or proven. The client caps its
per-record line and allocation inspection at 201 documents, rejecting a result
above 200.

The separate accepted-funds pager checks each open wallet against its accepted
remittance and any pending correction, pins all pages to one protected
revision, and releases a summary only when all pages are exhausted. It is a
partial view of remaining accepted funds, not a full balance, report, audit or
spending permission. It does not validate the full allocation history, and
administrator writes can bypass the rules and revision. The separate activity
pager provides date-filtered payment and expense records while retaining their
void, draft and cancellation states; it does not calculate cash or period
report totals or prove historical completeness against privileged corruption.
Both readers remain experimental and outside the app; see the quota document
for growth and read limitations.

These modules cannot be mixed with the older namespace and have no migration.
Emulator tests reject attempts to hide linked payments and test
concurrent releases; a racing release encountered the rules 1,000-expression
limit and required explicit retry. Discovery and retry must remain available
after any ambiguous result, and rules complexity, index needs and real-project
behavior remain release blockers.

The standalone experimental `faculty-fund-spark-recovery-ui.js` screen displays
server-visible recovery records, their relevant payment and expense details,
and explicit resume, cancel or finish actions. The new optional
`faculty-fund-spark-paged-recovery.js` bridge connects it to discovery and the
targeted resolver: it loads one recovery record per page and inspects at most
200 selected payment documents for a remittance. It requires the page, selected
record and payment reads to agree on the protected revision. Empty pages are
not mistaken for exhaustion, and the screen offers an in-memory expense-scan
continuation. A lost response remains unconfirmed; accepted/recorded outcomes
are distinguished from cancellations. The host must reset it on every
authentication, membership, role or workspace change. The browser test uses
in-memory data, while separate emulator tests exercise the bridge against
fixture rules: neither is a real-account end-to-end test.

`faculty-fund-spark-app.js` now wires the existing app UI to the discovery
reader, writer, pending inspector and recovery screen **only when the disabled
`FACULTY_FUND_SPARK_DEMO` switch is explicitly changed in a demo build**. It
rejects non-`demo-` project IDs, and the real-project rules still deny these
writes. The demo build also needs a separately configured Firestore emulator;
the current app has not been connected to one. The test screen warns against
real data and hides protected backup/restore, which do not exist for Spark.
A full-ledger read is still used for the main state, receipts and reports and
is not suitable for unbounded real-world use. The bounded recovery screen is
accessible even when that state refuses to load because of unfinished work.
Demo emulator tests exercise the UI-contract API; synthetic browser tests cover
the UI separately, not the whole browser-to-emulator flow.

This remains **disabled and not production-ready**. Safe restore, efficient
balances and reports, notification integration, real-device printing, durable
expense-scan cursors, production rules, quota validation and real-account tests
remain unfinished. Do not publish the fixture or enter real fund data based on
this experiment. Emulator and synthetic-browser tests do not replace actual
multi-account tests in Firebase.

### Incremental dated activity browser (experimental)

The test-only fund now offers a separate read-only dated payment/expense browser, even when the complete state read fails. It reads at most 26 query documents per 25-item page (including lookahead), plus two revision reads; later pages repeat the lookahead. Dates use Philippine time. Its server-confirmed pages must share one protected revision; a changed revision, failed page, or scope reset clears displayed results. The browser never totals pages or supplies spend authority. Query ordering can omit administratively malformed documents missing the date field; privileged writes also bypass the revision rules. This is not an audit or proof that the ledger is complete.

This does **not** remove the full reader's 1,000-document-per-collection safety limit, and opening or refreshing the existing fund still performs its full reconciliation. The regular balance, reports, receipts, write planning and notifications remain subject to their existing limits and read costs. Browse requests add reads, rather than automatically reducing the existing refresh cost. Further work needs a protected, reconciled aggregate and safe migration, concurrency, recovery, quota and security tests before replacing any guarded financial calculation. No production readiness or rule deployment is implied; fictitious data only.
