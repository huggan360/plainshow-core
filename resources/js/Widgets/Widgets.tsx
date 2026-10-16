import { Avatar, Badge, Empty, relativeTime, RoleBadge } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { createContext, CSSProperties, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type SettingField = {
    name: string; type: 'text' | 'links' | 'choices' | 'toggle' | 'select'; label: string; max?: number;
    options?: { value: string; label: string }[]; default?: unknown;
};
export type WidgetDefinition = { key: string; extension: string; extensionName: string; id: string; title: string; description?: string; icon: string; sizes: string[]; default: string; settings?: SettingField[]; admin: boolean };
export type Glow = 'accent' | 'green' | 'blue' | 'violet' | 'pink' | 'warm' | 'cyan' | 'none';
export type Bookmark = { label: string; url: string };
export type LayoutItem = { key: string; size: string; title?: string; glow?: Glow; settings?: { text?: string; links?: Bookmark[]; [name: string]: unknown } };

/** The placed widget's own title, glow and settings, from the saved layout. */
export const WidgetItem = createContext<LayoutItem | null>(null);

/** A widget's setting: what was saved, else the default from its manifest. */
function useSetting<T>(definition: WidgetDefinition, name: string): T {
    const item = useContext(WidgetItem);
    const saved = item?.settings?.[name];
    if (saved !== undefined) return saved as T;
    return definition.settings?.find((field) => field.name === name)?.default as T;
}
function useCount(definition: WidgetDefinition, fallback = 5): number {
    return Number(useSetting<string>(definition, 'count') ?? fallback) || fallback;
}

type State<T> = { data: T | null; error: string | null; loading: boolean };

function useWidgetData<T>(extension: string, id: string, refreshSeconds?: number): State<T> {
    const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
    const load = useCallback(async () => {
        try {
            const response = await fetch(`/widgets/${extension}/${id}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!response.ok) throw new Error(response.status === 404 ? 'Not available' : 'Could not load');
            setState({ data: (await response.json()) as T, error: null, loading: false });
        } catch (error) {
            setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Could not load', loading: false }));
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

function Loading() {
    return <div className="ps-chain" aria-busy="true"><div className="widget-skeleton" /><div className="widget-skeleton" /><div className="widget-skeleton" /></div>;
}

function Body<T>({ state, children }: { state: State<T>; children: (data: T) => ReactNode }) {
    if (state.loading && !state.data) return <Loading />;
    if (state.error && !state.data) return <Empty icon="bx-error-circle">{state.error}</Empty>;
    return <>{children(state.data as T)}</>;
}

/* ---------- Rows: the joined list every widget uses ---------- */
type Row = { key: string | number; title: ReactNode; meta?: ReactNode; lead?: ReactNode; trail?: ReactNode; href?: string };
function Rows({ rows, empty }: { rows: Row[]; empty?: ReactNode }) {
    if (rows.length === 0) return <p className="widget-empty">{empty ?? 'Nothing yet.'}</p>;
    return (
        <ul className="ps-chain widget-rows">
            {rows.map((row) => {
                const inner = <>
                    {row.lead && <span className="widget-row__lead">{row.lead}</span>}
                    <span className="widget-row__text"><span className="widget-row__title">{row.title}</span>{row.meta && <span className="widget-row__meta">{row.meta}</span>}</span>
                    {row.trail && <span className="widget-row__trail">{row.trail}</span>}
                </>;
                return <li key={row.key}>{row.href ? <a className="widget-row" href={row.href}>{inner}</a> : <div className="widget-row">{inner}</div>}</li>;
            })}
        </ul>
    );
}

function Figures({ figures }: { figures: { label: string; value: ReactNode; tone?: 'warn' | 'alert' | 'good' }[] }) {
    return (
        <div className="ps-chain ps-chain--row widget-figures">
            {figures.map((figure) => <div key={figure.label} className={figure.tone ? `is-${figure.tone}` : undefined}><strong>{figure.value}</strong><span>{figure.label}</span></div>)}
        </div>
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
    const metrics = useSetting<string[]>(definition, 'metrics') ?? ['memory', 'disk', 'cpu'];
    const details = useSetting<boolean>(definition, 'details') ?? true;
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{({ system }) => (
                <div className="widget-stack">
                    <div className="ps-chain">
                        {metrics.includes('memory') && <Gauge tone="red" label="RAM used" value={system.memoryPercent} display={`${system.memoryPercent}%`} />}
                        {metrics.includes('disk') && <Gauge tone="orange" label="Disk used" value={system.diskPercent} display={`${system.diskPercent}%`} />}
                        {metrics.includes('cpu') && <Gauge tone="yellow" label="CPU load" value={system.cpuPercent} display={`${system.cpuPercent}%`} />}
                        {metrics.includes('temperature') && system.temperature !== null && <Gauge tone={system.temperature >= 75 ? 'red' : system.temperature >= 62 ? 'orange' : 'green'} label="Temperature" value={(system.temperature / 90) * 100} display={`${system.temperature.toFixed(0)} °C`} />}
                    </div>
                    {details && <p className="widget-foot"><span>Up {system.uptime}</span><span>{system.diskFree} free</span></p>}
                </div>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Services ---------- */
type LauncherData = { apps: { id: string; name: string; description: string; icon: string; url: string }[] };
export function LauncherWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<LauncherData>(definition.extension, definition.id);
    const descriptions = useSetting<boolean>(definition, 'descriptions') ?? false;
    const hidden = useSetting<string[]>(definition, 'hidden') ?? [];
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{({ apps }) => {
                const shown = apps.filter((app) => !hidden.includes(app.id));
                return shown.length === 0
                    ? <p className="widget-empty">No services to show.</p>
                    : <div className={`widget-apps${descriptions ? ' widget-apps--described' : ''}`}>{shown.map((app) => (
                        <a key={app.id} href={app.url} className="widget-app">
                            <i className={`bx ${app.icon}`} aria-hidden="true" />
                            <span className="widget-app__name">{app.name}</span>
                            {descriptions && <span className="widget-app__text">{app.description}</span>}
                        </a>
                    ))}</div>;
            }}</Body>
        </WidgetFrame>
    );
}

/* ---------- Activity ---------- */
type EventItem = { id: number; label: string; actor: string | null; source: string; at: string };
function eventRows(events: EventItem[], count: number, showActor = false): Row[] {
    return events.slice(0, count).map((event) => ({ key: event.id, title: event.label, meta: showActor && event.actor ? event.actor : undefined, trail: relativeTime(event.at) }));
}
export function ActivityWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<{ events: EventItem[] }>(definition.extension, definition.id, 60);
    const count = useCount(definition);
    return <WidgetFrame definition={definition}><Body state={state}>{({ events }) => <Rows rows={eventRows(events, count)} />}</Body></WidgetFrame>;
}

/* ---------- Admin: accounts ---------- */
type UsersData = { total: number; byRole: Record<string, number>; disabled: number; withoutTwoFactor: number; recent: { id: number; name: string; initials: string; avatar: string | null; username: string; lastLogin: string }[] };
export function AdminUsersWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<UsersData>(definition.extension, definition.id, 120);
    const count = useCount(definition, 3);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/users">All</More>}>
            <Body state={state}>{(data) => (
                <div className="widget-stack">
                    <Figures figures={[
                        { label: 'Accounts', value: data.total },
                        { label: 'Admins', value: data.byRole.admin ?? 0 },
                        { label: 'No 2FA', value: data.withoutTwoFactor, tone: data.withoutTwoFactor > 0 ? 'warn' : undefined },
                    ]} />
                    <Rows rows={data.recent.slice(0, count).map((user) => ({ key: user.id, lead: <Avatar src={user.avatar} initials={user.initials} size="xs" />, title: user.name, trail: relativeTime(user.lastLogin) }))} />
                </div>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: service health ---------- */
type ServicesData = { services: { id: string; name: string; icon: string; version: string | null; state: string; ms: number | null }[] };
const STATE_DOT: Record<string, string> = { online: 'ps-dot--green', error: 'ps-dot--amber', offline: 'ps-dot--red' };
export function AdminServicesWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<ServicesData>(definition.extension, definition.id, 60);
    const problems = useSetting<boolean>(definition, 'problems') ?? false;
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{({ services }) => {
                const shown = problems ? services.filter((service) => service.state !== 'online') : services;
                return <Rows empty="Every service answers." rows={shown.map((service) => ({
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
    const count = useCount(definition, 3);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/audit">Log</More>}>
            <Body state={state}>{(data) => (
                <div className="widget-stack">
                    <Figures figures={[
                        { label: 'Sign-ins today', value: data.signIns },
                        { label: 'Failed', value: data.failed, tone: data.failed > 0 ? 'warn' : undefined },
                        { label: 'Locked', value: data.locked, tone: data.locked > 0 ? 'alert' : undefined },
                    ]} />
                    <Rows rows={eventRows(data.events, count, true)} />
                </div>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: updates ---------- */
type UpdatesData = { checkedAt: string | null; available: { id: string; name: string; installed: string | null; latest: string }[]; failed: number };
export function AdminUpdatesWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<UpdatesData>(definition.extension, definition.id, 300);
    return (
        <WidgetFrame definition={definition} action={<More href="/admin/updates">Open</More>}>
            <Body state={state}>{(data) => (
                <div className="widget-stack">
                    <Rows empty={data.checkedAt ? `Up to date, checked ${relativeTime(data.checkedAt)}.` : 'Not checked yet.'}
                        rows={data.available.map((item) => ({ key: item.id, title: item.name, meta: `${item.installed ?? 'unknown'} installed`, trail: <Badge tone="accent">{item.latest}</Badge> }))} />
                    {data.failed > 0 && <p className="widget-warn">{data.failed === 1 ? 'One update failed' : `${data.failed} updates failed`} this week.</p>}
                </div>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Notes and bookmarks: kept in the widget's own settings ---------- */
export function NotesWidget({ definition }: { definition: WidgetDefinition }) {
    const text = (useContext(WidgetItem)?.settings?.text ?? '').trim();
    return (
        <WidgetFrame definition={definition} glow="warm">
            {text ? <div className="widget-notes">{text}</div> : <p className="widget-empty">Write a note in the <Link href="/design">Design studio</Link>.</p>}
        </WidgetFrame>
    );
}
export function BookmarksWidget({ definition }: { definition: WidgetDefinition }) {
    const links = useContext(WidgetItem)?.settings?.links ?? [];
    return (
        <WidgetFrame definition={definition}>
            <Rows empty={<>Add links in the <Link href="/design">Design studio</Link>.</>}
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
    return <div className="widget-connect"><p>Show your Nextcloud here.</p><Link href="/account/connections" className="ps-btn ps-btn--sm">Connect Nextcloud</Link></div>;
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
    const days = Number(useSetting<string>(definition, 'days') ?? 14);
    const count = useCount(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/calendar">Calendar</More>}>
            <Body state={state}>{(data) => {
                if (!data.connected) return <NotConnected />;
                if (data.error) return <p className="widget-empty">{data.error}</p>;
                const until = Date.now() + days * 86400000;
                const events = (data.events ?? []).filter((event) => new Date(event.start).getTime() < until).slice(0, count);
                return <Rows empty="Nothing planned." rows={events.map((event, index) => {
                    const start = new Date(event.start);
                    const time = event.allDay ? 'All day' : start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                    return {
                        key: index,
                        lead: <span className="widget-day" style={event.color ? { '--day': event.color } as CSSProperties : undefined}><strong>{start.getDate()}</strong><span>{start.toLocaleDateString('en-GB', { month: 'short' })}</span></span>,
                        title: event.title,
                        meta: [dayLabel(start), time, event.place].filter(Boolean).join(', '),
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
    if (/\.(docx?|odt|md|txt)$/i.test(name)) return 'bx-file';
    if (/\.(xlsx?|ods|csv)$/i.test(name)) return 'bx-spreadsheet';
    return 'bx-file-blank';
}
export function FilesWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<CloudState & { files?: CloudFile[] }>(definition.extension, definition.id, 300);
    const count = useCount(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/files">Files</More>}>
            <Body state={state}>{(data) => !data.connected ? <NotConnected /> : data.error ? <p className="widget-empty">{data.error}</p> : (
                <Rows empty="No files yet." rows={(data.files ?? []).slice(0, count).map((file, index) => ({
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
    const unreadOnly = useSetting<boolean>(definition, 'unread') ?? false;
    const count = useCount(definition);
    return (
        <WidgetFrame definition={definition} action={<More href="https://cloud.plainshow.se/apps/spreed">Talk</More>}>
            <Body state={state}>{(data) => {
                if (!data.connected) return <NotConnected />;
                if (data.error) return <p className="widget-empty">{data.error}</p>;
                const rooms = (data.rooms ?? []).filter((room) => !unreadOnly || room.unread > 0).slice(0, count);
                return <Rows empty={unreadOnly ? 'Nothing unread.' : 'No conversations yet.'} rows={rooms.map((room, index) => ({
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
    const count = useCount(definition, definition.id.includes('photo') ? 9 : 5);
    const more = state.data?.more;
    return (
        <WidgetFrame definition={definition} action={more ? <More href={more.url}>{more.label}</More> : undefined}>
            <Body state={state}>{(data) => (
                <div className="widget-stack">
                    {data.metrics && data.metrics.length > 0 && <Figures figures={data.metrics.map((metric) => ({ label: metric.label, value: metric.value, tone: metric.tone === 'minus' ? 'alert' : metric.tone === 'plus' ? 'good' : undefined }))} />}
                    {data.type === 'gallery' && data.images && data.images.length > 0 && (
                        <div className="widget-gallery">{data.images.slice(0, count).map((image, index) => (
                            <a key={image.src + index} href={image.url ?? image.src} className="widget-gallery__photo"><img src={image.src} alt={image.alt ?? ''} loading="lazy" /></a>
                        ))}</div>
                    )}
                    {data.items && data.items.length > 0 && <Rows rows={data.items.slice(0, count).map((item, index) => ({
                        key: index, href: item.url, title: item.title, meta: item.meta,
                        lead: item.image ? <span className="widget-thumb"><img src={item.image} alt="" loading="lazy" /></span> : item.avatar || item.initials ? <Avatar src={item.avatar ?? null} initials={item.initials ?? '?'} size="xs" /> : undefined,
                        trail: item.badge ? <Badge tone={item.tone === 'minus' ? 'red' : item.tone === 'plus' ? 'green' : undefined}>{item.badge}</Badge> : undefined,
                    }))} />}
                    {!data.items?.length && !data.images?.length && !data.metrics?.length && <p className="widget-empty">{data.empty ?? 'Nothing here yet.'}</p>}
                </div>
            )}</Body>
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
