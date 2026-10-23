import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, ButtonLink, Empty, Field, Frame, FrameHead, ListRow, Meter, Switch } from '@/Components/ui';
import { can, SharedProps } from '@/types';
import { Bookmark, Border, Height, LayoutItem, PlacedWidget, SettingField, WidgetDefinition } from '@/Widgets/Widgets';
import { Place, PlaceSearch } from '@/Widgets/Weather';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { router, usePage } from '@inertiajs/react';
import { createContext, CSSProperties, KeyboardEvent, PointerEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';

type RoleData = { name: string; layout: LayoutItem[]; catalogue: WidgetDefinition[]; saved: boolean };
type Props = { layout: LayoutItem[]; catalogue: WidgetDefinition[]; customised: boolean; roles: Record<string, RoleData> | null };
type Target = 'me' | RoleName;
type RoleName = string;
type Width = 'desktop' | 'tablet' | 'phone';

const WIDTHS: Record<Width, { px: number; label: string; icon: string }> = {
    desktop: { px: 1180, label: t('Desktop'), icon: 'bx-desktop' },
    tablet: { px: 820, label: t('Tablet'), icon: 'bx-tab' },
    phone: { px: 390, label: t('Phone'), icon: 'bx-mobile' },
};
const SIZE_LABELS: Record<string, string> = { s: t('Small'), m: t('Medium'), l: t('Large'), xl: t('Wide'), full: t('Full width') };
const HEIGHTS: { value: Height; label: string }[] = [{ value: 'short', label: t('Short') }, { value: 'normal', label: t('Normal') }, { value: 'tall', label: t('Tall') }];
const BORDERS: { value: Border | undefined; label: string }[] = [
    { value: undefined, label: t('Default') }, { value: 'none', label: t('None') }, { value: 'orange', label: t('Orange') }, { value: 'sunset', label: t('Sunset') },
    { value: 'ocean', label: t('Ocean') }, { value: 'forest', label: t('Forest') }, { value: 'violet', label: t('Violet') }, { value: 'mono', label: t('Grey') },
];
/** How far the preview is scaled down, so dragged widgets follow the pointer. */
const ZoomContext = createContext(1);
export default function Design(props: Props) {
    const { props: shared } = usePage<SharedProps>();
    const tokens = can(shared.auth.capabilities, 'core.design.tokens');
    const [tab, setTab] = useState<'dashboard' | 'tokens'>(() => (tokens && window.location.hash === '#tokens' ? 'tokens' : 'dashboard'));
    const choose = (next: 'dashboard' | 'tokens') => {
        setTab(next);
        window.history.replaceState(null, '', next === 'tokens' ? '#tokens' : window.location.pathname);
    };

    return (
        <AppShell title={t('Design')} wide description={tokens ? t('Arrange your dashboard, and see the type, colours and boxes every page is built from.') : t('Arrange your dashboard: drag widgets into place, size them and change their settings.')}
            actions={tokens && <div className="ps-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'dashboard'} className={`ps-tab${tab === 'dashboard' ? ' is-active' : ''}`} onClick={() => choose('dashboard')}>{t('Dashboard')}</button>
                <button type="button" role="tab" aria-selected={tab === 'tokens'} className={`ps-tab${tab === 'tokens' ? ' is-active' : ''}`} onClick={() => choose('tokens')}>{t('Tokens')}</button>
            </div>}>
            {tab === 'dashboard' ? <Studio {...props} /> : <Tokens />}
        </AppShell>
    );
}

/* ---------- Dashboard studio ---------- */

function Studio({ layout, catalogue, customised, roles }: Props) {
    const [target, setTarget] = useState<Target>('me');
    const source = target === 'me' ? { layout, catalogue, saved: customised } : roles![target];
    const [items, setItems] = useState<LayoutItem[]>(source.layout);
    const [dirty, setDirty] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [width, setWidth] = useState<Width>(() => (window.innerWidth < 700 ? 'phone' : 'desktop'));
    const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
    const [saving, setSaving] = useState(false);
    const byKey = useMemo(() => new Map(source.catalogue.map((widget) => [widget.key, widget])), [source.catalogue]);

    // Switching target, or fresh props after a save, starts from what is stored.
    useEffect(() => { setItems(source.layout); setDirty(false); setSelected(null); }, [target, source.layout]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const change = (next: LayoutItem[]) => { setItems(next); setDirty(true); };
    const update = (key: string, patch: Partial<LayoutItem>) => change(items.map((item) => (item.key === key ? clean({ ...item, ...patch }) : item)));
    const remove = (key: string) => { change(items.filter((item) => item.key !== key)); if (selected === key) setSelected(null); };
    const add = (definition: WidgetDefinition) => {
        change([...items, { key: definition.key, size: definition.sizes.includes(definition.default) ? definition.default : definition.sizes[0], height: definition.height ?? 'normal' }]);
        setSelected(definition.key);
    };

    const endpoint = target === 'me' ? '/dashboard/layout' : `/dashboard/layout/roles/${target}`;
    const save = () => {
        setSaving(true);
        router.put(endpoint, { widgets: items } as unknown as Record<string, string>, { preserveScroll: true, preserveState: true, onSuccess: () => setDirty(false), onFinish: () => setSaving(false) });
    };
    const reset = () => {
        const question = target === 'me' ? 'Go back to the default dashboard for your role?' : `Go back to the built-in default for ${roles?.[target]?.name ?? target}?`;
        if (window.confirm(question)) router.delete(endpoint, { preserveScroll: true, preserveState: true });
    };

    const selectedItem = items.find((item) => item.key === selected);
    const selectedDefinition = selected ? byKey.get(selected) : undefined;

    return (
        <div className="studio">
            <div className="studio-bar">
                {roles && (
                    <label className="studio-bar__target">
                        <span className="ps-sr-only">{t('Dashboard to edit')}</span>
                        <select className="ps-select" value={target} onChange={(event) => {
                            if (dirty && !window.confirm(t('Leave without saving your changes?'))) return;
                            setTarget(event.target.value as Target);
                        }}>
                            <option value="me">{t('Your dashboard')}</option>
                            {Object.entries(roles).map(([role, data]) => <option key={role} value={role}>{t('Default for')}{' '}{data.name}</option>)}
                        </select>
                    </label>
                )}
                <div className="ps-tabs studio-bar__group" aria-label={t('Preview width')}>
                    {(Object.keys(WIDTHS) as Width[]).map((key) => (
                        <button key={key} type="button" className={`ps-tab${width === key ? ' is-active' : ''}`} aria-pressed={width === key} onClick={() => setWidth(key)} title={WIDTHS[key].label}>
                            <i className={`bx ${WIDTHS[key].icon}`} aria-hidden="true" /><span className="studio-bar__label">{WIDTHS[key].label}</span>
                        </button>
                    ))}
                </div>
                <div className="ps-tabs studio-bar__group" aria-label={t('Preview theme')}>
                    <button type="button" className={`ps-tab${theme === 'dark' ? ' is-active' : ''}`} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} title={t('Dark')}><i className="bx bx-moon" aria-hidden="true" /><span className="studio-bar__label">{t('Dark')}</span></button>
                    <button type="button" className={`ps-tab${theme === 'light' ? ' is-active' : ''}`} aria-pressed={theme === 'light'} onClick={() => setTheme('light')} title={t('Light')}><i className="bx bx-sun" aria-hidden="true" /><span className="studio-bar__label">{t('Light')}</span></button>
                </div>
                <span className="studio-bar__spacer" />
                {dirty && <span className="ps-small ps-muted">{t('Unsaved changes')}</span>}
                {(source.saved || dirty) && <Button size="sm" variant="ghost" icon="bx-reset" onClick={dirty ? () => { setItems(source.layout); setDirty(false); } : reset}>{dirty ? t('Undo') : t('Reset')}</Button>}
                <Button size="sm" variant="primary" icon="bx-check" onClick={save} loading={saving} disabled={!dirty}>{t('Save')}</Button>
            </div>

            <div className="studio-body">
                <Canvas width={width} theme={theme}>
                    {items.length === 0
                        ? <Empty icon="bx-grid-alt">{t('Add widgets from the list.')}</Empty>
                        : <SortableGrid items={items} onMove={change}>
                            {items.map((item) => {
                                const definition = byKey.get(item.key);
                                return definition ? (
                                    <SortableWidget key={item.key} item={item} definition={definition} selected={selected === item.key}
                                        onSelect={() => setSelected(selected === item.key ? null : item.key)} onRemove={() => remove(item.key)}
                                        onSize={(size) => update(item.key, { size })} />
                                ) : null;
                            })}
                        </SortableGrid>}
                </Canvas>

                <aside className="studio-panel">
                    {selectedItem && selectedDefinition
                        ? <WidgetSettings item={selectedItem} definition={selectedDefinition} onChange={(patch) => update(selectedItem.key, patch)} onRemove={() => remove(selectedItem.key)} onClose={() => setSelected(null)} />
                        : <Gallery catalogue={source.catalogue} placed={new Set(items.map((item) => item.key))} onAdd={add} />}
                </aside>
            </div>
        </div>
    );
}

/** Drops empty optional fields so saved layouts stay small. */
function clean(item: LayoutItem): LayoutItem {
    const next: LayoutItem = { key: item.key, size: item.size, height: item.height };
    if (item.border) next.border = item.border;
    if (item.settings && Object.keys(item.settings).length) next.settings = item.settings;
    return next;
}

/** The preview, laid out at the chosen device width and scaled to fit. */
function Canvas({ width, theme, children }: { width: Width; theme: 'dark' | 'light'; children: ReactNode }) {
    const outer = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState(0);
    useEffect(() => {
        const element = outer.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const px = WIDTHS[width].px;
    const zoom = available > 0 ? Math.min(1, available / px) : 1;

    return (
        <div className="studio-stage" ref={outer}>
            <div className="studio-canvas" data-theme={theme} data-width={width} style={{ width: px, zoom }}>
                <ZoomContext.Provider value={zoom}>{children}</ZoomContext.Provider>
            </div>
        </div>
    );
}

function SortableGrid({ items, onMove, children }: { items: LayoutItem[]; onMove: (items: LayoutItem[]) => void; children: ReactNode }) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = items.findIndex((item) => item.key === active.id);
        const to = items.findIndex((item) => item.key === over.id);
        if (from >= 0 && to >= 0) onMove(arrayMove(items, from, to));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((item) => item.key)} strategy={rectSortingStrategy}>
                <div className="ps-widget-grid">{children}</div>
            </SortableContext>
        </DndContext>
    );
}

function SortableWidget({ item, definition, selected, onSelect, onRemove, onSize }: {
    item: LayoutItem; definition: WidgetDefinition; selected: boolean; onSelect: () => void; onRemove: () => void; onSize: (size: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
    // Movement is measured on screen; the canvas may be zoomed, so undo that.
    const zoom = useContext(ZoomContext);
    const style: CSSProperties = {
        transform: transform ? `translate3d(${transform.x / zoom}px, ${transform.y / zoom}px, 0)` : undefined,
        transition,
    };
    const stop = { onPointerDown: (event: PointerEvent) => event.stopPropagation(), onKeyDown: (event: KeyboardEvent) => event.stopPropagation() };

    return (
        <div ref={setNodeRef} data-size={item.size} data-height={item.height ?? definition.height ?? 'normal'} style={style} className={`studio-widget${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
            {...attributes} {...listeners} aria-label={t('{title}, {value}. Drag to move, Enter to edit.', { title: definition.title, value: SIZE_LABELS[item.size] })}
            onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(); listeners?.onKeyDown?.(event); }}>
            <div className="studio-widget__tools" {...stop}>
                <span className="studio-widget__grip" aria-hidden="true"><i className="bx bx-grid-vertical" /></span>
                <select className="studio-widget__size" value={item.size} onChange={(event) => onSize(event.target.value)} onClick={(event) => event.stopPropagation()} aria-label={t('Size')}>
                    {definition.sizes.map((size) => <option key={size} value={size}>{SIZE_LABELS[size] ?? size}</option>)}
                </select>
                <button type="button" className="studio-widget__tool" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={t('Settings')} title={t('Settings')}><i className="bx bx-slider-alt" /></button>
                <button type="button" className="studio-widget__tool" onClick={(event) => { event.stopPropagation(); onRemove(); }} aria-label={t('Remove')} title={t('Remove')}><i className="bx bx-x" /></button>
            </div>
            <div className="studio-widget__content" inert>
                <PlacedWidget item={item} definition={definition} />
            </div>
        </div>
    );
}

function Gallery({ catalogue, placed, onAdd }: { catalogue: WidgetDefinition[]; placed: Set<string>; onAdd: (definition: WidgetDefinition) => void }) {
    const groups = useMemo(() => {
        const map = new Map<string, WidgetDefinition[]>();
        catalogue.forEach((widget) => map.set(widget.extensionName, [...(map.get(widget.extensionName) ?? []), widget]));
        return [...map.entries()];
    }, [catalogue]);

    return (
        <Frame compact>
            <div className="studio-gallery__head">
                <h2 className="ps-frame__title">{t('Widgets')}</h2>
                <p className="ps-small ps-muted">{t('Click one on the dashboard to change it; drag to move.')}</p>
            </div>
            <div className="studio-gallery">
                {groups.map(([name, widgets]) => (
                    <section key={name} className="studio-gallery__group">
                        <h3 className="studio-gallery__name">{name}</h3>
                        <ul className="ps-chain">
                            {widgets.map((widget) => {
                                const added = placed.has(widget.key);
                                return (
                                    <li key={widget.key}>
                                        <button type="button" className={`studio-pick${added ? ' is-added' : ''}`} disabled={added} onClick={() => onAdd(widget)} title={t(widget.description)} aria-label={added ? t('{title} is on the dashboard', { title: widget.title }) : t('Add {title}', { title: widget.title })}>
                                            <span className="studio-pick__name">{t(widget.title)}{widget.admin && <span className="studio-pick__admin">{t('Admin')}</span>}</span>
                                            <i className={`bx ${added ? 'bx-check' : 'bx-plus'}`} aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </Frame>
    );
}

function WidgetSettings({ item, definition, onChange, onRemove, onClose }: {
    item: LayoutItem; definition: WidgetDefinition; onChange: (patch: Partial<LayoutItem>) => void; onRemove: () => void; onClose: () => void;
}) {
    const setSetting = (name: string, value: unknown) => onChange({ settings: { ...(item.settings ?? {}), [name]: value } });

    return (
        <Frame compact>
            <FrameHead title={definition.title} text={t(definition.description)}
                action={<Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Close settings')} onClick={onClose} />} />
            <div className="ps-frame__body studio-settings">
                <div className="ps-field">
                    <span className="ps-label">{t('Size')}</span>
                    <div className="studio-choices">
                        {definition.sizes.map((size) => (
                            <button key={size} type="button" className={`studio-choice${item.size === size ? ' is-active' : ''}`} aria-pressed={item.size === size} onClick={() => onChange({ size })}>{SIZE_LABELS[size] ?? size}</button>
                        ))}
                    </div>
                </div>
                <div className="ps-field">
                    <span className="ps-label">{t('Height')}</span>
                    <div className="studio-choices">
                        {HEIGHTS.map((height) => {
                            const current = item.height ?? definition.height ?? 'normal';
                            return <button key={height.value} type="button" className={`studio-choice${current === height.value ? ' is-active' : ''}`} aria-pressed={current === height.value} onClick={() => onChange({ height: height.value })}>{t(height.label)}</button>;
                        })}
                    </div>
                </div>
                <div className="ps-field">
                    <span className="ps-label">{t('Border')}</span>
                    <div className="studio-swatches">
                        {BORDERS.map((border) => (
                            <button key={border.label} type="button" className={`studio-swatch studio-swatch--${border.value ?? (definition.border ?? 'none')}${border.value === undefined ? ' studio-swatch--default' : ''}${item.border === border.value ? ' is-active' : ''}`}
                                aria-pressed={item.border === border.value} title={border.label} aria-label={border.label} onClick={() => onChange({ border: border.value })} />
                        ))}
                    </div>
                </div>
                {(definition.settings ?? []).map((field) => <SettingInput key={field.name} field={field} value={item.settings?.[field.name]} onChange={(value) => setSetting(field.name, value)} />)}
                <div className="studio-settings__foot">
                    <Button size="sm" variant="danger" icon="bx-trash" onClick={onRemove}>{t('Remove')}</Button>
                    <Button size="sm" onClick={onClose}>{t('Done')}</Button>
                </div>
            </div>
        </Frame>
    );
}

function SettingInput({ field, value, onChange }: { field: SettingField; value: unknown; onChange: (value: unknown) => void }) {
    const id = `studio-setting-${field.name}`;
    const current = value === undefined ? field.default : value;
    if (field.type === 'toggle') {
        return (
            <div className="studio-toggle">
                <span>{t(field.label)}</span>
                <Switch checked={Boolean(current)} onChange={(checked) => onChange(checked)} label={t(field.label)} />
            </div>
        );
    }
    if (field.type === 'select') {
        return (
            <div className="ps-field">
                <span className="ps-label">{t(field.label)}</span>
                <div className="studio-choices">
                    {(field.options ?? []).map((option) => (
                        <button key={option.value} type="button" className={`studio-choice${String(current) === option.value ? ' is-active' : ''}`} aria-pressed={String(current) === option.value} onClick={() => onChange(option.value)}>{t(option.label)}</button>
                    ))}
                </div>
            </div>
        );
    }
    if (field.type === 'text') {
        return (
            <Field label={t(field.label)} htmlFor={id}>
                <textarea id={id} className="ps-textarea" rows={6} maxLength={field.max ?? 2000} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
            </Field>
        );
    }
    if (field.type === 'place') {
        const place = value && typeof value === 'object' ? (value as Place) : null;
        return (
            <div className="ps-field">
                <span className="ps-label">{t(field.label)}</span>
                {place && (
                    <div className="studio-place">
                        <i className="bx bxs-map" aria-hidden="true" />
                        <span><strong>{place.name}</strong>{place.region && <span className="ps-muted">{place.region}</span>}</span>
                        <Button size="sm" variant="ghost" iconOnly icon="bx-x" aria-label={t('Clear the place')} onClick={() => onChange(undefined)} />
                    </div>
                )}
                <PlaceSearch onPick={(picked) => onChange(picked)} />
            </div>
        );
    }
    if (field.type === 'links') {
        const links = Array.isArray(value) ? (value as Bookmark[]) : [];
        const set = (index: number, patch: Partial<Bookmark>) => onChange(links.map((link, at) => (at === index ? { ...link, ...patch } : link)));
        return (
            <div className="ps-field">
                <span className="ps-label">{t(field.label)}</span>
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
    return (
        <div className="ps-field">
            <span className="ps-label">{t(field.label)}</span>
            {(field.options ?? []).map((option) => (
                <label key={option.value} className="ps-check">
                    <input type="checkbox" checked={chosen.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...chosen, option.value] : chosen.filter((entry) => entry !== option.value))} />
                    {t(option.label)}
                </label>
            ))}
        </div>
    );
}

/* ---------- Tokens: type, colour and boxes ---------- */

const SCALE: [string, string, string][] = [
    ['3xl', '36 px', t('Greeting and hero titles')], ['2xl', '28 px', t('Page titles')], ['xl', '22 px', t('Section titles')],
    ['lg', '17.5 px', t('Lead text and reading')], ['md', '15.5 px', t('Body')], ['sm', '13.5 px', t('Secondary text, tables')], ['xs', '12 px', t('Captions and meta')],
];
const COLOURS: [string, string][] = [
    ['--ps-accent', t('Orange')], ['--ps-bg', t('Page')], ['--ps-shell', t('Shell')], ['--ps-panel', t('Panel')], ['--ps-raised', t('Raised')],
    ['--ps-text', t('Text')], ['--ps-text-muted', t('Muted')], ['--ps-green', t('Green')], ['--ps-amber', t('Amber')], ['--ps-red', t('Red')], ['--ps-blue', t('Blue')], ['--ps-violet', t('Violet')],
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
                            <p className="design-type__name">{t('Source Serif 4')}</p>
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
