import { Avatar, Badge, ButtonLink, Empty, ListRow, Meter, relativeTime, RoleBadge } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { ReactNode, useCallback, useEffect, useState } from 'react';

export type WidgetDefinition = { key: string; extension: string; extensionName: string; id: string; title: string; icon: string; sizes: string[]; default: string; admin: boolean };

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

export function WidgetFrame({ definition, children, glow }: { definition: WidgetDefinition; children: ReactNode; glow?: 'accent' | 'green' | 'blue' | 'violet' | 'pink' | 'warm' | 'cyan' }) {
    return (
        <section className="ps-frame ps-widget" data-glow={glow}>
            <div className="ps-frame__panel">
                <header className="ps-widget__head">
                    <span className="ps-widget__icon"><i className={`bx ${definition.icon}`} aria-hidden="true" /></span>
                    <h2 className="ps-widget__title">{definition.title}</h2>
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
    const now = new Date();
    return (
        <section className="ps-frame ps-widget widget-greeting" data-glow="accent">
            <div className="ps-frame__panel">
                <Body state={state}>{(data) => (
                    <div className="widget-greeting__inner">
                        <div>
                            <p className="ps-eyebrow">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
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

export const WIDGETS: Record<string, (props: { definition: WidgetDefinition }) => ReactNode> = {
    'core.greeting': GreetingWidget,
    'core.pi-health': PiHealthWidget,
    'core.launcher': LauncherWidget,
    'core.activity': ActivityWidget,
    'core.admin-users': AdminUsersWidget,
    'core.admin-services': AdminServicesWidget,
    'core.admin-security': AdminSecurityWidget,
};
