# Installed app identity and recovery

Pondo's old manifest used `"id": "/"`. The initial CustodianPro manifest
uses `"id": "./"`; manifest IDs are resolved against the **origin** of
`start_url`, not the manifest's directory. If both apps were installed from
`jorzyrockz-crypto.github.io`, both IDs resolve to
`https://jorzyrockz-crypto.github.io/`. Browsers can therefore treat the two
manifests as one installed app, despite the apps having different GitHub Pages
paths. The precise state on a particular device still needs to be checked.
See https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id.

Pondo now declares `/PondoApp/` as its ID, retaining its existing relative
start URL and scope. This ID is a stable identifier on each host; it is not a
redirect. Pondo's worker also deletes only old `pondo-v` caches and only reads
its own current cache. This does not change localStorage, IndexedDB, Firestore,
or other apps' service-worker registrations. These changes have not yet been
verified in real installed browsers.

Changing an app ID describes a **new installation** to browsers; it may not
repair an already overwritten installed shortcut automatically. Before removing
or reinstalling anything, preserve data:

1. Open the exact original Pondo URL in the same browser profile and on the same
   device. Do not switch origin, clear site data or uninstall. The GitHub Pages
   URL is https://jorzyrockz-crypto.github.io/PondoApp/ if that was the original.
2. Sign in to the original account and select the original workspace. If records
   look wrong, are missing, or a recovery/sync warning is present, stop and
   investigate rather than replacing or resetting data. A team recovery draft
   can be downloaded from Settings → Team.
3. If the expected data is accessible, export a backup and verify the file
   independently. Receipts and logos may exist only on the device where added;
   team sync does not carry them. Reinstallation and origin changes must not be
   treated as a data recovery or migration mechanism.
4. Once the corrected version has been deployed and the backup verified, test a
   separate install of Pondo from its original URL. Confirm its name, icon,
   launch URL and data, and test CustodianPro separately before considering
   removal of the old shortcut. Removal can offer to delete site data; do not
   approve deletion without a verified recovery plan.

The CustodianPro repository also needs its own distinct manifest ID; this
repository does not change or deploy it. Other apps sharing the origin should
avoid root IDs as well. Check service workers and storage isolation for each
app. Verify on actual Chrome/Edge installed PWAs, including update and restart,
existing installations, offline behavior and backups before rollout.
