import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, ButtonLink, Field, Frame, Modal, relativeTime } from '@/Components/ui';
import { Link, router, useForm } from '@inertiajs/react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

type Props = {
    section: 'profile' | 'security' | 'connections' | 'tokens';
    profile: { username: string; firstName: string; lastName: string; email: string | null; phone: string | null; avatar: string | null; initials: string; role: string };
    security: { twoFactor: boolean; recoveryCodesLeft: number; passwordChangedAt: string | null; lastLoginAt: string | null; enrollment: { secret: string; qr: string } | null; recoveryCodes: string[] | null };
    apiAccess: boolean;
    tokens: { list: ApiToken[]; services: string[]; error: string | null; created: { token: string; name: string } | null } | null;
    connections: { cloud: { widgets: boolean; available: boolean; url: string | null; account: string; linked: boolean }; pi: { username: string | null; webAccess: boolean; url: string | null } };
};

type ApiToken = { id: string; name: string; scopes: string[]; createdAt: string; expiresAt: string };

const SECTIONS = [
    { id: 'profile', label: 'Profile', icon: 'bx-user' },
    { id: 'security', label: 'Security', icon: 'bx-shield-quarter' },
    { id: 'connections', label: 'Connections', icon: 'bx-link' },
    { id: 'tokens', label: 'API tokens', icon: 'bx-key' },
] as const;

export default function Account(props: Props) {
    const sections = SECTIONS.filter((item) => item.id !== 'tokens' || props.apiAccess);
    return (
        <AppShell title="Account" description="Your PlainShow account: who you are, how you sign in and what it is connected to."
            actions={<nav className="ps-tabs" aria-label="Account sections">
                {sections.map((item) => (
                    <Link key={item.id} href={item.id === 'profile' ? '/account' : `/account/${item.id}`} className={`ps-tab${props.section === item.id ? ' is-active' : ''}`} preserveScroll>{item.label}</Link>
                ))}
            </nav>}>
            <div className="account">
                {props.section === 'profile' && <Profile {...props} />}
                {props.section === 'security' && <Security {...props} />}
                {props.section === 'connections' && <Connections {...props} />}
                {props.section === 'tokens' && props.tokens && <Tokens tokens={props.tokens} />}
            </div>
        </AppShell>
    );
}

/** One setting: icon, name, a short line, and what you can do about it, like the admin pages. */
function Setting({ icon, title, text, action, children, off }: { icon: string; title: ReactNode; text?: ReactNode; action?: ReactNode; children?: ReactNode; off?: boolean }) {
    return (
        <Frame compact className={off ? 'is-off' : ''}>
            <div className="service">
                <span className="service__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>
                <div className="service__body">
                    <strong>{title}</strong>
                    {text && <p className="ps-muted ps-small">{text}</p>}
                </div>
                {action && <div className="account-row__action">{action}</div>}
            </div>
            {children && <div className="account-row__more">{children}</div>}
        </Frame>
    );
}

function Profile({ profile }: Props) {
    const form = useForm({ firstName: profile.firstName, lastName: profile.lastName ?? '', email: profile.email ?? '', phone: profile.phone ?? '' });
    const file = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);

    const submit = (event: FormEvent) => { event.preventDefault(); form.put('/account/profile', { preserveScroll: true }); };
    const upload = (picked: File | undefined) => {
        if (!picked) return;
        setUploading(true);
        setAvatarError(null);
        router.post('/account/avatar', { avatar: picked }, {
            forceFormData: true,
            preserveScroll: true,
            onError: (errors) => setAvatarError(errors.avatar ?? 'Upload failed.'),
            onFinish: () => { setUploading(false); if (file.current) file.current.value = ''; },
        });
    };

    return (
        <div className="ps-stack">
            <Setting icon="bx-image" title="Profile picture" text="Shown everywhere in PlainShow. JPG, PNG, WebP or HEIC, cropped to a square."
                action={<div className="ps-inline">
                    {profile.avatar && <Button size="sm" variant="ghost" onClick={() => router.delete('/account/avatar', { preserveScroll: true })}>Remove</Button>}
                    <Button size="sm" variant="primary" icon="bx-upload" loading={uploading} onClick={() => file.current?.click()}>Upload</Button>
                </div>}>
                <div className="account-avatar">
                    <Avatar src={profile.avatar} initials={profile.initials} size="xl" />
                    {avatarError && <p className="ps-error">{avatarError}</p>}
                </div>
                <input ref={file} type="file" accept="image/*" className="ps-sr-only" tabIndex={-1} onChange={(event) => upload(event.target.files?.[0])} />
            </Setting>

            <Frame compact>
                <form onSubmit={submit} noValidate className="account-form">
                    <div className="account-form__head">
                        <strong>Details</strong>
                        <Button type="submit" size="sm" variant="primary" loading={form.processing} disabled={!form.isDirty}>Save</Button>
                    </div>
                    <div className="account__grid">
                        <Field label="First name" htmlFor="firstName" error={form.errors.firstName}><input id="firstName" className="ps-input" value={form.data.firstName} onChange={(event) => form.setData('firstName', event.target.value)} autoComplete="given-name" required /></Field>
                        <Field label="Last name" htmlFor="lastName" error={form.errors.lastName}><input id="lastName" className="ps-input" value={form.data.lastName} onChange={(event) => form.setData('lastName', event.target.value)} autoComplete="family-name" /></Field>
                        <Field label="Email" htmlFor="email" error={form.errors.email}><input id="email" type="email" className="ps-input" value={form.data.email} onChange={(event) => form.setData('email', event.target.value)} autoComplete="email" /></Field>
                        <Field label="Phone" htmlFor="phone" error={form.errors.phone}><input id="phone" type="tel" className="ps-input" value={form.data.phone} onChange={(event) => form.setData('phone', event.target.value)} autoComplete="tel" /></Field>
                        <Field label="Username" htmlFor="username" help="An administrator can change it."><input id="username" className="ps-input" value={profile.username} disabled /></Field>
                    </div>
                </form>
            </Frame>
        </div>
    );
}

function Security({ security }: Props) {
    const password = useForm({ current: '', password: '', password_confirmation: '' });
    const code = useForm({ code: '' });
    const disable = useForm({ password: '' });
    const [disableOpen, setDisableOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);

    return (
        <div className="ps-stack">
            <Setting icon="bx-lock-alt" title="Password" text={security.passwordChangedAt ? `Changed ${relativeTime(security.passwordChangedAt)}. Changing it signs out your other devices.` : 'At least 10 characters. Changing it signs out your other devices.'}
                action={<Button size="sm" onClick={() => setPasswordOpen((open) => !open)}>{passwordOpen ? 'Cancel' : 'Change'}</Button>}>
                {passwordOpen && (
                    <form className="account-form" noValidate onSubmit={(event) => { event.preventDefault(); password.put('/account/password', { preserveScroll: true, onSuccess: () => { password.reset(); setPasswordOpen(false); } }); }}>
                        <input type="text" autoComplete="username" className="ps-sr-only" tabIndex={-1} aria-hidden="true" readOnly />
                        <div className="account__grid account__grid--3">
                            <Field label="Current password" htmlFor="current" error={password.errors.current}><input id="current" type="password" className="ps-input" autoComplete="current-password" value={password.data.current} onChange={(event) => password.setData('current', event.target.value)} /></Field>
                            <Field label="New password" htmlFor="new" error={password.errors.password}><input id="new" type="password" className="ps-input" autoComplete="new-password" value={password.data.password} onChange={(event) => password.setData('password', event.target.value)} /></Field>
                            <Field label="Repeat it" htmlFor="repeat"><input id="repeat" type="password" className="ps-input" autoComplete="new-password" value={password.data.password_confirmation} onChange={(event) => password.setData('password_confirmation', event.target.value)} /></Field>
                        </div>
                        <Button type="submit" size="sm" variant="primary" loading={password.processing}>Change password</Button>
                    </form>
                )}
            </Setting>

            <Setting icon="bx-shield-quarter" title={<>Two-factor {security.twoFactor ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</>}
                text={security.twoFactor ? `${security.recoveryCodesLeft} recovery codes left.` : 'A code from an authenticator app on top of your password.'}
                action={security.twoFactor
                    ? <div className="ps-inline"><Button size="sm" onClick={() => router.post('/account/recovery-codes', {}, { preserveScroll: true })}>New codes</Button><Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}>Turn off</Button></div>
                    : !security.enrollment && <Button size="sm" variant="primary" onClick={() => router.post('/account/two-factor', {}, { preserveScroll: true })}>Set up</Button>}>
                {security.recoveryCodes && (
                    <div className="ps-stack">
                        <p className="ps-small ps-soft">Save these recovery codes somewhere safe. Each works once if you lose your phone, and they are not shown again.</p>
                        <ul className="account__code-list">{security.recoveryCodes.map((item) => <li key={item} className="ps-mono">{item}</li>)}</ul>
                        <div><Button size="sm" icon="bx-copy" onClick={() => navigator.clipboard?.writeText(security.recoveryCodes!.join('\n'))}>Copy codes</Button></div>
                    </div>
                )}
                {!security.twoFactor && security.enrollment && (
                    <div className="account__enroll">
                        <img src={security.enrollment.qr} alt="QR code for your authenticator app" className="account__qr" width={152} height={152} />
                        <form className="ps-stack" noValidate onSubmit={(event) => { event.preventDefault(); code.post('/account/two-factor/confirm', { preserveScroll: true }); }}>
                            <p className="ps-small ps-soft">Scan it with an authenticator app, or type <code className="ps-mono">{security.enrollment.secret}</code>.</p>
                            <Field label="Code from the app" htmlFor="code" error={code.errors.code}><input id="code" className="ps-input ps-input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code.data.code} onChange={(event) => code.setData('code', event.target.value)} /></Field>
                            <div className="ps-inline">
                                <Button type="submit" size="sm" variant="primary" loading={code.processing}>Turn on</Button>
                                <Button size="sm" variant="ghost" onClick={() => router.delete('/account/two-factor/pending', { preserveScroll: true })}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}
            </Setting>

            <Setting icon="bx-devices" title="Other devices" text={security.lastLoginAt ? `Last sign-in ${relativeTime(security.lastLoginAt)}. Sign out of every other device and app.` : 'Sign out of every other device and app.'}
                action={<Button size="sm" onClick={() => router.post('/account/sign-out-everywhere', {}, { preserveScroll: true })}>Sign out others</Button>} />

            <Modal open={disableOpen} size="sm" title="Turn off two-factor" onClose={() => setDisableOpen(false)}
                footer={<><Button variant="ghost" onClick={() => setDisableOpen(false)}>Cancel</Button><Button variant="danger" loading={disable.processing} onClick={() => disable.delete('/account/two-factor', { preserveScroll: true, onSuccess: () => { setDisableOpen(false); disable.reset(); } })}>Turn off</Button></>}>
                <Field label="Confirm with your password" htmlFor="confirm-password" error={disable.errors.password}>
                    <input id="confirm-password" type="password" className="ps-input" autoComplete="current-password" value={disable.data.password} onChange={(event) => disable.setData('password', event.target.value)} />
                </Field>
            </Modal>
        </div>
    );
}

function Connections({ connections }: Props) {
    const cloud = connections.cloud;
    const [connecting, setConnecting] = useState<'idle' | 'waiting' | 'failed'>('idle');

    const connect = async () => {
        const popup = window.open('', '_blank');
        setConnecting('waiting');
        try {
            const start = await fetch('/account/nextcloud', { method: 'POST', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() }, credentials: 'same-origin' });
            const { login } = await start.json();
            if (!start.ok || !login) throw new Error();
            if (popup) popup.location.href = login; else window.open(login, '_blank');
            for (let i = 0; i < 300; i++) {
                await new Promise((resolve) => window.setTimeout(resolve, 2000));
                const poll = await fetch('/account/nextcloud/poll', { method: 'POST', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() }, credentials: 'same-origin' });
                const state = await poll.json();
                if (state.connected) { popup?.close(); router.reload(); setConnecting('idle'); return; }
                if (state.expired || !poll.ok) break;
            }
            setConnecting('failed');
        } catch {
            popup?.close();
            setConnecting('failed');
        }
    };

    return (
        <div className="ps-stack">
            <Setting icon="bx-cloud" off={!cloud.available} title={<>Nextcloud {cloud.available ? <Badge tone="green">Single sign-on</Badge> : <Badge>No access</Badge>}</>}
                text={cloud.available ? <>Signs in as <span className="ps-mono">{cloud.account}</span>. The desktop and phone apps sign in with PlainShow too.</> : 'An administrator can give you access.'}
                action={cloud.available && cloud.url ? <ButtonLink href={cloud.url} external size="sm">Open</ButtonLink> : undefined} />
            {cloud.available && (
                <Setting icon="bx-calendar" title={<>Nextcloud on the dashboard {cloud.widgets && <Badge tone="green">Connected</Badge>}</>}
                    text={cloud.widgets
                        ? 'Your calendar, recent files and Talk can be added in the Design studio.'
                        : connecting === 'waiting' ? 'Approve PlainShow in the Nextcloud tab that opened. This page notices when you are done.'
                        : connecting === 'failed' ? 'That did not finish. Try again.'
                        : 'Let the dashboard show your calendar, recent files and Talk. Nextcloud asks you to approve it once.'}
                    action={cloud.widgets
                        ? <Button size="sm" variant="ghost" onClick={() => router.delete('/account/nextcloud', { preserveScroll: true })}>Disconnect</Button>
                        : <Button size="sm" variant="primary" loading={connecting === 'waiting'} onClick={connect}>Connect</Button>} />
            )}
            <Setting icon="bx-server" off={!connections.pi.username} title={<>Server account {connections.pi.username ? <Badge tone="green">Linked</Badge> : <Badge>Not linked</Badge>}</>}
                text={connections.pi.username ? <>Web acts as <span className="ps-mono">{connections.pi.username}</span>; you never need its password.</> : 'An administrator can create or link one for you.'}
                action={connections.pi.webAccess && connections.pi.url ? <ButtonLink href={connections.pi.url} external size="sm">Open Web</ButtonLink> : undefined} />
        </div>
    );
}

function xsrf(): string {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

const SERVICE_NAMES: Record<string, string> = { core: 'Dashboard', blog: 'Blog', split: 'Split', latex: 'LaTeX' };

function Tokens({ tokens }: { tokens: NonNullable<Props['tokens']> }) {
    const form = useForm<{ name: string; services: string[]; readOnly: boolean }>({ name: '', services: [], readOnly: true });
    const [copied, setCopied] = useState(false);
    const [shown, setShown] = useState(tokens.created);
    useEffect(() => { if (tokens.created) { setShown(tokens.created); setCopied(false); } }, [tokens.created]);
    const submit = (event: FormEvent) => { event.preventDefault(); form.post('/account/tokens', { preserveScroll: true, onSuccess: () => form.reset('name', 'services') }); };
    const toggle = (service: string) => form.setData('services', form.data.services.includes(service) ? form.data.services.filter((item) => item !== service) : [...form.data.services, service]);
    const copy = async () => {
        if (!shown) return;
        try { await navigator.clipboard.writeText(shown.token); setCopied(true); } catch { setCopied(false); }
    };

    return (
        <div className="ps-stack">
            <Frame compact>
                <form onSubmit={submit} className="account-form">
                    <div className="account-form__head">
                        <span><strong>New token</strong><span className="ps-muted ps-small"> for your own scripts, through <a href="/api">plainshow.se/api</a>. It lasts 90 days.</span></span>
                        <Button type="submit" size="sm" variant="primary" icon="bx-plus" loading={form.processing} disabled={!form.data.name.trim() || form.data.services.length === 0}>Create</Button>
                    </div>
                    <div className="token-form">
                        <Field label="Name" htmlFor="token-name" error={form.errors.name}>
                            <input id="token-name" className="ps-input" value={form.data.name} maxLength={60} placeholder="Backup script" onChange={(event) => form.setData('name', event.target.value)} required />
                        </Field>
                        <div className="ps-field">
                            <span className="ps-label">Reaches</span>
                            <div className="token-services">
                                {tokens.services.map((service) => (
                                    <label key={service} className="ps-check"><input type="checkbox" checked={form.data.services.includes(service)} onChange={() => toggle(service)} />{SERVICE_NAMES[service] ?? service}</label>
                                ))}
                                <label className="ps-check"><input type="checkbox" checked={form.data.readOnly} onChange={(event) => form.setData('readOnly', event.target.checked)} />Read only</label>
                            </div>
                        </div>
                    </div>
                </form>
            </Frame>
            {tokens.error && <div className="ps-alert"><i className="bx bx-error-circle" /><span>{tokens.error}</span></div>}
            <Frame flush>
                {tokens.list.length === 0
                    ? <p className="ps-muted token-empty">No tokens yet.</p>
                    : <div className="ps-table-wrap"><table className="ps-table">
                        <thead><tr><th>Token</th><th>Reaches</th><th className="token-hide-sm">Ends</th><th><span className="ps-sr-only">Revoke</span></th></tr></thead>
                        <tbody>{tokens.list.map((token) => (
                            <tr key={token.id}>
                                <td className="is-primary"><strong>{token.name}</strong><span className="ps-muted ps-small token-made">Made {relativeTime(token.createdAt)}</span></td>
                                <td><div className="ps-inline token-scopes">{token.scopes.map((scope) => <Badge key={scope} tone={scope === 'read-only' ? undefined : 'accent'}>{scope === 'read-only' ? 'Read only' : SERVICE_NAMES[scope] ?? scope}</Badge>)}</div></td>
                                <td className="token-hide-sm ps-muted">{new Date(token.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="token-actions"><Button size="sm" variant="ghost" icon="bx-trash" aria-label={`Revoke ${token.name}`} onClick={() => { if (window.confirm(`Revoke ${token.name}? Scripts using it stop working.`)) router.delete(`/account/tokens/${token.id}`, { preserveScroll: true }); }}>Revoke</Button></td>
                            </tr>
                        ))}</tbody>
                    </table></div>}
            </Frame>
            <Modal open={shown !== null} title="Copy your token" onClose={() => setShown(null)} footer={<><Button onClick={copy} icon={copied ? 'bx-check' : 'bx-copy'}>{copied ? 'Copied' : 'Copy'}</Button><Button variant="primary" onClick={() => setShown(null)}>Done</Button></>}>
                <p className="ps-muted">This is the only time {shown?.name} is shown. Keep it somewhere safe.</p>
                <textarea className="ps-textarea token-value" readOnly rows={5} value={shown?.token ?? ''} onFocus={(event) => event.target.select()} />
            </Modal>
        </div>
    );
}
