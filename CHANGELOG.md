# Changelog

## v1.5.2

- Rain radar: the map is Esri's quiet grey canvas (the old map now asked for a key). The rain is drawn from the radar's own values in calm blues to violet, blended between radar cells so it is smooth, with the place names above it. Your place is a larger dot that no longer pulses.
- Weather: rain falls as single drops, more of them the harder it rains; snow falls as drifting flakes.

## v1.5.1

- Server is back to the bars from PlainShow Web, now with a dark look in the dark theme: a dark tint of each bar's colour instead of the pale track.

## v1.5.0

- Widgets were cleaned up. Lists hold a fixed number of rows. On a computer they scroll one row at a time like the notices on PlainShow Web, with the rounded corners following the rows on screen, and load more as you go. On a phone they show the first rows and how many more there are. Corners no longer break on phones.
- Welcome: centred, with the greeting and the clock in the same colour and size, and the date above.
- Server is now a list like the other widgets: processor, memory, storage, temperature and uptime, each row filled as far as it is used.
- Widget titles follow your language and can no longer be renamed.
- Gradient borders instead of the glow: orange, sunset, ocean, forest, violet or grey, as thick as on PlainShow Web.
- Calendar: a month view, alongside the list.
- New widgets: Weather (now, with a sky that follows the time of day and the weather), Forecast (the coming hours and seven days) and Rain radar (a map around you with the last two hours of rain). Set the place in the Design studio, or in the widget itself.
- Weather in the API: `/weather/places`, `/weather/forecast` and `/weather/radar`. Forecasts come from SMHI in the Nordic countries and Open-Meteo elsewhere; radar from SMHI over Sweden and RainViewer elsewhere.

## v1.4.2

- Background: large soft orange blobs that fade in, drift and fade out, lighting only the glyphs (kit 1.10).

## v1.4.1

- Groups: one card per row, in the same frames as the rest of PlainShow, tinted with the group's colour.
- New background: embers from orange to yellow that move away from the pointer, so you can chase them (kit 1.9).

## v1.4.0

- English, Dutch and Swedish: the browser's language by default, or chosen in the account menu (the choice follows you to every PlainShow site).
- The account menu is the same in every app: Account, the app's own items, Language, Theme, Sign out.
- Groups: your groups as cards; a card opens the group and who is in it; owners edit it from there (name and colour, people and their LaTeX access, owner, delete).
- Dashboard widgets from other services come in your language.

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
