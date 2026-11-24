# Clay profile avatars

The profile picker in Settings → Appearance is for signed-in accounts without a profile photo. The selected preset is saved to the user's profile and, if a workspace is active, to that user's own member record in the same online transaction. Other workspaces receive the choice when the user opens them while online. Existing profile photos take precedence. This does not alter financial records or membership roles.

Deploy the matching Firestore rules with the app after reviewing the currently deployed rules for unrelated changes. Until the rules are deployed, saving an avatar while in a workspace cannot be confirmed. Selection requires an online connection; previously confirmed choices remain available on the same device offline. Preset artwork is cached in the app shell. Account profile changes made on another device are fetched on the next sign-in.
