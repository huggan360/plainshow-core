# Changelog

## 0.1.0

- plainshow.se becomes the PlainShow dashboard. It signs in through login.plainshow.se like every other app.
- Widget dashboard: greeting, server health, services, recent activity, and admin widgets for accounts, service health and sign-in activity.
- One account page for the whole platform: profile and picture, password, two-factor with recovery codes, sign out everywhere, and the Nextcloud and server account links.
- Administration: accounts (roles, status, server account, per-service access, password links), services (on and off, default access by role), and the audit log.
- Extension registry built from manifests, with the permissions model shared with login through plainshow-kit.
- `/api/core/v1` with bearer tokens from login.
- `/design` specimen for choosing typefaces and checking the nested boxes.
