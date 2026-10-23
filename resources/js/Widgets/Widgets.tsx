import { Avatar, Badge, relativeTime, RoleBadge } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { CSSProperties, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { t, locale } from '@/i18n';
import { Fill, Height, List, Row } from './List';
import { Body, LayoutItem, More, useBorder, useHeight, usePaging, useSetting, useWidgetData, WidgetDefinition, WidgetFrame, WidgetItem } from './base';
import { ForecastWidget, RadarWidget, WeatherWidget } from './Weather';

export type { Height } from './List';
export { SLOTS } from './List';
export type { Border, Bookmark, LayoutItem, SettingField, WidgetDefinition } from './base';
export { WidgetItem } from './base';

/*
 * How every widget is laid out.
 *
 * The grid has one row height. A widget is one, two or three rows tall
 * (short, normal, tall), always with the same frame, padding and title, in
 * the visitor's language (titles cannot be renamed). Lists hold a fixed
 * number of rows at once and scroll on a computer (see List.tsx). A widget
 * can have a gradient border instead of the plain one.
 */
const PHOTO_COLUMNS: Record<string, number> = { s: 2, m: 3, l: 4, xl: 5, full: 8 };

/* ---------- Welcome: greeting, clock and date ---------- */
type GreetingData = { firstName: string; role: string; services: number };
function greetingFor(hour: number) {
    if (hour < 5) return t('Good night');
    if (hour < 10) return t('Good morning');
    if (hour < 17) return t('Good afternoon');
    return t('Good evening');
}
function useNow(everySecond: boolean): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), everySecond ? 1000 : 15000);
        return () => window.clearInterval(timer);
    }, [everySecond]);
    return now;
}
export function GreetingWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<GreetingData>(definition.extension, definition.id);
    const border = useBorder(definition.border);
    const display = useSetting<string>(definition, 'display') ?? 'greeting';
    const showDate = useSetting<boolean>(definition, 'date') ?? true;
    const seconds = useSetting<boolean>(definition, 'seconds') ?? false;
    const showRole = useSetting<boolean>(definition, 'role') ?? false;
    const now = useNow(seconds && display !== 'greeting');
    const clock = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined });
    const date = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <section className="ps-frame ps-widget widget-greeting" data-border={border}>
            <div className="ps-frame__panel">
                <div className="widget-greeting__inner">
                    <div className="widget-greeting__main">
                        {showDate && <p className="widget-greeting__date">{date}</p>}
                        {display !== 'clock'
                            ? <h2 className="widget-greeting__title">{greetingFor(now.getHours())}{state.data ? t(', {firstName}', { firstName: state.data.firstName }) : ''}</h2>
                            : <p className="widget-greeting__title widget-clock">{clock}</p>}
                        {showRole && state.data && (
                            <div className="ps-inline widget-greeting__badges">
                                <RoleBadge role={state.data.role} />
                                <Badge>{state.data.services === 1 ? t('1 service') : t('{n} services', { n: state.data.services })}</Badge>
                            </div>
                        )}
                    </div>
                    {display === 'both' && <p className="widget-greeting__title widget-clock">{clock}</p>}
                </div>
            </div>
        </section>
    );
}

/* ---------- Server: the bars from PlainShow Web ---------- */
type SystemData = { system: { model: string; hostname: string; cpuPercent: number; load: number[]; cores: number; memoryPercent: number; memoryUsed: string; memoryTotal: string; diskPercent: number; diskFree: string; diskTotal: string; temperature: number | null; uptime: string }; detailed: boolean };
function Gauge({ label, value, display, tone }: { label: string; value: number; display: string; tone: string }) {
    return (
        <div className={`ps-gauge ps-gauge--${tone}`} style={{ '--value': Math.max(0, Math.min(100, value)) } as CSSProperties} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
            <span className="ps-gauge__fill" />
            <span>{label}</span>
            <span>{display}</span>
        </div>
    );
}
export function PiHealthWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<SystemData>(definition.extension, definition.id, 15);
    const height = useHeight(definition);
    const metrics = useSetting<string[]>(definition, 'metrics') ?? ['memory', 'disk', 'cpu'];
    const details = useSetting<boolean>(definition, 'details') ?? true;
    const system = state.data?.system;
    return (
        <WidgetFrame definition={definition} action={details && system ? <span className="widget-note">{t('Up')}{' '}{system.uptime}</span> : undefined}>
            <Body state={state} height={height}>{() => {
                const s = system!;
                const bars = [
                    metrics.includes('memory') && <Gauge key="m" tone="red" label={t('RAM used')} value={s.memoryPercent} display={`${s.memoryPercent}%`} />,
                    metrics.includes('disk') && <Gauge key="d" tone="orange" label={t('Disk used')} value={s.diskPercent} display={details ? t('{free} free', { free: s.diskFree }) : `${s.diskPercent}%`} />,
                    metrics.includes('cpu') && <Gauge key="c" tone="yellow" label={t('CPU load')} value={s.cpuPercent} display={`${s.cpuPercent}%`} />,
                    metrics.includes('temperature') && s.temperature !== null && <Gauge key="t" tone={s.temperature >= 75 ? 'red' : s.temperature >= 62 ? 'orange' : 'green'} label={t('Temperature')} value={(s.temperature / 90) * 100} display={`${s.temperature.toFixed(0)} °C`} />,
                ].filter(Boolean);
                // A short widget has room for two bars; they are left out here rather than hidden, so the corners stay right.
                const shown = bars.slice(0, height === 'short' ? 2 : 4);
                return shown.length ? <div className="widget-bars ps-chain" style={{ '--bars': shown.length } as CSSProperties}>{shown}</div> : <Fill>{t('Choose bars in the Design studio.')}</Fill>;
            }}</Body>
        </WidgetFrame>
    );
}

function Lead({ icon }: { icon: string }) {
    return <span className="widget-icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>;
}

/* ---------- Services ---------- */
type LauncherData = { apps: { id: string; name: string; description: string; icon: string; url: string }[] };
export function LauncherWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<LauncherData>(definition.extension, definition.id);
    const height = useHeight(definition);
    const descriptions = (useSetting<boolean>(definition, 'descriptions') ?? false) && height !== 'short';
    const hidden = useSetting<string[]>(definition, 'hidden') ?? [];
    return (
        <WidgetFrame definition={definition}>
            <Body state={state} height={height}>{({ apps }) => {
                const shown = apps.filter((app) => !hidden.includes(app.id));
                return shown.length === 0
                    ? <Fill>{t('No services to show.')}</Fill>
                    : <div className={`widget-apps${descriptions ? ' widget-apps--described' : ''}`}>{shown.map((app, index) => (
                        <a key={app.id} href={app.url} className={`widget-app${index === 0 ? ' is-first' : ''}${index === shown.length - 1 ? ' is-last' : ''}`}>
                            <span className="widget-app__icon"><i className={`bx ${app.icon}`} aria-hidden="true" /></span>
                            <span className="widget-app__text"><strong>{app.name}</strong>{descriptions && <span>{t(app.description)}</span>}</span>
                        </a>
                    ))}</div>;
            }}</Body>
        </WidgetFrame>
    );
}

/* ---------- Activity ---------- */
type EventItem = { id: number; label: string; actor: string | null; source: string; at: string };
function eventRows(events: EventItem[], showActor = false): Row[] {
    return events.map((event) => ({ key: event.id, title: event.label, meta: showActor && event.actor ? event.actor : undefined, trail: relativeTime(event.at) }));
}
export function ActivityWidget({ definition }: { definition: WidgetDefinition }) {
    const [limit, more] = usePaging();
    const state = useWidgetData<{ events: EventItem[] }>(definition.extension, definition.id, 60, { limit });
    const height = useHeight(definition);
    return <WidgetFrame definition={definition}><Body state={state} height={height}>{({ events }) => <List height={height} rows={eventRows(events)} empty={t('Nothing yet.')} onEnd={() => more(events.length)} />}</Body></WidgetFrame>;
}

/* ---------- Admin: accounts ---------- */
type UsersData = { total: number; byRole: Record<string, number>; disabled: number; withoutTwoFactor: number; recent: { id: number; name: string; initials: string; avatar: string | null; username: string; lastLogin: string }[] };
export function AdminUsersWidget({ definition }: { definition: WidgetDefinition }) {
    const [limit, more] = usePaging();
    const state = useWidgetData<UsersData>(definition.extension, definition.id, 120, { limit });
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/users">{t('All')}</More>}>
            <Body state={state} height={height}>{(data) => (
                <List height={height} more={{ href: '/admin/users' }} onEnd={() => more(data.recent.length)}
                    figures={[
                        { label: t('Accounts'), value: data.total },
                        { label: t('Admins'), value: data.byRole.admin ?? 0 },
                        { label: t('No 2FA'), value: data.withoutTwoFactor, tone: data.withoutTwoFactor > 0 ? 'warn' : undefined },
                    ]}
                    rows={data.recent.map((user) => ({ key: user.id, lead: <Avatar src={user.avatar} initials={user.initials} size="xs" />, title: user.name, trail: relativeTime(user.lastLogin) }))}
                    empty={t('Nobody has signed in yet.')} />
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: service health ---------- */
type ServicesData = { services: { id: string; name: string; icon: string; version: string | null; state: string; ms: number | null }[] };
const STATE_DOT: Record<string, string> = { online: 'ps-dot--green', error: 'ps-dot--amber', offline: 'ps-dot--red' };
export function AdminServicesWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<ServicesData>(definition.extension, definition.id, 60);
    const height = useHeight(definition);
    const problems = useSetting<boolean>(definition, 'problems') ?? false;
    return (
        <WidgetFrame definition={definition}>
            <Body state={state} height={height}>{({ services }) => {
                // Trouble first, so it is never the part that does not fit.
                const sorted = [...services].sort((a, b) => Number(a.state === 'online') - Number(b.state === 'online'));
                const shown = problems ? sorted.filter((service) => service.state !== 'online') : sorted;
                return <List height={height} more={{ href: '/admin/services' }} empty={t('Every service answers.')} rows={shown.map((service) => ({
                    key: service.id,
                    lead: <Lead icon={service.icon} />,
                    title: service.name,
                    meta: service.version ? `v${service.version.replace(/^v/, '')}` : undefined,
                    trail: <span className="widget-state">{service.state === 'online' ? (service.ms !== null ? t('{ms} ms', { ms: service.ms }) : t('Online')) : service.state === 'offline' ? t('Down') : service.state === 'error' ? t('Errors') : t('Unknown')}<span className={`ps-dot ${STATE_DOT[service.state] ?? ''}`} aria-hidden="true" /></span>,
                }))} />;
            }}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: sign-in activity ---------- */
type SecurityData = { failed: number; locked: number; signIns: number; events: EventItem[] };
export function AdminSecurityWidget({ definition }: { definition: WidgetDefinition }) {
    const [limit, more] = usePaging();
    const state = useWidgetData<SecurityData>(definition.extension, definition.id, 60, { limit });
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/audit">{t('Log')}</More>}>
            <Body state={state} height={height}>{(data) => (
                <List height={height} more={{ href: '/admin/audit' }} onEnd={() => more(data.events.length)}
                    figures={[
                        { label: t('Today'), value: data.signIns },
                        { label: t('Failed'), value: data.failed, tone: data.failed > 0 ? 'warn' : undefined },
                        { label: t('Locked'), value: data.locked, tone: data.locked > 0 ? 'alert' : undefined },
                    ]}
                    rows={eventRows(data.events, true)} empty={t('No sign-ins yet.')} />
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: updates ---------- */
type UpdatesData = { checkedAt: string | null; available: { id: string; name: string; installed: string | null; latest: string }[]; failed: number };
export function AdminUpdatesWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<UpdatesData>(definition.extension, definition.id, 300);
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/updates">{t('Open')}</More>}>
            <Body state={state} height={height}>{(data) => (
                <List height={height} more={{ href: '/admin/updates' }}
                    empty={<><i className="bx bx-check-circle widget-ok" aria-hidden="true" />{' '}{data.checkedAt ? t('Up to date, checked {when}.', { when: relativeTime(data.checkedAt) }) : t('Up to date.')}{data.failed > 0 && <><br />{data.failed === 1 ? t('One update failed this week.') : t('{failed} updates failed this week.', { failed: data.failed })}</>}</>}
                    rows={data.available.map((item) => ({ key: item.id, title: item.name, meta: t('{version} installed', { version: item.installed ?? t('unknown') }), trail: <Badge tone="accent">{item.latest}</Badge> }))} />
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Notes and bookmarks: kept in the widget's own settings ---------- */
export function NotesWidget({ definition }: { definition: WidgetDefinition }) {
    const text = (useContext(WidgetItem)?.settings?.text ?? '').trim();
    return (
        <WidgetFrame definition={definition}>
            {text ? <div className="widget-notes">{text}</div> : <Fill>{t('Write a note in the')}{' '}<Link href="/design">{t('Design studio')}</Link>.</Fill>}
        </WidgetFrame>
    );
}
export function BookmarksWidget({ definition }: { definition: WidgetDefinition }) {
    const links = useContext(WidgetItem)?.settings?.links ?? [];
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition}>
            <List height={height} empty={<>{t('Add links in the')}{' '}<Link href="/design">{t('Design studio')}</Link>.</>}
                rows={links.map((link, index) => ({ key: index, lead: <Lead icon="bx-link" />, title: link.label, trail: hostOf(link.url), href: link.url }))} />
        </WidgetFrame>
    );
}
function hostOf(url: string) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/* ---------- Cloud: calendar and files (photos is a gallery) ---------- */
type CloudState = { connected: boolean; error?: string };
function NotConnected() {
    return <Fill icon="bx-cloud"><p>{t('You have no Cloud account yet. An administrator can give you access.')}</p></Fill>;
}
type CalendarEvent = { title: string; place: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null };
const CALENDAR_URL = 'https://cloud.plainshow.se/calendar';
function dayLabel(date: Date): string {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(date); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return t('Today');
    if (diff === 1) return t('Tomorrow');
    return date.toLocaleDateString(locale, { weekday: 'long' });
}
function isoDay(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** The Monday on or before the first of this month: where a month grid starts. */
function monthStart(): Date {
    const first = new Date(); first.setDate(1); first.setHours(0, 0, 0, 0);
    first.setDate(1 - ((first.getDay() + 6) % 7));
    return first;
}
export function CalendarWidget({ definition }: { definition: WidgetDefinition }) {
    const view = useSetting<string>(definition, 'view') ?? 'list';
    const height = useHeight(definition);
    const [limit, more] = usePaging();
    const month = view === 'month';
    const query = useMemo(() => (month ? { from: isoDay(monthStart()), days: 42, limit: 200 } : { limit }), [month, limit]);
    const state = useWidgetData<CloudState & { events?: CalendarEvent[] }>(definition.extension, definition.id, 300, query);
    return (
        <WidgetFrame definition={definition} action={<More href={CALENDAR_URL}>{t('Calendar')}</More>}>
            <Body state={state} height={height}>{(data) => {
                if (!data.connected) return <NotConnected />;
                if (data.error) return <Fill icon="bx-error-circle">{data.error}</Fill>;
                const events = data.events ?? [];
                if (month) return <MonthGrid events={events} height={height} />;
                return <List height={height} more={{ href: CALENDAR_URL }} empty={t('Nothing planned.')} onEnd={() => more(events.length)} rows={events.map((event, index) => {
                    const start = new Date(event.start);
                    return {
                        key: index,
                        lead: <span className="widget-day" style={event.color ? { '--day': event.color } as CSSProperties : undefined}><strong>{start.getDate()}</strong><span>{start.toLocaleDateString(locale, { month: 'short' })}</span></span>,
                        title: event.title,
                        meta: [dayLabel(start), event.allDay ? t('All day') : start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }), event.place].filter(Boolean).join(', '),
                    };
                })} />;
            }}</Body>
        </WidgetFrame>
    );
}

/** This month, Monday first, six weeks; a short widget shows only this week. Days with events get their colours. */
function MonthGrid({ events, height }: { events: CalendarEvent[]; height: Height }) {
    const [picked, setPicked] = useState<string | null>(null);
    const today = isoDay(new Date());
    const thisMonth = new Date().getMonth();
    const start = monthStart();
    const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
    const weeks = height === 'short' ? [days.slice(Math.floor(days.findIndex((day) => isoDay(day) === today) / 7) * 7).slice(0, 7)] : Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7));
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events) {
        const first = new Date(event.start);
        const last = new Date(event.end ? new Date(event.end).getTime() - (event.allDay ? 1 : 0) : first.getTime());
        for (const day = new Date(first.getFullYear(), first.getMonth(), first.getDate()); day <= last && byDay.size < 400; day.setDate(day.getDate() + 1)) {
            const key = isoDay(day);
            byDay.set(key, [...(byDay.get(key) ?? []), event]);
        }
    }
    const names = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' }));
    const chosen = picked ? byDay.get(picked) ?? [] : [];

    return (
        <div className="widget-month" style={{ '--weeks': weeks.length } as CSSProperties}>
            <div className="widget-month__names">{names.map((name, index) => <span key={index}>{name}</span>)}</div>
            <div className="widget-month__grid">
                {weeks.flat().map((day) => {
                    const key = isoDay(day);
                    const list = byDay.get(key) ?? [];
                    return (
                        <button key={key} type="button" className={`widget-month__day${key === today ? ' is-today' : ''}${day.getMonth() !== thisMonth ? ' is-other' : ''}${key === picked ? ' is-picked' : ''}`}
                            onClick={() => setPicked(key === picked ? null : key)} title={list.map((event) => event.title).join('\n') || undefined}
                            aria-label={`${day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length === 1 ? t('1 event') : t('{n} events', { n: list.length })}` : ''}`}>
                            <span>{day.getDate()}</span>
                            {list.length > 0 && <span className="widget-month__dots">{list.slice(0, 3).map((event, index) => <i key={index} style={event.color ? { background: event.color } : undefined} />)}</span>}
                        </button>
                    );
                })}
            </div>
            {picked && (
                <div className="widget-month__day-list">
                    <strong>{new Date(picked).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                    {chosen.length === 0 ? <span>{t('Nothing planned.')}</span> : chosen.slice(0, 3).map((event, index) => (
                        <span key={index}><i style={event.color ? { background: event.color } : undefined} />{event.allDay ? t('All day') : new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}{' '}{event.title}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

type CloudFile = { name: string; folder: string | null; type: string; changed: string | null; url: string };
function fileIcon(type: string, name: string): string {
    if (type.startsWith('image/')) return 'bx-image';
    if (type.startsWith('video/')) return 'bx-movie';
    if (type.startsWith('audio/')) return 'bx-music';
    if (type === 'application/pdf') return 'bxs-file-pdf';
    if (/\.(xlsx?|ods|csv)$/i.test(name)) return 'bx-spreadsheet';
    return 'bx-file-blank';
}
export function FilesWidget({ definition }: { definition: WidgetDefinition }) {
    const [limit, more] = usePaging();
    const state = useWidgetData<CloudState & { files?: CloudFile[] }>(definition.extension, definition.id, 300, { limit });
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/">{t('Files')}</More>}>
            <Body state={state} height={height}>{(data) => !data.connected ? <NotConnected /> : data.error ? <Fill icon="bx-error-circle">{data.error}</Fill> : (
                <List height={height} more={{ href: 'https://cloud.plainshow.se/' }} empty={t('No files yet.')} onEnd={() => more((data.files ?? []).length)} rows={(data.files ?? []).map((file, index) => ({
                    key: index, href: file.url,
                    lead: <Lead icon={fileIcon(file.type, file.name)} />,
                    title: file.name,
                    meta: file.folder ?? t('Home'),
                    trail: file.changed ? relativeTime(file.changed) : undefined,
                }))} />
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Extension widgets: typed data from Blog, LaTeX, Split and others ---------- */
type ExtItem = { title?: string; meta?: string; url?: string; icon?: string; image?: string; avatar?: string; initials?: string; badge?: string; tone?: 'plus' | 'minus' | 'accent' };
type ExtData = {
    type: 'list' | 'metrics' | 'gallery';
    items?: ExtItem[];
    metrics?: { label: string; value: string; tone?: 'plus' | 'minus' | 'accent' }[];
    images?: { src: string; url?: string; alt?: string }[];
    more?: { label: string; url: string };
    empty?: string;
    error?: boolean;
};
export function ExtensionWidget({ definition }: { definition: WidgetDefinition }) {
    const [limit, more] = usePaging();
    const state = useWidgetData<ExtData>(definition.extension, definition.id, 120, { limit });
    const item = useContext(WidgetItem);
    const height = useHeight(definition);
    const link = state.data?.more;
    return (
        <WidgetFrame definition={definition} action={link ? <More href={link.url}>{t(link.label)}</More> : undefined}>
            <Body state={state} height={height}>{(data) => {
                if (data.type === 'gallery' && data.images && data.images.length > 0) {
                    const rows = { short: 1, normal: 2, tall: 3 }[height];
                    // As many columns as the width allows, but never more than the photos can fill.
                    const columns = Math.max(1, Math.min(PHOTO_COLUMNS[item?.size ?? definition.default] ?? 4, Math.floor(data.images.length / rows) || 1));
                    const shown = data.images.slice(0, rows * columns);
                    return (
                        <div className="widget-gallery" style={{ '--rows': rows, '--columns': columns } as CSSProperties}>
                            {shown.map((image, index) => (
                                <a key={image.src + index} href={image.url ?? image.src} className={`widget-gallery__photo${index === 0 ? ' is-first' : ''}${index === columns - 1 ? ' is-top-end' : ''}${index === shown.length - columns ? ' is-bottom-start' : ''}${index === shown.length - 1 ? ' is-last' : ''}`}><img src={image.src} alt={image.alt ?? ''} loading="lazy" /></a>
                            ))}
                        </div>
                    );
                }
                if (data.error) return <Fill icon="bx-error-circle">{data.empty ?? t('Could not load.')}</Fill>;
                return <List height={height} more={link ? { href: link.url } : undefined} empty={data.empty ?? t('Nothing here yet.')} onEnd={() => more((data.items ?? []).length)}
                    figures={data.metrics?.map((metric) => ({ label: metric.label, value: metric.value, tone: metric.tone === 'minus' ? 'alert' : metric.tone === 'plus' ? 'good' : undefined }))}
                    rows={(data.items ?? []).map((entry, index) => ({
                        key: index, href: entry.url, title: entry.title, meta: entry.meta,
                        lead: entry.image ? <span className="widget-thumb"><img src={entry.image} alt="" loading="lazy" /></span> : entry.avatar || entry.initials ? <Avatar src={entry.avatar ?? null} initials={entry.initials ?? '?'} size="xs" /> : entry.icon ? <Lead icon={entry.icon} /> : undefined,
                        trail: entry.badge ? <Badge tone={entry.tone === 'minus' ? 'red' : entry.tone === 'plus' ? 'green' : undefined}>{entry.badge}</Badge> : undefined,
                    }))} />;
            }}</Body>
        </WidgetFrame>
    );
}

export const WIDGETS: Record<string, (props: { definition: WidgetDefinition }) => ReactNode> = {
    'core.greeting': GreetingWidget,
    'core.pi-health': PiHealthWidget,
    'core.weather': WeatherWidget,
    'core.forecast': ForecastWidget,
    'core.radar': RadarWidget,
    'core.launcher': LauncherWidget,
    'core.activity': ActivityWidget,
    'core.admin-users': AdminUsersWidget,
    'core.admin-services': AdminServicesWidget,
    'core.admin-security': AdminSecurityWidget,
    'core.admin-updates': AdminUpdatesWidget,
    'core.notes': NotesWidget,
    'core.bookmarks': BookmarksWidget,
    'cloud.calendar': CalendarWidget,
    'cloud.files': FilesWidget,
};

/** Renders one placed widget with its own size, border and settings. */
export function PlacedWidget({ item, definition }: { item: LayoutItem; definition: WidgetDefinition }) {
    const Component = WIDGETS[item.key] ?? (definition.extension !== 'core' ? ExtensionWidget : undefined);
    if (!Component) return null;
    return <WidgetItem.Provider value={item}><Component definition={definition} /></WidgetItem.Provider>;
}
