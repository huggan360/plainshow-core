import AppShell from '@/Layouts/AppShell';
import { Badge, Frame, Switch } from '@/Components/ui';
import { router } from '@inertiajs/react';
import { t } from '@/i18n';

type Extension = {
    id: string; name: string; description: string; icon: string; url: string | null; enabled: boolean; system: boolean; version: string | null;
    defaultAccess: string[]; capabilities: number; health: { state: string; ms: number | null } | null;
};

type Role = { key: string; name: string };
const STATE: Record<string, { tone: 'green' | 'amber' | 'red' | undefined; label: string }> = {
    online: { tone: 'green', label: t('Online') }, error: { tone: 'amber', label: t('Errors') }, offline: { tone: 'red', label: t('Offline') }, unknown: { tone: undefined, label: t('Not checked') },
};

export default function Extensions({ extensions, roles }: { extensions: Extension[]; roles: Role[] }) {
    const save = (extension: Extension, changes: Partial<Pick<Extension, 'enabled' | 'defaultAccess'>>) => {
        router.put(`/admin/services/${extension.id}`, { enabled: changes.enabled ?? extension.enabled, defaultAccess: changes.defaultAccess ?? extension.defaultAccess }, { preserveScroll: true });
    };

    return (
        <AppShell title={t('Services')} description={t('Turn services on or off, and choose which roles get them by default.')}>
            <div className="ps-stack">
                {extensions.map((extension) => {
                    const state = STATE[extension.health?.state ?? 'unknown'];
                    return (
                        <Frame key={extension.id} compact className={extension.enabled ? '' : 'is-off'}>
                            <div className="service">
                                <span className="service__icon"><i className={`bx ${extension.icon}`} aria-hidden="true" /></span>
                                <div className="service__body">
                                    <div className="ps-inline">
                                        <strong>{extension.name}</strong>
                                        {extension.version && <span className="ps-faint ps-small ps-mono">v{extension.version}</span>}
                                        {extension.enabled && <Badge tone={state.tone}>{t(state.label)}</Badge>}
                                        {extension.system && <Badge>{t('Always on')}</Badge>}
                                    </div>
                                    <p className="ps-muted ps-small">{t(extension.description)}</p>
                                    {!extension.system && (
                                        <div className="service__roles" role="group" aria-label={t('Who gets {name} by default', { name: extension.name })}>
                                            {roles.map((role) => {
                                                const on = extension.defaultAccess.includes(role.key);
                                                return (
                                                    <button key={role.key} type="button" disabled={role.key === 'admin'} aria-pressed={on} className={`service__role${on ? ' is-on' : ''}`}
                                                        onClick={() => save(extension, { defaultAccess: on ? extension.defaultAccess.filter((item) => item !== role.key) : [...extension.defaultAccess, role.key] })}>
                                                        {on && <i className="bx bx-check" aria-hidden="true" />}{role.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div className="service__toggle">
                                    <Switch checked={extension.enabled} disabled={extension.system} label={t('{name} on', { name: extension.name })} onChange={(enabled) => save(extension, { enabled })} />
                                </div>
                            </div>
                        </Frame>
                    );
                })}
            </div>
        </AppShell>
    );
}
