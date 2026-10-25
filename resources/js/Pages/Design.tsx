import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, ButtonLink, Field, Frame, FrameHead, ListRow, Meter, RoleBadge, Switch } from '@/Components/ui';
import { can, SharedProps } from '@/types';
import { Bookmark, Border, LayoutItem, PHONE_COLUMNS, PlacedWidget, SettingField, WidgetDefinition } from '@/Widgets/Widgets';
import { Place, PlaceSearch } from '@/Widgets/Weather';
import { router, usePage } from '@inertiajs/react';
import ReactGridLayout from 'react-grid-layout/legacy';
import type { Layout, ResizeHandleAxis } from 'react-grid-layout/legacy';
import { CSSProperties, memo, Ref, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';

/*
 * The Design studio: the dashboard itself, full size, to arrange.
 *
 * Desktop: widgets sit on the grid of twelve columns and rows of one unit
 * (the same grid as the dashboard). Drag a widget to move it; drag any edge
 * (the orange bars on hover) to size it. It snaps to the grid, never smaller
 * than the widget allows, and stops at its neighbours instead of pushing them.
 *
 * Phone: one column, each widget with its height. Until the phone is changed
 * it follows the desktop (the desktop layout, top to bottom, in one column);
 * once changed it is its own, and the desktop no longer changes it.
 *
 * The bar on top: Desktop or Phone, the widgets by kind, and for admins the
 * dashboard being edited (yours, or a role's default).
 */
type RoleData = { name: string; layout: LayoutItem[]; phone: LayoutItem[]; phoneCustom: boolean; catalogue: WidgetDefinition[]; saved: boolean };
type Props = { layout: LayoutItem[]; phone: LayoutItem[]; phoneCustom: boolean; catalogue: WidgetDefinition[]; customised: boolean; roles: Record<string, RoleData> | null };
type Mode = 'desktop' | 'phone';
type Target = 'me' | string;

const COLS = 12;
const ROW = 96;
const GAP = 16;
// Kept as constants so the grid never sees a new value between drags.
const MARGIN: [number, number] = [GAP, GAP];
const PADDING: [number, number] = [0, 0];
const DESKTOP_HANDLES: ResizeHandleAxis[] = ['n', 'e', 's', 'w'];
const PHONE_HANDLES: ResizeHandleAxis[] = ['n', 's'];

const BORDERS: { value: Border | undefined; label: string }[] = [
    { value: undefined, label: t('Default') }, { value: 'none', label: t('None') }, { value: 'orange', label: t('Theme colour') }, { value: 'sunset', label: t('Sunset') },
    { value: 'ocean', label: t('Ocean') }, { value: 'forest', label: t('Forest') }, { value: 'violet', label: t('Violet') }, { value: 'mono', label: t('Grey') },
];

type View = 'dashboard' | 'theme' | 'tokens';

export default function Design(props: Props) {
    const { props: shared } = usePage<SharedProps>();
    const tokens = can(shared.auth.capabilities, 'core.design.tokens');
    const [view, setView] = useState<View>(() => {
        const hash = window.location.hash;
        return hash === '#theme' ? 'theme' : tokens && hash === '#tokens' ? 'tokens' : 'dashboard';
    });
    const choose = (next: View) => {
        setView(next);
        window.history.replaceState(null, '', next === 'dashboard' ? window.location.pathname : `#${next}`);
    };
    const back = <div className="studio-toolbar"><Button size="sm" variant="ghost" icon="bx-arrow-back" onClick={() => choose('dashboard')}>{t('Dashboard')}</Button></div>;
    return (
        <AppShell title={t('Design')} wide heading={false}>
            {view === 'tokens' ? <>{back}<Tokens /></>
                : view === 'theme' ? <>{back}<ThemeView /></>
                    : <Studio {...props} onTheme={() => choose('theme')} onTokens={tokens ? () => choose('tokens') : undefined} />}
        </AppShell>
    );
}

/* ---------- Layout arithmetic, as App\Support\Dashboard ---------- */

/** The desktop layout in one column: top to bottom, left to right. */
function derivePhone(desktop: LayoutItem[]): LayoutItem[] {
    return [...desktop].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
        .map(({ key, h, border, settings }) => clean({ key, h: Math.min(8, h ?? 4), border, settings }));
}

/** The first place a widget of this size fits, row by row. */
function firstFree(items: LayoutItem[], w: number, h: number): { x: number; y: number } {
    const taken = (x: number, y: number) => items.some((item) => x < (item.x ?? 0) + (item.w ?? 1) && x + w > (item.x ?? 0) && y < (item.y ?? 0) + (item.h ?? 1) && y + h > (item.y ?? 0));
    for (let y = 0; y < 500; y++) for (let x = 0; x + w <= COLS; x++) if (!taken(x, y)) return { x, y };
    return { x: 0, y: 500 };
}

/** Drops empty optional fields so saved layouts stay small. */
function clean(item: LayoutItem): LayoutItem {
    const next: LayoutItem = { key: item.key };
    (['x', 'y', 'w', 'h'] as const).forEach((field) => { if (item[field] !== undefined) next[field] = item[field]; });
    if (item.border) next.border = item.border;
    if (item.settings && Object.keys(item.settings).length) next.settings = item.settings;
    return next;
}

/** What kind of widget it is, for the menus: Dashboard, News, Weather, then each service. */
function category(widget: WidgetDefinition): string {
    if (widget.extension !== 'core') return widget.extensionName;
    if (['weather', 'forecast', 'radar'].includes(widget.id)) return t('Weather');
    if (widget.id.startsWith('news')) return t('News');
    return t('Dashboard');
}

/* ---------- The studio ---------- */

function Studio({ layout, phone, phoneCustom, catalogue, customised, roles, onTheme, onTokens }: Props & { onTheme: () => void; onTokens?: () => void }) {
    const [target, setTarget] = useState<Target>('me');
    const source = target === 'me' ? { layout, phone, phoneCustom, catalogue, saved: customised } : roles![target];
    const [desktop, setDesktop] = useState<LayoutItem[]>(source.layout);
    const [ownPhone, setOwnPhone] = useState<LayoutItem[] | null>(source.phoneCustom ? source.phone : null);
    const [mode, setMode] = useState<Mode>(() => (window.innerWidth <= 700 ? 'phone' : 'desktop'));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const byKey = useMemo(() => new Map(source.catalogue.map((widget) => [widget.key, widget])), [source.catalogue]);
    const phoneItems = ownPhone ?? derivePhone(desktop);
    // On a phone there is only the phone layout to edit.
    const narrow = useNarrow();
    const shown: Mode = narrow ? 'phone' : mode;

    // Switching target, or fresh props after a save, starts from what is stored.
    useEffect(() => {
        setDesktop(source.layout);
        setOwnPhone(source.phoneCustom ? source.phone : null);
        setDirty(false);
        setSelected(null);
    }, [target, source.layout, source.phone, source.phoneCustom]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const changeDesktop = (next: LayoutItem[]) => { setDesktop(next.map(clean)); setDirty(true); };
    // The first change on the phone makes it a layout of its own.
    const changePhone = (next: LayoutItem[]) => { setOwnPhone(next.map(clean)); setDirty(true); };
    const items = shown === 'phone' ? phoneItems : desktop;
    const change = shown === 'phone' ? changePhone : changeDesktop;

    const add = (definition: WidgetDefinition) => {
        if (shown === 'phone') {
            changePhone([...phoneItems, { key: definition.key, h: definition.h }]);
        } else {
            const w = Math.max(definition.min[0], Math.min(COLS, definition.w));
            changeDesktop([...desktop, { key: definition.key, w, h: definition.h, ...firstFree(desktop, w, definition.h) }]);
        }
        setSelected(null);
    };
    const remove = (key: string) => { change(items.filter((item) => item.key !== key)); if (selected === key) setSelected(null); };
    const update = (key: string, patch: Partial<LayoutItem>) => change(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

    const endpoint = target === 'me' ? '/dashboard/layout' : `/dashboard/layout/roles/${target}`;
    const save = () => {
        setSaving(true);
        router.put(endpoint, { widgets: desktop, phone: ownPhone } as unknown as Record<string, string>, { preserveScroll: true, preserveState: true, onSuccess: () => setDirty(false), onFinish: () => setSaving(false) });
    };
    const undo = () => { setDesktop(source.layout); setOwnPhone(source.phoneCustom ? source.phone : null); setDirty(false); };
    const reset = () => {
        const question = target === 'me' ? t('Go back to the default dashboard for your role?') : t('Go back to the built-in default for {role}?', { role: roles?.[target]?.name ?? target });
        if (window.confirm(question)) router.delete(endpoint, { preserveScroll: true, preserveState: true });
    };

    const selectedItem = items.find((item) => item.key === selected);
    const selectedDefinition = selected ? byKey.get(selected) : undefined;
    const placed = new Set(items.map((item) => item.key));

    return (
        <div className="studio">
            <div className="studio-toolbar">
                {!narrow && (
                    <div className="studio-modes" role="tablist" aria-label={t('Layout')}>
                        <button type="button" role="tab" aria-selected={shown === 'desktop'} className={shown === 'desktop' ? 'is-active' : undefined} onClick={() => setMode('desktop')}><i className="bx bx-desktop" aria-hidden="true" /><span>{t('Desktop')}</span></button>
                        <button type="button" role="tab" aria-selected={shown === 'phone'} className={shown === 'phone' ? 'is-active' : undefined} onClick={() => setMode('phone')}><i className="bx bx-mobile" aria-hidden="true" /><span>{t('Phone')}</span></button>
                    </div>
                )}
                <Menus catalogue={source.catalogue} placed={placed} onAdd={add} />
                <span className="studio-toolbar__spacer" />
                {shown === 'phone' && ownPhone && (
                    <button type="button" className="studio-chip" onClick={() => { setOwnPhone(null); setDirty(true); }} title={t('Let the phone follow the desktop again')}>
                        <i className="bx bx-link" aria-hidden="true" />{t('Follow desktop')}
                    </button>
                )}
                {roles && <TargetMenu roles={roles} target={target} onChoose={(next) => {
                    if (dirty && !window.confirm(t('Leave without saving your changes?'))) return;
                    setTarget(next);
                }} />}
                <button type="button" className="studio-chip" onClick={onTheme} title={t('Theme colour, light or dark')}><i className="bx bx-brush" aria-hidden="true" />{t('Theme')}</button>
                {onTokens && <button type="button" className="studio-icon" onClick={onTokens} aria-label={t('Design tokens')} title={t('Design tokens')}><i className="bx bx-palette" /></button>}
                {dirty
                    ? <Button size="sm" variant="ghost" icon="bx-undo" onClick={undo}>{t('Undo')}</Button>
                    : source.saved && <Button size="sm" variant="ghost" icon="bx-reset" onClick={reset}>{t('Reset')}</Button>}
                <Button size="sm" variant="primary" icon="bx-check" onClick={save} loading={saving} disabled={!dirty}>{t('Save')}</Button>
            </div>

            {shown === 'desktop'
                ? <DesktopGrid items={desktop} byKey={byKey} selected={selected} onChange={changeDesktop} onSelect={setSelected} onRemove={remove} />
                : <PhoneColumn items={phoneItems} byKey={byKey} selected={selected} onChange={changePhone} onSelect={setSelected} onRemove={remove} />}

            {selectedItem && selectedDefinition && (
                <WidgetSettings item={selectedItem} definition={selectedDefinition} onChange={(patch) => update(selectedItem.key, patch)} onRemove={() => remove(selectedItem.key)} onClose={() => setSelected(null)} />
            )}
        </div>
    );
}

function useNarrow(): boolean {
    const [narrow, setNarrow] = useState(() => window.innerWidth <= 700);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 700px)');
        const change = () => setNarrow(media.matches);
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, []);
    return narrow;
}

function useOutside(open: boolean, close: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const down = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        document.addEventListener('mousedown', down);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
    }, [open, close]);
    return ref;
}

/** The widgets by kind, each kind a menu. */
function Menus({ catalogue, placed, onAdd }: { catalogue: WidgetDefinition[]; placed: Set<string>; onAdd: (widget: WidgetDefinition) => void }) {
    const [open, setOpen] = useState<string | null>(null);
    const ref = useOutside(open !== null, () => setOpen(null));
    const groups = useMemo(() => {
        const map = new Map<string, WidgetDefinition[]>();
        [t('Dashboard'), t('News'), t('Weather')].forEach((name) => map.set(name, []));
        catalogue.forEach((widget) => map.set(category(widget), [...(map.get(category(widget)) ?? []), widget]));
        return [...map.entries()].filter(([, widgets]) => widgets.length > 0);
    }, [catalogue]);
    return (
        <nav className="studio-menus" ref={ref} aria-label={t('Widgets')}>
            {groups.map(([name, widgets]) => (
                <div key={name} className={`studio-menu${open === name ? ' is-open' : ''}`}>
                    <button type="button" className="studio-menu__button" aria-expanded={open === name} onClick={() => setOpen(open === name ? null : name)}>
                        {name}<i className="bx bx-chevron-down" aria-hidden="true" />
                    </button>
                    {open === name && (
                        <div className="studio-menu__panel" role="menu">
                            {widgets.map((widget) => {
                                const added = placed.has(widget.key);
                                return (
                                    <button key={widget.key} type="button" role="menuitem" className={`studio-pick${added ? ' is-added' : ''}`} disabled={added}
                                        onClick={() => { onAdd(widget); setOpen(null); }}>
                                        <span className="studio-pick__icon"><i className={`bx ${widget.icon}`} aria-hidden="true" /></span>
                                        <span className="studio-pick__text"><strong>{widget.title}{widget.admin && <span className="studio-pick__admin">{t('Admin')}</span>}</strong>{widget.description && <small>{widget.description}</small>}</span>
                                        <i className={`bx ${added ? 'bx-check' : 'bx-plus'} studio-pick__add`} aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </nav>
    );
}

/** For admins: whose dashboard is being edited, yours or a role's default. */
function TargetMenu({ roles, target, onChoose }: { roles: Record<string, RoleData>; target: Target; onChoose: (target: Target) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useOutside(open, () => setOpen(false));
    return (
        <div className={`studio-menu studio-menu--right${open ? ' is-open' : ''}`} ref={ref}>
            <button type="button" className="studio-menu__button" aria-expanded={open} onClick={() => setOpen(!open)}>
                {target === 'me' ? <><i className="bx bx-user" aria-hidden="true" />{t('Your dashboard')}</> : <RoleBadge role={target} name={roles[target]?.name} />}
                <i className="bx bx-chevron-down" aria-hidden="true" />
            </button>
            {open && (
                <div className="studio-menu__panel" role="menu">
                    <button type="button" role="menuitem" className={`studio-target${target === 'me' ? ' is-active' : ''}`} onClick={() => { onChoose('me'); setOpen(false); }}>
                        <i className="bx bx-user" aria-hidden="true" />{t('Your dashboard')}
                    </button>
                    <p className="studio-menu__label">{t('Defaults for roles')}</p>
                    {Object.entries(roles).map(([role, data]) => (
                        <button key={role} type="button" role="menuitem" className={`studio-target${target === role ? ' is-active' : ''}`} onClick={() => { onChoose(role); setOpen(false); }}>
                            <RoleBadge role={role} name={data.name} />{data.saved && <i className="bx bx-check-circle studio-target__saved" title={t('Changed')} aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ---------- The canvas ---------- */

function useWidth(): [Ref<HTMLDivElement>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

/**
 * While an edge is dragged the widget shows a light stand-in (its icon, name
 * and size) that follows the pointer exactly; the real widget is drawn again
 * at its new size when the edge is let go. Redrawing a real widget for every
 * pixel of the drag made it lag behind. The size is written straight into the
 * stand-in, without redrawing anything.
 */
function showSize(...args: unknown[]) {
    const item = args[2] as { w: number; h: number } | null;
    const element = args.find((arg): arg is HTMLElement => arg instanceof HTMLElement);
    // The grid passes the edge being dragged; the label is in the widget around it.
    const label = element?.closest('.react-grid-item')?.querySelector('.studio-stand-in__size');
    if (item && label) label.textContent = `${item.w} × ${item.h}`;
}

/** An orange bar on each edge, shown on hover, to size the widget from that side. */
const handle = (axis: ResizeHandleAxis, ref: Ref<HTMLElement>) => <span ref={ref as Ref<HTMLSpanElement>} className={`studio-handle studio-handle--${axis}`} aria-hidden="true" />;

type Cell = Layout[number];

/**
 * Where everything stands while one widget moves or grows: every other widget
 * keeps the place it had when the move began, unless the moving one covers
 * it; then it steps down just far enough, and those below it after it. So
 * widgets make way, and go back when the way is free again. Nothing is
 * pulled up: an empty row stays where it was left.
 */
function makeWay(origin: Layout, moving: Cell): Layout {
    const overlaps = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const placed: Cell[] = [moving];
    const others = origin.filter((cell) => cell.i !== moving.i).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of others) {
        const next = { ...cell };
        for (let blocker = placed.find((other) => overlaps(next, other)); blocker; blocker = placed.find((other) => overlaps(next, other))) {
            next.y = blocker.y + blocker.h;
        }
        placed.push(next);
    }
    return origin.map((cell) => placed.find((other) => other.i === cell.i)!);
}

type CanvasProps = { items: LayoutItem[]; byKey: Map<string, WidgetDefinition>; selected: string | null; onChange: (items: LayoutItem[]) => void; onSelect: (key: string | null) => void; onRemove: (key: string) => void };

function DesktopGrid({ items, byKey, selected, onChange, onSelect, onRemove }: CanvasProps) {
    const [ref, width] = useWidth();
    const [moving, setMoving] = useState(false);
    // While a widget moves or grows: the places at the start, and where everything stands now (makeWay).
    const origin = useRef<Layout>([]);
    const [live, setLive] = useState<Layout | null>(null);
    const settle = (cell: Cell | null) => (cell ? makeWay(origin.current, cell) : origin.current);
    const known = useMemo(() => items.filter((item) => byKey.has(item.key)), [items, byKey]);
    const grid: Layout = useMemo(() => known.map((item) => {
        const definition = byKey.get(item.key)!;
        return { i: item.key, x: item.x ?? 0, y: item.y ?? 0, w: item.w ?? definition.w, h: item.h ?? definition.h, minW: definition.min[0], minH: definition.min[1], maxW: COLS, maxH: 12 };
    }), [known, byKey]);
    // The grid reports every layout, also unchanged ones; only real moves count.
    const apply = (next: Layout) => {
        let changed = false;
        const updated = items.map((item) => {
            const cell = next.find((entry) => entry.i === item.key);
            if (!cell || (cell.x === item.x && cell.y === item.y && cell.w === item.w && cell.h === item.h)) return item;
            changed = true;
            return { ...item, x: cell.x, y: cell.y, w: cell.w, h: cell.h };
        });
        if (changed) onChange(updated);
    };
    const column = width ? (width - GAP * (COLS - 1)) / COLS : 0;
    return (
        <div ref={ref} className={`studio-canvas${moving ? ' is-moving' : ''}`} style={{ '--col': `${column}px`, '--row': `${ROW}px`, '--gap': `${GAP}px` } as CSSProperties}>
            {known.length === 0 && <div className="studio-empty"><i className="bx bx-grid-alt" aria-hidden="true" /></div>}
            {width > 0 && (
                // Widgets stay where they are put (no compacting); the grid itself never shifts them, makeWay does.
                <ReactGridLayout width={width} layout={live ?? grid} cols={COLS} rowHeight={ROW} margin={MARGIN} containerPadding={PADDING}
                    compactType={null} allowOverlap isResizable isDraggable resizeHandles={DESKTOP_HANDLES} resizeHandle={handle}
                    draggableCancel=".studio-tools,.studio-handle"
                    onDragStart={() => { origin.current = grid; setMoving(true); }}
                    onDrag={(_layout, _old, cell) => setLive(settle(cell))}
                    onDragStop={(_layout, _old, cell) => { setMoving(false); setLive(null); apply(settle(cell)); }}
                    onResizeStart={(...args) => { origin.current = grid; setMoving(true); showSize(...args); }}
                    onResize={(...args) => { showSize(...args); setLive(settle(args[2] as Cell | null)); }}
                    onResizeStop={(_layout, _old, cell) => { setMoving(false); setLive(null); apply(settle(cell)); }}>
                    {known.map((item) => <div key={item.key}><StudioItem item={item} definition={byKey.get(item.key)!} selected={selected === item.key} onSelect={onSelect} onRemove={onRemove} /></div>)}
                </ReactGridLayout>
            )}
        </div>
    );
}

function PhoneColumn({ items, byKey, selected, onChange, onSelect, onRemove }: CanvasProps) {
    const [ref, width] = useWidth();
    const known = useMemo(() => items.filter((item) => byKey.has(item.key)), [items, byKey]);
    const grid: Layout = useMemo(() => {
        let top = 0;
        return known.map((item) => {
            const definition = byKey.get(item.key)!;
            const h = item.h ?? definition.h;
            const cell = { i: item.key, x: 0, y: top, w: 1, h, minW: 1, maxW: 1, minH: definition.min[1], maxH: 12 };
            top += h;
            return cell;
        });
    }, [known, byKey]);
    // Order follows the column; heights follow the edges.
    const apply = (next: Layout) => {
        const ordered = [...next].sort((a, b) => a.y - b.y);
        const updated = ordered.map((cell) => ({ ...known.find((item) => item.key === cell.i)!, h: cell.h }));
        const same = updated.every((item, index) => item.key === known[index]?.key && item.h === (known[index].h ?? byKey.get(item.key)!.h));
        if (!same) onChange(updated);
    };
    return (
        <div className="studio-phone">
            <div className="studio-phone__screen">
              <div ref={ref} className="studio-phone__grid">
                {known.length === 0 && <div className="studio-empty"><i className="bx bx-mobile" aria-hidden="true" /></div>}
                {width > 0 && (
                    <ReactGridLayout width={width} layout={grid} cols={1} rowHeight={ROW} margin={MARGIN} containerPadding={PADDING}
                        compactType="vertical" isResizable isDraggable resizeHandles={PHONE_HANDLES} resizeHandle={handle}
                        draggableCancel=".studio-tools,.studio-handle" onDragStop={apply} onResizeStart={showSize} onResize={showSize} onResizeStop={apply}>
                        {known.map((item) => <div key={item.key}><StudioItem item={{ ...item, w: PHONE_COLUMNS }} definition={byKey.get(item.key)!} selected={selected === item.key} onSelect={onSelect} onRemove={onRemove} /></div>)}
                    </ReactGridLayout>
                )}
              </div>
            </div>
        </div>
    );
}

/** A widget as it will look, with its tools on hover: settings and remove. Only redrawn when its own item changes. */
const StudioItem = memo(function StudioItem({ item, definition, selected, onSelect, onRemove }: { item: LayoutItem; definition: WidgetDefinition; selected: boolean; onSelect: (key: string | null) => void; onRemove: (key: string) => void }) {
    return (
        <div className={`studio-item${selected ? ' is-selected' : ''}`}>
            <div className="studio-tools">
                <button type="button" onClick={() => onSelect(selected ? null : item.key)} aria-label={t('Settings for {title}', { title: definition.title })} title={t('Settings')}><i className="bx bx-slider-alt" /></button>
                <button type="button" onClick={() => onRemove(item.key)} aria-label={t('Remove {title}', { title: definition.title })} title={t('Remove')}><i className="bx bx-x" /></button>
            </div>
            <div className="studio-item__content" inert>
                <PlacedWidget item={item} definition={definition} />
            </div>
            <div className="studio-stand-in" aria-hidden="true">
                <span className="studio-pick__icon"><i className={`bx ${definition.icon}`} /></span>
                <strong>{definition.title}</strong>
                <span className="studio-stand-in__size">{item.w ?? definition.w} × {item.h ?? definition.h}</span>
            </div>
        </div>
    );
}, (before, after) => before.selected === after.selected && before.definition === after.definition && JSON.stringify(before.item) === JSON.stringify(after.item));

/* ---------- A widget's settings, in a drawer ---------- */

function WidgetSettings({ item, definition, onChange, onRemove, onClose }: {
    item: LayoutItem; definition: WidgetDefinition; onChange: (patch: Partial<LayoutItem>) => void; onRemove: () => void; onClose: () => void;
}) {
    const setSetting = (name: string, value: unknown) => onChange({ settings: { ...(item.settings ?? {}), [name]: value } });
    return (
        <aside className="studio-drawer" aria-label={t('Settings for {title}', { title: definition.title })}>
            <header className="studio-drawer__head">
                <span className="studio-pick__icon"><i className={`bx ${definition.icon}`} aria-hidden="true" /></span>
                <h2>{definition.title}</h2>
                <button type="button" className="studio-icon" onClick={onClose} aria-label={t('Close settings')}><i className="bx bx-x" /></button>
            </header>
            <div className="studio-drawer__body">
                <div className="studio-group">
                    <span className="studio-group__label">{t('Border')}</span>
                    <div className="studio-swatches">
                        {BORDERS.map((border) => (
                            <button key={border.label} type="button" className={`studio-swatch studio-swatch--${border.value ?? (definition.border ?? 'none')}${border.value === undefined ? ' studio-swatch--default' : ''}${item.border === border.value ? ' is-active' : ''}`}
                                aria-pressed={item.border === border.value} title={border.label} aria-label={border.label} onClick={() => onChange({ border: border.value })} />
                        ))}
                    </div>
                </div>
                {(definition.settings ?? []).map((field) => <SettingInput key={field.name} field={field} value={item.settings?.[field.name]} onChange={(value) => setSetting(field.name, value)} />)}
            </div>
            <footer className="studio-drawer__foot">
                <Button size="sm" variant="danger" icon="bx-trash" onClick={onRemove}>{t('Remove')}</Button>
                <Button size="sm" onClick={onClose}>{t('Done')}</Button>
            </footer>
        </aside>
    );
}


/**
 * One setting, as a group in the drawer: a choice of a few is a row of
 * segmented buttons, on and off is a switch, several things to show are a
 * list of rows with a switch each.
 */
function SettingInput({ field, value, onChange }: { field: SettingField; value: unknown; onChange: (value: unknown) => void }) {
    const id = `studio-setting-${field.name}`;
    const current = value === undefined ? field.default : value;
    if (field.type === 'toggle') {
        return (
            <div className="studio-group">
                <label className="studio-rows__row is-only" htmlFor={id}>
                    <span>{t(field.label)}</span>
                    <Switch checked={Boolean(current)} onChange={(checked) => onChange(checked)} label={t(field.label)} />
                </label>
            </div>
        );
    }
    if (field.type === 'select') {
        const options = field.options ?? [];
        return (
            <div className="studio-group">
                <span className="studio-group__label">{t(field.label)}</span>
                <div className={`studio-segment${options.length > 3 ? ' is-wrapping' : ''}`} role="radiogroup" aria-label={t(field.label)}>
                    {options.map((option) => {
                        const on = String(current) === option.value;
                        return <button key={option.value} type="button" role="radio" aria-checked={on} className={on ? 'is-on' : undefined} onClick={() => onChange(option.value)}>{t(option.label)}</button>;
                    })}
                </div>
            </div>
        );
    }
    if (field.type === 'text') {
        return (
            <div className="studio-group">
                <label className="studio-group__label" htmlFor={id}>{t(field.label)}</label>
                <textarea id={id} className="ps-textarea" rows={6} maxLength={field.max ?? 2000} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
            </div>
        );
    }
    if (field.type === 'place') {
        const place = value && typeof value === 'object' ? (value as Place) : null;
        return (
            <div className="studio-group">
                <span className="studio-group__label">{t(field.label)}</span>
                {place
                    ? <div className="studio-place"><i className="bx bxs-map" aria-hidden="true" /><span><strong>{place.name}</strong>{place.region && <span className="ps-muted">{place.region}</span>}</span><Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Clear the place')} onClick={() => onChange(undefined)} /></div>
                    : <p className="studio-group__note">{t('Your home place')}</p>}
                <PlaceSearch onPick={(picked) => onChange(picked)} />
            </div>
        );
    }
    if (field.type === 'links') {
        const links = Array.isArray(value) ? (value as Bookmark[]) : [];
        const set = (index: number, patch: Partial<Bookmark>) => onChange(links.map((link, at) => (at === index ? { ...link, ...patch } : link)));
        return (
            <div className="studio-group">
                <span className="studio-group__label">{t(field.label)}</span>
                <div className="studio-links">
                    {links.map((link, index) => (
                        <div key={index} className="studio-links__row">
                            <input className="ps-input" value={t(link.label)} placeholder={t('Name')} aria-label={t('Name')} maxLength={60} onChange={(event) => set(index, { label: event.target.value })} />
                            <input className="ps-input" value={link.url} placeholder="https://" aria-label={t('Address')} type="url" onChange={(event) => set(index, { url: event.target.value })} />
                            <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Remove link')} onClick={() => onChange(links.filter((_, at) => at !== index))} />
                        </div>
                    ))}
                    {links.length < 20 && <Button size="sm" icon="bx-plus" onClick={() => onChange([...links, { label: '', url: '' }])}>{t('Add link')}</Button>}
                </div>
            </div>
        );
    }
    const chosen = Array.isArray(current) ? (current as string[]) : [];
    const options = field.options ?? [];
    return (
        <div className="studio-group">
            <span className="studio-group__label">{t(field.label)}</span>
            <div className="studio-rows">
                {options.map((option, index) => (
                    <label key={option.value} className={`studio-rows__row${index === 0 ? ' is-first' : ''}${index === options.length - 1 ? ' is-last' : ''}`}>
                        <span>{t(option.label)}</span>
                        <Switch checked={chosen.includes(option.value)} label={t(option.label)}
                            onChange={(on) => onChange(on ? [...chosen, option.value] : chosen.filter((entry) => entry !== option.value))} />
                    </label>
                ))}
            </div>
        </div>
    );
}

/* ---------- Tokens: type, colour and boxes ---------- */

const SCALE: [string, string, string][] = [
    ['3xl', '36 px', t('Greeting and hero titles')], ['2xl', '28 px', t('Page titles')], ['xl', '22 px', t('Section titles')],
    ['lg', '17.5 px', t('Lead text and reading')], ['md', '15.5 px', t('Body')], ['sm', '13.5 px', t('Secondary text, tables')], ['xs', '12 px', t('Captions and meta')],
];
/* ---------- Theme: the colour and light or dark, for every PlainShow app ---------- */
const ACCENTS: { id: string; name: string }[] = [
    { id: 'orange', name: t('Orange') }, { id: 'teal', name: t('Teal') }, { id: 'indigo', name: t('Indigo') }, { id: 'red', name: t('Red') }, { id: 'yellow', name: t('Yellow') },
];

function ThemeView() {
    const { props } = usePage<SharedProps>();
    const [accent, setAccent] = useState(props.accent || 'orange');
    const [mode, setMode] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
    const [saving, setSaving] = useState(false);

    // The colour shows at once; the account and every PlainShow site follow when it is saved.
    const chooseAccent = (next: string) => {
        if (next === accent) return;
        setAccent(next);
        if (next === 'orange') document.documentElement.removeAttribute('data-accent');
        else document.documentElement.setAttribute('data-accent', next);
        setSaving(true);
        router.put('/design/theme', { accent: next }, { preserveScroll: true, preserveState: true, onFinish: () => setSaving(false) });
    };
    const chooseMode = (next: string) => {
        setMode(next);
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('plainshow-theme', next); } catch { /* private mode */ }
    };

    return (
        <div className="theme-studio">
            <div className="ps-page-head ps-page-head--gradient">
                <div>
                    <h1 className="ps-page-head__title">{t('Theme')}</h1>
                    <p className="ps-page-head__text">{t('Your colour on every PlainShow app: buttons, links, rings, gradients, the logo and the light behind the page. It follows your account to your other computers and phones.')}</p>
                </div>
            </div>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Colour')}{saving && <i className="bx bx-loader-alt bx-spin theme-studio__saving" aria-label={t('Saving')} />}</h2>
                <div className="theme-choices" role="radiogroup" aria-label={t('Colour')}>
                    {ACCENTS.map((item) => (
                        <button key={item.id} type="button" role="radio" aria-checked={accent === item.id} data-accent={item.id} data-theme={mode}
                            className={`theme-choice${accent === item.id ? ' is-active' : ''}`} onClick={() => chooseAccent(item.id)}>
                            <span className="theme-choice__panel">
                                <img src="/ui/brand/plainshow-logo.webp" alt="" className="theme-choice__logo" />
                                <span className="theme-choice__swatches" aria-hidden="true"><span /><span /><span /><span /></span>
                                <span className="ps-btn ps-btn--primary ps-btn--sm" aria-hidden="true">{t('Save')}</span>
                            </span>
                            <span className="theme-choice__name">{accent === item.id && <i className="bx bx-check" aria-hidden="true" />}{item.name}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Light or dark')}</h2>
                <div className="studio-modes theme-modes" role="radiogroup" aria-label={t('Light or dark')}>
                    <button type="button" role="radio" aria-checked={mode === 'light'} className={mode === 'light' ? 'is-active' : undefined} onClick={() => chooseMode('light')}><i className="bx bx-sun" aria-hidden="true" /><span>{t('Light')}</span></button>
                    <button type="button" role="radio" aria-checked={mode === 'dark'} className={mode === 'dark' ? 'is-active' : undefined} onClick={() => chooseMode('dark')}><i className="bx bx-moon" aria-hidden="true" /><span>{t('Dark')}</span></button>
                </div>
                <p className="ps-muted design-section__text">{t('Light or dark is kept on each device.')}</p>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Preview')}</h2>
                <div className="ps-frames">
                    <Frame variant="gradient">
                        <FrameHead title={t('A frame with the gradient')} text={t('For emphasis only: an update, an alert, the active item.')} />
                        <div className="ps-stack ps-frame__body">
                            <div className="ps-inline"><Button variant="primary">{t('Primary')}</Button><Button>{t('Secondary')}</Button><a className="theme-studio__link" href="#theme">{t('A link')}</a></div>
                            <Meter value={64} label={t('Example')} />
                        </div>
                    </Frame>
                    <Frame glow="accent">
                        <FrameHead title={t('Your picture')} text={t('The ring around profile pictures takes the colour too.')} />
                        <div className="ps-inline ps-frame__body"><Avatar src={props.auth.user?.avatar} initials={props.auth.user?.initials ?? "?"} size="xl" /><span className="ps-gradient-text theme-studio__word">{t('PlainShow')}</span></div>
                    </Frame>
                </div>
            </section>
        </div>
    );
}

const COLOURS: [string, string][] = [
    ['--ps-accent', t('Theme colour')], ['--ps-bg', t('Page')], ['--ps-shell', t('Shell')], ['--ps-panel', t('Panel')], ['--ps-raised', t('Raised')],
    ['--ps-text-strong', t('Titles')], ['--ps-text', t('Text')], ['--ps-text-soft', t('Soft')], ['--ps-text-muted', t('Muted')], ['--ps-text-faint', t('Faint')], ['--ps-green', t('Green')], ['--ps-amber', t('Amber')], ['--ps-red', t('Red')], ['--ps-blue', t('Blue')], ['--ps-violet', t('Violet')],
];

function Tokens() {
    const { props } = usePage<SharedProps>();
    const user = props.auth.user!;
    const [switchOn, setSwitchOn] = useState(true);

    return (
        <>
            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Typefaces')}</h2>
                <div className="ps-frames">
                    <Frame glow="accent">
                        <div className="design-type" style={{ fontFamily: 'var(--ps-font-text)' }}>
                            <span className="ps-eyebrow">{t('All text')}</span>
                            <p className="design-type__name">{t('Outfit')}</p>
                            <p className="design-type__big">{t('Hand off the work. Keep the craft.')}</p>
                            <p className="ps-soft">{t('Inlägg, gallerier och dokument. The quick brown fox jumps over the lazy dog. 0123456789')}</p>
                            <div className="ps-inline"><span className="design-type__w400">{t('Regular')}</span><span className="design-type__w500">{t('Medium')}</span><span className="design-type__w600">{t('Semibold')}</span></div>
                        </div>
                    </Frame>
                    <Frame glow="warm">
                        <div className="design-type" style={{ fontFamily: 'var(--ps-font-title)' }}>
                            <span className="ps-eyebrow">{t('Titles and reading')}</span>
                            <p className="design-type__name">{t('Bree Serif')}</p>
                            <p className="design-type__display">{t('Do more with PlainShow, everywhere you work')}</p>
                            <p className="design-type__body ps-reading">{t('En vecka på Bali började med regn och slutade med solnedgångar över Uluwatu. Blog posts read in this face.')}</p>
                        </div>
                    </Frame>
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Type scale')}</h2>
                <Frame>
                    <ul className="ps-list design-scale">
                        {SCALE.map(([name, size, use]) => (
                            <li key={name} className="design-scale__row">
                                <code className="design-scale__token">--ps-text-{name}</code>
                                <span className={`ps-text-${name} design-scale__sample${['3xl', '2xl', 'xl'].includes(name) ? ' design-scale__sample--title' : ''}`}>{use}</span>
                                <span className="ps-small ps-muted">{size}</span>
                            </li>
                        ))}
                    </ul>
                </Frame>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Colours')}</h2>
                <div className="design-colours">
                    {COLOURS.map(([token, label]) => (
                        <div key={token} className="design-colour">
                            <span className="design-colour__chip" style={{ background: `var(${token})` }} />
                            <span><strong>{label}</strong><code className="ps-small ps-muted">{token}</code></span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Boxes')}</h2>
                <p className="ps-muted design-section__text">{t('Outer radius 28 px, padding 10 px, inner radius 18 px, so the corners stay concentric.')}</p>
                <div className="ps-frames">
                    <Frame glow="green">
                        <FrameHead title={t('Services')} text={t('Open any PlainShow service with the same account.')} />
                        <ul className="ps-list ps-frame__body">
                            <ListRow icon="bx-news" title={t('Blog')} action={<Button size="sm">{t('Open')}{' '}<i className="bx bx-right-top-arrow-circle" /></Button>} />
                            <ListRow icon="bx-code-curly" title={t('LaTeX')} action={<Button size="sm">{t('Open')}{' '}<i className="bx bx-right-top-arrow-circle" /></Button>} />
                            <ListRow icon="bx-server" title={<>{t('Web')}{' '}<Badge tone="accent">{t('Admin')}</Badge></>} action={<Button size="sm">{t('Open')}{' '}<i className="bx bx-right-top-arrow-circle" /></Button>} />
                        </ul>
                    </Frame>
                    <Frame variant="gradient">
                        <FrameHead title={t('Gradient frame')} text={t('For emphasis only: an update, an alert, the active item.')} />
                        <div className="ps-stack ps-frame__body">
                            <div className="ps-frames">
                                <div className="ps-metric ps-metric--blue"><div className="ps-metric__label">{t('Posts')}</div><div className="ps-metric__value">128</div></div>
                                <div className="ps-metric ps-metric--green"><div className="ps-metric__label">{t('Online')}</div><div className="ps-metric__value">5</div></div>
                            </div>
                            <Meter value={64} label={t('Example')} />
                        </div>
                    </Frame>
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">{t('Components')}</h2>
                <div className="ps-frames">
                    <Frame>
                        <FrameHead title={t('Buttons and badges')} />
                        <div className="ps-stack ps-frame__body">
                            <div className="ps-inline"><Button variant="primary">{t('Primary')}</Button><Button>{t('Secondary')}</Button><Button variant="ghost">{t('Ghost')}</Button><Button variant="danger">{t('Danger')}</Button><Button variant="gradient">{t('Highlight')}</Button></div>
                            <div className="ps-inline"><Button size="sm" icon="bx-plus">{t('Small')}</Button><Button iconOnly icon="bx-cog" aria-label={t('Settings')} /><Button loading>{t('Saving')}</Button></div>
                            <div className="ps-inline"><Badge>{t('Neutral')}</Badge><Badge tone="accent">{t('Beta')}</Badge><Badge tone="green">{t('Online')}</Badge><Badge tone="amber">{t('Moderator')}</Badge><Badge tone="red">{t('Admin')}</Badge><Badge tone="violet">{t('New')}</Badge><Badge tone="warm">{t('Blog')}</Badge></div>
                        </div>
                    </Frame>
                    <Frame>
                        <FrameHead title={t('Form')} />
                        <div className="ps-frame__body">
                            <Field label={t('Title')} htmlFor="d-title"><input id="d-title" className="ps-input" placeholder={t('A week in Bali')} /></Field>
                            <Field label={t('With an error')} htmlFor="d-error" error={t('This field is required.')}><input id="d-error" className="ps-input" aria-invalid="true" /></Field>
                            <div className="ps-between"><label className="ps-check"><input type="checkbox" defaultChecked /> {' '}{t('Keep me signed in')}</label><Switch checked={switchOn} onChange={setSwitchOn} label={t('Example switch')} /></div>
                        </div>
                    </Frame>
                    <Frame glow="warm" className="ps-span-all">
                        <FrameHead title={t('Account menu and avatars')} text={t('Kept from the blog.')} />
                        <div className="design-account ps-frame__body">
                            <nav className="ps-account-menu">
                                <span className="ps-account-menu__item is-active"><i className="bx bx-user" />{t('Profile')}</span>
                                <span className="ps-account-menu__item"><i className="bx bx-shield-quarter" />{t('Security')}</span>
                            </nav>
                            <div className="ps-inline"><Avatar src={user.avatar} initials={user.initials} size="xl" /><Avatar initials="HH" size="lg" /><Avatar initials="AB" /><Avatar initials="CD" size="sm" presence /></div>
                        </div>
                    </Frame>
                </div>
            </section>
            <p className="ps-small ps-muted"><ButtonLink href="/" size="sm" icon="bx-grid-alt">{t('Back to the dashboard')}</ButtonLink></p>
        </>
    );
}
