import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import type { ComponentType } from 'react';

const pages = import.meta.glob<{ default: ComponentType }>('./Pages/**/*.tsx');

createInertiaApp({
    title: (title) => (title ? `${title} | PlainShow` : 'PlainShow'),
    resolve: async (name) => {
        const page = pages[`./Pages/${name}.tsx`];
        if (!page) throw new Error(`Unknown page: ${name}`);
        return (await page()).default;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
    progress: { color: '#6da7ec', delay: 150 },
});
