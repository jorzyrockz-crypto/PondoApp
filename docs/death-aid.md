# Death Aid contributions

Choose **+ Aid Record** on the Dashboard, or **Record Death Aid** on
Contributions, to open the Death Aid record modal and create an activity with
the deceased person's name, optional details/date and optional voluntary
suggested amount. The Dashboard’s **Death Aid** card opens the register below
the activity workspace and summarizes collected, remitted and awaiting-handover
amounts; awaiting handover is not an unpaid member obligation. Expand the
activity's Payments section and record a named member's payment, position, date,
payment channel and collector. Choose **Member personally** or **Fund source
for member**. Personal payments are handled outside organization funds and do
not change fund balances. A fund-funded payment creates one linked fund expense
on that member's behalf; it uses only uncommitted cash and cannot overdraw the
fund on recorded dates. Neither type creates a member debt. Suggested amounts
are voluntary and do not cap payments.

Use the member dropdown to reuse an existing identity across activities. Names
alone are never automatically matched: same-name people remain separate unless
the user explicitly selects the existing member. The dropdown is derived from
recorded payments; it is not a general-purpose member directory. A member's
name and position are snapshots when the identity is first used. To correct a
payment or identity, void the unremitted payment and record it again. Voiding a
fund-funded payment also voids its linked expense and restores fund cash; either
the Death Aid payment or the expense in Transactions starts the same reversal.
Payments in a recorded remittance cannot be voided until that remittance is voided.
Empty activities can be deleted, and activity details can be edited until any
payment is remitted. Changes/voids are retained in the audit log.

**Print Death Aid report** includes the activity and actual payments, grouped
by explicit member identity, with collector/receiver signature lines. For a
BaPSTEA acknowledgment, select one or more activities, enter the received date
and representative, and print a draft. Printing never records a remittance.
After handover, **Record remittance** assigns every currently unremitted payment
in the selected activities to one batch. It does not select individual partial
payments within an activity; record separate installments when appropriate.
Later payments can be remitted in another batch. A recorded batch can be
printed or voided; voiding makes its payments available again and leaves an
audit entry. Reports prepared for signature do not themselves prove that a
handover occurred. For wide combined acknowledgments, columns are split into
groups of three activities while the grand total covers the whole batch.

Death Aid is stored on dedicated contribution-activity records with embedded
payments, in the normal workspace snapshot and JSON backup. Fund-funded payments
are cross-linked to expenses; backup validation checks both sides. Transactions
shows these expenses in the fund ledger and personal Death Aid payments in a
separate non-cash section. Filter by payment type or search for a member. It is
excluded from ordinary contribution totals and the experimental public report
projection. Access follows the workspace's existing roles; reviewers cannot
record or void. These records contain sensitive names and bereavement details:
share printed copies and backups only with authorized people. Update all open
app tabs and installed copies before using this feature in a team workspace.
Test real team sync, conflicts and backup/restore with actual accounts before
operational use.

Online team members with an open, confirmed team workspace can receive a
notification when another member records cash donations or Death Aid payments.
Alerts compare confirmed team snapshots, omit donation and bereavement details,
and open Transactions. They are device-local and best-effort: there are no push
alerts when the app is closed, no historical replay on first sync, and browser
notifications require permission. Test team syncing and notifications with real
accounts before operational use.
