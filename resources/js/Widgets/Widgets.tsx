import { Avatar, Badge, ButtonLink, Empty, ListRow, Meter, relativeTime, RoleBadge } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type SettingField = { name: string; type: 'text' | 'links' | 'choices'; label: string; max?: number; options?: { value: string; label: string }[] };
export type WidgetDefinition = { key: string; extension: string; extensionName: string; id: string; title: string; description?: string; icon: string; sizes: string[]; default: string; settings?: SettingField[]; admin: boolean };
export type Glow = 'accent' | 'green' | 'blue' | 'violet' | 'pink' | 'warm' | 'cyan' | 'none';
export type Bookmark = { label: string; url: string };
export type LayoutItem = { key: string; size: string; title?: string; glow?: Glow; settings?: { text?: string; links?: Bookmark[]; [name: string]: unknown } };

/** The placed widget's own title, glow and settings, from the saved layout. */
export const WidgetItem = createContext<LayoutItem | null>(null);

type State<T> = { data: T | null; error: string | null; loading: boolean };

function useWidgetData<T>(extension: string, id: string, refreshSeconds?: number): State<T> & { reload: () => void } {
    const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
    const load = useCallback(async () => {
        try {
            const response = await fetch(`/widgets/${extension}/${id}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!response.ok) throw new Error(response.status === 404 ? 'Not available' : `Could not load (${response.status})`);
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

    return { ...state, reload: load };
}

export function WidgetFrame({ definition, children, glow }: { definition: WidgetDefinition; children: ReactNode; glow?: Glow }) {
    const item = useContext(WidgetItem);
    const tone = item?.glow ?? glow;
    return (
        <section className="ps-frame ps-widget" data-glow={tone === 'none' ? undefined : tone}>
            <div className="ps-frame__panel">
                <header className="ps-widget__head">
                    <span className="ps-widget__icon"><i className={`bx ${definition.icon}`} aria-hidden="true" /></span>
                    <h2 className="ps-widget__title">{item?.title || definition.title}</h2>
                    {definition.admin && <span className="ps-widget__source"><Badge tone="accent">Admin</Badge></span>}
                </header>
                <div className="ps-widget__body">{children}</div>
            </div>
        </section>
    );
}

function Loading() {
    return <div className="ps-stack" aria-busy="true"><div className="ps-skeleton widget-skeleton" /><div className="ps-skeleton widget-skeleton widget-skeleton--short" /></div>;
}

function Body<T>({ state, children }: { state: State<T>; children: (data: T) => ReactNode }) {
    if (state.loading && !state.data) return <Loading />;
    if (state.error && !state.data) return <Empty icon="bx-error-circle">{state.error}</Empty>;
    return <>{children(state.data as T)}</>;
}

/* ---------- Greeting ---------- */
type GreetingData = { firstName: string; role: string; services: number; twoFactor: boolean };
function greetingFor(hour: number) {
    if (hour < 5) return 'Good night';
    if (hour < 10) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}
export function GreetingWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<GreetingData>(definition.extension, definition.id);
    const item = useContext(WidgetItem);
    const glow = item?.glow ?? 'accent';
    const now = new Date();
    return (
        <section className="ps-frame ps-widget widget-greeting" data-glow={glow === 'none' ? undefined : glow}>
            <div className="ps-frame__panel">
                <Body state={state}>{(data) => (
                    <div className="widget-greeting__inner">
                        <div>
                            <p className="ps-eyebrow ps-eyebrow--accent">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <h2 className="ps-title ps-title--hero widget-greeting__title">{greetingFor(now.getHours())}, {data.firstName}</h2>
                        </div>
                        <div className="ps-inline">
                            <RoleBadge role={data.role} />
                            <Badge>{data.services} {data.services === 1 ? 'service' : 'services'}</Badge>
                            {data.twoFactor
                                ? <Badge tone="green"><i className="bx bx-check-shield" /> Two-factor on</Badge>
                                : <Link href="/account/security" className="ps-badge ps-badge--amber"><i className="bx bx-shield-x" /> Turn on two-factor</Link>}
                        </div>
                    </div>
                )}</Body>
            </div>
        </section>
    );
}

/* ---------- Server ---------- */
type SystemData = { system: { model: string; hostname: string; cpuPercent: number; load: number[]; cores: number; memoryPercent: number; memoryUsed: string; memoryTotal: string; diskPercent: number; diskFree: string; diskTotal: string; temperature: number | null; uptime: string }; detailed: boolean };
function tempTone(value: number | null): 'green' | 'amber' | 'red' | undefined {
    if (value === null) return undefined;
    return value >= 75 ? 'red' : value >= 62 ? 'amber' : 'green';
}
export function PiHealthWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<SystemData>(definition.extension, definition.id, 15);
    return (
        <WidgetFrame definition={definition} glow="green">
            <Body state={state}>{({ system, detailed }) => (
                <div className="ps-stack widget-health">
                    <div className="ps-between">
                        <span className="ps-small ps-muted">{detailed ? system.model : system.hostname}</span>
                        {system.temperature !== null && <Badge tone={tempTone(system.temperature)}>{system.temperature.toFixed(0)} °C</Badge>}
                    </div>
                    <div className="widget-health__row"><div className="ps-between"><span>Processor</span><span className="ps-muted">{system.cpuPercent}%</span></div><Meter value={system.cpuPercent} label="Processor load" /></div>
                    <div className="widget-health__row"><div className="ps-between"><span>Memory</span><span className="ps-muted">{system.memoryUsed} of {system.memoryTotal}</span></div><Meter value={system.memoryPercent} label="Memory used" /></div>
                    <div className="widget-health__row"><div className="ps-between"><span>Storage</span><span className="ps-muted">{system.diskFree} free</span></div><Meter value={system.diskPercent} label="Storage used" /></div>
                    <div className="ps-between ps-small ps-muted"><span>Up {system.uptime}</span>{detailed && <span>Load {system.load.join(' / ')}</span>}</div>
                </div>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Services ---------- */
type LauncherData = { apps: { id: string; name: string; description: string; icon: string; url: string }[] };
export function LauncherWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<LauncherData>(definition.extension, definition.id);
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{({ apps }) => apps.length === 0
                ? <Empty icon="bx-extension">No services are open to you yet.</Empty>
                : <div className="widget-launcher">{apps.map((app) => (
                    <a key={app.id} href={app.url} className="widget-launcher__app">
                        <span className="widget-launcher__icon"><i className={`bx ${app.icon}`} aria-hidden="true" /></span>
                        <span className="widget-launcher__text"><strong>{app.name}</strong><span>{app.description}</span></span>
                        <i className="bx bx-chevron-right widget-launcher__go" aria-hidden="true" />
                    </a>
                ))}</div>}
            </Body>
        </WidgetFrame>
    );
}

/* ---------- Activity ---------- */
type EventItem = { id: number; label: string; actor: string | null; source: string; at: string };
function EventList({ events, showActor }: { events: EventItem[]; showActor?: boolean }) {
    if (events.length === 0) return <Empty icon="bx-history">Nothing yet.</Empty>;
    return <ul className="ps-list">{events.map((event) => (
        <ListRow key={event.id} title={event.label} meta={`${showActor && event.actor ? `${event.actor}, ` : ''}${relativeTime(event.at)}`} icon={event.source === 'login' ? 'bx-log-in-circle' : 'bx-edit'} />
    ))}</ul>;
}
export function ActivityWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<{ events: EventItem[] }>(definition.extension, definition.id, 60);
    return <WidgetFrame definition={definition}><Body state={state}>{({ events }) => <EventList events={events} />}</Body></WidgetFrame>;
}

/* ---------- Admin: accounts ---------- */
type UsersData = { total: number; byRole: Record<string, number>; disabled: number; withoutTwoFactor: number; recent: { id: number; name: string; initials: string; avatar: string | null; username: string; lastLogin: string }[] };
export function AdminUsersWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<UsersData>(definition.extension, definition.id, 120);
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{(data) => (
                <div className="ps-stack">
                    <div className="widget-figures">
                        <div><strong>{data.total}</strong><span>Accounts</span></div>
                        <div><strong>{data.byRole.admin ?? 0}</strong><span>Admins</span></div>
                        <div><strong>{data.byRole.moderator ?? 0}</strong><span>Moderators</span></div>
                    </div>
                    {data.withoutTwoFactor > 0 && <div className="ps-alert"><i className="bx bx-shield-x" /><span>{data.withoutTwoFactor} admins or moderators have no two-factor.</span></div>}
                    <ul className="ps-list">{data.recent.map((user) => (
                        <ListRow key={user.id} icon={<Avatar src={user.avatar} initials={user.initials} size="xs" />} title={user.name} meta={`Signed in ${relativeTime(user.lastLogin)}`} />
                    ))}</ul>
                    <ButtonLink href="/admin/users" size="sm" icon="bx-group">Manage accounts</ButtonLink>
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
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{({ services }) => (
                <ul className="ps-list">{services.map((service) => (
                    <ListRow key={service.id} icon={service.icon} title={service.name}
                        meta={service.state === 'online' ? `Online${service.ms !== null ? `, ${service.ms} ms` : ''}` : service.state === 'offline' ? 'Not responding' : service.state === 'error' ? 'Answering with errors' : 'Not checked'}
                        action={<span className={`ps-dot ${STATE_DOT[service.state] ?? ''}`} aria-hidden="true" />} />
                ))}</ul>
            )}</Body>
        </WidgetFrame>
    );
}

/* ---------- Admin: sign-in activity ---------- */
type SecurityData = { failed: number; locked: number; signIns: number; events: EventItem[] };
export function AdminSecurityWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<SecurityData>(definition.extension, definition.id, 60);
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{(data) => (
                <div className="ps-stack">
                    <div className="widget-figures">
                        <div><strong>{data.signIns}</strong><span>Sign-ins today</span></div>
                        <div className={data.failed > 0 ? 'is-warn' : ''}><strong>{data.failed}</strong><span>Failed</span></div>
                        <div className={data.locked > 0 ? 'is-alert' : ''}><strong>{data.locked}</strong><span>Locked</span></div>
                    </div>
                    <EventList events={data.events.slice(0, 5)} showActor />
                </div>
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
function ExtRow({ item }: { item: ExtItem }) {
    const lead = item.image
        ? <span className="widget-ext__thumb"><img src={item.image} alt="" loading="lazy" /></span>
        : item.avatar || item.initials
            ? <Avatar src={item.avatar ?? null} initials={item.initials ?? '?'} size="sm" />
            : item.icon;
    return <ListRow href={item.url} icon={lead} title={<>{item.title}{item.badge && <Badge tone={item.tone === 'minus' ? 'red' : item.tone === 'plus' ? 'green' : undefined}>{item.badge}</Badge>}</>} meta={item.meta} />;
}
export function ExtensionWidget({ definition }: { definition: WidgetDefinition }) {
    const state = useWidgetData<ExtData>(definition.extension, definition.id, 120);
    return (
        <WidgetFrame definition={definition}>
            <Body state={state}>{(data) => (
                <div className="widget-ext">
                    {data.metrics && data.metrics.length > 0 && (
                        <div className="widget-figures">{data.metrics.map((metric) => (
                            <div key={metric.label} className={metric.tone === 'minus' ? 'is-alert' : metric.tone === 'plus' ? 'is-good' : ''}><strong>{metric.value}</strong><span>{metric.label}</span></div>
                        ))}</div>
                    )}
                    {data.type === 'gallery' && data.images && data.images.length > 0 && (
                        <div className="widget-ext__gallery">{data.images.map((image, index) => (
                            <a key={image.src + index} href={image.url ?? image.src} className="widget-ext__photo"><img src={image.src} alt={image.alt ?? ''} loading="lazy" /></a>
                        ))}</div>
                    )}
                    {data.items && data.items.length > 0 && <ul className="ps-list">{data.items.map((item, index) => <ExtRow key={index} item={item} />)}</ul>}
                    {!data.items?.length && !data.images?.length && !data.metrics?.length && <Empty icon={data.error ? 'bx-error-circle' : definition.icon}>{data.empty ?? 'Nothing here yet.'}</Empty>}
                    {data.more && <a className="ps-btn ps-btn--sm widget-ext__more" href={data.more.url}>{data.more.label}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></a>}
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
        <WidgetFrame definition={definition}>
            <Body state={state}>{(data) => (
                <div className="ps-stack">
                    {data.available.length === 0
                        ? <Empty icon="bx-check-circle">{data.checkedAt ? `Everything is up to date. Checked ${relativeTime(data.checkedAt)}.` : 'Not checked yet.'}</Empty>
                        : <ul className="ps-list">{data.available.map((item) => <ListRow key={item.id} icon="bx-download" title={`${item.name} ${item.latest}`} meta={`Installed ${item.installed ?? 'unknown'}`} />)}</ul>}
                    {data.failed > 0 && <div className="ps-alert"><i className="bx bx-error-circle" /><span>{data.failed === 1 ? 'One update failed' : `${data.failed} updates failed`} this week.</span></div>}
                    <ButtonLink href="/admin/updates" size="sm" icon="bx-refresh">Open updates</ButtonLink>
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
            {text
                ? <div className="widget-notes">{text}</div>
                : <Empty icon="bx-note">Write a note in the <Link href="/design">Design studio</Link>.</Empty>}
        </WidgetFrame>
    );
}
export function BookmarksWidget({ definition }: { definition: WidgetDefinition }) {
    const links = useContext(WidgetItem)?.settings?.links ?? [];
    return (
        <WidgetFrame definition={definition}>
            {links.length
                ? <ul className="ps-list">{links.map((link, index) => <ListRow key={index} href={link.url} icon="bx-link-external" title={link.label} meta={hostOf(link.url)} />)}</ul>
                : <Empty icon="bx-bookmark">Add links in the <Link href="/design">Design studio</Link>.</Empty>}
        </WidgetFrame>
    );
}
function hostOf(url: string) {
    try { return new URL(url).host; } catch { return url; }
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
};

/** Renders one placed widget with its own title, glow and settings. */
export function PlacedWidget({ item, definition }: { item: LayoutItem; definition: WidgetDefinition }) {
    const Component = WIDGETS[item.key] ?? (definition.extension !== 'core' ? ExtensionWidget : undefined);
    if (!Component) return null;
    return <WidgetItem.Provider value={item}><Component definition={definition} /></WidgetItem.Provider>;
}
