import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, Field, Frame, Modal, relativeTime, RoleBadge } from '@/Components/ui';
import { PermissionCapability, PermissionChoice, PermissionEditor } from '@/Components/PermissionEditor';
import { router, useForm } from '@inertiajs/react';
import { FormEvent, useEffect, useState } from 'react';

type Row = {
    id: number; username: string; name: string; firstName: string; lastName: string; initials: string; avatar: string | null;
    role: string; status: string; email: string | null; piUsername: string | null; twoFactor: boolean; lastLogin: string | null; services: string[]; capabilities: string[]; groups: string[];
    accounts: { cloud: boolean; web: boolean };
};
type Extension = { id: string; name: string; icon: string; system: boolean };
type Role = { key: string; name: string; color: string; protected: boolean };
type Capability = PermissionCapability;
type Props = { users: Row[]; search: string; extensions: Extension[]; access: Record<string, Record<string, string>>; capabilities: Record<string, Capability[]>; capabilityOverrides: Record<string, Record<string, string>>; roles: Role[]; resetLink: { username: string; url: string } | null };

export default function Users({ users, search, extensions, access, capabilities, capabilityOverrides, roles, resetLink }: Props) {
    const [query, setQuery] = useState(search);
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [link, setLink] = useState(resetLink);
    useEffect(() => setLink(resetLink), [resetLink]);

    useEffect(() => {
        if (query === search) return;
        const timer = window.setTimeout(() => router.get('/admin/users', query ? { q: query } : {}, { preserveState: true, replace: true }), 250);
        return () => window.clearTimeout(timer);
    }, [query, search]);

    return (
        <AppShell title="Accounts" wide description={`${users.length} ${users.length === 1 ? 'person' : 'people'}`} actions={<>
            <div className="ps-input-wrap admin-search">
                <i className="bx bx-search" aria-hidden="true" />
                <input className="ps-input" type="search" placeholder="Search accounts" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search accounts" />
            </div>
            <Button variant="primary" icon="bx-plus" onClick={() => setCreating(true)}>New account</Button>
        </>}>

            <Frame flush>
                <div className="ps-table-wrap">
                    <table className="ps-table admin-table">
                        <thead><tr><th>Name</th><th>Role</th><th className="admin-hide-sm">Services</th><th className="admin-hide-sm">Security</th><th className="admin-hide-md">Last sign-in</th><th aria-label="Actions" /></tr></thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className={user.status !== 'active' ? 'is-muted' : ''}>
                                    <td className="is-primary">
                                        <button type="button" className="admin-user" onClick={() => setEditing(user)}>
                                            <Avatar src={user.avatar} initials={user.initials} size="sm" />
                                            <span><strong>{user.name}</strong><span className="ps-muted ps-small">@{user.username}</span></span>
                                        </button>
                                    </td>
                                    <td><div className="ps-inline" style={{ flexWrap: 'wrap' }}><RoleBadge role={user.role} name={roles.find((role) => role.key === user.role)?.name} color={roles.find((role) => role.key === user.role)?.color} />{user.groups.map((group) => <Badge key={group} tone="accent">{group}</Badge>)}{user.status !== 'active' && <Badge tone="red">Disabled</Badge>}</div></td>
                                    <td className="admin-hide-sm"><div className="admin-services">{extensions.filter((extension) => !extension.system && user.services.includes(extension.id)).map((extension) => <i key={extension.id} className={`bx ${extension.icon}`} title={extension.name} />)}</div></td>
                                    <td className="admin-hide-sm">{user.twoFactor ? <Badge tone="green">Two-factor</Badge> : <span className="ps-faint ps-small">Password only</span>}</td>
                                    <td className="admin-hide-md ps-small">{relativeTime(user.lastLogin)}</td>
                                    <td className="admin-actions"><Button size="sm" variant="ghost" iconOnly icon="bx-edit-alt" aria-label={`Edit ${user.name}`} onClick={() => setEditing(user)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Frame>

            {editing && <EditUser key={editing.id} user={editing} roles={roles} extensions={extensions} overrides={access[editing.id] ?? {}} capabilities={capabilities} capabilityOverrides={capabilityOverrides[editing.id] ?? {}} onClose={() => setEditing(null)} />}
            {creating && <CreateUser roles={roles} onClose={() => setCreating(false)} />}
            <Modal open={link !== null} size="sm" title="Password link" onClose={() => setLink(null)}
                footer={<><Button variant="ghost" onClick={() => setLink(null)}>Done</Button><Button variant="primary" icon="bx-copy" onClick={() => navigator.clipboard?.writeText(link?.url ?? '')}>Copy link</Button></>}>
                <p className="ps-soft">Send this to <strong>{link?.username}</strong>. It works once, for one hour.</p>
                <input className="ps-input ps-mono admin-link" readOnly value={link?.url ?? ''} onFocus={(event) => event.target.select()} aria-label="Password link" />
            </Modal>
        </AppShell>
    );
}

function UserFields({ form, roles }: { form: ReturnType<typeof useForm<{ username: string; firstName: string; lastName: string; email: string; role: string; piUsername: string; status?: string }>>; roles: Role[] }) {
    return (
        <>
            <div className="account__grid">
                <Field label="First name" htmlFor="u-first" error={form.errors.firstName}><input id="u-first" className="ps-input" value={form.data.firstName} onChange={(event) => form.setData('firstName', event.target.value)} /></Field>
                <Field label="Last name" htmlFor="u-last" error={form.errors.lastName}><input id="u-last" className="ps-input" value={form.data.lastName} onChange={(event) => form.setData('lastName', event.target.value)} /></Field>
                <Field label="Username" htmlFor="u-name" error={form.errors.username}><input id="u-name" className="ps-input" value={form.data.username} onChange={(event) => form.setData('username', event.target.value)} autoCapitalize="none" spellCheck={false} /></Field>
                <Field label="Email" htmlFor="u-email" error={form.errors.email}><input id="u-email" type="email" className="ps-input" value={form.data.email} onChange={(event) => form.setData('email', event.target.value)} /></Field>
                <Field label="Role" htmlFor="u-role" error={form.errors.role}>
                    <select id="u-role" className="ps-select" value={form.data.role} onChange={(event) => form.setData('role', event.target.value)}>
                        {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                    </select>
                </Field>
                <Field label="Server account" htmlFor="u-pi" error={form.errors.piUsername} help="Created automatically when Web access is enabled.">
                    <input id="u-pi" className="ps-input ps-mono" value={form.data.piUsername || 'Automatic'} readOnly />
                </Field>
            </div>
        </>
    );
}

function EditUser({ user, roles, extensions, overrides, capabilities, capabilityOverrides, onClose }: { user: Row; roles: Role[]; extensions: Extension[]; overrides: Record<string, string>; capabilities: Record<string, Capability[]>; capabilityOverrides: Record<string, string>; onClose: () => void }) {
    const form = useForm({ username: user.username, firstName: user.firstName, lastName: user.lastName ?? '', email: user.email ?? '', role: user.role, piUsername: user.piUsername ?? '', status: user.status });
    const [tab, setTab] = useState<'details' | 'access' | 'permissions'>('details');
    const [removing, setRemoving] = useState(false);
    const removal = useForm({ confirmUsername: '', services: Object.entries(user.accounts).filter(([, exists]) => exists).map(([service]) => service), retainData: true });
    const accessForm = useForm({ access: Object.fromEntries(extensions.filter((extension) => !extension.system).map((extension) => [extension.id, user.services.includes(extension.id) ? 'allow' : 'deny'])) as Record<string, string> });
    const permissionForm = useForm<{ access: Record<string, PermissionChoice>; capabilities: Record<string, PermissionChoice> }>({
        access: Object.fromEntries(extensions.map((extension) => [extension.id, overrides[extension.id] ?? 'default'])) as Record<string, PermissionChoice>,
        capabilities: Object.fromEntries(Object.values(capabilities).flat().map((capability) => [capability.name, capabilityOverrides[capability.name] ?? 'default'])) as Record<string, PermissionChoice>,
    });
    const save = (event: FormEvent) => { event.preventDefault(); form.put(`/admin/users/${user.id}`, { preserveScroll: true, onSuccess: onClose }); };

    return (
        <>
        <Modal open={!removing} title={user.name} onClose={onClose}
            footer={tab === 'details'
                ? <><Button variant="ghost" icon="bx-key" onClick={() => router.post(`/admin/users/${user.id}/reset-link`, {}, { preserveScroll: true, onSuccess: onClose })}>Password link</Button><Button variant="danger" onClick={() => setRemoving(true)}>Remove</Button><span className="ps-topbar__spacer" /><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={form.processing} onClick={save}>Save</Button></>
                : tab === 'access'
                    ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={accessForm.processing} onClick={() => accessForm.put(`/admin/users/${user.id}/access`, { preserveScroll: true, onSuccess: onClose })}>Save access</Button></>
                    : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={permissionForm.processing} onClick={() => permissionForm.put(`/admin/permissions/users/${user.id}`, { preserveScroll: true, onSuccess: onClose })}>Save permissions</Button></>}>
            <div className="ps-tabs admin-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'details'} className={`ps-tab${tab === 'details' ? ' is-active' : ''}`} onClick={() => setTab('details')}>Details</button>
                <button type="button" role="tab" aria-selected={tab === 'access'} className={`ps-tab${tab === 'access' ? ' is-active' : ''}`} onClick={() => setTab('access')}>Service access</button>
                <button type="button" role="tab" aria-selected={tab === 'permissions'} className={`ps-tab${tab === 'permissions' ? ' is-active' : ''}`} onClick={() => setTab('permissions')}>Permissions</button>
            </div>
            {tab === 'details' ? (
                <form onSubmit={save} noValidate>
                    <UserFields form={form as never} roles={roles} />
                    <Field label="Status" htmlFor="u-status" error={form.errors.status}>
                        <select id="u-status" className="ps-select" value={form.data.status} onChange={(event) => form.setData('status', event.target.value)}>
                            <option value="active">Active</option>
                            <option value="disabled">Disabled (signed out everywhere)</option>
                        </select>
                    </Field>
                </form>
            ) : tab === 'access' ? (
                <>{accessForm.errors.access && <div role="alert" className="ps-error">{accessForm.errors.access}</div>}<ul className="ps-list">
                    {extensions.filter((extension) => !extension.system).map((extension) => (
                        <li key={extension.id} className="ps-row">
                            <span className="ps-row__icon"><i className={`bx ${extension.icon}`} /></span>
                            <span className="ps-row__body"><span className="ps-row__title">{extension.name}</span><span className="ps-row__meta">{user.accounts[extension.id as 'cloud' | 'web'] === true ? 'Account exists' : user.services.includes(extension.id) ? 'Available' : 'No access'}</span></span>
                            <span className="ps-row__action">
                                <select className="ps-select admin-access" value={accessForm.data.access[extension.id]} onChange={(event) => accessForm.setData('access', { ...accessForm.data.access, [extension.id]: event.target.value })} aria-label={`${extension.name} access`}>
                                    <option value="allow">Has access</option>
                                    <option value="deny">No access</option>
                                </select>
                            </span>
                        </li>
                    ))}
                </ul></>
            ) : (
                <div className="ps-stack admin-permissions">
                    <PermissionEditor
                        extensions={extensions.filter((extension) => user.services.includes(extension.id)).map((extension) => ({ ...extension, capabilities: capabilities[extension.id] ?? [] }))}
                        effectiveServices={user.services} effectiveCapabilities={user.capabilities} access={permissionForm.data.access} capabilities={permissionForm.data.capabilities} isAdmin={user.role === 'admin'}
                        onAccessChange={(extension, value) => permissionForm.setData('access', { ...permissionForm.data.access, [extension]: value })}
                        onCapabilityChange={(capability, value) => permissionForm.setData('capabilities', { ...permissionForm.data.capabilities, [capability]: value })} />
                </div>
            )}
        </Modal>
        <Modal open={removing} size="sm" title={`Remove ${user.name}`} onClose={() => setRemoving(false)} footer={<><Button variant="ghost" onClick={() => setRemoving(false)}>Cancel</Button><Button variant="danger" loading={removal.processing} onClick={() => removal.delete(`/admin/users/${user.id}`, { preserveScroll: true, onSuccess: onClose })}>Remove account</Button></>}>
            <p className="ps-soft">Their PlainShow login is removed. Shared expense history stays.</p>
            <Field label="Service accounts" htmlFor="remove-services">
                <div id="remove-services" className="ps-stack admin-remove-services">
                    {(['cloud', 'web'] as const).filter((service) => user.accounts[service]).map((service) => <label key={service} className="ps-check"><input type="checkbox" checked={removal.data.services.includes(service)} onChange={(event) => removal.setData('services', event.target.checked ? [...removal.data.services, service] : removal.data.services.filter((item) => item !== service))} /><span>{service === 'cloud' ? 'Cloud account' : 'Web server account'}</span></label>)}
                </div>
            </Field>
            <label className="ps-check"><input type="checkbox" checked={removal.data.retainData} onChange={(event) => removal.setData('retainData', event.target.checked)} /><span>Keep stored data for selected services</span></label>
            <p className="ps-small ps-muted">When kept, service accounts are disabled instead of permanently deleted.</p>
            <Field label={`Type ${user.username} to confirm`} htmlFor="remove-username" error={removal.errors.confirmUsername}><input id="remove-username" className="ps-input" value={removal.data.confirmUsername} onChange={(event) => removal.setData('confirmUsername', event.target.value)} /></Field>
        </Modal>
        </>
    );
}

function CreateUser({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
    const form = useForm({ username: '', firstName: '', lastName: '', email: '', role: roles.find((role) => role.key === 'user')?.key ?? roles[0]?.key ?? 'user', piUsername: '' });
    const save = (event: FormEvent) => { event.preventDefault(); form.post('/admin/users', { preserveScroll: true, onSuccess: onClose }); };

    return (
        <Modal open title="New account" onClose={onClose}
            footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={form.processing} onClick={save}>Create</Button></>}>
            <p className="ps-soft admin-intro">They set their own password through a one-time link.</p>
            <form onSubmit={save} noValidate><UserFields form={form as never} roles={roles} /></form>
        </Modal>
    );
}
