# Contribution PDF pagination regression

Activity reports can be printed while a detail dialog is open. The dialog
normally locks root scrolling; print CSS must release that lock and keep the
print container in normal document flow so tables can continue onto more pages.
The shared container is also used by Death Aid, donations and other office
reports. The same CSS remains isolated to printing and does not unlock a dialog
on screen.

`node --test tests/*.test.cjs` checks the print CSS and report data. The optional
`tests/contribution-print-pagination.browser.cjs` generates real PDFs with
synthetic data, extracts their text, and checks every contributor, payment,
workspace activity and Death Aid member, as well as signatories and print
cleanup. It opens the actual contribution detail dialog for the named report.
It does not access Firebase or use real records.

Example isolated setup (requires Chromium and Python):

```sh
npm install --prefix /tmp/pondo-print-deps playwright-core @sparticuz/chromium
python3 -m pip install --target /tmp/pondo-print-python pypdf
NODE_PATH=/tmp/pondo-print-deps/node_modules PYTHONPATH=/tmp/pondo-print-python \
  CHROMIUM_PATH=/path/to/chromium node tests/contribution-print-pagination.browser.cjs
```

Omit `CHROMIUM_PATH` to use the `@sparticuz/chromium` executable if its shared
libraries are installed. Browsers and PDF tools differ; verify a saved PDF in
the user's browser before distributing reports containing financial details.
