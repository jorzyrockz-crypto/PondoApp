# Refunds settled with non-cash credits

For an approved refund, **Refund History → Grant non-cash credit** records one
credit for a specified absence date. Each credit settles exactly ₱250 when it is
granted; the specified date can be past or future. Grant separately for each
date. A refund must have at least ₱250 outstanding; any smaller remainder stays
outstanding and may be paid in cash using the existing payment flow. Duplicate
dates on the same refund are blocked. If another refund with the same payee
name has a credit for that date, the app warns, but names are not unique IDs and
users must verify the person and date themselves.

This is a record of an approved settlement, not an attendance, payroll or leave
system. Verify the arrangement and authorization under applicable school
policy. It does not grant or verify leave, mark attendance, pay salary, or
confirm the person actually used the date. The credit remains settled until it
is explicitly voided. The feature does not automate external school systems.

The cash paid, non-cash settled and outstanding figures are distinct. Granting a
credit creates no fund transaction, does not reduce fund cash or spend/release a
project allocation, and does not create another expense. The financial report
includes the aggregate non-cash settled amount in the payable table so the
outstanding figure reconciles; it does not print the specified absence dates.
The transaction ledger and its audit panel do not list credit details. The
Refund History log and backed-up audit data retain the date, amount, grant and
void history. From Refund History, voiding a credit requires a reason, reopens
₱250 of the refund, and has no cash effect. Any recorded cash payment is separate.

In a team workspace, the app permits only owners and disbursing officers to
grant or void credits; an unapproved refund cannot be settled. Personal/offline
workspaces can manage their own records. These are app-level controls, not a
separate private datastore: confirmed workspace members can access the shared
snapshot, including credit dates and audit history. Do not treat this feature as
restricted access or use it to hide a settlement from authorized reporting.
Keep backups secure. Test role changes, cloud conflicts and real multi-user sync
before operational use; update all app copies first.
