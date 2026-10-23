import { Avatar } from '@/Components/ui';
import { can, SharedProps } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { lang, LANGS, setLang, t } from '@/i18n';

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
/**
 * `app`: a core app (Weather, News). On a computer its frame fills the window
 * below the top bar and the page does not scroll; on phones it scrolls as usual.
 */
export default function AppShell({ title, children, wide, actions, description, heading = true, app }: { title: string; children: ReactNode; wide?: boolean; actions?: ReactNode; description?: ReactNode; heading?: boolean; app?: boolean }) {
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
    const admin = props.adminAreas;
    const inAdmin = path === '/administration' || path.startsWith('/admin/');

    return (
        <div className={`ps-shell${menuOpen ? ' is-menu-open' : ''}${app ? ' ps-shell--app' : ''}`}>
            <Head title={title} />
            <aside className="ps-sidebar" aria-label={t('Main')}>
                <div className="ps-sidebar__brand">
                    <Link href="/" className="ps-brand">
                        <img className="ps-brand__logo" src={`/ui/brand/plainshow-logo.webp?v=${props.uiVersion}`} alt={t('PlainShow')} width="92" height="30" />
                    </Link>
                </div>
                <nav className="ps-nav">
                    <Link href="/" className={`ps-nav__item${active('/') ? ' is-active' : ''}`}><i className="bx bx-grid-alt" aria-hidden="true" />{t('Dashboard')}</Link>
                    <Link href="/account" className={`ps-nav__item${active('/account') ? ' is-active' : ''}`}><i className="bx bx-user-circle" aria-hidden="true" />{t('Account')}</Link>
                    {can(caps, 'core.groups.view') && <Link href="/groups" className={`ps-nav__item${active('/groups') ? ' is-active' : ''}`}><i className="bx bx-group" aria-hidden="true" />{t('Groups')}</Link>}
                </nav>
                {props.coreApps.length > 0 && (
                    <nav className="ps-nav ps-sidebar__section" aria-label={t('Apps')}>
                        {props.coreApps.map((app) => <Link key={app.id} href={app.url} className={`ps-nav__item${active(app.url) ? ' is-active' : ''}`}><i className={`bx ${app.icon}`} aria-hidden="true" />{app.name}</Link>)}
                    </nav>
                )}
                {services.length > 0 && (
                    <div className="ps-sidebar__section">
                        <p className="ps-eyebrow ps-sidebar__label">{t('Services')}</p>
                        <nav className="ps-nav">
                            {services.map((app) => (
                                <a key={app.id} href={app.url ?? '#'} className="ps-nav__item"><i className={`bx ${app.icon}`} aria-hidden="true" />{app.name}<i className="bx bx-right-top-arrow-circle ps-nav__count" aria-hidden="true" /></a>
                            ))}
                        </nav>
                    </div>
                )}
                <div className="ps-sidebar__foot">
                    <Link href="/design" className={`ps-nav__item${active('/design') ? ' is-active' : ''}`}><i className="bx bx-palette" aria-hidden="true" />{t('Design')}</Link>
                    <div className={`ps-dropdown ps-me${accountOpen ? ' is-open' : ''}`} ref={accountRef}>
                        <button type="button" className="ps-me__button" aria-expanded={accountOpen} aria-label={t('Account menu')} onClick={() => setAccountOpen((open) => !open)}>
                            <Avatar src={user.avatar} initials={user.initials} size="sm" />
                            <span className="ps-me__text"><span className="ps-me__name">{user.name}</span><span className="ps-me__meta">@{user.username}</span></span>
                            <i className={`bx ${accountOpen ? 'bx-chevron-down' : 'bx-chevron-up'} ps-me__chevron`} aria-hidden="true" />
                        </button>
                        {accountOpen && (
                            <div className="ps-dropdown__menu ps-dropdown__menu--up">
                                <Link href="/account" className="ps-dropdown__item"><i className="bx bx-user" />{t('Account')}</Link>
                                {admin.length > 0 && <Link href="/administration" className="ps-dropdown__item"><i className="bx bx-shield-quarter" />{t('Administration')}</Link>}
                                <LanguageSwitch />
                                <button type="button" className="ps-dropdown__item" onClick={toggleTheme}><i className={`bx ${theme === 'light' ? 'bx-moon' : 'bx-sun'}`} />{theme === 'light' ? t('Dark theme') : t('Light theme')}</button>
                                <div className="ps-dropdown__sep" />
                                <a href="/auth/logout" className="ps-dropdown__item"><i className="bx bx-log-out" />{t('Sign out')}</a>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <div className="ps-main">
                <header className="ps-topbar">
                    <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-menu-toggle" aria-label={t('Open menu')} onClick={() => setMenuOpen(true)}><i className="bx bx-menu" /></button>
                    <Link href="/" className="ps-brand shell-topbar-mark" aria-label={t('PlainShow')}><img className="ps-brand__mark" src={`/ui/brand/plainshow-icon.webp?v=${props.uiVersion}`} alt="" /></Link>
                    <span className="ps-topbar__spacer" />
                    <div className="ps-switcher" ref={switcherRef}>
                        <button type="button" className="ps-btn ps-btn--ghost ps-btn--icon ps-switcher__trigger" aria-label={t('Switch service')} aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}><i className="bx bx-grid" /></button>
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
                </header>
                <main className={`ps-content${wide ? ' ps-content--wide' : ''}`}>
                    {inAdmin && admin.length > 0 && (
                        <nav className="admin-tabs" aria-label={t('Administration')}>
                            <Link href="/administration" className={`admin-tabs__item${path === '/administration' ? ' is-active' : ''}`}><i className="bx bx-shield-quarter" aria-hidden="true" />{t('Administration')}</Link>
                            {admin.map((area) => <Link key={area.id} href={area.href} className={`admin-tabs__item${active(area.href) ? ' is-active' : ''}`}><i className={`bx ${area.icon}`} aria-hidden="true" />{area.label}</Link>)}
                        </nav>
                    )}
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

            <nav className="ps-tabbar" aria-label={t('Quick navigation')}>
                <Link href="/" className={`ps-tabbar__item${active('/') ? ' is-active' : ''}`}><i className="bx bx-grid-alt" />{t('Home')}</Link>
                {props.coreApps.map((app) => <Link key={app.id} href={app.url} className={`ps-tabbar__item${active(app.url) ? ' is-active' : ''}`}><i className={`bx ${app.icon}`} />{app.name}</Link>)}
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

/** English, Dutch or Swedish, for every PlainShow site (the same switch in every app's menu). */
export function LanguageSwitch() {
    return <div className="ps-dropdown__lang" role="group" aria-label={t('Language')}>
        <i className="bx bx-globe" aria-hidden="true" /><span>{t('Language')}</span>
        <span className="ps-lang">{LANGS.map((item) => (
            <button key={item.code} type="button" lang={item.code} title={item.name} aria-pressed={item.code === lang} className={item.code === lang ? 'is-active' : ''} onClick={() => setLang(item.code)}>{item.code.toUpperCase()}</button>
        ))}</span>
    </div>;
}
