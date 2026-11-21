# Death Aid contributions

On the Dashboard choose **+ Death Aid**, or on Contributions choose **Record
Death Aid**. Step 1 searches existing records by deceased person's name. Select
a suggestion explicitly to add to that record; otherwise enter a new person's
name and optional details, date of death and voluntary suggested amount.
Identical names are never silently merged: a confirmation is required before
creating another record with the same name. Editing existing details is available
from the payment records view until any payment is handed over.

Step 2 records a member's payment, optional position, date, channel and
collector. Member suggestions are drawn from previous Death Aid payments, not a
general member directory. Payment channel and collector inputs also suggest
non-empty values from saved Death Aid payments in the current workspace; new
values can be typed and nothing is filled automatically. Selecting a suggested
member reuses their identity and displays their
payments for the current deceased person; typing a name alone does not select an
identity. Duplicate names require confirmation before creating a separate
identity. **Save & add another** stays on the payment form; **Save & close**
opens the Death Aid dashboard on Contributions. Closing the workflow also returns
to the dashboard after any unsaved changes are confirmed. An optional
individual acknowledgment can be printed after
saving, or later from the payment records. Each individual acknowledgment prints
on A4 with a paying-member copy in the top half and a records copy in the bottom
half, with signature lines for the receiver and the member. The individual
receipt, single-record report, and combined acknowledgment use a centered
letterhead with the workspace name, location, and uploaded logo if present;
they do not invent government or school affiliations. Exceptionally long
information can extend the copies onto additional pages instead of clipping it.
Closing with unsaved entries asks for confirmation; already saved records and
payments remain. The form survives same-workspace re-rendering.

Choose **Member personally** or **Fund source for member**. Personal payments
are handled outside organization funds and do not change fund balances. A
fund-funded payment creates one linked fund expense on that member's behalf;
it uses only uncommitted cash and cannot overdraw the fund on recorded dates.
Neither type creates a member debt. Suggested amounts are voluntary and do not
cap payments. A member's name and position are snapshots when the identity is
first used. To correct a payment or identity, void the unremitted payment and
record it again. Voiding a fund-funded payment also voids its linked expense;
either the payment or the expense in Transactions starts the same reversal.
Payments in a recorded handover cannot be voided until that handover is voided.
Empty activities can be deleted, and changes/voids are retained in the audit log.

The Death Aid dashboard is always visible on the Contributions page. Each
table row shows the deceased, optional date, number of distinct paid member identities,
total collected, handed over and awaiting handover. On small screens scroll the
table sideways to reach the icon-only actions; their tooltips and the legend
identify each action. The count opens payment records with the deceased's
details and a table of individual installments. In that view, **Preview
acknowledgment draft** includes only payments awaiting handover and does not
record or prove a handover. **Print payment report** includes all payments for
that deceased person, including those already handed over; it does not prove a
handover either. Each
row has a **Print** action for that payment's receipt and, if not handed over,
a **Void** action for authorized users. Scroll the table sideways on a small
screen to reach its action column. Awaiting handover is not an unpaid member
balance. **Add payment** applies to that row. **Preview draft** and **Review
handover** also apply to that row and replace the checked selection with that
one record. For several records, check them and use **Preview selected draft**
or **Review selected handover** in the checked-records panel. The panel shows
the number of checked records and unremitted payments; its actions are disabled
when there is nothing to include. A draft preview and printing do not record or
prove handover, and a draft can be printed without recipient/date details.
After actual handover, review the handover, enter the received date and
representative, and confirm. It assigns all currently unremitted payments
in the selected records, not individual partial payments within a record. Later
payments can be handed over in another batch. Both the draft and recorded
acknowledgment include a **Collected by** signature line as well as **Received
by**. When every included payment names the same collector, that name is shown
on the line. If collectors differ or some were not specified, the document lists
the recorded names and amounts (including any unspecified amount), and leaves
the collector signature name blank for completion. Names reflect the payment
entries and are not proof of a signature. Recorded handovers appear in a
separate history card and can be printed or voided; voiding releases the
payments and leaves an audit entry. Wide combined acknowledgments split columns
into groups of three activities, while the grand total covers the batch.

Death Aid is stored on dedicated contribution-activity records with embedded
payments, in the normal workspace snapshot and JSON backup. Fund-funded payments
are cross-linked to expenses; backup validation checks both sides. Transactions
shows these expenses in the fund ledger and personal Death Aid payments in a
separate non-cash section. Personal entries use a heart icon and neutral amount
(without an income or expense sign), and state that they have no fund impact.
Filter by payment type or search for a member. It is
excluded from ordinary contribution totals and the experimental public report
projection. Access follows existing workspace roles; reviewers cannot record or
void. These records contain sensitive names and bereavement details: share
printed copies and backups only with authorized people. Update all open app tabs
and installed copies before using this feature in a team workspace. Test real
team sync, conflicts and backup/restore with actual accounts before operational use.

Online team members with an open, confirmed team workspace can receive a
notification when another member records cash donations or Death Aid payments.
Alerts compare confirmed team snapshots, omit donation and bereavement details,
and open Transactions. They are device-local and best-effort: there are no push
alerts when the app is closed, no historical replay on first sync, and browser
notifications require permission. Test team syncing and notifications with real
accounts before operational use.
