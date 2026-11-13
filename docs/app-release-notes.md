# App releases and What’s New

For each app-shell release, update the `pondo-vNN` cache version in `sw.js`, the
`release` constant and displayed app version in `index.html`, the worker's
`.pondo-update-ready-vNN` marker, and the release notes in the About panel.
Update the PWA and About tests to match. The About button in More always opens
the current notes.

On service-worker activation, the new worker records a marker only if an older
Pondo cache was present. After the tracker is ready, the panel opens once for
that release and waits for other dialogs to close. Dismissal is remembered in
local storage. Fresh installations do not show an update notice. Storage
failures can prevent or repeat the notice; they must never block app startup or
the update itself. The update button still uses the existing save/sync checks
and confirmation. This does not provide background push notifications.
