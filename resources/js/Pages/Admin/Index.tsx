import AppShell from '@/Layouts/AppShell';
import { Link } from '@inertiajs/react';
import { t } from '@/i18n';

type Area = { id: string; href: string; icon: string; label: string; description: string; figure: string | null };

/** Administration: the admin areas this person may open, each with a figure at a glance. */
export default function AdminIndex({ areas }: { areas: Area[] }) {
    return (
        <AppShell title={t('Administration')} heading={false}>
            <div className="admin-areas">
                {areas.map((area) => (
                    <Link key={area.id} href={area.href} className="ps-frame ps-frame--compact admin-area">
                        <span className="ps-frame__panel">
                            <span className="admin-area__icon"><i className={`bx ${area.icon}`} aria-hidden="true" /></span>
                            <span className="admin-area__text">
                                <strong>{area.label}</strong>
                                <span>{area.description}</span>
                            </span>
                            {area.figure && <span className="admin-area__figure">{area.figure}</span>}
                            <i className="bx bx-chevron-right admin-area__go" aria-hidden="true" />
                        </span>
                    </Link>
                ))}
            </div>
        </AppShell>
    );
}
