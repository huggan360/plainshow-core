import { Link } from '@inertiajs/react';
import { createContext, MouseEvent, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { expandWidget } from './expand';
import { t } from '@/i18n';
import { Fill, Height, SLOTS, useMobile } from './List';
import type { Place } from './Weather';

/* What every widget shares: its saved settings, its data and its frame. */
export type SettingField = {
    name: string; type: 'text' | 'links' | 'choices' | 'toggle' | 'select' | 'place'; label: string; max?: number;
    options?: { value: string; label: string }[]; default?: unknown;
};
export type Border = 'none' | 'orange' | 'sunset' | 'ocean' | 'forest' | 'violet' | 'mono';
export type WidgetDefinition = {
    key: string; extension: string; extensionName: string; id: string; title: string; description?: string; icon: string;
    sizes: string[]; default: string; height?: Height; settings?: SettingField[]; admin: boolean; border?: Border | null;
    /** The smallest size on the grid, and the size it starts at, in columns and rows. */
    min: [number, number]; w: number; h: number;
};
export type Bookmark = { label: string; url: string };
/**
 * A widget on a dashboard. On the desktop it has a place on the grid of
 * twelve columns (x, y) and a size (w, h); on a phone only a height.
 */
export type LayoutItem = {
    key: string; x?: number; y?: number; w?: number; h?: number;
    border?: Border; settings?: { text?: string; links?: Bookmark[]; place?: Place; [name: string]: unknown };
};
/** A phone shows a widget about as wide as four desktop columns. */
export const PHONE_COLUMNS = 4;


/** The placed widget's own size, border and settings, from the saved layout. */
export const WidgetItem = createContext<LayoutItem | null>(null);

/**
 * The widget's size on the grid. Tiny widgets (two or three columns and rows)
 * have no title and show only what matters most.
 */
export function useSize(definition: WidgetDefinition): { w: number; h: number; tiny: boolean } {
    const item = useContext(WidgetItem);
    const w = item?.w ?? definition.w ?? 4;
    const h = item?.h ?? definition.h ?? 4;
    return { w, h, tiny: w * h <= 6 || h <= 1 };
}

export function useSetting<T>(definition: WidgetDefinition, name: string): T {
    const item = useContext(WidgetItem);
    const saved = item?.settings?.[name];
    if (saved !== undefined) return saved as T;
    return definition.settings?.find((field) => field.name === name)?.default as T;
}
/** The old three heights, from the rows a widget has: up to three short, up to five normal, else tall. */
export function useHeight(definition: WidgetDefinition): Height {
    const { h } = useSize(definition);
    return h <= 3 ? 'short' : h <= 5 ? 'normal' : 'tall';
}

export type State<T> = { data: T | null; error: string | null; loading: boolean };

export function useWidgetData<T>(extension: string, id: string, refreshSeconds?: number, query?: Record<string, string | number | undefined>): State<T> {
    const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
    const search = new URLSearchParams(Object.entries(query ?? {}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
    const load = useCallback(async () => {
        try {
            const response = await fetch(`/widgets/${extension}/${id}${search ? `?${search}` : ''}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!response.ok) throw new Error(response.status === 404 ? t('Not available.') : t('Could not load.'));
            setState({ data: (await response.json()) as T, error: null, loading: false });
        } catch (error) {
            setState((current) => ({ ...current, error: error instanceof Error ? error.message : t('Could not load.'), loading: false }));
        }
    }, [extension, id, search]);

    useEffect(() => {
        load();
        if (!refreshSeconds) return;
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshSeconds * 1000);
        return () => window.clearInterval(timer);
    }, [load, refreshSeconds]);

    return state;
}

/** Lists ask for more as they are scrolled: 20 at first, then 15 more at a time, up to 50. */
export function usePaging(): [number, (loaded: number) => void] {
    const [limit, setLimit] = useState(20);
    const more = useCallback((loaded: number) => { if (loaded >= limit && limit < 50) setLimit((current) => Math.min(50, current + 15)); }, [limit]);
    return [limit, more];
}

export function useBorder(fallback?: Border | null): string | undefined {
    const item = useContext(WidgetItem);
    const border = item?.border ?? fallback ?? 'none';
    return border === 'none' ? undefined : border;
}

/** The button in a widget's corner that grows it into its app (Weather, News). */
export function ExpandButton({ href }: { href: string }) {
    const open = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); expandWidget(event.currentTarget.closest('.ps-frame'), href); };
    return <button type="button" className="widget-expand" onClick={open} aria-label={t('Open')} title={t('Open')}><i className="bx bx-expand-alt" aria-hidden="true" /></button>;
}

/** `expand`: the address of the core app this widget opens. */
export function WidgetFrame({ definition, children, action, className = '', expand }: { definition: WidgetDefinition; children: ReactNode; action?: ReactNode; className?: string; expand?: string }) {
    const border = useBorder(definition.border);
    const { tiny } = useSize(definition);
    return (
        <section className={`ps-frame ps-widget${tiny ? ' is-tiny' : ''} ${className}`} data-border={border} aria-label={tiny ? definition.title : undefined}>
            <div className="ps-frame__panel">
                {tiny
                    ? expand && <span className="widget-corner"><ExpandButton href={expand} /></span>
                    : <header className="ps-widget__head">
                        <h2 className="ps-widget__title">{definition.title}</h2>
                        {(action || expand) && <span className="ps-widget__action">{action}{expand && <ExpandButton href={expand} />}</span>}
                    </header>}
                <div className="ps-widget__body">{children}</div>
            </div>
        </section>
    );
}

export function More({ href, children }: { href: string; children: ReactNode }) {
    return /^https?:/.test(href)
        ? <a className="widget-more" href={href}>{children}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></a>
        : <Link className="widget-more" href={href}>{children}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></Link>;
}

/** Loading, failure, or the content, all in the widget's own shape. */
export function Body<T>({ state, height, children }: { state: State<T>; height: Height; children: (data: T) => ReactNode }) {
    const mobile = useMobile();
    if (state.loading && !state.data) {
        const count = mobile ? 3 : Math.min(SLOTS[height], 6);
        return <div className="widget-list widget-list--loading" aria-busy="true">{Array.from({ length: count }, (_, index) => <div key={index} className={`widget-row widget-row--loading${index === 0 ? ' is-first' : ''}${index === count - 1 ? ' is-last' : ''}`} />)}</div>;
    }
    if (state.error && !state.data) return <Fill icon="bx-error-circle">{state.error}</Fill>;
    return <>{children(state.data as T)}</>;
}

