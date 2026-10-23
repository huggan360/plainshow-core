# Changelog

## v1.10.0

- Administration: one page for the admin area, with a card per part you may open (accounts, services, permissions, updates, audit log) and a figure on each. It is in the account menu for people who may use it; the sidebar no longer lists the admin pages. The admin pages have tabs to move between them.
- The API page is gone: Account, API tokens now says how to use a token, with each service's address and what it can do.

## v1.9.2

- Design studio: widgets rise as high as they can and close the gaps, also on the dashboard itself; a widget pushed aside while another is moved goes back when it passes.
- Design studio: while an edge is dragged, a light stand-in with the widget's name and size follows the pointer exactly, and the widget is drawn at its new size when let go. No more lag or freezing.

## v1.9.1

- Design studio: moving a widget works on a full dashboard; it pushes the others aside. Sizing still stops at the neighbours.
- Design studio: sizing follows the pointer smoothly; the widget's contents keep their size until the edge is let go.
- Design studio: the phone screen fits its widgets.
- Widget settings: choices are segmented buttons, on and off and the things to show are switches in rows.

## v1.9.0

- Design studio rebuilt: the dashboard itself at full size, with a bar on top: Desktop or Phone, the widgets in menus by kind (Dashboard, News, Weather, then each service), and for admins the dashboard being edited (yours, or a role's default). No light and dark switch and no text; the design tokens are behind the palette button.
- Free sizing: drag any edge of a widget (the orange bars on hover) to size it on a grid of twelve columns and rows of one unit. It snaps to the grid, never smaller than the widget allows, never wider than the page, and stops at its neighbours instead of pushing them. Drag a widget to move it.
- Phone layout: the phone follows the desktop (top to bottom, in one column) until you change it on the phone; then it is its own, and changing the desktop no longer changes it. "Follow desktop" makes it follow again. A phone can only change its own layout.
- Small widgets: at two or three columns and rows a widget has no title and shows only what matters: the clock, the temperature, the services as four icons, today and the next event, or the top story.
- News widgets: Headlines (a list, with or without pictures), Top story (the biggest stories over their pictures, turning every few seconds) and News strip (stories side by side). Each can show the top or the local edition, and a section.
- The system's own dashboard is now a greeting beside the weather, with the services and the top story under them.
- News: the headlines beside a section are rows like the widgets', as many as fit beside the feature, ending in a row to the section. The reader puts the article on a page of its own, with the source and links on the left and more to read on the right.

## v1.8.0

- News: the big title is gone; a bar of sections under the date (Front page, then your topics in your order) opens a topic as its own page, with a line that slides to the open one. Section headings on the front page open their section too.
- News: alerts from the authorities lead the page: VMA, SMHI's warnings when your town is inside the warned area, and Krisinformation (MSB) for your county or marked important. Alerts can be closed (a VMA cannot).
- News: the reader shows the whole article where the source publishes it openly (SVT, Sveriges Radio, BBC, The Guardian and others), else the summary.
- News: a new first-time setup, three short questions one at a time, where each topic is skip, show or more of it. What you want more of leads the front page and gets more room; the same choices are in the settings.
- News: the column of headlines no longer sits on its rule.
- Weather app: SMHI's warnings here and within 80 km, nearest first, each opening to its text; a warning over the place itself shows under the temperature. API: `/weather/warnings`.

## v1.7.0

- News: a news app in the dashboard, laid out like a paper. A lead story in large type, the next stories beside it, the latest headlines in a narrow column, then a section per topic with a feature and a column of headlines. Two editions: Top news and Local (SVT's regional desk for your county, and stories that name your town). Search on top, settings in the corner (town, topics, sources), a short setup the first time, and a reader with the story's summary and a link to the whole story.
- Sources are open RSS feeds, no keys: SVT, Sveriges Radio Ekot, DN, SvD, Dagens industri, Aftonbladet, Expressen, Sydsvenskan, BBC, The Guardian, Al Jazeera, NOS, Ars Technica and The Verge. Sweden comes first. Stories without a picture in their feed get the one their page shares. Pictures are passed through plainshow.se and kept for three days.
- News widget: the latest headlines with pictures; it expands into the News app.

## v1.6.2

- Weather app on phones: the report rows no longer run out of the frame (the hours strip widened everything to a whole day's width). Narrow screens get a thinner frame and rows that keep only what fits.

## v1.6.1

- Weather icons: one outline set that the icon font really has, so light rain, drizzle and snow show a symbol.
- Weather widgets show as many hours and days as fit at a readable size, so they no longer shrink on phones.
- Core apps on a computer fill the window below the top bar without the page scrolling; on phones and tablets they are normal pages with the usual margins.
- Weather app on phones and tablets: stacked hero, smaller hours you can swipe, figures two by two, compact hour and day rows, and a radar with its settings behind a button.
- Opening the Weather app from a widget: the widget's sky now grows smoothly into the app (a scaled copy instead of a resized one), its text fades as it grows, and the copy only fades once the app has drawn its own sky.

## v1.6.0

- Core apps: apps inside the dashboard itself, listed in the sidebar above Services. They open in the content area in one large frame, and their widgets have an expand button in the corner that grows the widget into the app. Weather is the first; News comes next.
- Weather app: the sky of the place behind everything, crossfading when you change place, with a quiet map of the place blended into the hero. Search on top, your places as dots beneath it, a heart to save a place and a blue house to make it home. The coming hours step one hour at a time; below, the weather now in figures and the full report by hour or by day.
- Home place: the weather widgets show your home unless a widget has a place of its own. A widget without any place asks for one and makes it your home.
- Rain radar tool: open the radar from a place and it fills the frame. Drag and zoom the map, choose one to six hours, play or scrub through them at three speeds, set how strong the rain shows, read the scale in mm/h, and point at the rain to see how hard it falls there (over Sweden). The radar widget opens straight into it.
- API: `/weather/radar` takes `hours` (1 to 6).

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
