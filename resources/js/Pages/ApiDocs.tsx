import AppShell from '@/Layouts/AppShell';
import { Badge, Frame } from '@/Components/ui';
import { SharedProps } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';

type Field = { name: string; type?: string; in?: string; required: boolean; description: string };
type Endpoint = { method: string; path: string; summary: string; description: string; capability: string | null; public: boolean; parameters: Field[]; body: { type: string; fields: Field[] } | null };
type Service = { id: string; name: string; icon: string; description: string; base: string; spec: string; endpoints: Endpoint[] };

export default function ApiDocs({ services }: { services: Service[] }) {
    const { props } = usePage<SharedProps>();
    const content = <Docs services={services} signedIn={!!props.auth.user} />;

    if (props.auth.user) {
        return <AppShell title="API" wide description="Call PlainShow from your own scripts: one address and one token for every service.">{content}</AppShell>;
    }

    return (
        <div className="ps docs-guest">
            <Head title="API" />
            <header className="docs-guest__bar">
                <a href="/" className="ps-brand"><img className="ps-brand__logo" src={`/ui/brand/plainshow-logo.webp?v=${props.uiVersion}`} alt="PlainShow" /></a>
                <a href="/auth/login?return=%2Fapi" className="ps-btn ps-btn--sm ps-btn--primary">Sign in</a>
            </header>
            <main className="ps-content ps-content--wide">
                <div className="ps-page-head"><div><h1 className="ps-page-head__title">API</h1><p className="ps-page-head__text">Use PlainShow from your own scripts: one address, one token, every service.</p></div></div>
                {content}
            </main>
        </div>
    );
}

function Docs({ services, signedIn }: { services: Service[]; signedIn: boolean }) {
    return (
        <div className="docs">
            <Frame>
                <div className="docs-start">
                    <div className="docs-start__steps">
                        <h2 className="ps-frame__title">Getting started</h2>
                        <ol className="docs-steps">
                            <li><strong>Make a token</strong> in <a href={signedIn ? '/account/tokens' : '/auth/login?return=%2Faccount%2Ftokens'}>Account, API tokens</a>. Pick what it reaches; it lasts 90 days.</li>
                            <li><strong>Send it</strong> with every call. Calls act as you, so a token never does more than you can.</li>
                            <li><strong>Read the answer:</strong> JSON, or one of the statuses on the right.</li>
                        </ol>
                        <pre className="docs-code">{'curl https://plainshow.se/api/core/v1/me \
  -H "Authorization: Bearer $PLAINSHOW_TOKEN"'}</pre>
                    </div>
                    <ul className="ps-chain docs-errors">
                        {[['401', 'No token, or it expired or was revoked'], ['403', 'Not allowed, or the token does not reach this'], ['404', 'Nothing there'], ['422', 'Something you sent is wrong'], ['429', 'Over 120 calls a minute'], ['503', 'The service is turned off']].map(([code, text]) => (
                            <li key={code}><code>{code}</code><span>{text}</span></li>
                        ))}
                    </ul>
                </div>
            </Frame>
            {services.map((service) => <ServiceDocs key={service.id} service={service} />)}
        </div>
    );
}

function ServiceDocs({ service }: { service: Service }) {
    const [open, setOpen] = useState(false);
    return (
        <Frame compact id={service.id}>
            <div className="docs-service">
                <span className="service__icon"><i className={`bx ${service.icon}`} aria-hidden="true" /></span>
                <div className="docs-service__text">
                    <strong>{service.name}</strong>
                    <code className="docs-service__base">{service.base}</code>
                </div>
                <a className="ps-btn ps-btn--sm ps-btn--ghost" href={service.spec} target="_blank" rel="noreferrer">OpenAPI</a>
                <button type="button" className="ps-btn ps-btn--sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                    {service.endpoints.length} endpoints<i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'}`} aria-hidden="true" />
                </button>
            </div>
            {open && <ul className="ps-chain docs-endpoints">{service.endpoints.map((endpoint) => <EndpointRow key={endpoint.method + endpoint.path} endpoint={endpoint} />)}</ul>}
        </Frame>
    );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
    const [open, setOpen] = useState(false);
    const detail = endpoint.description || endpoint.parameters.length > 0 || endpoint.body || endpoint.capability;
    return (
        <li className={`docs-endpoint${open ? ' is-open' : ''}`}>
            <button type="button" className="docs-endpoint__row" onClick={() => detail && setOpen((value) => !value)} aria-expanded={detail ? open : undefined} disabled={!detail}>
                <span className={`docs-method docs-method--${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                <code className="docs-endpoint__path">{endpoint.path}</code>
                <span className="docs-endpoint__summary">{endpoint.summary}</span>
                {endpoint.public && <Badge>No token</Badge>}
            </button>
            {open && (
                <div className="docs-endpoint__detail">
                    {endpoint.description && <p>{endpoint.description}</p>}
                    {endpoint.capability && <p className="ps-small ps-muted">Needs <code>{endpoint.capability}</code>.</p>}
                    {endpoint.parameters.length > 0 && <FieldTable title="Parameters" fields={endpoint.parameters} />}
                    {endpoint.body && endpoint.body.fields.length > 0 && <FieldTable title={endpoint.body.type === 'multipart/form-data' ? 'Form fields' : 'Body'} fields={endpoint.body.fields} />}
                </div>
            )}
        </li>
    );
}

function FieldTable({ title, fields }: { title: string; fields: Field[] }) {
    return (
        <div className="docs-fields">
            <h4 className="docs-fields__title">{title}</h4>
            <table className="ps-table">
                <tbody>{fields.map((field) => (
                    <tr key={field.name}>
                        <th scope="row"><code>{field.name}</code>{field.required && <span className="docs-fields__required">required</span>}</th>
                        <td className="ps-muted">{field.in || field.type}</td>
                        <td>{field.description}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}
