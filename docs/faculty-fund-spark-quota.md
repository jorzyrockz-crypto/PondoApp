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

The reader refuses to load a collection once it exceeds 1,000 documents by
default. No safe archival or pagination solution is implemented. Shared-revision
contention and rule-dependent reads also require measurement.

## Release gate

Do not enable the prototype for normal use merely because it works on a small
empty workspace. Redesign reads and recovery to operate on bounded pages and
needed records without weakening consistency, provide a verified way to handle
growing history, measure representative emulator and real-project usage, and
include all project traffic in the free-plan budget. Keep an explicit response
for quota exhaustion and preserve uncertain tokens. Do not enable billing or
use Firestore paid backups/PITR as an implied free recovery mechanism. Firebase
lists those features as requiring billing in the usage-and-limits reference.
