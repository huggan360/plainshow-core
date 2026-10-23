import AppShell from '@/Layouts/AppShell';
import { ButtonLink, Empty } from '@/Components/ui';
import { CSSProperties } from 'react';
import { LayoutItem, PHONE_COLUMNS, PlacedWidget, WidgetDefinition } from '@/Widgets/Widgets';
import { useMobile } from '@/Widgets/List';
import { t } from '@/i18n';

type Props = { layout: LayoutItem[]; phone: LayoutItem[]; catalogue: WidgetDefinition[] };

/**
 * The dashboard. On a computer each widget sits where it was put on the grid
 * of twelve columns and rows of one unit; on a phone the phone layout (its
 * own, or the desktop's in one column) is stacked, each with its height.
 */
export default function Dashboard({ layout, phone, catalogue }: Props) {
    const byKey = new Map(catalogue.map((widget) => [widget.key, widget]));
    const mobile = useMobile();
    const items = mobile ? phone : layout;

    return (
        <AppShell title={t('Dashboard')} wide heading={false}>
            {items.length === 0
                ? <Empty icon="bx-grid-alt">{t('Your dashboard is empty.')}</Empty>
                : <div className={`ps-widget-grid${mobile ? ' is-phone' : ''}`}>
                    {items.map((item) => {
                        const definition = byKey.get(item.key);
                        if (!definition) return null;
                        const style: CSSProperties = mobile
                            ? { gridRow: `span ${item.h ?? definition.h}` }
                            : { gridColumn: `${(item.x ?? 0) + 1} / span ${item.w ?? definition.w}`, gridRow: `${(item.y ?? 0) + 1} / span ${item.h ?? definition.h}` };
                        return <div key={item.key} className="ps-widget-cell" style={style}><PlacedWidget item={mobile ? { ...item, w: PHONE_COLUMNS } : item} definition={definition} /></div>;
                    })}
                </div>}
            <div className="dash-foot"><ButtonLink href="/design" size="sm" icon="bx-customize">{t('Customize dashboard')}</ButtonLink></div>
        </AppShell>
    );
}
