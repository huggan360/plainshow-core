import { Avatar } from '@/Components/ui';
import { can, SharedProps } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useRef, useState } from 'react';

type Toast = { id: number; kind: 'success' | 'error'; message: string };

function useTheme(): [string, () => void] {
    const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
    const toggle = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('plainshow-theme', next); } catch { /* private mode */ }
        setTheme(next);
    };
    return [theme, toggle];
}

function useOutside(open: boolean, close: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open, close]);
    return ref;
}

/**
 * The page title sits on the page as a heading, not in the top bar. Pages
 * with their own heading (the dashboard greeting) pass `heading={false}`.
 */
export default function AppShell({ title, children, wide, actions, description, heading = true }: { title: string; children: ReactNode; wide?: boolean; actions?: ReactNode; description?: ReactNode; heading?: boolean }) {
    const { props, url } = usePage<SharedProps>();
    const user = props.auth.user!;
    const caps = props.auth.capabilities;
    const [menuOpen, setMenuOpen] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [theme, toggleTheme] = useTheme();
    const [toasts, setToasts] = useState<Toast[]>([]);
    const switcherRef = useOutside(switcherOpen, () => setSwitcherOpen(false));
    const accountRef = useOutside(accountOpen, () => setAccountOpen(false));
    const services = props.apps.filter((app) => app.id !== 'core');

    useEffect(() => {
        const message = props.flash.error ?? props.flash.status;
        if (!message) return;
        const toast: Toast = { id: Date.now(), kind: props.flash.error ? 'error' : 'success', message };
        setToasts((current) => [...current.slice(-2), toast]);
        const timer = window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4500);
        return () => window.clearTimeout(timer);
    }, [props.flash.error, props.flash.status]);

    useEffect(() => { setMenuOpen(false); }, [url]);

    const path = url.split('?')[0];
    const active = (prefix: string) => (prefix === '/' ? path === '/' : path.startsWith(prefix));
    const admin = [
        can(caps, 'core.users.manage') && { href: '/admin/users', icon: 'bx-group', label: 'Accounts' },
        can(caps, 'core.extensions.manage') && { href: '/admin/services', icon: 'bx-extension', label: 'Services' },
        can(caps, 'core.permissions.manage') && { href: '/admin/permissions', icon: 'bx-key', label: 'Permissions' },
        can(caps, 'core.updates.apply') && { href: '/admin/updates', icon: 'bx-refresh', label: 'Updates' },
        can(caps, 'core.audit.view') && { href: '/admin/audit', icon: 'bx-list-ul', label: 'Audit log' },
    ].filter(Boolean) as { href: string; icon: string; label: string }[];

    return (
        <div className={`ps-shell${menuOpen ? ' is-menu-open' : ''}`}>
            <Head title={title} />
            <aside className="ps-sidebar" aria-label="Main">
                <div className="ps-sidebar__brand">
                    <Link href="/" className="ps-brand">
                        <img className="ps-brand__logo" src={`/ui/brand/plainshow-logo.webp?v=${props.uiVersion}`} alt="PlainShow" width="92" height="30" />
                    </Link>
                </div>
                <nav className="ps-nav">
                    <Link href="/" className={`ps-nav__item${active('/') ? ' is-active' : ''}`}><i className="bx bx-grid-alt" aria-hidden="true" />Dashboard</Link>
                    <Link href="/account" className={`ps-nav__item${active('/account') ? ' is-active' : ''}`}><i className="bx bx-user-circle" aria-hidden="true" />Account</Link>
                </nav>
                {services.length > 0 && (
                    <div className="ps-sidebar__section">
                        <p className="ps-eyebrow ps-sidebar__label">Services</p>
                        <nav className="ps-nav">
                            {services.map((app) => (
                                <a key={app.id} href={app.url ?? '#'} className="ps-nav__item"><i className={`bx ${app.icon}`} aria-hidden="true" />{app.name}<i className="bx bx-right-top-arrow-circle ps-nav__count" aria-hidden="true" /></a>
                            ))}
                        </nav>
                    </div>
                )}
                {admin.length > 0 && (
                    <div className="ps-sidebar__section">
                        <p className="ps-eyebrow ps-sidebar__label">Administration</p>
                        <nav className="ps-nav">
                            {admin.map((item) => <Link key={item.href} href={item.href} className={`ps-nav__item${active(item.href) ? ' is-active' : ''}`}><i className={`bx ${item.icon}`} aria-hidden="true" />{item.label}</Link>)}
                        </nav>
                    </div>
                )}
                <div className="ps-sidebar__foot">
                    <button type="button" className="ps-nav__item" onClick={toggleTheme}><i className={`bx ${theme === 'light' ? 'bx-moon' : 'bx-sun'}`} aria-hidden="true" />{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>
                    <Link href="/design" className={`ps-nav__item${active('/design') ? ' is-active' : ''}`}><i className="bx bx-palette" aria-hidden="true" />Design</Link>
                    <a href="/auth/logout" className="ps-nav__item"><i className="bx bx-log-out" aria-hidden="true" />Sign out</a>
                </div>
            </aside>

            <div className="ps-main">
                <header className="ps-topbar">
                    <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(true)}><i className="bx bx-menu" /></button>
                    <Link href="/" className="ps-brand shell-topbar-mark" aria-label="PlainShow"><img className="ps-brand__mark" src={`/ui/brand/plainshow-icon.webp?v=${props.uiVersion}`} alt="" /></Link>
                    <span className="ps-topbar__spacer" />
                    <div className="ps-switcher" ref={switcherRef}>
                        <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon" aria-label="Switch service" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}><i className="bx bx-grid-small" /></button>
                        {switcherOpen && (
                            <div className="ps-switcher__panel">
                                <div className="ps-switcher__grid">
                                    {props.apps.map((app) => (
                                        <a key={app.id} href={app.id === 'core' ? '/' : app.url ?? '#'} className={`ps-switcher__app${app.id === 'core' ? ' is-current' : ''}`}>
                                            <i className={`bx ${app.icon}`} aria-hidden="true" />{app.name}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="ps-dropdown" ref={accountRef}>
                        <button type="button" className="ps-btn ps-btn--ghost shell-account" aria-expanded={accountOpen} aria-label="Account menu" onClick={() => setAccountOpen((open) => !open)}>
                            <Avatar src={user.avatar} initials={user.initials} size="sm" />
                        </button>
                        {accountOpen && (
                            <div className="ps-dropdown__menu">
                                <div className="ps-dropdown__head">
                                    <Avatar src={user.avatar} initials={user.initials} />
                                    <div className="shell-account__who"><strong>{user.name}</strong><span className="ps-muted ps-small">@{user.username}</span></div>
                                </div>
                                <div className="ps-dropdown__sep" />
                                <Link href="/account" className="ps-dropdown__item"><i className="bx bx-user" />Profile</Link>
                                <Link href="/account/security" className="ps-dropdown__item"><i className="bx bx-shield-quarter" />Security</Link>
                                <Link href="/account/connections" className="ps-dropdown__item"><i className="bx bx-link" />Connections</Link>
                                <div className="ps-dropdown__sep" />
                                <a href="/auth/logout" className="ps-dropdown__item"><i className="bx bx-log-out" />Sign out</a>
                            </div>
                        )}
                    </div>
                </header>
                <main className={`ps-content${wide ? ' ps-content--wide' : ''}`}>
                    {heading && (
                        <div className="ps-page-head">
                            <div>
                                <h1 className="ps-page-head__title">{title}</h1>
                                {description && <p className="ps-page-head__text">{description}</p>}
                            </div>
                            {actions && <div className="ps-page-head__actions">{actions}</div>}
                        </div>
                    )}
                    {children}
                </main>
            </div>

            <nav className="ps-tabbar" aria-label="Quick navigation">
                <Link href="/" className={`ps-tabbar__item${active('/') ? ' is-active' : ''}`}><i className="bx bx-grid-alt" />Home</Link>
                <button type="button" className="ps-tabbar__item shell-tab-button" onClick={() => setSwitcherOpen(true)}><i className="bx bx-grid-small" />Services</button>
                <Link href="/account" className={`ps-tabbar__item${active('/account') ? ' is-active' : ''}`}><i className="bx bx-user-circle" />Account</Link>
                {admin.length > 0 && <Link href={admin[0].href} className={`ps-tabbar__item${active('/admin') ? ' is-active' : ''}`}><i className="bx bx-cog" />Admin</Link>}
            </nav>

            <div className="ps-toasts" aria-live="polite">
                {toasts.map((toast) => (
                    <div key={toast.id} className="ps-toast" role={toast.kind === 'error' ? 'alert' : 'status'}>
                        <i className={`bx ${toast.kind === 'error' ? 'bx-error-circle shell-toast--error' : 'bx-check-circle shell-toast--ok'}`} aria-hidden="true" />
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
