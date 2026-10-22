import AppShell from '@/Layouts/AppShell';
import { Badge, Empty, Frame, relativeTime } from '@/Components/ui';
import { Link } from '@inertiajs/react';
import { t, locale } from '@/i18n';

type Event = { id: number; label: string; event: string; actor: string | null; subject: string | null; source: string; ip: string | null; context: Record<string, unknown> | null; at: string };
type Page = { data: Event[]; links: { url: string | null; label: string; active: boolean }[]; total: number };

const FILTERS = [{ id: 'all', label: t('Everything') }, { id: 'security', label: t('Sign-ins') }, { id: 'admin', label: t('Admin changes') }];

export default function Audit({ events, filter }: { events: Page; filter: string }) {
    const pages = events.links.filter((link) => /^\d+$/.test(link.label));
    const previous = events.links[0];
    const next = events.links[events.links.length - 1];

    return (
        <AppShell title={t('Audit log')} wide description={t('{total} events', { total: events.total })} actions={
            <nav className="ps-tabs" aria-label={t('Filter')}>
                {FILTERS.map((item) => <Link key={item.id} href={`/admin/audit${item.id === 'all' ? '' : `?filter=${item.id}`}`} className={`ps-tab${filter === item.id ? ' is-active' : ''}`} preserveState>{t(item.label)}</Link>)}
            </nav>
        }>
            <Frame flush>
                {events.data.length === 0 ? <Empty icon="bx-list-ul">{t('No events.')}</Empty> : (
                    <div className="ps-table-wrap">
                        <table className="ps-table">
                            <thead><tr><th>{t('Event')}</th><th>{t('By')}</th><th className="admin-hide-sm">{t('Account')}</th><th className="admin-hide-sm">{t('Where')}</th><th>{t('When')}</th></tr></thead>
                            <tbody>
                                {events.data.map((event) => (
                                    <tr key={event.id}>
                                        <td className="is-primary">{t(event.label)}</td>
                                        <td>{event.actor ?? <span className="ps-faint">{t('Unknown')}</span>}</td>
                                        <td className="admin-hide-sm">{event.subject && event.subject !== event.actor ? event.subject : <span className="ps-faint">{t('Same')}</span>}</td>
                                        <td className="admin-hide-sm"><Badge>{event.source}</Badge> <span className="ps-faint ps-small ps-mono">{event.ip}</span></td>
                                        <td className="ps-small" title={new Date(event.at).toLocaleString(locale)}>{relativeTime(event.at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Frame>
            {pages.length > 1 && (
                <nav className="ps-inline audit-pages" aria-label={t('Pages')}>
                    {previous.url && <Link href={previous.url} className="ps-btn ps-btn--sm" preserveScroll><i className="bx bx-chevron-left" />{t('Newer')}</Link>}
                    <span className="ps-muted ps-small">{t('Page')}{' '}{pages.find((page) => page.active)?.label} of {pages.length}</span>
                    {next.url && <Link href={next.url} className="ps-btn ps-btn--sm" preserveScroll>{t('Older')}<i className="bx bx-chevron-right" /></Link>}
                </nav>
            )}
        </AppShell>
    );
}
