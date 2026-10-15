import AppShell from '@/Layouts/AppShell';
import { Badge, Empty, Frame, relativeTime } from '@/Components/ui';
import { Link } from '@inertiajs/react';

type Event = { id: number; label: string; event: string; actor: string | null; subject: string | null; source: string; ip: string | null; context: Record<string, unknown> | null; at: string };
type Page = { data: Event[]; links: { url: string | null; label: string; active: boolean }[]; total: number };

const FILTERS = [{ id: 'all', label: 'Everything' }, { id: 'security', label: 'Sign-ins' }, { id: 'admin', label: 'Admin changes' }];

export default function Audit({ events, filter }: { events: Page; filter: string }) {
    const pages = events.links.filter((link) => /^\d+$/.test(link.label));
    const previous = events.links[0];
    const next = events.links[events.links.length - 1];

    return (
        <AppShell title="Audit log" wide>
            <div className="ps-page-head">
                <div>
                    <h1 className="ps-title">Audit log</h1>
                    <p className="ps-muted">{events.total} events</p>
                </div>
                <nav className="ps-tabs" aria-label="Filter">
                    {FILTERS.map((item) => <Link key={item.id} href={`/admin/audit${item.id === 'all' ? '' : `?filter=${item.id}`}`} className={`ps-tab${filter === item.id ? ' is-active' : ''}`} preserveState>{item.label}</Link>)}
                </nav>
            </div>
            <Frame flush>
                {events.data.length === 0 ? <Empty icon="bx-list-ul">No events.</Empty> : (
                    <div className="ps-table-wrap">
                        <table className="ps-table">
                            <thead><tr><th>Event</th><th>By</th><th className="admin-hide-sm">Account</th><th className="admin-hide-sm">Where</th><th>When</th></tr></thead>
                            <tbody>
                                {events.data.map((event) => (
                                    <tr key={event.id}>
                                        <td className="is-primary">{event.label}</td>
                                        <td>{event.actor ?? <span className="ps-faint">Unknown</span>}</td>
                                        <td className="admin-hide-sm">{event.subject && event.subject !== event.actor ? event.subject : <span className="ps-faint">Same</span>}</td>
                                        <td className="admin-hide-sm"><Badge>{event.source}</Badge> <span className="ps-faint ps-small ps-mono">{event.ip}</span></td>
                                        <td className="ps-small" title={new Date(event.at).toLocaleString('en-GB')}>{relativeTime(event.at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Frame>
            {pages.length > 1 && (
                <nav className="ps-inline audit-pages" aria-label="Pages">
                    {previous.url && <Link href={previous.url} className="ps-btn ps-btn--sm" preserveScroll><i className="bx bx-chevron-left" />Newer</Link>}
                    <span className="ps-muted ps-small">Page {pages.find((page) => page.active)?.label} of {pages.length}</span>
                    {next.url && <Link href={next.url} className="ps-btn ps-btn--sm" preserveScroll>Older<i className="bx bx-chevron-right" /></Link>}
                </nav>
            )}
        </AppShell>
    );
}
