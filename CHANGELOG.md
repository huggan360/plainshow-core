# Changelog

## v1.3.0

- While a part of PlainShow installs an update, its site shows an "updating" page that reloads by itself; the dashboard's Updates page carries on while the dashboard updates itself.
- Old versions are removed from the server once an update is live.
- New error pages (401, 403, 404, 429, 500, 503) on every PlainShow site.
- Kit 1.6. AGENTS.md for developers.

## 1.1.1

- Let dashboard widgets size to their content on phones; show all list rows and server gauges without filler rows.
- Distinguish Cloud access from an account that has actually been created.
- Grant Cloud and Web access only to people with linked accounts in those services.
- Use the PlainShow orange and a thicker border for dashboard profile pictures.

## 1.1.0

- Cloud widgets use PlainShow Cloud directly, without a separate Nextcloud connection.
- Cloud is managed through Updates, with the frontend's health endpoint checked after installation.
- Remove the Talk widget and preserve old Nextcloud connection records in a rollback archive.
- Use PlainShow Kit 1.4.

## 1.0.0

- Design studio at `/design`: drag widgets into place on a live preview at desktop, tablet or phone width in either theme; size, rename and give them a glow; save for yourself or, for admins, as a role's default. Tokens (type, colour, boxes) on their own tab.
- Notes, bookmarks and an updates widget for admins; extension widgets from Blog, LaTeX and Split.
- Permissions manager: the role matrix per service, and allows and denies for single people. Every change is audited.
- Updates: installed and latest versions of every part with changelogs; one-step installs that switch back by themselves when the health check fails; switching to any kept release.
- API: personal tokens on the account page, `plainshow.se/api/{service}/v1` for every service behind one token, and documentation at `plainshow.se/api`.
- Security: wildcard role rules no longer grant core's own capabilities (members could read the audit log).
- Outfit for text and Source Serif 4 for titles; the orange brand; page titles on the page.

## 0.1.0

- plainshow.se becomes the PlainShow dashboard. It signs in through login.plainshow.se like every other app.
- Widget dashboard: greeting, server health, services, recent activity, and admin widgets for accounts, service health and sign-in activity.
- One account page for the whole platform: profile and picture, password, two-factor with recovery codes, sign out everywhere, and the Nextcloud and server account links.
- Administration: accounts (roles, status, server account, per-service access, password links), services (on and off, default access by role), and the audit log.
- Extension registry built from manifests, with the permissions model shared with login through plainshow-kit.
- `/api/core/v1` with bearer tokens from login.
- `/design` specimen for choosing typefaces and checking the nested boxes.
