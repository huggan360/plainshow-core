import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@/i18n';

/*
 * The one list every widget uses.
 *
 * A widget is short, normal or tall, and its body holds that many rows at
 * once (SLOTS). On a computer the list scrolls like the notices on PlainShow
 * Web: the wheel moves exactly one row, rows snap into place, and the rows at
 * the top and bottom of the view take the rounded corners of the box as they
 * scroll. Near the end it asks for more (onEnd). With fewer rows than fit,
 * quiet placeholders keep the shape. On a phone nothing scrolls inside the
 * page: the first rows show, and the last one says how many more there are.
 *
 * Corners are given to the rows that are first and last on screen by class,
 * never by :first-child, so hidden or extra rows cannot break them.
 */
export type Height = 'short' | 'normal' | 'tall';
export const SLOTS: Record<Height, number> = { short: 2, normal: 6, tall: 10 };
const GAP = 3;

export type Row = {
    key: string | number; title: ReactNode; meta?: ReactNode; lead?: ReactNode; trail?: ReactNode; href?: string;
    /** 0 to 100: a bar behind the row, for figures like memory used. */
    fill?: number; tone?: 'red' | 'orange' | 'yellow' | 'green' | 'blue';
};
export type Figure = { label: string; value: ReactNode; tone?: 'warn' | 'alert' | 'good' };

export function useMobile(): boolean {
    const query = '(max-width: 700px)';
    const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const media = window.matchMedia(query);
        const change = () => setMobile(media.matches);
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, []);
    return mobile;
}

/** A body that fills its space with one message, for errors and empty widgets. */
export function Fill({ icon, children }: { icon?: string; children: ReactNode }) {
    return <div className="widget-fill">{icon && <i className={`bx ${icon}`} aria-hidden="true" />}<div>{children}</div></div>;
}

function RowContent({ row }: { row: Row }) {
    return <>
        {row.lead && <span className="widget-row__lead">{row.lead}</span>}
        <span className="widget-row__text"><span className="widget-row__title">{row.title}</span>{row.meta && <span className="widget-row__meta">{row.meta}</span>}</span>
        {row.trail !== undefined && row.trail !== null && <span className="widget-row__trail">{row.trail}</span>}
    </>;
}

function RowItem({ row, className, style }: { row: Row; className: string; style?: CSSProperties }) {
    const filled = row.fill !== undefined;
    const classes = `widget-row ${className}${filled ? ` widget-row--fill widget-row--${row.tone ?? 'orange'}` : ''}`;
    const rowStyle = { ...style, ...(filled ? { '--fill': `${Math.max(0, Math.min(100, row.fill!))}%` } : {}) } as CSSProperties;
    return row.href
        ? <a className={classes} style={rowStyle} href={row.href}><RowContent row={row} /></a>
        : <div className={classes} style={rowStyle}><RowContent row={row} /></div>;
}

function edges(index: number, first: number, last: number, capTop: boolean) {
    return `${index === first && capTop ? ' is-first' : ''}${index === last ? ' is-last' : ''}`;
}

export function List({ height, rows, figures, empty, more, onEnd }: {
    height: Height; rows: Row[]; figures?: Figure[]; empty?: ReactNode;
    /** Where the rest is, for the "more" row on phones. */
    more?: { href: string };
    /** Called when the list is scrolled near its end, to load more rows. */
    onEnd?: () => void;
}) {
    const mobile = useMobile();
    const total = SLOTS[height];
    const hasFigures = !!figures && figures.length > 0;
    const count = total - (hasFigures ? 1 : 0);
    if (!hasFigures && rows.length === 0) return <Fill>{empty ?? t('Nothing yet.')}</Fill>;

    const strip = hasFigures && (
        <div className="widget-figures">
            {figures!.map((figure) => <div key={figure.label} className={figure.tone ? `is-${figure.tone}` : undefined}><strong>{figure.value}</strong><span>{figure.label}</span></div>)}
        </div>
    );

    if (mobile) {
        const overflow = rows.length > count;
        const shown = overflow ? rows.slice(0, count - 1) : rows;
        const items = shown.length + (overflow ? 1 : 0);
        return (
            <div className="widget-list widget-list--static">
                {strip}
                {rows.length === 0
                    ? <div className="widget-row widget-row--empty is-last">{empty ?? t('Nothing yet.')}</div>
                    : shown.map((row, index) => <RowItem key={row.key} row={row} className={edges(index, 0, items - 1, !hasFigures).trim()} />)}
                {overflow && (more
                    ? <a className={`widget-row widget-row--more is-last${shown.length === 0 && !hasFigures ? ' is-first' : ''}`} href={more.href}>{t('{n} more', { n: rows.length - shown.length })}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></a>
                    : <div className="widget-row widget-row--more is-last">{t('{n} more', { n: rows.length - shown.length })}</div>)}
            </div>
        );
    }
    return <ScrollList total={total} count={count} rows={rows} strip={strip} empty={empty} onEnd={onEnd} />;
}

function ScrollList({ total, count, rows, strip, empty, onEnd }: { total: number; count: number; rows: Row[]; strip: ReactNode; empty?: ReactNode; onEnd?: () => void }) {
    const box = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const lock = useRef(false);
    const [rowHeight, setRowHeight] = useState(0);
    const [first, setFirst] = useState(0);
    const step = rowHeight + GAP;

    // Every row, and the strip of figures, is one equal share of the body.
    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const measure = () => setRowHeight(Math.max(0, (element.clientHeight - GAP * (total - 1)) / total));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [total]);

    // The wheel moves one row at a time, as on PlainShow Web.
    useEffect(() => {
        const element = list.current;
        if (!element || !step) return;
        const wheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) < 2 || rows.length <= count) return;
            event.preventDefault();
            if (lock.current) return;
            const current = Math.round(element.scrollTop / step);
            const next = Math.min(rows.length - count, Math.max(0, current + (event.deltaY > 0 ? 1 : -1)));
            if (next === current) { if (event.deltaY > 0) onEnd?.(); return; }
            lock.current = true;
            element.scrollTo({ top: next * step, behavior: 'smooth' });
            window.setTimeout(() => { lock.current = false; }, 220);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [step, rows.length, count, onEnd]);

    const scrolled = () => {
        const element = list.current;
        if (!element || !step) return;
        const next = Math.min(Math.max(0, rows.length - count), Math.max(0, Math.round(element.scrollTop / step)));
        setFirst(next);
        if (next + count >= rows.length - 2) onEnd?.();
    };

    const placeholders = Math.max(0, count - rows.length);
    const lastShown = Math.min(rows.length + placeholders, first + count) - 1;
    const capTop = !strip;
    const style = { '--row': rowHeight ? `${rowHeight}px` : undefined } as CSSProperties;

    return (
        <div ref={box} className="widget-list" style={style}>
            {strip}
            <div ref={list} className="widget-list__scroll" onScroll={scrolled}>
                {rows.length === 0
                    ? <div className="widget-row widget-row--empty is-last" style={{ flexBasis: `calc(var(--row) * ${count} + ${GAP * (count - 1)}px)` }}>{empty ?? t('Nothing yet.')}</div>
                    : rows.map((row, index) => <RowItem key={row.key} row={row} className={edges(index, first, lastShown, capTop).trim()} />)}
                {rows.length > 0 && Array.from({ length: placeholders }, (_, index) => (
                    <div key={`p${index}`} className={`widget-row widget-row--placeholder${rows.length + index === lastShown ? ' is-last' : ''}`} aria-hidden="true" />
                ))}
            </div>
        </div>
    );
}
