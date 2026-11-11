# Public report implementation — not ready for deployment

This work is incomplete. Do not deploy the Cloud Functions or enable public Firestore access yet. The app has no owner-facing publishing controls or personal-workspace update loop, and the public Firestore rules are deliberately unchanged. No report is publicly accessible.

## Implemented groundwork

- `functions/projection.js` builds a minimal projection using only generic entity and transaction labels, dates and integer amounts; no source IDs or free-text fields are included. Only explicitly selected scopes are emitted.
- `functions/validate.cjs` independently checks an untrusted projection at the publishing boundary. Its schema is strict and it enforces record-count and encoded-size limits; failures prevent publication rather than truncating data.
- `functions/index.cjs` contains an initial trusted publishing service with owner checks, a non-publishing preview, confirmation bound to the exact previewed report and settings, separate public records, revocation, team refresh from the latest snapshot, and link rotation on every publish confirmation to reject delayed updates from older configurations. The eventual controls must warn that confirming new settings invalidates the previous link. Its tests use an in-memory Firestore mock, not the Firebase emulator or production.
- `public-report/index.html` and `viewer.js` contain a read-only iframe view. The service worker avoids caching that page as the main app shell. The viewer marks cached or offline data as potentially outdated or revoked.

## Required before release

- Complete owner controls with an explicit preview and confirmation of what is public; warn that dates and amounts may still identify individuals, even with generic labels. Use the server preview for team reports and show its exact result; if the digest no longer matches at confirmation, request and show a fresh preview. For personal reports preview only a sanitized projection, never the private snapshot.
- Complete personal updates using only a sanitized projection from the local device when it is open and online. Enforce workspace and account isolation, ordering, retries, and visible stale/failed status.
- Verify team updates, concurrent edits, event ordering, owner changes and revocation races using the Firebase emulator and real deployed functions. Audit the callable service and restrict Firestore access to exact public records, while retaining private workspace protections. Revoke must prevent republishing by a delayed event or delayed enable request; preview digests alone do not provide ordering or prevent replay. Implement and test a durable generation/consent protocol before release.
- Verify status and recovery for invalid or oversized reports, offline changes, workspace switches, stale clients, deletion, and re-enabling. Never silently publish partial data.
- Verify iframe rendering and authentication in target browsers, deploy the required service and rules under an authorized Firebase project, and test end-to-end before declaring the feature live. Cloud Functions may require billing and additional configuration.

The schema uses generic entity labels as well as generic transaction labels to avoid revealing personal names in user-entered titles. Any future option to publish names or descriptions requires separate review and consent. Revocation cannot remove copies already seen by visitors.
