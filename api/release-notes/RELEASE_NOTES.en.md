# Glou release notes

What each version changes, written for administrators and shown in the "What's New?" window after an update (FEAT-115).
`CHANGELOG.md` stays the technical reference. Every change users will notice adds one line here and the same line in
`RELEASE_NOTES.fr.md`, under "Upcoming", in the section that fits: Points of attention, Security, New, Improved, Fixed,
Removed. Points of attention only say what is left to do or to know after the update, never what to do before it.
One plain-text line per note, no Markdown. Releasing moves the upcoming notes under the new `## vYYYY.MM[.PATCH]` heading.

## Upcoming

### Points of attention
- E-mail with the STARTTLS security is no longer sent when the mail server does not switch to encryption. If e-mail stopped after the update and your relay has no STARTTLS, choose "No encryption (trusted local relay)" in Administration → System Configuration → Email, then test the connection.

### Security
- With STARTTLS, the connection to the mail server must now be encrypted, so the SMTP password can no longer leak in clear text. A third choice, "No encryption (trusted local relay)", is for a relay on your own network.
- Wrong two-factor codes typed when turning two-factor off, generating backup codes, trusting a device or confirming an administrator action now count toward the same 5-attempt lock as at sign-in.

### Improved
- Profile → Active sessions: the location is labelled as approximate, each session shows when it signed in, and one button signs out every other session.

### Fixed
- Analytics: at the closest zoom of the world map, spread regions no longer overlap a neighbouring region's marker.

## v2026.11.4

### Points of attention
- Guest links with no expiry date, or opening every cellar for more than 30 days, now expire 30 days after this update. Make a new link limited to the right cellars or collections for a guest who still needs one.
- If the web app is reached directly, without a reverse proxy in front of it, set TRUSTED_PROXY_HOPS=0 in .env and restart. If your compose file overrides the command of the web service, remove that override.
- Analytics → Added, Deleted and Restored now count bottles and cigars from the new stock movements and start again from this update.

### Security
- Security alerts (new device sign-in, password, e-mail, username or two-factor changes…) can no longer be turned off and always reach the account e-mail when the server can send e-mail. The notices about members' accounts move to a new "Member accounts" category.
- Changing your username, and creating a guest link that lets the guest open, drink or smoke, now ask for your password.
- Turning two-factor authentication on revokes the devices trusted before.
- Each visitor's sign-in attempts are now counted on their own address, and wrong passwords are also limited per account: a stranger can no longer block everyone's sign-in. A browser the member already signed in from still signs in while their account is locked, with or without two-factor, and the lock shows in the audit log.

### New
- This "What's New?" window: after each update, administrators see what changed. It opens again from Administration and from the bottom of the sidebar.
- A wine's drawer shows its stock movements: who added, opened, drank, moved, repriced or corrected its bottles, and when.
- Administration → Member Management: delete a member's account now, export a member's data, and schedule or cancel the deletion of an account, also for a deactivated member.
- Analytics: the world map can be zoomed, moved and shown full screen; nearby regions come apart when you zoom in.

### Improved
- Collections are shared by the household: every member sees and fills every collection, and a collection stays when its author leaves.
- Profile → Sign-in and security gathers username, e-mail, password, two-factor and the app lock in one card. The display name and the custom app name moved to their own fields.
- Deleting an account now deletes the member's personal data (wishlist, goals, presets, label scans); bottles, tastings and collections stay for the household.

### Fixed
- A wine's history and its Restore buttons no longer disappear after 90 days: the audit-log clean-up keeps the history of every wine and bottle.
- Drinking, moving or counting a bottle no longer changes the date it was finished, so the consumption analytics and the monthly goal stay right.
- When the server cannot be reached the app no longer waits forever, and while the database restarts it says the server is temporarily unavailable instead of an error.
- Screens refresh at once after any change to the stock (history, goal, suggestions, badges, statistics, budget).
- Screen readers reach the drop-down lists of form windows and the actions menu of a wine's lines; secondary text is easier to read.
