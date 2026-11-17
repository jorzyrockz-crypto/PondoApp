# Faculty Fund Spark prototype: quota assessment

**Not production-ready.** This is an illustrative calculation from the current
experimental reader, not a measurement of the owner's project. No Firebase
project has been changed. The Firebase Spark free tier currently includes
50,000 Firestore document reads and 20,000 writes per day, with quotas shared
across the project and reset around midnight Pacific time. Exactly one database
per project gets the free quota. See [Firestore usage and limits](https://firebase.google.com/docs/firestore/quotas).

## One full experimental read

`faculty-fund-spark-read.js` reads the revision twice, the President config
once, and queries all 12 collections. It fetches every document in each query
(up to its limit), rather than just the records needed for the displayed page.
Firestore charges at least one document read for a query, even when it returns
no documents, and security-rule dependent reads can incur additional reads.
See [Firestore pricing](https://firebase.google.com/docs/firestore/pricing).

Example, assuming the revision and configuration documents exist:

| Collection | Documents returned | Query reads before rules |
| --- | ---: | ---: |
| People | 100 | 100 |
| Payments | 500 | 500 |
| Payment slots | 500 | 500 |
| Remittances | 50 | 50 |
| Remittance lines | 500 | 500 |
| Wallets | 50 | 50 |
| Expenses | 100 | 100 |
| Allocations | 100 | 100 |
| Corrections | 0 | 1 |
| President history | 1 | 1 |
| Member receipts | 300 | 300 |
| Remittance receipts | 20 | 20 |
| **Collection queries** | | **2,222** |
| Revision twice and config once | | **3** |
| **One full read, before other costs** | | **2,225** |

At these fictional counts, 23 full reads are **51,175** document reads before
security rules, other app traffic, retries, listeners, or transaction reads.
That alone exceeds the 50,000 daily free-read quota. A recovery action can read
more than once. Every protected write also updates the shared revision, adding
a document write; multi-payment remittances and multi-wallet expenses involve
multiple transactions. This is not a guaranteed cost or a prediction of the
user's usage. The project may also have data and traffic from other features.

The full reader refuses to load a collection once it exceeds 1,000 documents by
default. Shared-revision contention and rule-dependent reads also require
measurement.

## Bounded experiments

Several isolated modules reduce reads for specific purposes, but do **not**
replace all full-ledger reads:

* `faculty-fund-spark-pending-reader.js` checks one known uncertain request. It
  requests three server documents (revision, parent, revision) in the common
  case. A cancelled, declined or voided remittance also checks each selected
  payment, at most 200. Missing documents and changed revisions fail closed.
* `faculty-fund-spark-history.js` reads one payment or expense history page at
  a time. A page requests up to the page size plus one lookahead document and
  reads the revision before and after. It refuses to combine pages after the
  revision changes. This is an individual-record list, **not a reconciled
  balance, complete audit, receipt or report**.
* `faculty-fund-spark-activity.js` similarly pages date-filtered payments and
  expenses in the separate discovery namespace. Payment dates are date-only;
  expense occurrence timestamps are grouped by UTC+08:00, with inclusive date
  endpoints. Both categories must finish at one revision to exhaust that
  window. Results keep draft, cancellation and void statuses and provide no
  totals. The list is not a balance, audit, period report, or proof that
  entered dates or cash movements reflect real events.

A separate `faculty-fund-spark-discovery.js` experiment pages three filtered
categories: remittance drafts, remittances with payments still to release, and
unfinished expenses. Each page reads at most the selected page size plus one
lookahead, with revision reads on both sides. The corresponding isolated rules
fixture maintains a release counter and a discovery flag atomically with each
payment link or release. Completing the three lists requires exhausting every
page at the same revision; it is not a lock on subsequent changes.

The discovery fixture uses a **new, separate `sparkDiscovery*` namespace**. It
must not be pointed at older prototype records, which do not have protected
counters; no migration has been implemented. Concurrent release attempts in the
emulator hit Firestore's 1,000-expression rules limit for one contender. The
test verifies that remaining work stays discoverable and an explicit retry can
finish it, but the rules complexity and contention are not production-ready.

These are request counts, not measured billable usage: rule-dependent reads,
index entries, retries and other traffic are additional. The pages and focused
reader rely on matching revision-enforcing rules and immutable record/link
invariants; administrator writes bypass those rules. Firestore emulator tests
exercise isolated fixtures, not production rules or production index
requirements. `faculty-fund-spark-accepted-funds.js` is a separate paged
summary of the remaining accepted wallets in the discovery namespace. It
reads at most page size plus one wallets, the corresponding remittance per
visible wallet, an additional correction document for each frozen wallet, and
the revision before and after each page. Lookahead documents can be read again
on the next page. All pages must finish at one revision before a total is
returned; any intervening protected write requires a restart. The summary
separates unfrozen and correction-frozen unspent amounts and includes the effect
of draft reservations. It is **not** total cash, income, expense, a reconciled
ledger, a report, or authorization to spend: an expense's date and later
changes can further limit which funds it may use. It does not independently
reconstruct each allocation or detect all administrator corruption.

This reduces the scope to accepted wallets but still grows with their count,
including fully spent open wallets; it does not guarantee free-quota operation.
Firestore rules and query index needs, real-project costs, concurrent changes
and the user experience of restarting must be evaluated before integration.
The isolated targeted resolver can resume remittance drafts and
finish cancellations or reversals without that full reader. Its optional
expense resumer pages eligible wallets, rechecks individual records and uses
retry-safe allocations. It scans at most 200 wallets by default and fails
without claiming completion if the scan limit or available funds are exhausted;
partial allocations remain reserved until resumed or cancelled. A release can
still read up to 200 selected payments; expense inspection fetches at most 201
allocation records and rejects more than 200. These are bounded requests, not
proof of staying within the free quota. Query indexes and real-project cost are
unverified. None of these modules is connected to the app. The full reader still
serves the prototype's balances, reports and existing recovery adapter, so the
1,000-record limit and high read costs remain for those paths.

## Release gate

Do not enable the prototype for normal use merely because it works on a small
empty workspace. Redesign reads and recovery to operate on bounded pages and
needed records without weakening consistency, provide a verified way to handle
growing history, measure representative emulator and real-project usage, and
include all project traffic in the free-plan budget. Keep an explicit response
for quota exhaustion and preserve uncertain tokens. Do not enable billing or
use Firestore paid backups/PITR as an implied free recovery mechanism. Firebase
lists those features as requiring billing in the usage-and-limits reference.
