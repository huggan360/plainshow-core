import { Avatar, Badge, relativeTime, RoleBadge } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { createContext, CSSProperties, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type SettingField = {
    name: string; type: 'text' | 'links' | 'choices' | 'toggle' | 'select'; label: string; max?: number;
    options?: { value: string; label: string }[]; default?: unknown;
};
export type Height = 'short' | 'normal' | 'tall';
export type WidgetDefinition = { key: string; extension: string; extensionName: string; id: string; title: string; description?: string; icon: string; sizes: string[]; default: string; height?: Height; settings?: SettingField[]; admin: boolean };
export type Glow = 'accent' | 'green' | 'blue' | 'violet' | 'pink' | 'warm' | 'cyan' | 'none';
export type Bookmark = { label: string; url: string };
export type LayoutItem = { key: string; size: string; height?: Height; title?: string; glow?: Glow; settings?: { text?: string; links?: Bookmark[]; [name: string]: unknown } };

/*
 * How every widget is laid out.
 *
 * The grid has one row height. A widget is one, two or three rows tall
 * (short, normal, tall), always with the same frame, padding and title. The
 * space under the title is cut into equal slots: two when short, six when
 * normal, ten when tall. A list row, a strip of figures, a loading line and
 * an empty place each take one slot, so content always ends exactly where
 * the padding begins, never cut off and never with a gap below. Lists that
 * have more than fits end in a "more" slot; lists with less keep their
 * remaining slots as quiet placeholders. Bars, tiles and photos stretch to
 * fill the same space instead.
 */
export const SLOTS: Record<Height, number> = { short: 2, normal: 6, tall: 10 };
const PHOTO_COLUMNS: Record<string, number> = { s: 2, m: 3, l: 4, xl: 5, full: 8 };

/** The placed widget's own title, glow and settings, from the saved layout. */
export const WidgetItem = createContext<LayoutItem | null>(null);

function useSetting<T>(definition: WidgetDefinition, name: string): T {
    const item = useContext(WidgetItem);
    const saved = item?.settings?.[name];
    if (saved !== undefined) return saved as T;
    return definition.settings?.find((field) => field.name === name)?.default as T;
}
function useHeight(definition: WidgetDefinition): Height {
    return useContext(WidgetItem)?.height ?? definition.height ?? 'normal';
}

type State<T> = { data: T | null; error: string | null; loading: boolean };

function useWidgetData<T>(extension: string, id: string, refreshSeconds?: number): State<T> {
    const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
    const load = useCallback(async () => {
        try {
            const response = await fetch(`/widgets/${extension}/${id}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!response.ok) throw new Error(response.status === 404 ? 'Not available.' : 'Could not load.');
            setState({ data: (await response.json()) as T, error: null, loading: false });
        } catch (error) {
            setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Could not load.', loading: false }));
        }
    }, [extension, id]);

    useEffect(() => {
        load();
        if (!refreshSeconds) return;
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshSeconds * 1000);
        return () => window.clearInterval(timer);
    }, [load, refreshSeconds]);

    return state;
}

export function WidgetFrame({ definition, children, glow, action }: { definition: WidgetDefinition; children: ReactNode; glow?: Glow; action?: ReactNode }) {
    const item = useContext(WidgetItem);
    const tone = item?.glow ?? glow;
    return (
        <section className="ps-frame ps-widget" data-glow={tone === 'none' ? undefined : tone}>
            <div className="ps-frame__panel">
                <header className="ps-widget__head">
                    <h2 className="ps-widget__title">{item?.title || definition.title}</h2>
                    {action && <span className="ps-widget__action">{action}</span>}
                </header>
                <div className="ps-widget__body">{children}</div>
            </div>
        </section>
    );
}

function More({ href, children }: { href: string; children: ReactNode }) {
    return /^https?:/.test(href)
        ? <a className="widget-more" href={href}>{children}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></a>
        : <Link className="widget-more" href={href}>{children}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></Link>;
}

/** A body that fills its space with one message, for errors and empty widgets. */
function Fill({ icon, children }: { icon?: string; children: ReactNode }) {
    return <div className="widget-fill">{icon && <i className={`bx ${icon}`} aria-hidden="true" />}<div>{children}</div></div>;
}

/** Loading, failure, or the content, all in the widget's own shape. */
function Body<T>({ state, height, children }: { state: State<T>; height: Height; children: (data: T) => ReactNode }) {
    if (state.loading && !state.data) {
        return <div className="widget-slots ps-chain" style={{ '--slots': SLOTS[height] } as CSSProperties} aria-busy="true">{Array.from({ length: SLOTS[height] }, (_, index) => <div key={index} className="widget-slot widget-slot--loading" />)}</div>;
    }
    if (state.error && !state.data) return <Fill icon="bx-error-circle">{state.error}</Fill>;
    return <>{children(state.data as T)}</>;
}

/* ---------- Slots: rows, figures, placeholders and "more" ---------- */
type Row = { key: string | number; title: ReactNode; meta?: ReactNode; lead?: ReactNode; trail?: ReactNode; href?: string };
type Figure = { label: string; value: ReactNode; tone?: 'warn' | 'alert' | 'good' };

function RowContent({ row }: { row: Row }) {
    return <>
        {row.lead && <span className="widget-row__lead">{row.lead}</span>}
        <span className="widget-row__text"><span className="widget-row__title">{row.title}</span>{row.meta && <span className="widget-row__meta">{row.meta}</span>}</span>
        {row.trail !== undefined && row.trail !== null && <span className="widget-row__trail">{row.trail}</span>}
    </>;
}

function Slots({ height, rows, figures, empty, more }: { height: Height; rows: Row[]; figures?: Figure[]; empty?: ReactNode; more?: { href: string; label?: string } }) {
    const total = SLOTS[height];
    const hasFigures = !!figures && figures.length > 0;
    const capacity = total - (hasFigures ? 1 : 0);
    if (!hasFigures && rows.length === 0) return <Fill>{empty ?? 'Nothing yet.'}</Fill>;

    const overflow = rows.length > capacity;
    const shown = overflow ? rows.slice(0, Math.max(0, capacity - 1)) : rows;
    const placeholders = overflow ? 0 : capacity - shown.length;

    return (
        <ul className="widget-slots ps-chain" style={{ '--slots': total } as CSSProperties}>
            {hasFigures && (
                <li className="widget-slot widget-figures">
                    {figures!.map((figure) => <div key={figure.label} className={figure.tone ? `is-${figure.tone}` : undefined}><strong>{figure.value}</strong><span>{figure.label}</span></div>)}
                </li>
            )}
            {shown.map((row) => (
                <li key={row.key} className="widget-slot">
                    {row.href ? <a className="widget-row" href={row.href}><RowContent row={row} /></a> : <div className="widget-row"><RowContent row={row} /></div>}
                </li>
            ))}
            {overflow && (
                <li className="widget-slot">
                    {more ? <a className="widget-row widget-row--more" href={more.href}>{rows.length - shown.length} more<i className="bx bx-right-arrow-alt" aria-hidden="true" /></a>
                        : <div className="widget-row widget-row--more">{rows.length - shown.length} more</div>}
                </li>
            )}
            {placeholders > 0 && rows.length === 0 && (
                <li className="widget-slot widget-slot--empty" style={{ gridRow: `span ${placeholders}` }}>{empty ?? 'Nothing yet.'}</li>
            )}
            {placeholders > 0 && rows.length > 0 && Array.from({ length: placeholders }, (_, index) => <li key={`p${index}`} className="widget-slot widget-slot--placeholder" aria-hidden="true" />)}
        </ul>
    );
}

/* ---------- Welcome: greeting, clock and date ---------- */
type GreetingData = { firstName: string; role: string; services: number };
function greetingFor(hour: number) {
    if (hour < 5) return 'Good night';
    if (hour < 10) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
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
    const item = useContext(WidgetItem);
    const display = useSetting<string>(definition, 'display') ?? 'greeting';
    const showDate = useSetting<boolean>(definition, 'date') ?? true;
    const seconds = useSetting<boolean>(definition, 'seconds') ?? false;
    const showRole = useSetting<boolean>(definition, 'role') ?? false;
    const now = useNow(seconds && display !== 'greeting');
    const glow = item?.glow ?? 'accent';
    const clock = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined });
    const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <section className="ps-frame ps-widget widget-greeting" data-glow={glow === 'none' ? undefined : glow}>
            <div className="ps-frame__panel">
                <div className="widget-greeting__inner">
                    <div className="widget-greeting__main">
                        {showDate && <p className="ps-eyebrow ps-eyebrow--accent">{date}</p>}
                        {display !== 'clock'
                            ? <h2 className="ps-title ps-title--hero widget-greeting__title">{greetingFor(now.getHours())}{state.data ? `, ${state.data.firstName}` : ''}</h2>
                            : <p className="widget-clock">{clock}</p>}
                        {showRole && state.data && (
                            <div className="ps-inline widget-greeting__badges">
                                <RoleBadge role={state.data.role} />
                                <Badge>{state.data.services} {state.data.services === 1 ? 'service' : 'services'}</Badge>
                            </div>
                        )}
                    </div>
                    {display === 'both' && <p className="widget-clock widget-clock--side">{clock}</p>}
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
        <WidgetFrame definition={definition} action={details && system ? <span className="widget-note">Up {system.uptime}</span> : undefined}>
            <Body state={state} height={height}>{() => {
                const s = system!;
                const bars = [
                    metrics.includes('memory') && <Gauge key="m" tone="red" label="RAM used" value={s.memoryPercent} display={`${s.memoryPercent}%`} />,
                    metrics.includes('disk') && <Gauge key="d" tone="orange" label="Disk used" value={s.diskPercent} display={details ? `${s.diskFree} free` : `${s.diskPercent}%`} />,
                    metrics.includes('cpu') && <Gauge key="c" tone="yellow" label="CPU load" value={s.cpuPercent} display={`${s.cpuPercent}%`} />,
                    metrics.includes('temperature') && s.temperature !== null && <Gauge key="t" tone={s.temperature >= 75 ? 'red' : s.temperature >= 62 ? 'orange' : 'green'} label="Temperature" value={(s.temperature / 90) * 100} display={`${s.temperature.toFixed(0)} °C`} />,
                ].filter(Boolean).slice(0, height === 'short' ? 2 : 4);
                return bars.length ? <div className="widget-bars ps-chain" style={{ '--bars': bars.length } as CSSProperties}>{bars}</div> : <Fill>Choose bars in the Design studio.</Fill>;
            }}</Body>
        </WidgetFrame>
    );
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
                    ? <Fill>No services to show.</Fill>
                    : <div className={`widget-apps${descriptions ? ' widget-apps--described' : ''}`}>{shown.map((app) => (
                        <a key={app.id} href={app.url} className="widget-app">
                            <span className="widget-app__icon"><i className={`bx ${app.icon}`} aria-hidden="true" /></span>
                            <span className="widget-app__text"><strong>{app.name}</strong>{descriptions && <span>{app.description}</span>}</span>
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
    const state = useWidgetData<{ events: EventItem[] }>(definition.extension, definition.id, 60);
    const height = useHeight(definition);
    return <WidgetFrame definition={definition}><Body state={state} height={height}>{({ events }) => <Slots height={height} rows={eventRows(events)} empty="Nothing yet." />}</Body></WidgetFrame>;
}

/* ---------- Admin: accounts ---------- */
type UsersData = { total: number; byRole: Record<string, number>; disabled: number; withoutTwoFactor: number; recent: { id: number; name: string; initials: string; avatar: string | null; username: string; lastLogin: string }[] };
export function AdminUsersWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<UsersData>(definition.extension, definition.id, 120);
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/users">All</More>}>
            <Body state={state} height={height}>{(data) => (
                <Slots height={height} more={{ href: '/admin/users' }}
                    figures={[
                        { label: 'Accounts', value: data.total },
                        { label: 'Admins', value: data.byRole.admin ?? 0 },
                        { label: 'No 2FA', value: data.withoutTwoFactor, tone: data.withoutTwoFactor > 0 ? 'warn' : undefined },
                    ]}
                    rows={data.recent.map((user) => ({ key: user.id, lead: <Avatar src={user.avatar} initials={user.initials} size="xs" />, title: user.name, trail: relativeTime(user.lastLogin) }))}
                    empty="Nobody has signed in yet." />
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
                return <Slots height={height} more={{ href: '/admin/services' }} empty="Every service answers." rows={shown.map((service) => ({
                    key: service.id,
                    title: service.name,
                    trail: <span className="widget-state">{service.state === 'online' ? (service.ms !== null ? `${service.ms} ms` : 'Online') : service.state === 'offline' ? 'Down' : service.state === 'error' ? 'Errors' : 'Unknown'}<span className={`ps-dot ${STATE_DOT[service.state] ?? ''}`} aria-hidden="true" /></span>,
                }))} />;
            }}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: sign-in activity ---------- */
type SecurityData = { failed: number; locked: number; signIns: number; events: EventItem[] };
export function AdminSecurityWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<SecurityData>(definition.extension, definition.id, 60);
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/audit">Log</More>}>
            <Body state={state} height={height}>{(data) => (
                <Slots height={height} more={{ href: '/admin/audit' }}
                    figures={[
                        { label: 'Today', value: data.signIns },
                        { label: 'Failed', value: data.failed, tone: data.failed > 0 ? 'warn' : undefined },
                        { label: 'Locked', value: data.locked, tone: data.locked > 0 ? 'alert' : undefined },
                    ]}
                    rows={eventRows(data.events, true)} empty="No sign-ins yet." />
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
        <WidgetFrame definition={definition} action={<More href="/admin/updates">Open</More>}>
            <Body state={state} height={height}>{(data) => (
                <Slots height={height} more={{ href: '/admin/updates' }}
                    empty={<><i className="bx bx-check-circle widget-ok" aria-hidden="true" /> Up to date{data.checkedAt ? `, checked ${relativeTime(data.checkedAt)}` : ''}.{data.failed > 0 && <><br />{data.failed === 1 ? 'One update failed' : `${data.failed} updates failed`} this week.</>}</>}
                    rows={data.available.map((item) => ({ key: item.id, title: item.name, meta: `${item.installed ?? 'unknown'} installed`, trail: <Badge tone="accent">{item.latest}</Badge> }))} />
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Notes and bookmarks: kept in the widget's own settings ---------- */
export function NotesWidget({ definition }: { definition: WidgetDefinition }) {
    const text = (useContext(WidgetItem)?.settings?.text ?? '').trim();
    return (
        <WidgetFrame definition={definition} glow="warm">
            {text ? <div className="widget-notes">{text}</div> : <Fill>Write a note in the <Link href="/design">Design studio</Link>.</Fill>}
        </WidgetFrame>
    );
}
export function BookmarksWidget({ definition }: { definition: WidgetDefinition }) {
    const links = useContext(WidgetItem)?.settings?.links ?? [];
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition}>
            <Slots height={height} empty={<>Add links in the <Link href="/design">Design studio</Link>.</>}
                rows={links.map((link, index) => ({ key: index, title: link.label, trail: hostOf(link.url), href: link.url }))} />
        </WidgetFrame>
    );
}
function hostOf(url: string) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/* ---------- Cloud: calendar, files and Talk from Nextcloud ---------- */
type CloudState = { connected: boolean; error?: string };
function NotConnected() {
    return <Fill icon="bx-cloud"><p>Show your Nextcloud here.</p><Link href="/account/connections" className="ps-btn ps-btn--sm">Connect Nextcloud</Link></Fill>;
}
type CalendarEvent = { title: string; place: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null };
function dayLabel(date: Date): string {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(date); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-GB', { weekday: 'long' });
}
export function CalendarWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<CloudState & { events?: CalendarEvent[] }>(definition.extension, definition.id, 300);
    const height = useHeight(definition);
    const days = Number(useSetting<string>(definition, 'days') ?? 14);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/calendar">Calendar</More>}>
            <Body state={state} height={height}>{(data) => {
                if (!data.connected) return <NotConnected />;
                if (data.error) return <Fill icon="bx-error-circle">{data.error}</Fill>;
                const until = Date.now() + days * 86400000;
                const events = (data.events ?? []).filter((event) => new Date(event.start).getTime() < until);
                return <Slots height={height} more={{ href: 'https://cloud.plainshow.se/apps/calendar' }} empty="Nothing planned." rows={events.map((event, index) => {
                    const start = new Date(event.start);
                    return {
                        key: index,
                        lead: <span className="widget-day" style={event.color ? { '--day': event.color } as CSSProperties : undefined}><strong>{start.getDate()}</strong><span>{start.toLocaleDateString('en-GB', { month: 'short' })}</span></span>,
                        title: event.title,
                        meta: [dayLabel(start), event.allDay ? 'All day' : start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }), event.place].filter(Boolean).join(', '),
                    };
                })} />;
            }}</Body>
        </WidgetFrame>
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
    const state = useWidgetData<CloudState & { files?: CloudFile[] }>(definition.extension, definition.id, 300);
    const height = useHeight(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/files">Files</More>}>
            <Body state={state} height={height}>{(data) => !data.connected ? <NotConnected /> : data.error ? <Fill icon="bx-error-circle">{data.error}</Fill> : (
                <Slots height={height} more={{ href: 'https://cloud.plainshow.se/apps/files' }} empty="No files yet." rows={(data.files ?? []).map((file, index) => ({
                    key: index, href: file.url,
                    lead: <i className={`bx ${fileIcon(file.type, file.name)} widget-row__icon`} aria-hidden="true" />,
                    title: file.name,
                    meta: file.folder ?? 'Home',
                    trail: file.changed ? relativeTime(file.changed) : undefined,
                }))} />
            )}</Body>
        </WidgetFrame>
    );
}
type TalkRoom = { name: string; unread: number; mention: boolean; last: string | null; by: string | null; at: string | null; url: string };
export function TalkWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<CloudState & { rooms?: TalkRoom[] }>(definition.extension, definition.id, 120);
    const height = useHeight(definition);
    const unreadOnly = useSetting<boolean>(definition, 'unread') ?? false;
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/spreed">Talk</More>}>
            <Body state={state} height={height}>{(data) => {
                if (!data.connected) return <NotConnected />;
                if (data.error) return <Fill icon="bx-error-circle">{data.error}</Fill>;
                const rooms = (data.rooms ?? []).filter((room) => !unreadOnly || room.unread > 0);
                return <Slots height={height} more={{ href: 'https://cloud.plainshow.se/apps/spreed' }} empty={unreadOnly ? 'Nothing unread.' : 'No conversations yet.'} rows={rooms.map((room, index) => ({
                    key: index, href: room.url, title: room.name,
                    meta: room.last ? `${room.by ? `${room.by}: ` : ''}${room.last}` : undefined,
                    trail: room.unread > 0 ? <span className={`widget-unread${room.mention ? ' is-mention' : ''}`}>{room.unread}</span> : room.at ? relativeTime(room.at) : undefined,
                }))} />;
            }}</Body>
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
    const state = useWidgetData<ExtData>(definition.extension, definition.id, 120);
    const item = useContext(WidgetItem);
    const height = useHeight(definition);
    const more = state.data?.more;
    return (
        <WidgetFrame definition={definition} action={more ? <More href={more.url}>{more.label}</More> : undefined}>
            <Body state={state} height={height}>{(data) => {
                if (data.type === 'gallery' && data.images && data.images.length > 0) {
                    const rows = { short: 1, normal: 2, tall: 3 }[height];
                    const columns = PHOTO_COLUMNS[item?.size ?? definition.default] ?? 4;
                    return (
                        <div className="widget-gallery" style={{ '--rows': rows, '--columns': columns } as CSSProperties}>
                            {data.images.slice(0, rows * columns).map((image, index) => (
                                <a key={image.src + index} href={image.url ?? image.src} className="widget-gallery__photo"><img src={image.src} alt={image.alt ?? ''} loading="lazy" /></a>
                            ))}
                        </div>
                    );
                }
                if (data.error) return <Fill icon="bx-error-circle">{data.empty ?? 'Could not load.'}</Fill>;
                return <Slots height={height} more={more ? { href: more.url } : undefined} empty={data.empty ?? 'Nothing here yet.'}
                    figures={data.metrics?.map((metric) => ({ label: metric.label, value: metric.value, tone: metric.tone === 'minus' ? 'alert' : metric.tone === 'plus' ? 'good' : undefined }))}
                    rows={(data.items ?? []).map((entry, index) => ({
                        key: index, href: entry.url, title: entry.title, meta: entry.meta,
                        lead: entry.image ? <span className="widget-thumb"><img src={entry.image} alt="" loading="lazy" /></span> : entry.avatar || entry.initials ? <Avatar src={entry.avatar ?? null} initials={entry.initials ?? '?'} size="xs" /> : undefined,
                        trail: entry.badge ? <Badge tone={entry.tone === 'minus' ? 'red' : entry.tone === 'plus' ? 'green' : undefined}>{entry.badge}</Badge> : undefined,
                    }))} />;
            }}</Body>
        </WidgetFrame>
    );
}

export const WIDGETS: Record<string, (props: { definition: WidgetDefinition }) => ReactNode> = {
    'core.greeting': GreetingWidget,
    'core.pi-health': PiHealthWidget,
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
    'cloud.talk': TalkWidget,
};

/** Renders one placed widget with its own title, glow and settings. */
export function PlacedWidget({ item, definition }: { item: LayoutItem; definition: WidgetDefinition }) {
    const Component = WIDGETS[item.key] ?? (definition.extension !== 'core' && definition.extension !== 'cloud' ? ExtensionWidget : undefined);
    if (!Component) return null;
    return <WidgetItem.Provider value={item}><Component definition={definition} /></WidgetItem.Provider>;
}
