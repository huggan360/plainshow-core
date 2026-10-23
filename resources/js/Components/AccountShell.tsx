import AppShell from '@/Layouts/AppShell';
import { Avatar, RoleBadge } from '@/Components/ui';
import { can, SharedProps } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ReactNode } from 'react';
import { t } from '@/i18n';

export type AccountSection = 'profile' | 'security' | 'tokens' | 'groups';

/**
 * Account and Groups share one head: you, in a frame, and the parts of your
 * account as tabs under it. Only the parts a person may use are shown.
 */
export default function AccountShell({ section, title, actions, children }: { section: AccountSection; title: string; actions?: ReactNode; children: ReactNode }) {
    const { props } = usePage<SharedProps>();
    const user = props.auth.user!;
    const caps = props.auth.capabilities;
    const tabs = [
        { id: 'profile', href: '/account', icon: 'bx-user', label: t('Profile') },
        { id: 'security', href: '/account/security', icon: 'bx-shield-quarter', label: t('Security') },
        can(caps, 'core.api.use') && { id: 'tokens', href: '/account/tokens', icon: 'bx-key', label: t('API tokens') },
        can(caps, 'core.groups.view') && { id: 'groups', href: '/groups', icon: 'bx-group', label: t('Groups') },
    ].filter(Boolean) as { id: AccountSection; href: string; icon: string; label: string }[];

    return (
        <AppShell title={title} heading={false}>
            <section className="ps-frame account-hero">
                <div className="ps-frame__panel">
                    <Avatar src={user.avatar} initials={user.initials} size="xl" />
                    <div className="account-hero__who">
                        <h1>{user.name}</h1>
                        <p><span>@{user.username}</span><RoleBadge role={user.role} /></p>
                    </div>
                    {actions && <div className="account-hero__actions">{actions}</div>}
                </div>
            </section>
            <nav className="account-tabs" aria-label={t('Account sections')}>
                {tabs.map((tab) => (
                    <Link key={tab.id} href={tab.href} preserveScroll={tab.id !== 'groups'} className={`account-tabs__item${section === tab.id ? ' is-active' : ''}`} aria-current={section === tab.id ? 'page' : undefined}>
                        <i className={`bx ${tab.icon}`} aria-hidden="true" />{tab.label}
                    </Link>
                ))}
            </nav>
            {children}
        </AppShell>
    );
}
