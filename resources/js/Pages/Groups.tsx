import { Avatar, Badge, Button, Field, Frame, Modal } from '@/Components/ui';
import AppShell from '@/Layouts/AppShell';
import { router, useForm } from '@inertiajs/react';
import { FormEvent, useMemo, useState } from 'react';

type Permissions = Record<'files' | 'calendar' | 'latex' | 'albums', 'none' | 'view' | 'edit'>;
type Member = { id: number; name: string; username: string; status: string; permissions: Permissions };
type Group = { id: number; name: string; color: string; ownerId: number; members: Member[] };
type Person = { id: number; name: string; username: string };
type Props = { groups: Group[]; people: Person[]; canCreate: boolean; canManageAll: boolean; viewerId: number };

function MemberRow({ group, member, canManage, viewerId }: { group: Group; member: Member; canManage: boolean; viewerId: number }) {
    const isOwner = member.id === group.ownerId;
    const initials = member.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

    return <li className="ps-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Avatar src={`/avatars/${member.id}`} initials={initials} size="sm" />
        <span className="ps-row__body">
            <span className="ps-row__title">{member.name} {isOwner && <Badge tone="accent">Owner</Badge>} {member.status !== 'active' && <Badge tone="red">Disabled</Badge>}</span>
            <span className="ps-row__meta">@{member.username}</span>
        </span>
        <span className="ps-row__action ps-inline" style={{ flexWrap: 'wrap' }}>
            {!isOwner && canManage && <label className="ps-inline ps-small">LaTeX
                <select className="ps-select" aria-label={`LaTeX access for ${member.name}`} value={member.permissions.latex} onChange={(event) => router.put(`/groups/${group.id}/members/${member.id}/latex`, { permission: event.target.value }, { preserveScroll: true })}>
                    <option value="none">No access</option><option value="view">View</option><option value="edit">Edit</option>
                </select>
            </label>}
            {!isOwner && (canManage || member.id === viewerId) && <Button size="sm" variant="ghost" onClick={() => router.delete(`/groups/${group.id}/members/${member.id}`, { preserveScroll: true })}>{member.id === viewerId ? 'Leave' : 'Remove'}</Button>}
        </span>
    </li>;
}

function GroupDetail({ group, people, canManageAll, viewerId, onDeleted }: { group: Group; people: Person[]; canManageAll: boolean; viewerId: number; onDeleted: () => void }) {
    const canManage = canManageAll || group.ownerId === viewerId;
    const [editing, setEditing] = useState(false);
    const add = useForm({ userId: '' });
    const transfer = useForm({ userId: '' });
    const edit = useForm({ name: group.name, color: group.color });
    const available = people.filter((person) => !group.members.some((member) => member.id === person.id));
    const save = (event: FormEvent) => {
        event.preventDefault();
        edit.put(`/groups/${group.id}`, { preserveScroll: true, onSuccess: () => setEditing(false) });
    };

    return <Frame>
        <div className="groups-detail">
            <div className="groups-detail__head">
                <div className="groups-head"><span className="groups-head__dot" style={{ background: group.color }} /><h2>{group.name}</h2><Badge>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</Badge></div>
                {canManage && <div className="ps-inline">
                    <Button size="sm" icon="bx-edit-alt" onClick={() => setEditing(true)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon="bx-trash" onClick={() => {
                        if (window.confirm(`Delete ${group.name}? Group-based access will end for everyone.`)) router.delete(`/groups/${group.id}`, { preserveScroll: true, onSuccess: onDeleted });
                    }}>Delete</Button>
                </div>}
            </div>
            <ul className="ps-list">{group.members.map((member) => <MemberRow key={member.id} group={group} member={member} canManage={canManage} viewerId={viewerId} />)}</ul>
            {canManage && available.length > 0 && <form className="ps-inline" onSubmit={(event) => { event.preventDefault(); add.post(`/groups/${group.id}/members`, { preserveScroll: true, onSuccess: () => add.reset() }); }}>
                <select className="ps-select" aria-label={`Add person to ${group.name}`} value={add.data.userId} onChange={(event) => add.setData('userId', event.target.value)}>
                    <option value="">Choose a person</option>
                    {available.map((person) => <option key={person.id} value={person.id}>{person.name} (@{person.username})</option>)}
                </select>
                <Button size="sm" variant="primary" onClick={() => add.post(`/groups/${group.id}/members`, { preserveScroll: true, onSuccess: () => add.reset() })}>Add</Button>
                {add.errors.userId && <span role="alert" className="ps-error">{add.errors.userId}</span>}
            </form>}
            {canManage && group.members.length > 1 && <div className="ps-inline" style={{ flexWrap: 'wrap', marginTop: 12 }}>
                <span className="ps-small ps-muted">Transfer ownership</span>
                <select className="ps-select" aria-label={`New owner of ${group.name}`} value={transfer.data.userId} onChange={(event) => transfer.setData('userId', event.target.value)}>
                    <option value="">Choose a member</option>
                    {group.members.filter((member) => member.id !== group.ownerId && member.status === 'active').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
                <Button size="sm" onClick={() => transfer.put(`/groups/${group.id}/owner`, { preserveScroll: true })}>Transfer</Button>
                {transfer.errors.userId && <span role="alert" className="ps-error">{transfer.errors.userId}</span>}
            </div>}
        </div>
        <Modal open={editing} title="Edit group" onClose={() => setEditing(false)} footer={<><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" loading={edit.processing} onClick={save}>Save</Button></>}>
            <form className="ps-stack" onSubmit={save}>
                <Field label="Name" htmlFor="edit-group-name" error={edit.errors.name}><input id="edit-group-name" className="ps-input" value={edit.data.name} onChange={(event) => edit.setData('name', event.target.value)} /></Field>
                <Field label="Color" htmlFor="edit-group-color" error={edit.errors.color}><input id="edit-group-color" type="color" className="groups-color" value={edit.data.color} onChange={(event) => edit.setData('color', event.target.value)} /></Field>
            </form>
        </Modal>
    </Frame>;
}

export default function Groups({ groups, people, canCreate, canManageAll, viewerId }: Props) {
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);
    const form = useForm({ name: '', color: '#fc5000' });
    const create = (event: FormEvent) => {
        event.preventDefault();
        form.post('/groups', { preserveScroll: true, onSuccess: () => { form.reset(); setCreating(false); } });
    };

    return <AppShell title="Groups" description="People you share with" actions={canCreate && <Button variant="primary" icon="bx-plus" onClick={() => setCreating(true)}>New group</Button>}>
        <div className="groups-layout">
            <Frame compact>
                <div className="ps-frame__body">
                    <h2 className="ps-frame__title">Your groups</h2>
                    {groups.length ? <ul className="groups-list">{groups.map((group) => <li key={group.id}>
                        <button type="button" className={`groups-pick${selectedId === group.id ? ' is-active' : ''}`} onClick={() => setSelectedId(group.id)}>
                            <span className="groups-pick__dot" style={{ background: group.color }} /><span className="groups-pick__name">{group.name}</span><span className="groups-pick__count">{group.members.length}</span><i className="bx bx-chevron-right" />
                        </button>
                    </li>)}</ul> : <p className="ps-muted">No groups yet.</p>}
                </div>
            </Frame>
            {selected ? <GroupDetail key={selected.id} group={selected} people={people} canManageAll={canManageAll} viewerId={viewerId} onDeleted={() => setSelectedId(null)} /> : <Frame><p className="ps-muted">Choose a group to see its members.</p></Frame>}
        </div>
        <Modal open={creating} title="New group" onClose={() => setCreating(false)} footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" loading={form.processing} onClick={create}>Create</Button></>}>
            <form className="ps-stack" onSubmit={create}>
                <Field label="Name" htmlFor="group-name" error={form.errors.name}><input id="group-name" className="ps-input" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} /></Field>
                <Field label="Color" htmlFor="group-color" error={form.errors.color}><input id="group-color" type="color" className="groups-color" value={form.data.color} onChange={(event) => form.setData('color', event.target.value)} /></Field>
            </form>
        </Modal>
    </AppShell>;
}
