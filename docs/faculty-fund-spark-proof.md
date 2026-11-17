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

The integrated client fixture demonstrates retries after a committed response is
lost. Firestore emulator tests exercise competing expenses, forged allocation
pairs, incomplete drafts, correction races, receipt locks, and partial-draft
releases. This is still an isolated research fixture, **not app integration or
production rules**. Recorded-expense voids, a complete recovery/export story,
validated date handling, safe browser persistence of multi-step operation plans,
reports, notifications, receipt rendering, and integration with the existing
team rules and UI remain unfinished. Do not publish the fixture or enter real
fund data based on this experiment. Emulator tests do not replace actual
multi-account tests in Firebase.
