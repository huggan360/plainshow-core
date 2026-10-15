import AppShell from '@/Layouts/AppShell';
import { ButtonLink, Frame } from '@/Components/ui';
import { SharedProps } from '@/types';
import { Head, usePage } from '@inertiajs/react';

export default function Problem({ title, message, status }: { title: string; message?: string | null; status?: number }) {
    const { props } = usePage<SharedProps>();
    const body = (
        <Frame className="problem">
            <p className="ps-eyebrow">{status ? `Error ${status}` : 'PlainShow'}</p>
            <h1 className="ps-title problem__title">{title}</h1>
            {message && <p className="ps-soft">{message}</p>}
            <div className="ps-inline problem__actions">
                <ButtonLink href="/" variant="primary" icon="bx-grid-alt">Dashboard</ButtonLink>
                {!props.auth.user && <a className="ps-btn" href="/auth/login">Sign in again</a>}
            </div>
        </Frame>
    );

    return props.auth.user
        ? <AppShell title={title}>{body}</AppShell>
        : <div className="problem-page"><Head title={title} />{body}</div>;
}
