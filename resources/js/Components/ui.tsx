import { Link } from '@inertiajs/react';
import { ComponentProps, ReactNode, useEffect, useRef } from 'react';

type Glow = 'accent' | 'green' | 'blue' | 'violet' | 'pink' | 'warm' | 'cyan';

/** The nested box: an outer shell around an inner panel (radius minus padding). */
export function Frame({ variant = 'soft', glow, compact, flush, className = '', panelClassName = '', children, ...rest }: {
    variant?: 'soft' | 'gradient' | 'plain';
    glow?: Glow;
    compact?: boolean;
    flush?: boolean;
    className?: string;
    panelClassName?: string;
    children: ReactNode;
} & Omit<ComponentProps<'section'>, 'className' | 'children'>) {
    const classes = ['ps-frame', variant !== 'soft' && `ps-frame--${variant}`, compact && 'ps-frame--compact', flush && 'ps-frame--flush', className].filter(Boolean).join(' ');

    return (
        <section className={classes} data-glow={glow} {...rest}>
            <div className={`ps-frame__panel ${panelClassName}`}>{children}</div>
        </section>
    );
}

export function FrameHead({ title, text, action }: { title: ReactNode; text?: ReactNode; action?: ReactNode }) {
    return (
        <div className="ps-frame__head">
            <div>
                <h2 className="ps-frame__title">{title}</h2>
                {text && <p className="ps-frame__text">{text}</p>}
            </div>
            {action}
        </div>
    );
}

type ButtonStyle = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient';

function buttonClass(style: ButtonStyle, size?: 'sm' | 'lg', block?: boolean, icon?: boolean, loading?: boolean, extra = '') {
    return ['ps-btn', style !== 'secondary' && `ps-btn--${style}`, size && `ps-btn--${size}`, block && 'ps-btn--block', icon && 'ps-btn--icon', loading && 'is-loading', extra].filter(Boolean).join(' ');
}

export function Button({ variant = 'secondary', size, block, icon, iconOnly, loading, className, children, ...rest }: {
    variant?: ButtonStyle; size?: 'sm' | 'lg'; block?: boolean; icon?: string; iconOnly?: boolean; loading?: boolean;
} & ComponentProps<'button'>) {
    return (
        <button type="button" className={buttonClass(variant, size, block, iconOnly, loading, className)} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
            {icon && <i className={`bx ${icon}`} aria-hidden="true" />}
            {children && <span>{children}</span>}
        </button>
    );
}

export function ButtonLink({ href, external, variant = 'secondary', size, icon, className, children }: {
    href: string; external?: boolean; variant?: ButtonStyle; size?: 'sm' | 'lg'; icon?: string; className?: string; children: ReactNode;
}) {
    const content = <>{icon && <i className={`bx ${icon}`} aria-hidden="true" />}<span>{children}</span>{external && <i className="bx bx-right-top-arrow-circle" aria-hidden="true" />}</>;

    return external
        ? <a href={href} className={buttonClass(variant, size, false, false, false, className)} target="_blank" rel="noreferrer">{content}</a>
        : <Link href={href} className={buttonClass(variant, size, false, false, false, className)}>{content}</Link>;
}

export function Badge({ tone, children }: { tone?: 'accent' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'warm'; children: ReactNode }) {
    return <span className={`ps-badge${tone ? ` ps-badge--${tone}` : ''}`}>{children}</span>;
}

const ROLE_TONES: Record<string, 'red' | 'amber' | 'green' | undefined> = { admin: 'red', moderator: 'amber', user: 'green' };
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', moderator: 'Moderator', user: 'User', guest: 'Guest' };

export function RoleBadge({ role, name, color }: { role: string; name?: string; color?: string }) {
    return <span className={`ps-badge${color ? ' ps-role-badge' : ROLE_TONES[role] ? ` ps-badge--${ROLE_TONES[role]}` : ''}`} style={color ? { color, borderColor: color } : undefined}>{name ?? ROLE_LABELS[role] ?? role}</span>;
}

export function Avatar({ src, initials, size, presence, alt = '' }: { src?: string | null; initials: string; size?: 'xs' | 'sm' | 'lg' | 'xl'; presence?: boolean; alt?: string }) {
    return (
        <span className={`ps-avatar${size ? ` ps-avatar--${size}` : ''}`}>
            {src ? <img className="ps-avatar__img" src={src} alt={alt} loading="lazy" /> : <span className="ps-avatar__initials" aria-hidden="true">{initials}</span>}
            {presence && <span className="ps-avatar__presence" />}
        </span>
    );
}

export function ListRow({ icon, title, meta, action, href }: { icon?: ReactNode; title: ReactNode; meta?: ReactNode; action?: ReactNode; href?: string }) {
    const body = <>
        {icon && <span className="ps-row__icon">{typeof icon === 'string' ? <i className={`bx ${icon}`} aria-hidden="true" /> : icon}</span>}
        <span className="ps-row__body"><span className="ps-row__title">{title}</span>{meta && <span className="ps-row__meta">{meta}</span>}</span>
        {action && <span className="ps-row__action">{action}</span>}
    </>;

    return href ? <a className="ps-row" href={href}>{body}</a> : <li className="ps-row">{body}</li>;
}

export function Field({ label, error, help, htmlFor, children }: { label: string; error?: string; help?: ReactNode; htmlFor?: string; children: ReactNode }) {
    return (
        <div className="ps-field">
            <label className="ps-label" htmlFor={htmlFor}>{label}</label>
            {children}
            {error ? <p className="ps-error" role="alert">{error}</p> : help ? <p className="ps-help">{help}</p> : null}
        </div>
    );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <span className="ps-switch">
            <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
            <span />
        </span>
    );
}

export function Modal({ open, title, onClose, size, children, footer }: { open: boolean; title: string; onClose: () => void; size?: 'sm'; children: ReactNode; footer?: ReactNode }) {
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus(); };
    }, [open, onClose]);
    if (!open) return null;

    return (
        <div className="ps-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div ref={panel} className={`ps-modal${size ? ` ps-modal--${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <Frame>
                    <div className="ps-modal__head">
                        <h2 className="ps-modal__title">{title}</h2>
                        <Button variant="ghost" iconOnly icon="bx-x" aria-label="Close" onClick={onClose} />
                    </div>
                    <div className="ps-modal__body">{children}</div>
                    {footer && <div className="ps-modal__foot">{footer}</div>}
                </Frame>
            </div>
        </div>
    );
}

export function Empty({ icon = 'bx-ghost', children }: { icon?: string; children: ReactNode }) {
    return <div className="ps-empty"><i className={`bx ${icon}`} aria-hidden="true" /><div>{children}</div></div>;
}

export function Meter({ value, label }: { value: number; label: string }) {
    return <div className="ps-meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function relativeTime(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
    for (let i = 0; i < steps.length; i++) {
        const [limit, unit] = steps[i];
        if (Math.abs(seconds) < limit) {
            const divisor = i === 0 ? 1 : steps[i - 1][0];
            return format.format(-Math.round(seconds / divisor), unit);
        }
    }
    return format.format(-Math.round(seconds / 31557600), 'year');
}
