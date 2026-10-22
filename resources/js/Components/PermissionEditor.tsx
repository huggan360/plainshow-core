import { Frame } from '@/Components/ui';
import { ReactNode } from 'react';

export type PermissionChoice = 'default' | 'allow' | 'deny';
export type PermissionTier = 'user' | 'moderator' | 'admin';
export type PermissionCapability = {
    name: string;
    label: string;
    description: string;
    tier: PermissionTier;
    group: string;
    implies: string[];
};
export type PermissionExtension = {
    id: string;
    name: string;
    icon: string;
    system?: boolean;
    capabilities: PermissionCapability[];
};

const TIERS: Array<{ key: PermissionTier; label: string; text: string }> = [
    { key: 'user', label: 'Common user privileges', text: 'Everyday actions with the lowest level of access.' },
    { key: 'moderator', label: 'Moderator privileges', text: 'Create, edit or manage content beyond ordinary use.' },
    { key: 'admin', label: 'Admin privileges', text: 'Sensitive account, platform or server administration.' },
];

export function capabilitySections(capabilities: PermissionCapability[]) {
    return TIERS.map((tier) => ({
        ...tier,
        groups: Array.from(new Set(capabilities.filter((capability) => capability.tier === tier.key).map((capability) => capability.group || 'General')))
            .map((group) => ({ group, capabilities: capabilities.filter((capability) => capability.tier === tier.key && (capability.group || 'General') === group) })),
    })).filter((tier) => tier.groups.length > 0);
}

export function impliedCapabilities(activeNames: string[], capabilities: PermissionCapability[]): Set<string> {
    const byName = new Map(capabilities.map((capability) => [capability.name, capability]));
    const active = new Set(activeNames);
    const implied = new Set<string>();
    const queue = [...active];
    for (let index = 0; index < queue.length; index += 1) {
        for (const required of byName.get(queue[index])?.implies ?? []) {
            implied.add(required);
            if (!active.has(required)) {
                active.add(required);
                queue.push(required);
            }
        }
    }
    return implied;
}

export function implicationText(name: string, activeNames: string[], capabilities: PermissionCapability[]): string | undefined {
    const labels = capabilities.filter((capability) => activeNames.includes(capability.name) && capability.implies.includes(name)).map((capability) => capability.label);
    return labels.length ? `Included automatically by ${labels.join(' and ')}.` : undefined;
}

export function CapabilityInfo({ capability, implication }: { capability: PermissionCapability; implication?: string }) {
    return <span className="perm-cap">
        <span className="perm-cap__name">{capability.label}<code className="ps-small ps-muted">{capability.name}</code></span>
        <span className="perm-cap__help"><i className="bx bx-info-circle" aria-hidden="true" />{implication ?? capability.description}</span>
    </span>;
}

export function CapabilitySectionRows({ capabilities, columns, render }: { capabilities: PermissionCapability[]; columns: number; render: (capability: PermissionCapability) => ReactNode }) {
    return <>{capabilitySections(capabilities).map((tier) => <tbody key={tier.key} className={`perm-tier perm-tier--${tier.key}`}>
        <tr className="perm-tier__head"><th colSpan={columns}><span>{tier.label}</span><small>{tier.text}</small></th></tr>
        {tier.groups.map(({ group, capabilities: grouped }) => <FragmentRows key={group} group={group} capabilities={grouped} columns={columns} render={render} />)}
    </tbody>)}</>;
}

function FragmentRows({ group, capabilities, columns, render }: { group: string; capabilities: PermissionCapability[]; columns: number; render: (capability: PermissionCapability) => ReactNode }) {
    return <>
        <tr className="perm-group"><th colSpan={columns}>{group}</th></tr>
        {capabilities.map((capability) => render(capability))}
    </>;
}

export function PermissionEditor({ extensions, effectiveServices, effectiveCapabilities, access, capabilities, isAdmin, onAccessChange, onCapabilityChange }: {
    extensions: PermissionExtension[];
    effectiveServices: string[];
    effectiveCapabilities: string[];
    access: Record<string, PermissionChoice>;
    capabilities: Record<string, PermissionChoice>;
    isAdmin?: boolean;
    onAccessChange: (extension: string, value: PermissionChoice) => void;
    onCapabilityChange: (capability: string, value: PermissionChoice) => void;
}) {
    return <>{extensions.map((extension) => {
        const service = effectiveServices.includes(extension.id);
        const activeNames = extension.capabilities.filter((capability) => {
            const choice = capabilities[capability.name] ?? 'default';
            return choice === 'allow' || (choice === 'default' && (effectiveCapabilities.includes('*') || effectiveCapabilities.includes(capability.name)));
        }).map((capability) => capability.name);
        const implied = impliedCapabilities(activeNames, extension.capabilities);
        return <Frame key={extension.id} flush>
            <div className="ps-table-wrap">
                <table className="ps-table perm-table perm-table--person">
                    <thead><tr>
                        <th scope="col"><span className="perm-ext"><i className={`bx ${extension.icon}`} aria-hidden="true" />{extension.name}</span></th>
                        <th scope="col" className="perm-now">Now</th><th scope="col">Exception</th>
                    </tr></thead>
                    <tbody>
                        <tr className="perm-row perm-row--access">
                            <th scope="row"><strong>Open {extension.name}</strong></th>
                            <td className="perm-now"><Verdict yes={service} /></td>
                            <td><PermissionChoiceControl value={access[extension.id] ?? 'default'} disabled={extension.system && extension.id === 'core'} label={`Open ${extension.name}`} onChange={(value) => onAccessChange(extension.id, value)} /></td>
                        </tr>
                    </tbody>
                    {!isAdmin && <CapabilitySectionRows capabilities={extension.capabilities} columns={3} render={(capability) => {
                        const included = implied.has(capability.name);
                        const reason = implicationText(capability.name, activeNames, extension.capabilities);
                        return <tr key={capability.name} className={`perm-row${included ? ' is-implied' : ''}`}>
                            <th scope="row"><CapabilityInfo capability={capability} implication={reason} /></th>
                            <td className="perm-now"><Verdict yes={effectiveCapabilities.includes('*') || effectiveCapabilities.includes(capability.name) || included} /></td>
                            <td><PermissionChoiceControl value={included ? 'allow' : capabilities[capability.name] ?? 'default'} disabled={included} label={capability.label} title={reason} onChange={(value) => onCapabilityChange(capability.name, value)} /></td>
                        </tr>;
                    }} />}
                </table>
            </div>
        </Frame>;
    })}</>;
}

function Verdict({ yes }: { yes: boolean }) {
    return yes ? <span className="perm-verdict is-yes"><i className="bx bx-check" aria-hidden="true" />Yes</span> : <span className="perm-verdict"><i className="bx bx-minus" aria-hidden="true" />No</span>;
}

function PermissionChoiceControl({ value, onChange, label, disabled, title }: { value: PermissionChoice; onChange: (value: PermissionChoice) => void; label: string; disabled?: boolean; title?: string }) {
    const options: [PermissionChoice, string][] = [['default', 'Role'], ['allow', 'Allow'], ['deny', 'Deny']];
    return <div className="perm-tri" role="radiogroup" aria-label={label} title={title}>{options.map(([option, text]) =>
        <button key={option} type="button" role="radio" aria-checked={value === option} disabled={disabled} className={`perm-tri__option perm-tri__option--${option}${value === option ? ' is-active' : ''}`} onClick={() => onChange(option)}>{text}</button>
    )}</div>;
}
