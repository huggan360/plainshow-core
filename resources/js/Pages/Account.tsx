import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, ButtonLink, Field, Frame, FrameHead, ListRow, Modal, relativeTime, RoleBadge } from '@/Components/ui';
import { Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Props = {
    section: 'profile' | 'security' | 'connections' | 'tokens';
    profile: { username: string; firstName: string; lastName: string; email: string | null; phone: string | null; avatar: string | null; initials: string; role: string };
    security: { twoFactor: boolean; recoveryCodesLeft: number; passwordChangedAt: string | null; lastLoginAt: string | null; enrollment: { secret: string; qr: string } | null; recoveryCodes: string[] | null };
    tokens: { list: ApiToken[]; services: string[]; error: string | null; created: { token: string; name: string } | null } | null;
    connections: { cloud: { available: boolean; url: string | null; account: string; linked: boolean }; pi: { username: string | null; webAccess: boolean; url: string | null } };
};

type ApiToken = { id: string; name: string; scopes: string[]; createdAt: string; expiresAt: string };

const SECTIONS = [
    { id: 'profile', label: 'Profile', icon: 'bx-user' },
    { id: 'security', label: 'Security', icon: 'bx-shield-quarter' },
    { id: 'connections', label: 'Connections', icon: 'bx-link' },
    { id: 'tokens', label: 'API tokens', icon: 'bx-key' },
] as const;

export default function Account(props: Props) {
    return (
        <AppShell title="Account">
            <div className="account">
                <aside className="account__side">
                    <div className="account__who">
                        <Avatar src={props.profile.avatar} initials={props.profile.initials} size="lg" />
                        <div>
                            <strong>{[props.profile.firstName, props.profile.lastName].filter(Boolean).join(' ') || props.profile.username}</strong>
                            <div className="ps-inline account__who-meta"><span className="ps-muted ps-small">@{props.profile.username}</span><RoleBadge role={props.profile.role} /></div>
                        </div>
                    </div>
                    <nav className="ps-account-menu" aria-label="Account sections">
                        {SECTIONS.map((item) => (
                            <Link key={item.id} href={item.id === 'profile' ? '/account' : `/account/${item.id}`} className={`ps-account-menu__item${props.section === item.id ? ' is-active' : ''}`} preserveScroll>
                                <i className={`bx ${item.icon}`} aria-hidden="true" />{item.label}
                            </Link>
                        ))}
                        <a href="/auth/logout" className="ps-account-menu__item"><i className="bx bx-log-out" aria-hidden="true" />Sign out</a>
                    </nav>
                </aside>
                <div className="account__main">
                    {props.section === 'profile' && <Profile {...props} />}
                    {props.section === 'security' && <Security {...props} />}
                    {props.section === 'connections' && <Connections {...props} />}
                    {props.section === 'tokens' && props.tokens && <Tokens tokens={props.tokens} />}
                </div>
            </div>
        </AppShell>
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
        <div className="ps-stack account__stack">
            <Frame glow="warm">
                <FrameHead title="Profile picture" text="Shown across PlainShow, the blog and LaTeX." />
                <div className="ps-frame__body account__avatar">
                    <Avatar src={profile.avatar} initials={profile.initials} size="xl" />
                    <div className="ps-stack">
                        <div className="ps-inline">
                            <Button variant="primary" icon="bx-upload" loading={uploading} onClick={() => file.current?.click()}>Upload picture</Button>
                            {profile.avatar && <Button variant="ghost" icon="bx-trash" onClick={() => router.delete('/account/avatar', { preserveScroll: true })}>Remove</Button>}
                        </div>
                        <p className="ps-help">JPG, PNG, WebP or HEIC. It is cropped to a square.</p>
                        {avatarError && <p className="ps-error">{avatarError}</p>}
                        <input ref={file} type="file" accept="image/*" className="ps-sr-only" tabIndex={-1} onChange={(event) => upload(event.target.files?.[0])} />
                    </div>
                </div>
            </Frame>

            <Frame>
                <FrameHead title="Details" />
                <form className="ps-frame__body" onSubmit={submit} noValidate>
                    <div className="account__grid">
                        <Field label="First name" htmlFor="firstName" error={form.errors.firstName}><input id="firstName" className="ps-input" value={form.data.firstName} onChange={(event) => form.setData('firstName', event.target.value)} autoComplete="given-name" required /></Field>
                        <Field label="Last name" htmlFor="lastName" error={form.errors.lastName}><input id="lastName" className="ps-input" value={form.data.lastName} onChange={(event) => form.setData('lastName', event.target.value)} autoComplete="family-name" /></Field>
                        <Field label="Email" htmlFor="email" error={form.errors.email} help="Used to sign in and to recover your account."><input id="email" type="email" className="ps-input" value={form.data.email} onChange={(event) => form.setData('email', event.target.value)} autoComplete="email" /></Field>
                        <Field label="Phone" htmlFor="phone" error={form.errors.phone}><input id="phone" type="tel" className="ps-input" value={form.data.phone} onChange={(event) => form.setData('phone', event.target.value)} autoComplete="tel" /></Field>
                    </div>
                    <Field label="Username" htmlFor="username" help="Ask an administrator to change it."><input id="username" className="ps-input" value={profile.username} disabled /></Field>
                    <Button type="submit" variant="primary" loading={form.processing} disabled={!form.isDirty}>Save</Button>
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

    return (
        <div className="ps-stack account__stack">
            <Frame>
                <FrameHead title="Password" text={security.passwordChangedAt ? `Changed ${relativeTime(security.passwordChangedAt)}.` : 'Use at least 10 characters. Changing it signs out your other devices.'} />
                <form className="ps-frame__body" noValidate onSubmit={(event) => { event.preventDefault(); password.put('/account/password', { preserveScroll: true, onSuccess: () => password.reset() }); }}>
                    <input type="text" autoComplete="username" className="ps-sr-only" tabIndex={-1} aria-hidden="true" readOnly />
                    <Field label="Current password" htmlFor="current" error={password.errors.current}><input id="current" type="password" className="ps-input" autoComplete="current-password" value={password.data.current} onChange={(event) => password.setData('current', event.target.value)} /></Field>
                    <div className="account__grid">
                        <Field label="New password" htmlFor="new" error={password.errors.password}><input id="new" type="password" className="ps-input" autoComplete="new-password" value={password.data.password} onChange={(event) => password.setData('password', event.target.value)} /></Field>
                        <Field label="Repeat new password" htmlFor="repeat"><input id="repeat" type="password" className="ps-input" autoComplete="new-password" value={password.data.password_confirmation} onChange={(event) => password.setData('password_confirmation', event.target.value)} /></Field>
                    </div>
                    <Button type="submit" variant="primary" loading={password.processing}>Change password</Button>
                </form>
            </Frame>

            <Frame glow={security.twoFactor ? 'green' : 'accent'}>
                <FrameHead title="Two-factor authentication" text="A code from an authenticator app on top of your password." action={security.twoFactor ? <Badge tone="green">On</Badge> : <Badge tone="amber">Off</Badge>} />
                <div className="ps-frame__body">
                    {security.recoveryCodes && (
                        <div className="ps-stack account__codes">
                            <div className="ps-alert ps-alert--info"><i className="bx bx-info-circle" /><span>Save these recovery codes somewhere safe. Each works once if you lose your phone. They will not be shown again.</span></div>
                            <ul className="account__code-list">{security.recoveryCodes.map((item) => <li key={item} className="ps-mono">{item}</li>)}</ul>
                            <Button icon="bx-copy" onClick={() => navigator.clipboard?.writeText(security.recoveryCodes!.join('\n'))}>Copy codes</Button>
                        </div>
                    )}
                    {!security.twoFactor && !security.enrollment && (
                        <Button variant="primary" icon="bx-shield-plus" onClick={() => router.post('/account/two-factor', {}, { preserveScroll: true })}>Set up two-factor</Button>
                    )}
                    {!security.twoFactor && security.enrollment && (
                        <div className="account__enroll">
                            <img src={security.enrollment.qr} alt="QR code for your authenticator app" className="account__qr" width={168} height={168} />
                            <div className="ps-stack">
                                <p className="ps-soft">Scan the code with an authenticator app, or enter this key:</p>
                                <code className="ps-code account__secret">{security.enrollment.secret}</code>
                                <form className="ps-stack" noValidate onSubmit={(event) => { event.preventDefault(); code.post('/account/two-factor/confirm', { preserveScroll: true }); }}>
                                    <Field label="Code from the app" htmlFor="code" error={code.errors.code}><input id="code" className="ps-input ps-input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code.data.code} onChange={(event) => code.setData('code', event.target.value)} /></Field>
                                    <div className="ps-inline">
                                        <Button type="submit" variant="primary" loading={code.processing}>Turn on</Button>
                                        <Button variant="ghost" onClick={() => router.delete('/account/two-factor/pending', { preserveScroll: true })}>Cancel</Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                    {security.twoFactor && (
                        <ul className="ps-list">
                            <ListRow icon="bx-key" title="Recovery codes" meta={`${security.recoveryCodesLeft} unused`} action={<Button size="sm" onClick={() => router.post('/account/recovery-codes', {}, { preserveScroll: true })}>New codes</Button>} />
                            <ListRow icon="bx-shield-x" title="Turn off two-factor" meta="Your account will only need a password." action={<Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}>Turn off</Button>} />
                        </ul>
                    )}
                </div>
            </Frame>

            <Frame>
                <FrameHead title="Sessions" text={security.lastLoginAt ? `Last sign-in ${relativeTime(security.lastLoginAt)}.` : undefined} />
                <ul className="ps-list ps-frame__body">
                    <ListRow icon="bx-devices" title="Sign out everywhere else" meta="Ends sessions on your other devices and in every app." action={<Button size="sm" onClick={() => router.post('/account/sign-out-everywhere', {}, { preserveScroll: true })}>Sign out others</Button>} />
                </ul>
            </Frame>

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
    return (
        <div className="ps-stack account__stack">
            <Frame glow="cyan">
                <FrameHead title="Nextcloud" text="Files, calendar and contacts on cloud.plainshow.se." action={connections.cloud.available ? <Badge tone="green">Single sign-on</Badge> : <Badge>No access</Badge>} />
                <div className="ps-frame__body">
                    <ul className="ps-list">
                        <ListRow icon="bx-cloud"
                            title={connections.cloud.available ? <>Signs in as <span className="ps-mono">{connections.cloud.account}</span></> : 'Not open to your account'}
                            meta={connections.cloud.available
                                ? (connections.cloud.linked ? 'Your existing Nextcloud account, with all its files. The desktop and phone apps sign in with PlainShow too.' : 'Created the first time you open Nextcloud. The desktop and phone apps sign in with PlainShow too.')
                                : 'An administrator can give you access.'}
                            action={connections.cloud.available && connections.cloud.url ? <ButtonLink href={connections.cloud.url} external size="sm">Open</ButtonLink> : undefined} />
                    </ul>
                </div>
            </Frame>
            <Frame glow="violet">
                <FrameHead title="Server account" text="The account on the server that Web uses for projects and deployments." action={connections.pi.username ? <Badge tone="green">Linked</Badge> : <Badge>Not linked</Badge>} />
                <div className="ps-frame__body">
                    <ul className="ps-list">
                        <ListRow icon="bx-server" title={connections.pi.username ? <span className="ps-mono">{connections.pi.username}</span> : 'No server account'}
                            meta={connections.pi.username ? 'Web acts as this account. You never need its password.' : 'An administrator can create or link one for you.'}
                            action={connections.pi.webAccess && connections.pi.url ? <ButtonLink href={connections.pi.url} external size="sm">Open Web</ButtonLink> : undefined} />
                    </ul>
                </div>
            </Frame>
        </div>
    );
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
            <Frame>
                <FrameHead title="API tokens" text={<>Tokens let your own scripts use PlainShow as you, through <a href="/api">plainshow.se/api</a>. Each reaches only the services you pick, and lasts 90 days.</>} />
                <form className="ps-frame__body" onSubmit={submit}>
                    <Field label="Name" htmlFor="token-name" error={form.errors.name}>
                        <input id="token-name" className="ps-input" value={form.data.name} maxLength={60} placeholder="Backup script" onChange={(event) => form.setData('name', event.target.value)} required />
                    </Field>
                    <div className="ps-field">
                        <span className="ps-label">Services</span>
                        <div className="token-services">
                            {tokens.services.map((service) => (
                                <label key={service} className="ps-check"><input type="checkbox" checked={form.data.services.includes(service)} onChange={() => toggle(service)} />{SERVICE_NAMES[service] ?? service}</label>
                            ))}
                        </div>
                        {form.errors.services && <span className="ps-error">{form.errors.services}</span>}
                    </div>
                    <label className="ps-check"><input type="checkbox" checked={form.data.readOnly} onChange={(event) => form.setData('readOnly', event.target.checked)} />Read only</label>
                    <div className="ps-frame__foot"><Button type="submit" variant="primary" icon="bx-plus" loading={form.processing} disabled={!form.data.name.trim() || form.data.services.length === 0}>Create token</Button></div>
                </form>
            </Frame>
            <Frame>
                <FrameHead title="Your tokens" />
                {tokens.error && <div className="ps-alert"><i className="bx bx-error-circle" /><span>{tokens.error}</span></div>}
                {tokens.list.length === 0
                    ? <p className="ps-muted ps-frame__body">No tokens yet.</p>
                    : <ul className="ps-list ps-frame__body">{tokens.list.map((token) => (
                        <ListRow key={token.id} icon="bx-key" title={<>{token.name}{token.scopes.map((scope) => <Badge key={scope} tone={scope === 'read-only' ? undefined : 'accent'}>{scope === 'read-only' ? 'Read only' : SERVICE_NAMES[scope] ?? scope}</Badge>)}</>}
                            meta={`Made ${relativeTime(token.createdAt)}, ends ${new Date(token.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            action={<Button size="sm" variant="danger" icon="bx-trash" onClick={() => { if (window.confirm(`Revoke ${token.name}? Scripts using it stop working.`)) router.delete(`/account/tokens/${token.id}`, { preserveScroll: true }); }}>Revoke</Button>} />
                    ))}</ul>}
            </Frame>
            <Modal open={shown !== null} title="Copy your token" onClose={() => setShown(null)} footer={<><Button onClick={copy} icon={copied ? 'bx-check' : 'bx-copy'}>{copied ? 'Copied' : 'Copy'}</Button><Button variant="primary" onClick={() => setShown(null)}>Done</Button></>}>
                <p className="ps-muted">This is the only time {shown?.name} is shown. Keep it somewhere safe.</p>
                <textarea className="ps-textarea token-value" readOnly rows={5} value={shown?.token ?? ''} onFocus={(event) => event.target.select()} />
            </Modal>
        </div>
    );
}
