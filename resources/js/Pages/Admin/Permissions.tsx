import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, Empty, Frame, RoleBadge } from '@/Components/ui';
import { Role, UserSummary } from '@/types';
import { router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

type Capability = { name: string; label: string; description: string };
type Extension = { id: string; name: string; icon: string; enabled: boolean; system: boolean; defaultAccess: string[]; capabilities: Capability[] };
type Effect = 'allow' | 'deny';
type Person = UserSummary & { effective: { services: string[]; capabilities: string[] } };
type Props = {
    extensions: Extension[];
    roles: Record<Role, { patterns: string[]; granted: string[] }>;
    people: Person[];
    overrides: { access: Record<string, Record<string, Effect>>; capabilities: Record<string, Record<string, Effect>> };
};

const ROLES: Role[] = ['admin', 'moderator', 'member', 'guest'];
const EDITABLE: Role[] = ['moderator', 'member', 'guest'];
const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', moderator: 'Moderator', member: 'Member', guest: 'Guest' };

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
    const initial = useMemo(() => ({
        capabilities: Object.fromEntries(EDITABLE.map((role) => [role, [...roles[role].granted]])) as Record<Role, string[]>,
        access: Object.fromEntries(extensions.map((extension) => [extension.id, [...extension.defaultAccess]])) as Record<string, string[]>,
    }), [extensions, roles]);
    const [state, setState] = useState(initial);
    const [saving, setSaving] = useState(false);
    useEffect(() => setState(initial), [initial]);
    const dirty = JSON.stringify(state) !== JSON.stringify(initial);

    const toggleCapability = (role: Role, name: string) => setState((current) => {
        const list = current.capabilities[role];
        return { ...current, capabilities: { ...current.capabilities, [role]: list.includes(name) ? list.filter((item) => item !== name) : [...list, name] } };
    });
    const toggleAccess = (extension: string, role: Role) => setState((current) => {
        const list = current.access[extension];
        return { ...current, access: { ...current.access, [extension]: list.includes(role) ? list.filter((item) => item !== role) : [...list, role] } };
    });
    const save = () => {
        setSaving(true);
        router.put('/admin/permissions/roles', state as unknown as Record<string, string>, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    return (
        <div className="perm">
            <div className={`perm-bar${dirty ? ' is-dirty' : ''}`}>
                <span className="ps-small ps-muted">{dirty ? 'Unsaved changes' : 'Admins always have everything.'}</span>
                <span className="perm-bar__spacer" />
                {dirty && <Button size="sm" variant="ghost" icon="bx-reset" onClick={() => setState(initial)}>Undo</Button>}
                <Button size="sm" variant="primary" icon="bx-check" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
            </div>
            {extensions.map((extension) => (
                <Frame key={extension.id} flush className={extension.enabled ? '' : 'is-off'}>
                    <div className="ps-table-wrap">
                        <table className="ps-table perm-table">
                            <thead>
                                <tr>
                                    <th scope="col"><span className="perm-ext"><i className={`bx ${extension.icon}`} aria-hidden="true" />{extension.name}{!extension.enabled && <Badge>Off</Badge>}</span></th>
                                    {ROLES.map((role) => <th key={role} scope="col" className="perm-col">{ROLE_LABEL[role]}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="perm-row perm-row--access">
                                    <th scope="row"><span className="perm-cap"><strong>Open {extension.name}</strong><span className="ps-small ps-muted">{extension.system ? 'Everyone with an account.' : 'Who gets the service without an exception.'}</span></span></th>
                                    {ROLES.map((role) => (
                                        <td key={role} className="perm-col">
                                            <Check checked={extension.system || role === 'admin' || state.access[extension.id].includes(role)} disabled={extension.system || role === 'admin'}
                                                label={`${ROLE_LABEL[role]} can open ${extension.name}`} onChange={() => toggleAccess(extension.id, role)} />
                                        </td>
                                    ))}
                                </tr>
                                {extension.capabilities.map((capability) => (
                                    <tr key={capability.name} className="perm-row">
                                        <th scope="row"><span className="perm-cap"><span>{capability.label}</span><code className="ps-small ps-muted">{capability.name}</code></span></th>
                                        {ROLES.map((role) => {
                                            const open = role === 'admin' || extension.system || state.access[extension.id].includes(role);
                                            return (
                                                <td key={role} className="perm-col">
                                                    <Check checked={role === 'admin' || state.capabilities[role].includes(capability.name)} disabled={role === 'admin'} muted={!open}
                                                        label={`${ROLE_LABEL[role]}: ${capability.label}`} onChange={() => toggleCapability(role, capability.name)} />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Frame>
            ))}
        </div>
    );
}

function Check({ checked, disabled, muted, label, onChange }: { checked: boolean; disabled?: boolean; muted?: boolean; label: string; onChange: () => void }) {
    return (
        <label className={`perm-check${checked ? ' is-on' : ''}${muted ? ' is-muted' : ''}`} title={muted ? 'Has no effect while the role cannot open the service' : undefined}>
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

type Choice = 'default' | Effect;

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
            {extensions.map((extension) => {
                const service = person.effective.services.includes(extension.id);
                return (
                    <Frame key={extension.id} flush>
                        <div className="ps-table-wrap">
                            <table className="ps-table perm-table perm-table--person">
                                <thead>
                                    <tr>
                                        <th scope="col"><span className="perm-ext"><i className={`bx ${extension.icon}`} aria-hidden="true" />{extension.name}</span></th>
                                        <th scope="col" className="perm-now">Now</th>
                                        <th scope="col">Exception</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="perm-row perm-row--access">
                                        <th scope="row"><strong>Open {extension.name}</strong></th>
                                        <td className="perm-now"><Verdict yes={service} /></td>
                                        <td><Tri value={state.access[extension.id] ?? 'default'} disabled={extension.system && extension.id === 'core'} label={`Open ${extension.name}`}
                                            onChange={(value) => setState((current) => ({ ...current, access: { ...current.access, [extension.id]: value } }))} /></td>
                                    </tr>
                                    {!isAdmin && extension.capabilities.map((capability) => (
                                        <tr key={capability.name} className="perm-row">
                                            <th scope="row"><span className="perm-cap"><span>{capability.label}</span><code className="ps-small ps-muted">{capability.name}</code></span></th>
                                            <td className="perm-now"><Verdict yes={person.effective.capabilities.includes('*') || person.effective.capabilities.includes(capability.name)} /></td>
                                            <td><Tri value={state.capabilities[capability.name] ?? 'default'} label={capability.label}
                                                onChange={(value) => setState((current) => ({ ...current, capabilities: { ...current.capabilities, [capability.name]: value } }))} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Frame>
                );
            })}
        </div>
    );
}

function Verdict({ yes }: { yes: boolean }) {
    return yes ? <span className="perm-verdict is-yes"><i className="bx bx-check" aria-hidden="true" />Yes</span> : <span className="perm-verdict"><i className="bx bx-minus" aria-hidden="true" />No</span>;
}

function Tri({ value, onChange, label, disabled }: { value: Choice; onChange: (value: Choice) => void; label: string; disabled?: boolean }) {
    const options: [Choice, string][] = [['default', 'Role'], ['allow', 'Allow'], ['deny', 'Deny']];
    return (
        <div className="perm-tri" role="radiogroup" aria-label={label}>
            {options.map(([option, text]) => (
                <button key={option} type="button" role="radio" aria-checked={value === option} disabled={disabled}
                    className={`perm-tri__option perm-tri__option--${option}${value === option ? ' is-active' : ''}`} onClick={() => onChange(option)}>{text}</button>
            ))}
        </div>
    );
}
