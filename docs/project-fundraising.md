# Project fundraising

Create a fundraising activity from a project's **Fundraising activity** action,
or choose **Fundraising for a project** on the Contributions activity form.
Choose a project, then add contributors and record the money actually received
individually. Select the fund where each payment was deposited. Each confirmed
entry records one contribution payment, one fund income transaction and an
increase of the same amount in that project's allocation. It does not move
money between bank accounts. Outstanding promises do not increase cash.
Existing tracking-only activities and payments retain their original behavior;
they are never converted into fund income automatically. Quick payments are not
available for fundraising activities; use individual payment entry.

A fundraising activity's purpose and project cannot change after it has
payments. To correct a payment, void it from contribution or transaction
history: the linked income and allocation are reversed together. Voiding is
blocked if the project allocation has already been spent or removing that
income would create a negative dated fund balance. Reverse dependent spending
first. Project allocations cannot be reduced below the amount of recorded
fundraising receipts; void a receipt before releasing its allocation. A fund,
project, activity or contributor with linked fundraising payments cannot be
force-deleted: void the relevant payments first. A project also cannot be
deleted while an activity is set up as its fundraiser; change or remove the
activity first. Regular tracking-only and fund-funded contribution behavior is
unchanged.

The existing acknowledgment and reports retain signature lines. JSON backups
include the payment, income transaction and allocation, and validate that the
links match on import. Receipt files remain on the device where added and are
included in its JSON backup; they do not sync to teammates. Team workspaces
sync their financial data using the existing snapshot conflict safeguards.

This adds a new payment type and linked records. Before rollout, back up each
workspace and close or update old app tabs and installed PWAs on all devices:
older versions do not understand this payment type. Test receipt entry,
concurrent edits, reversal, backup restore, and role restrictions in a separate
workspace before recording real money. A receipt entry is a record, not evidence
that a bank deposit or cash transfer actually occurred.
