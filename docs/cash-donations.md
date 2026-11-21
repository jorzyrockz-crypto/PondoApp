# Cash donation funds

Use **+ Donation** on the Dashboard for money actually received and
handled under applicable rules. Each new donation creates its own fund with a
zero opening balance and exactly one income transaction. The transaction is the
receipt, so the money is counted once. Give the fund an optional name; otherwise
it is named from the donor and receipt date. A matching donor, date and amount
warns of a possible duplicate across income transactions, but cannot detect every
duplicate. Opening receipts are not linkable income transactions; do not enter
one again as a new donation.

A previously recorded income can be linked only if it is the sole income in a
fund with zero opening balance and is not a linked contribution payment. That
fund then becomes the dedicated donation fund, preserving its existing spending
and allocations; linking adds no income. A mixed fund cannot safely be split
by relabeling one of its transactions. Additional income or fundraising receipts
cannot be added to a donation fund: record each donation separately instead.

The **Cash Donations** card in the Dashboard's funds rail opens the donation
register in **Funds**. Individual funds also appear among the other fund sources.
Open a donation fund to see its transactions, balance, reserved and uncommitted
amounts, and project allocations. In a project's details, allocate available
money from the donation fund, then record project expenses against that
allocation. The optional intended-project text on the donation is just a
reference and does not create an allocation.

The register can filter and print donations together with signatories, including
current spending and balance for the dedicated funds in the filtered view.
Those usage totals include all dates, not just the receipt-date filter. Shared
fund references, if any, are excluded from usage totals because their spending
cannot be attributed to a particular donation. The regular fund/project reports
also show the individual donation sources. Prints are not official DPDS reports,
accounting documents or tax receipts. The DPDS reference/status is a manual
check, not a submission or DepEd confirmation; there is no DPDS integration or
in-kind/service register.

Edit reference details from the register. The reference donor does not change
the original transaction payee. To correct an amount, void the income in
Transactions and record a new donation if dated-cash and allocation safeguards
allow. Reverse dependent spending and release reservations first if necessary.
The voided receipt is retained in audit history; the resulting empty donation
fund can be removed when it has no dependent records.

Donation metadata and the fund designation are in workspace snapshots and JSON
backups. Receipt attachments remain on the device where added and are included
in that device's JSON backup; they do not sync to other devices. Team workspaces
use the existing snapshot conflict safeguards. Test team syncing, conflicts,
backup/restore and permissions with actual accounts before operational use;
this change does not establish DPDS or accounting compliance.
