import AppShell from '@/Layouts/AppShell';
import { Badge, Frame, FrameHead } from '@/Components/ui';
import { SharedProps } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { ReactNode, useState } from 'react';

type Field = { name: string; type?: string; in?: string; required: boolean; description: string };
type Endpoint = { method: string; path: string; summary: string; description: string; capability: string | null; public: boolean; parameters: Field[]; body: { type: string; fields: Field[] } | null };
type Service = { id: string; name: string; icon: string; description: string; base: string; spec: string; endpoints: Endpoint[] };

export default function ApiDocs({ services }: { services: Service[] }) {
    const { props } = usePage<SharedProps>();
    const content = <Docs services={services} signedIn={!!props.auth.user} />;

    if (props.auth.user) {
        return <AppShell title="API" wide description="Use PlainShow from your own scripts: one address, one token, every service.">{content}</AppShell>;
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
            <nav className="docs__nav" aria-label="Services">
                <a href="#start" className="docs__link">Getting started</a>
                {services.map((service) => <a key={service.id} href={`#${service.id}`} className="docs__link"><i className={`bx ${service.icon}`} aria-hidden="true" />{service.name}</a>)}
            </nav>
            <div className="docs__main">
                <Frame id="start">
                    <FrameHead title="Getting started" />
                    <div className="ps-frame__body docs-prose">
                        <Step n={1} title="Make a token">
                            <p>Open <a href={signedIn ? '/account/tokens' : '/auth/login?return=%2Faccount%2Ftokens'}>Account, API tokens</a>, choose the services it may reach and whether it may only read. It is shown once and lasts 90 days. Revoke it there whenever you like.</p>
                        </Step>
                        <Step n={2} title="Send it with every request">
                            <pre className="docs-code">{'curl https://plainshow.se/api/core/v1/me \\\n  -H "Authorization: Bearer $PLAINSHOW_TOKEN"'}</pre>
                            <p>Every service lives under <code>https://plainshow.se/api/&lt;service&gt;/v1</code>. Calls act as you, with your role and permissions, so a token can never do more than you can.</p>
                        </Step>
                        <Step n={3} title="Read the answers">
                            <p>Answers are JSON. Mistakes come back with a status and a message:</p>
                            <dl className="docs-errors">
                                <div><dt>401</dt><dd>No token, or it expired or was revoked.</dd></div>
                                <div><dt>403</dt><dd>You may not do that, or the token does not reach that service (<code>insufficient_scope</code>) or can only read (<code>read_only</code>).</dd></div>
                                <div><dt>404</dt><dd>Nothing there.</dd></div>
                                <div><dt>422</dt><dd>Something in what you sent is wrong; the message says what.</dd></div>
                                <div><dt>429</dt><dd>More than 120 calls a minute. Wait a little.</dd></div>
                                <div><dt>503</dt><dd>The service is turned off.</dd></div>
                            </dl>
                            <p>Send changes as JSON, or as a form when they include files. Each service also describes itself as OpenAPI, linked below.</p>
                        </Step>
                    </div>
                </Frame>
                {services.map((service) => <ServiceDocs key={service.id} service={service} />)}
            </div>
        </div>
    );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return <section className="docs-step"><span className="docs-step__n">{n}</span><div><h3 className="docs-step__title">{title}</h3>{children}</div></section>;
}

function ServiceDocs({ service }: { service: Service }) {
    return (
        <Frame id={service.id} flush>
            <div className="docs-service__head">
                <span className="docs-service__icon"><i className={`bx ${service.icon}`} aria-hidden="true" /></span>
                <div className="docs-service__text">
                    <h2 className="ps-frame__title">{service.name}</h2>
                    <p className="ps-muted ps-small">{service.description}</p>
                    <code className="docs-service__base">{service.base}</code>
                </div>
                <a className="ps-btn ps-btn--sm" href={service.spec} target="_blank" rel="noreferrer">OpenAPI<i className="bx bx-right-top-arrow-circle" aria-hidden="true" /></a>
            </div>
            <ul className="docs-endpoints">{service.endpoints.map((endpoint) => <EndpointRow key={endpoint.method + endpoint.path} endpoint={endpoint} />)}</ul>
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
                {detail && <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'} docs-endpoint__chevron`} aria-hidden="true" />}
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
