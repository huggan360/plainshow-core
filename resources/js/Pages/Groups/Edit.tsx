import { Badge, Button, ButtonLink, Field, Frame, FrameHead } from '@/Components/ui';
import AppShell from '@/Layouts/AppShell';
import { router, useForm } from '@inertiajs/react';
import { FormEvent, useMemo, useState } from 'react';
import { Access, ACCESS_LABEL, ColorPicker, Group, GroupMark, MemberAvatar } from './shared';
import { t } from '@/i18n';

type Person = { id: number; name: string; username: string };

/** Change a group: its name and colour, its people and their access, its owner. */
export default function GroupEdit({ group, people, viewerId }: { group: Group; people: Person[]; viewerId: number }) {
    const details = useForm({ name: group.name, color: group.color });
    const [search, setSearch] = useState('');
    const [newOwner, setNewOwner] = useState('');
    const changed = details.data.name !== group.name || details.data.color !== group.color;
    const keep = { preserveScroll: true, preserveState: true };

    const available = useMemo(() => {
        const query = search.trim().toLowerCase();
        return people
            .filter((person) => !group.members.some((member) => member.id === person.id))
            .filter((person) => !query || person.name.toLowerCase().includes(query) || person.username.toLowerCase().includes(query))
            .slice(0, 8);
    }, [people, group.members, search]);

    const save = (event: FormEvent) => { event.preventDefault(); details.put(`/groups/${group.id}`, keep); };
    const add = (person: Person) => router.post(`/groups/${group.id}/members`, { userId: person.id }, { ...keep, onSuccess: () => setSearch('') });
    const remove = (member: Group['members'][number]) => {
        if (window.confirm(t('Remove {name} from {name2}?', { name: member.name, name2: group.name }))) router.delete(`/groups/${group.id}/members/${member.id}`, keep);
    };
    const setAccess = (member: Group['members'][number], permission: Access) => router.put(`/groups/${group.id}/members/${member.id}/latex`, { permission }, keep);
    const transfer = () => {
        const person = group.members.find((member) => String(member.id) === newOwner);
        if (person && window.confirm(t('Make {name} the owner of {name2}? {value}', { name: person.name, name2: group.name, value: group.ownerId === viewerId ? t('You stay a member but can no longer edit the group.') : '' }))) {
            router.put(`/groups/${group.id}/owner`, { userId: person.id }, { preserveScroll: true });
        }
    };
    const destroy = () => {
        if (window.confirm(t('Delete {name}? Everything shared with the group stops being shared with it. This cannot be undone.', { name: group.name }))) router.delete(`/groups/${group.id}`);
    };

    return <AppShell title={t('Edit {name}', { name: group.name })} heading={false}>
        <div className="group-page">
            <ButtonLink href={`/groups/${group.id}`} variant="ghost" size="sm" icon="bx-arrow-back">{t('Back to the group')}</ButtonLink>
            <div className="group-hero">
                <GroupMark group={{ name: details.data.name || group.name, color: details.data.color }} size="lg" />
                <div className="group-hero__text">
                    <h1 className="ps-page-head__title">{t('Edit group')}</h1>
                    <p className="ps-page-head__text">{group.name}</p>
                </div>
                <div className="group-hero__actions"><ButtonLink href={`/groups/${group.id}`} variant="primary" icon="bx-check">{t('Done')}</ButtonLink></div>
            </div>

            <div className="group-edit">
                <Frame>
                    <FrameHead title={t('Name and colour')} />
                    <form className="ps-stack" onSubmit={save}>
                        <Field label={t('Name')} htmlFor="group-name" error={details.errors.name}>
                            <input id="group-name" className="ps-input" value={details.data.name} maxLength={100} onChange={(event) => details.setData('name', event.target.value)} />
                        </Field>
                        <Field label={t('Colour')} error={details.errors.color}><ColorPicker value={details.data.color} onChange={(color) => details.setData('color', color)} /></Field>
                        <div><Button type="submit" variant="primary" loading={details.processing} disabled={!changed || details.data.name.trim().length < 2}>{t('Save')}</Button></div>
                    </form>
                </Frame>

                <Frame>
                    <FrameHead title={t('Add people')} />
                    <div className="ps-input-wrap">
                        <i className="bx bx-search" aria-hidden="true" />
                        <input className="ps-input" placeholder={t('Search by name or username')} value={search} aria-label={t('Search people')} onChange={(event) => setSearch(event.target.value)} />
                    </div>
                    {available.length === 0
                        ? <p className="ps-small ps-muted group-edit__none">{search ? t('Nobody matches.') : t('Everyone is already in this group.')}</p>
                        : <ul className="ps-list group-edit__add">{available.map((person) => (
                            <li key={person.id} className="ps-row">
                                <MemberAvatar member={person} size="xs" />
                                <span className="ps-row__body"><span className="ps-row__title">{person.name}</span><span className="ps-row__meta">@{person.username}</span></span>
                                <Button size="sm" icon="bx-plus" onClick={() => add(person)}>{t('Add')}</Button>
                            </li>
                        ))}</ul>}
                </Frame>

                <Frame className="group-edit__wide">
                    <FrameHead title={t('People ({n})', { n: group.members.length })} text={t('What each person can do with LaTeX projects shared with the group.')} />
                    <ul className="ps-list">
                        {group.members.map((member) => {
                            const isOwner = member.id === group.ownerId;
                            return <li key={member.id} className="ps-row group-member">
                                <MemberAvatar member={member} />
                                <span className="ps-row__body">
                                    <span className="ps-row__title">{member.name}{member.id === viewerId && <span className="ps-muted"> {' '}{t('(you)')}</span>}</span>
                                    <span className="ps-row__meta">@{member.username}</span>
                                </span>
                                <span className="group-member__badges">
                                    {isOwner ? <Badge tone="accent">{t('Owner, can edit')}</Badge> : <>
                                        <select className="ps-select group-member__access" aria-label={t('LaTeX access for {name}', { name: member.name })} value={member.permissions.latex ?? 'none'} onChange={(event) => setAccess(member, event.target.value as Access)}>
                                            {(['none', 'view', 'edit'] as Access[]).map((value) => <option key={value} value={value}>{ACCESS_LABEL[value]}</option>)}
                                        </select>
                                        <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Remove {name}', { name: member.name })} onClick={() => remove(member)} />
                                    </>}
                                </span>
                            </li>;
                        })}
                    </ul>
                </Frame>

                {group.members.length > 1 && <Frame>
                    <FrameHead title={t('Owner')} text={t('The owner can always edit the group.')} />
                    <div className="ps-inline group-edit__row">
                        <select className="ps-select" aria-label={t('New owner')} value={newOwner} onChange={(event) => setNewOwner(event.target.value)}>
                            <option value="">{t('Choose a member')}</option>
                            {group.members.filter((member) => member.id !== group.ownerId && member.status === 'active').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                        <Button disabled={!newOwner} onClick={transfer}>{t('Make owner')}</Button>
                    </div>
                </Frame>}

                <Frame className="group-edit__danger">
                    <FrameHead title={t('Delete the group')} text={t('Projects, files and calendars shared with it stop being shared. People keep their own things.')} />
                    <div><Button variant="danger" icon="bx-trash" onClick={destroy}>{t('Delete group')}</Button></div>
                </Frame>
            </div>
        </div>
    </AppShell>;
}
