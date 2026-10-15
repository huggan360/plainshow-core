import AppShell from '@/Layouts/AppShell';
import { Empty } from '@/Components/ui';
import { WidgetDefinition, WIDGETS } from '@/Widgets/Widgets';

type Props = { layout: { key: string; size: string }[]; catalogue: WidgetDefinition[] };

export default function Dashboard({ layout, catalogue }: Props) {
    const byKey = new Map(catalogue.map((widget) => [widget.key, widget]));

    return (
        <AppShell title="Dashboard" wide heading={false}>
            {layout.length === 0
                ? <Empty icon="bx-grid-alt">Your dashboard is empty.</Empty>
                : <div className="ps-widget-grid">
                    {layout.map((item) => {
                        const definition = byKey.get(item.key);
                        const Component = WIDGETS[item.key];
                        if (!definition || !Component) return null;
                        return <div key={item.key} data-size={item.size}><Component definition={definition} /></div>;
                    })}
                </div>}
        </AppShell>
    );
}
