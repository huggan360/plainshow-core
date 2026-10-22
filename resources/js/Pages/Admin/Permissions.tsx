import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, Empty, Field, Frame, Modal, RoleBadge } from '@/Components/ui';
import { CapabilityInfo, CapabilitySectionRows, impliedCapabilities, implicationText, PermissionCapability, PermissionChoice, PermissionEditor } from '@/Components/PermissionEditor';
import { UserSummary } from '@/types';
import { router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

type Capability = PermissionCapability;
type Extension = { id: string; name: string; icon: string; enabled: boolean; system: boolean; defaultAccess: string[]; capabilities: Capability[] };
type Effect = 'allow' | 'deny';
type Person = UserSummary & { effective: { services: string[]; capabilities: string[] } };
type RoleInfo = { key: string; name: string; color: string; protected: boolean; patterns: string[]; granted: string[] };
type Props = {
    extensions: Extension[];
    roles: RoleInfo[];
    people: Person[];
    overrides: { access: Record<string, Record<string, Effect>>; capabilities: Record<string, Record<string, Effect>> };
};

export default function Permissions(props: Props) {
    const [tab, setTab] = useState<'roles' | 'people'>(() => (new URLSearchParams(window.location.search).get('person') ? 'people' : 'roles'));

    return (
        <AppShell title="Permissions" wide description="What each role may do in every service, and the exceptions for single people. Other services pick up changes the next time someone signs in."
            actions={<div className="ps-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'roles'} className={`ps-tab${tab === 'roles' ? ' is-active' : ''}`} onClick={() => setTab('roles')}>Roles</button>
                <button type="button" role="tab" aria-selected={tab === 'people'} className={`ps-tab${tab === 'people' ? ' is-active' : ''}`} onClick={() => setTab('people')}>People</button>
            </div>}>
            {tab === 'roles' ? <RoleMatrix {...props} /> : <People {...props} />}
        </AppShell>
    );
}

/* ---------- Roles ---------- */

function RoleMatrix({ extensions, roles }: Props) {
    const editable = roles.filter((role) => role.key !== 'admin');
    const initial = useMemo(() => ({
        capabilities: Object.fromEntries(editable.map((role) => [role.key, [...role.granted]])) as Record<string, string[]>,
        access: Object.fromEntries(extensions.map((extension) => [extension.id, [...extension.defaultAccess]])) as Record<string, string[]>,
    }), [extensions, roles]);
    const [state, setState] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [selectedKey, setSelectedKey] = useState(() => roles.find((role) => role.key === 'user')?.key ?? roles[0]?.key ?? '');
    const [roleModal, setRoleModal] = useState<RoleInfo | 'new' | null>(null);
    useEffect(() => setState(initial), [initial]);
    useEffect(() => { if (!roles.some((role) => role.key === selectedKey)) setSelectedKey(roles[0]?.key ?? ''); }, [roles, selectedKey]);
    const dirty = JSON.stringify(state) !== JSON.stringify(initial);
    const selected = roles.find((role) => role.key === selectedKey) ?? roles[0];

    const toggleCapability = (role: string, name: string) => setState((current) => {
        const list = current.capabilities[role] ?? [];
        return { ...current, capabilities: { ...current.capabilities, [role]: list.includes(name) ? list.filter((item) => item !== name) : [...list, name] } };
    });
    const toggleAccess = (extension: string, role: string) => setState((current) => {
        const list = current.access[extension];
        return { ...current, access: { ...current.access, [extension]: list.includes(role) ? list.filter((item) => item !== role) : [...list, role] } };
    });
    const save = () => {
        setSaving(true);
        router.put('/admin/permissions/roles', state as unknown as Record<string, string>, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    return (
        <div className="perm">
            <Frame compact>
                <div className="perm-role-picker">
                    <div className="perm-role-tabs" role="tablist" aria-label="Role">
                        {roles.map((role) => <button key={role.key} type="button" role="tab" aria-selected={role.key === selected?.key} className={`perm-role-tab${role.key === selected?.key ? ' is-active' : ''}`} onClick={() => setSelectedKey(role.key)}><RoleBadge role={role.key} name={role.name} color={role.color} /></button>)}
                    </div>
                    <Button size="sm" variant="primary" icon="bx-plus" onClick={() => setRoleModal('new')}>New role</Button>
                </div>
            </Frame>
            {selected && <Frame compact>
                <div className="perm-role-head">
                    <RoleBadge role={selected.key} name={selected.name} color={selected.color} />
                    <span className="ps-small ps-muted">Choose what this role may access and do.</span>
                    <span className="perm-bar__spacer" />
                    <Button size="sm" variant="ghost" icon="bx-edit" onClick={() => setRoleModal(selected)}>Edit role</Button>
                    {!selected.protected && <Button size="sm" variant="ghost" icon="bx-trash" onClick={() => { if (window.confirm(`Delete ${selected.name}?`)) router.delete(`/admin/permissions/roles/${selected.key}`, { preserveScroll: true }); }}>Delete</Button>}
                </div>
            </Frame>}
            <div className={`perm-bar${dirty ? ' is-dirty' : ''}`}>
                <span className="ps-small ps-muted">{dirty ? 'Unsaved changes' : 'Admins always have everything.'}</span>
                <span className="perm-bar__spacer" />
                {dirty && <Button size="sm" variant="ghost" icon="bx-reset" onClick={() => setState(initial)}>Undo</Button>}
                <Button size="sm" variant="primary" icon="bx-check" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
            </div>
            {selected && extensions.map((extension) => <RoleExtension key={extension.id} extension={extension} role={selected} selectedCapabilities={state.capabilities[selected.key] ?? []}
                hasAccess={extension.system || selected.key === 'admin' || state.access[extension.id].includes(selected.key)}
                onAccess={() => toggleAccess(extension.id, selected.key)} onCapability={(capability) => toggleCapability(selected.key, capability)} />)}
            {roleModal && <RoleModal role={roleModal === 'new' ? null : roleModal} onClose={() => setRoleModal(null)} />}
        </div>
    );
}

function RoleExtension({ extension, role, selectedCapabilities, hasAccess, onAccess, onCapability }: { extension: Extension; role: RoleInfo; selectedCapabilities: string[]; hasAccess: boolean; onAccess: () => void; onCapability: (capability: string) => void }) {
    const implied = impliedCapabilities(selectedCapabilities, extension.capabilities);
    return <Frame flush className={extension.enabled ? '' : 'is-off'}>
        <div className="ps-table-wrap">
            <table className="ps-table perm-table">
                <thead><tr>
                    <th scope="col"><span className="perm-ext"><i className={`bx ${extension.icon}`} aria-hidden="true" />{extension.name}{!extension.enabled && <Badge>Off</Badge>}</span></th>
                    <th scope="col" className="perm-col">Allowed</th>
                </tr></thead>
                <tbody><tr className="perm-row perm-row--access">
                    <th scope="row"><span className="perm-cap"><strong>Open {extension.name}</strong><span className="ps-small ps-muted">{extension.id === 'cloud' ? 'Creates or enables the linked Cloud account.' : extension.id === 'web' ? 'Requires a server username.' : extension.system ? 'Everyone with an account.' : 'Who gets the service without an exception.'}</span></span></th>
                    <td className="perm-col"><Check checked={hasAccess} disabled={extension.system || role.key === 'admin'} label={`${role.name} can open ${extension.name}`} onChange={onAccess} /></td>
                </tr></tbody>
                <CapabilitySectionRows capabilities={extension.capabilities} columns={2} render={(capability) => {
                    const included = implied.has(capability.name);
                    const reason = implicationText(capability.name, selectedCapabilities, extension.capabilities);
                    return <tr key={capability.name} className={`perm-row${included ? ' is-implied' : ''}`}>
                        <th scope="row"><CapabilityInfo capability={capability} implication={reason} /></th>
                        <td className="perm-col"><Check checked={role.key === 'admin' || selectedCapabilities.includes(capability.name) || included} disabled={role.key === 'admin' || included} muted={role.key !== 'admin' && !hasAccess} title={reason} label={`${role.name}: ${capability.label}`} onChange={() => onCapability(capability.name)} /></td>
                    </tr>;
                }} />
            </table>
        </div>
    </Frame>;
}

function RoleModal({ role, onClose }: { role: RoleInfo | null; onClose: () => void }) {
    const [name, setName] = useState(role?.name ?? '');
    const [color, setColor] = useState(role?.color ?? '#fc5000');
    const [saving, setSaving] = useState(false);
    const submit = () => {
        if (!name.trim()) return;
        setSaving(true);
        const options = { preserveScroll: true, onSuccess: onClose, onFinish: () => setSaving(false) };
        role ? router.put(`/admin/permissions/roles/${role.key}`, { name: name.trim(), color }, options) : router.post('/admin/permissions/roles', { name: name.trim(), color }, options);
    };
    return <Modal open title={role ? `Edit ${role.name}` : 'New role'} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} disabled={!name.trim()} onClick={submit}>{role ? 'Save role' : 'Create role'}</Button></>}>
        <div className="ps-stack">
            <Field label="Role name" htmlFor="role-name"><input id="role-name" className="ps-input" value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Badge color" htmlFor="role-color"><div className="perm-color"><input id="role-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><input className="ps-input ps-mono" value={color} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => setColor(event.target.value)} /></div></Field>
            <div><RoleBadge role={role?.key ?? 'custom'} name={name.trim() || 'Role preview'} color={/^#[0-9a-f]{6}$/i.test(color) ? color : '#64748b'} /></div>
        </div>
    </Modal>;
}

function Check({ checked, disabled, muted, label, title, onChange }: { checked: boolean; disabled?: boolean; muted?: boolean; label: string; title?: string; onChange: () => void }) {
    return (
        <label className={`perm-check${checked ? ' is-on' : ''}${muted ? ' is-muted' : ''}`} title={title ?? (muted ? 'Has no effect while the role cannot open the service' : undefined)}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} />
            <i className={`bx ${checked ? 'bx-check' : ''}`} aria-hidden="true" />
        </label>
    );
}

/* ---------- People ---------- */

function People({ extensions, people, overrides }: Props) {
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get('person')) || null);
    const visible = people.filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(query.trim().toLowerCase()));
    const selected = people.find((person) => person.id === selectedId) ?? null;
    const exceptions = (id: number) => Object.keys(overrides.access[id] ?? {}).length + Object.keys(overrides.capabilities[id] ?? {}).length;

    return (
        <div className="perm-people">
            <Frame compact className="perm-people__list">
                <input className="ps-input" type="search" placeholder="Search people" aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
                <ul className="ps-list perm-people__names">
                    {visible.map((person) => (
                        <li key={person.id}>
                            <button type="button" className={`perm-person${person.id === selectedId ? ' is-active' : ''}`} onClick={() => setSelectedId(person.id)}>
                                <Avatar src={person.avatar} initials={person.initials} size="sm" />
                                <span className="perm-person__text"><strong>{person.name}</strong><span className="ps-small ps-muted">@{person.username}</span></span>
                                {exceptions(person.id) > 0 && <Badge tone="accent">{exceptions(person.id)}</Badge>}
                            </button>
                        </li>
                    ))}
                </ul>
            </Frame>
            {selected
                ? <PersonEditor key={selected.id} person={selected} extensions={extensions} access={overrides.access[selected.id] ?? {}} capabilities={overrides.capabilities[selected.id] ?? {}} />
                : <Frame><Empty icon="bx-user">Choose someone to see what they can do.</Empty></Frame>}
        </div>
    );
}

type Choice = PermissionChoice;

function PersonEditor({ person, extensions, access, capabilities }: { person: Person; extensions: Extension[]; access: Record<string, Effect>; capabilities: Record<string, Effect> }) {
    const initial = useMemo(() => ({ access: { ...access } as Record<string, Choice>, capabilities: { ...capabilities } as Record<string, Choice> }), [access, capabilities]);
    const [state, setState] = useState(initial);
    const [saving, setSaving] = useState(false);
    useEffect(() => setState(initial), [initial]);
    const normalise = (map: Record<string, Choice>) => JSON.stringify(Object.entries(map).filter(([, value]) => value !== 'default').sort());
    const dirty = normalise(state.access) !== normalise(initial.access) || normalise(state.capabilities) !== normalise(initial.capabilities);
    const isAdmin = person.role === 'admin';

    const save = () => {
        setSaving(true);
        const fill = (keys: string[], map: Record<string, Choice>) => Object.fromEntries(keys.map((key) => [key, map[key] ?? 'default']));
        router.put(`/admin/permissions/users/${person.id}`, {
            access: fill(extensions.map((extension) => extension.id), state.access),
            capabilities: fill(extensions.flatMap((extension) => extension.capabilities.map((capability) => capability.name)), state.capabilities),
        } as unknown as Record<string, string>, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    return (
        <div className="perm-person-editor">
            <Frame compact>
                <div className="perm-person-head">
                    <Avatar src={person.avatar} initials={person.initials} size="lg" />
                    <div className="perm-person-head__text"><h2 className="ps-frame__title">{person.name}</h2><span className="ps-small ps-muted">@{person.username}</span></div>
                    <RoleBadge role={person.role} />
                    <span className="perm-bar__spacer" />
                    {dirty && <Button size="sm" variant="ghost" icon="bx-reset" onClick={() => setState(initial)}>Undo</Button>}
                    <Button size="sm" variant="primary" icon="bx-check" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
                </div>
                {isAdmin && <p className="ps-small ps-muted perm-person-note">Admins have every capability. Denying a service still closes it to them.</p>}
            </Frame>
            <PermissionEditor extensions={extensions} effectiveServices={person.effective.services} effectiveCapabilities={person.effective.capabilities} access={state.access} capabilities={state.capabilities} isAdmin={isAdmin}
                onAccessChange={(extension, value) => setState((current) => ({ ...current, access: { ...current.access, [extension]: value } }))}
                onCapabilityChange={(capability, value) => setState((current) => ({ ...current, capabilities: { ...current.capabilities, [capability]: value } }))} />
        </div>
    );
}
