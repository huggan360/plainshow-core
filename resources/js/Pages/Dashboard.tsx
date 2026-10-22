import AppShell from '@/Layouts/AppShell';
import { ButtonLink, Empty } from '@/Components/ui';
import { LayoutItem, PlacedWidget, WidgetDefinition } from '@/Widgets/Widgets';
import { t } from '@/i18n';

type Props = { layout: LayoutItem[]; catalogue: WidgetDefinition[] };

export default function Dashboard({ layout, catalogue }: Props) {
    const byKey = new Map(catalogue.map((widget) => [widget.key, widget]));

    return (
        <AppShell title={t('Dashboard')} wide heading={false}>
            {layout.length === 0
                ? <Empty icon="bx-grid-alt">{t('Your dashboard is empty.')}</Empty>
                : <div className="ps-widget-grid">
                    {layout.map((item) => {
                        const definition = byKey.get(item.key);
                        return definition ? <div key={item.key} data-size={item.size} data-height={item.height ?? definition.height ?? 'normal'}><PlacedWidget item={item} definition={definition} /></div> : null;
                    })}
                </div>}
            <div className="dash-foot"><ButtonLink href="/design" size="sm" icon="bx-customize">{t('Customize dashboard')}</ButtonLink></div>
        </AppShell>
    );
}
