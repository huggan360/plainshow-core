import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, Field, Frame, Modal, relativeTime } from '@/Components/ui';
import { Link, router, useForm } from '@inertiajs/react';
import { Children, FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { t, locale } from '@/i18n';

type Props = {
    section: 'profile' | 'security' | 'tokens';
    profile: { username: string; firstName: string; lastName: string; email: string | null; phone: string | null; avatar: string | null; initials: string; role: string; groups: string[] };
    security: { twoFactor: boolean; recoveryCodesLeft: number; passwordChangedAt: string | null; lastLoginAt: string | null; enrollment: { secret: string; qr: string } | null; recoveryCodes: string[] | null };
    apiAccess: boolean;
    tokens: { list: ApiToken[]; services: string[]; apis: ApiService[]; error: string | null; created: { token: string; name: string } | null } | null;
};

type ApiService = { id: string; name: string; icon: string; base: string; spec: string };
type ApiToken = { id: string; name: string; scopes: string[]; createdAt: string; expiresAt: string };

const SECTIONS = [
    { id: 'profile', label: t('Profile'), icon: 'bx-user' },
    { id: 'security', label: t('Security'), icon: 'bx-shield-quarter' },
    { id: 'tokens', label: t('API tokens'), icon: 'bx-key' },
] as const;

export default function Account(props: Props) {
    const sections = SECTIONS.filter((item) => item.id !== 'tokens' || props.apiAccess);
    return (
        <AppShell title={t('Account')} description={t('Your profile, sign-in security and API access across PlainShow.')}
            actions={<nav className="ps-tabs" aria-label={t('Account sections')}>
                {sections.map((item) => (
                    <Link key={item.id} href={item.id === 'profile' ? '/account' : `/account/${item.id}`} className={`ps-tab${props.section === item.id ? ' is-active' : ''}`} preserveScroll>{t(item.label)}</Link>
                ))}
            </nav>}>
            <div className="account">
                {props.section === 'profile' && <Profile {...props} />}
                {props.section === 'security' && <Security {...props} />}
                {props.section === 'tokens' && props.tokens && <Tokens tokens={props.tokens} />}
            </div>
        </AppShell>
    );
}

/** One setting: icon, name, a short line, and what you can do about it, like the admin pages. */
function Setting({ icon, lead, title, text, action, children, off }: { icon?: string; lead?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode; children?: ReactNode; off?: boolean }) {
    const more = Children.toArray(children).length > 0;
    return (
        <Frame compact className={off ? 'is-off' : ''}>
            <div className="service">
                {lead ?? <span className="service__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>}
                <div className="service__body">
                    <strong>{title}</strong>
                    {text && <p className="ps-muted ps-small">{text}</p>}
                </div>
                {action && <div className="account-row__action">{action}</div>}
            </div>
            {more && <div className="account-row__more">{children}</div>}
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
            onError: (errors) => setAvatarError(errors.avatar ?? t('Upload failed.')),
            onFinish: () => { setUploading(false); if (file.current) file.current.value = ''; },
        });
    };

    return (
        <div className="ps-stack">
            <Setting lead={<Avatar src={profile.avatar} initials={profile.initials} size="lg" />} title={t('Profile picture')} text={avatarError ?? t('Shown everywhere in PlainShow. JPG, PNG, WebP or HEIC, cropped to a square.')}
                action={<div className="ps-inline">
                    {profile.avatar && <Button size="sm" variant="ghost" onClick={() => router.delete('/account/avatar', { preserveScroll: true })}>{t('Remove')}</Button>}
                    <Button size="sm" variant="primary" icon="bx-upload" loading={uploading} onClick={() => file.current?.click()}>{t('Upload')}</Button>
                </div>}>
                <input ref={file} type="file" accept="image/*" className="ps-sr-only" tabIndex={-1} onChange={(event) => upload(event.target.files?.[0])} />
            </Setting>

            <Frame compact>
                <form onSubmit={submit} noValidate className="account-form">
                    <div className="account-form__head">
                        <strong>{t('Details')}</strong>
                        <Button type="submit" size="sm" variant="primary" loading={form.processing} disabled={!form.isDirty}>{t('Save')}</Button>
                    </div>
                    <div className="account__grid">
                        <Field label={t('First name')} htmlFor="firstName" error={form.errors.firstName}><input id="firstName" className="ps-input" value={form.data.firstName} onChange={(event) => form.setData('firstName', event.target.value)} autoComplete="given-name" required /></Field>
                        <Field label={t('Last name')} htmlFor="lastName" error={form.errors.lastName}><input id="lastName" className="ps-input" value={form.data.lastName} onChange={(event) => form.setData('lastName', event.target.value)} autoComplete="family-name" /></Field>
                        <Field label={t('Email')} htmlFor="email" error={form.errors.email}><input id="email" type="email" className="ps-input" value={form.data.email} onChange={(event) => form.setData('email', event.target.value)} autoComplete="email" /></Field>
                        <Field label={t('Phone')} htmlFor="phone" error={form.errors.phone}><input id="phone" type="tel" className="ps-input" value={form.data.phone} onChange={(event) => form.setData('phone', event.target.value)} autoComplete="tel" /></Field>
                        <Field label={t('Username')} htmlFor="username" help={t('An administrator can change it.')}><input id="username" className="ps-input" value={profile.username} disabled /></Field>
                    </div>
                </form>
            </Frame>
            {profile.groups.length > 0 && <Frame compact><div className="ps-inline" style={{ flexWrap: 'wrap' }}><strong>{t('Groups')}</strong>{profile.groups.map((group) => <Badge key={group} tone="accent">{group}</Badge>)}</div></Frame>}
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
            <Setting icon="bx-lock-alt" title={t('Password')} text={security.passwordChangedAt ? t('Changed {when}. Changing it signs out your other devices.', { when: relativeTime(security.passwordChangedAt) }) : t('At least 10 characters. Changing it signs out your other devices.')}
                action={<Button size="sm" onClick={() => setPasswordOpen((open) => !open)}>{passwordOpen ? t('Cancel') : t('Change')}</Button>}>
                {passwordOpen && (
                    <form className="account-form" noValidate onSubmit={(event) => { event.preventDefault(); password.put('/account/password', { preserveScroll: true, onSuccess: () => { password.reset(); setPasswordOpen(false); } }); }}>
                        <input type="text" autoComplete="username" className="ps-sr-only" tabIndex={-1} aria-hidden="true" readOnly />
                        <div className="account__grid account__grid--3">
                            <Field label={t('Current password')} htmlFor="current" error={password.errors.current}><input id="current" type="password" className="ps-input" autoComplete="current-password" value={password.data.current} onChange={(event) => password.setData('current', event.target.value)} /></Field>
                            <Field label={t('New password')} htmlFor="new" error={password.errors.password}><input id="new" type="password" className="ps-input" autoComplete="new-password" value={password.data.password} onChange={(event) => password.setData('password', event.target.value)} /></Field>
                            <Field label={t('Repeat it')} htmlFor="repeat"><input id="repeat" type="password" className="ps-input" autoComplete="new-password" value={password.data.password_confirmation} onChange={(event) => password.setData('password_confirmation', event.target.value)} /></Field>
                        </div>
                        <Button type="submit" size="sm" variant="primary" loading={password.processing}>{t('Change password')}</Button>
                    </form>
                )}
            </Setting>

            <Setting icon="bx-shield-quarter" title={<>{t('Two-factor')}{' '}{security.twoFactor ? <Badge tone="green">{t('On')}</Badge> : <Badge>{t('Off')}</Badge>}</>}
                text={security.twoFactor ? t('{recoveryCodesLeft} recovery codes left.', { recoveryCodesLeft: security.recoveryCodesLeft }) : t('A code from an authenticator app on top of your password.')}
                action={security.twoFactor
                    ? <div className="ps-inline"><Button size="sm" onClick={() => router.post('/account/recovery-codes', {}, { preserveScroll: true })}>{t('New codes')}</Button><Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}>{t('Turn off')}</Button></div>
                    : !security.enrollment && <Button size="sm" variant="primary" onClick={() => router.post('/account/two-factor', {}, { preserveScroll: true })}>{t('Set up')}</Button>}>
                {security.recoveryCodes && (
                    <div className="ps-stack">
                        <p className="ps-small ps-soft">{t('Save these recovery codes somewhere safe. Each works once if you lose your phone, and they are not shown again.')}</p>
                        <ul className="account__code-list">{security.recoveryCodes.map((item) => <li key={item} className="ps-mono">{item}</li>)}</ul>
                        <div><Button size="sm" icon="bx-copy" onClick={() => navigator.clipboard?.writeText(security.recoveryCodes!.join('\n'))}>{t('Copy codes')}</Button></div>
                    </div>
                )}
                {!security.twoFactor && security.enrollment && (
                    <div className="account__enroll">
                        <img src={security.enrollment.qr} alt={t('QR code for your authenticator app')} className="account__qr" width={152} height={152} />
                        <form className="ps-stack" noValidate onSubmit={(event) => { event.preventDefault(); code.post('/account/two-factor/confirm', { preserveScroll: true }); }}>
                            <p className="ps-small ps-soft">{t('Scan it with an authenticator app, or type')}{' '}<code className="ps-mono">{security.enrollment.secret}</code>.</p>
                            <Field label={t('Code from the app')} htmlFor="code" error={code.errors.code}><input id="code" className="ps-input ps-input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code.data.code} onChange={(event) => code.setData('code', event.target.value)} /></Field>
                            <div className="ps-inline">
                                <Button type="submit" size="sm" variant="primary" loading={code.processing}>{t('Turn on')}</Button>
                                <Button size="sm" variant="ghost" onClick={() => router.delete('/account/two-factor/pending', { preserveScroll: true })}>{t('Cancel')}</Button>
                            </div>
                        </form>
                    </div>
                )}
            </Setting>

            <Setting icon="bx-devices" title={t('Other devices')} text={security.lastLoginAt ? t('Last sign-in {when}. Sign out of every other device and app.', { when: relativeTime(security.lastLoginAt) }) : t('Sign out of every other device and app.')}
                action={<Button size="sm" onClick={() => router.post('/account/sign-out-everywhere', {}, { preserveScroll: true })}>{t('Sign out others')}</Button>} />

            <Modal open={disableOpen} size="sm" title={t('Turn off two-factor')} onClose={() => setDisableOpen(false)}
                footer={<><Button variant="ghost" onClick={() => setDisableOpen(false)}>{t('Cancel')}</Button><Button variant="danger" loading={disable.processing} onClick={() => disable.delete('/account/two-factor', { preserveScroll: true, onSuccess: () => { setDisableOpen(false); disable.reset(); } })}>{t('Turn off')}</Button></>}>
                <Field label={t('Confirm with your password')} htmlFor="confirm-password" error={disable.errors.password}>
                    <input id="confirm-password" type="password" className="ps-input" autoComplete="current-password" value={disable.data.password} onChange={(event) => disable.setData('password', event.target.value)} />
                </Field>
            </Modal>
        </div>
    );
}

const SERVICE_NAMES: Record<string, string> = { core: t('Dashboard'), blog: 'Blog', split: 'Split', latex: 'LaTeX', cloud: 'Cloud' };

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
                        <span><strong>{t('New token')}</strong><span className="ps-muted ps-small"> {' '}{t('for your own scripts. It lasts 90 days.')}</span></span>
                        <Button type="submit" size="sm" variant="primary" icon="bx-plus" loading={form.processing} disabled={!form.data.name.trim() || form.data.services.length === 0}>{t('Create')}</Button>
                    </div>
                    <div className="token-form">
                        <Field label={t('Name')} htmlFor="token-name" error={form.errors.name}>
                            <input id="token-name" className="ps-input" value={form.data.name} maxLength={60} placeholder={t('Backup script')} onChange={(event) => form.setData('name', event.target.value)} required />
                        </Field>
                        <div className="ps-field">
                            <span className="ps-label">{t('Reaches')}</span>
                            <div className="token-services">
                                {tokens.services.map((service) => (
                                    <label key={service} className="ps-check"><input type="checkbox" checked={form.data.services.includes(service)} onChange={() => toggle(service)} />{SERVICE_NAMES[service] ?? service}</label>
                                ))}
                                <label className="ps-check"><input type="checkbox" checked={form.data.readOnly} onChange={(event) => form.setData('readOnly', event.target.checked)} />{t('Read only')}</label>
                            </div>
                        </div>
                    </div>
                </form>
            </Frame>
            {tokens.error && <div className="ps-alert"><i className="bx bx-error-circle" /><span>{tokens.error}</span></div>}
            <Frame flush>
                {tokens.list.length === 0
                    ? <p className="ps-muted token-empty">{t('No tokens yet.')}</p>
                    : <div className="ps-table-wrap"><table className="ps-table">
                        <thead><tr><th>{t('Token')}</th><th>{t('Reaches')}</th><th className="token-hide-sm">{t('Ends')}</th><th><span className="ps-sr-only">{t('Revoke')}</span></th></tr></thead>
                        <tbody>{tokens.list.map((token) => (
                            <tr key={token.id}>
                                <td className="is-primary"><strong>{token.name}</strong><span className="ps-muted ps-small token-made">{t('Made')}{' '}{relativeTime(token.createdAt)}</span></td>
                                <td><div className="ps-inline token-scopes">{token.scopes.map((scope) => <Badge key={scope} tone={scope === 'read-only' ? undefined : 'accent'}>{scope === 'read-only' ? t('Read only') : SERVICE_NAMES[scope] ?? scope}</Badge>)}</div></td>
                                <td className="token-hide-sm ps-muted">{new Date(token.expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="token-actions"><Button size="sm" variant="ghost" icon="bx-trash" aria-label={t('Revoke {name}', { name: token.name })} onClick={() => { if (window.confirm(t('Revoke {name}? Scripts using it stop working.', { name: token.name }))) router.delete(`/account/tokens/${token.id}`, { preserveScroll: true }); }}>{t('Revoke')}</Button></td>
                            </tr>
                        ))}</tbody>
                    </table></div>}
            </Frame>
            {tokens.apis.length > 0 && <ApiHelp apis={tokens.apis} />}
            <Modal open={shown !== null} title={t('Copy your token')} onClose={() => setShown(null)} footer={<><Button onClick={copy} icon={copied ? 'bx-check' : 'bx-copy'}>{copied ? t('Copied') : t('Copy')}</Button><Button variant="primary" onClick={() => setShown(null)}>{t('Done')}</Button></>}>
                <p className="ps-muted">{t('This is the only time')}{' '}{shown?.name} {' '}{t('is shown. Keep it somewhere safe.')}</p>
                <textarea className="ps-textarea token-value" readOnly rows={5} value={shown?.token ?? ''} onFocus={(event) => event.target.select()} />
            </Modal>
        </div>
    );
}

/** How to use a token: one header, each service's address, and what it can do. */
function ApiHelp({ apis }: { apis: ApiService[] }) {
    const example = apis[0];
    const [copied, setCopied] = useState(false);
    const command = `curl ${example.base}/${example.id === 'core' ? 'me' : ''} \\\n  -H "Authorization: Bearer $PLAINSHOW_TOKEN"`;
    const copy = () => navigator.clipboard?.writeText(command).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => undefined);
    return (
        <Frame compact>
            <div className="api-help">
                <div className="api-help__intro">
                    <strong>{t('Using a token')}</strong>
                    <span className="ps-muted ps-small">{t('Send it in the Authorization header. Each service has its own address; its description lists what you can ask for.')}</span>
                </div>
                <div className="api-help__code">
                    <pre><code>{command}</code></pre>
                    <button type="button" className="api-help__copy" onClick={copy} aria-label={t('Copy')}><i className={`bx ${copied ? 'bx-check' : 'bx-copy'}`} aria-hidden="true" /></button>
                </div>
                <ul className="api-help__services">
                    {apis.map((api, index) => (
                        <li key={api.id} className={`${index === 0 ? 'is-first' : ''}${index === apis.length - 1 ? ' is-last' : ''}`}>
                            <i className={`bx ${api.icon}`} aria-hidden="true" />
                            <span className="api-help__name">{api.name}</span>
                            <code>{api.base}</code>
                            <a href={api.spec} target="_blank" rel="noopener noreferrer">{t('What it can do')}<i className="bx bx-link-external" aria-hidden="true" /></a>
                        </li>
                    ))}
                </ul>
            </div>
        </Frame>
    );
}
