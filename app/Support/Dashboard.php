<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\RoleLayout;
use App\Models\Role;
use App\Models\User;

/**
 * Which widgets a user may place, and the layouts they see: their own, else
 * their role's default from the Design studio, else the built-in one.
 *
 * A layout has two parts. The desktop layout places each widget on a grid of
 * twelve columns and rows of one unit (x, y, w, h), freely, without overlap.
 * The phone layout is one column of widgets with a height each; when there
 * is none (null), the phone shows the desktop layout in one column, top to
 * bottom and left to right, so changing the desktop changes the phone too.
 */
class Dashboard
{
    public const SIZES = ['s', 'm', 'l', 'xl', 'full'];

    public const COLS = 12;

    public const MAX_ROWS = 12;

    /** The old fixed sizes as grid spans, for layouts saved before free sizing. */
    private const SIZE_COLS = ['s' => 3, 'm' => 4, 'l' => 6, 'xl' => 8, 'full' => 12];

    private const HEIGHT_ROWS = ['short' => 2, 'normal' => 4, 'tall' => 6];

    /** Widgets that show the weather somewhere; they share a place. */
    public const WEATHER = ['core.weather', 'core.forecast', 'core.radar'];

    /** Heights in grid rows: short is one, normal two, tall three. */
    public const HEIGHTS = ['short', 'normal', 'tall'];

    /** Gradient borders a widget can have (resources/css/app.css, .ps-frame[data-border]). */
    public const BORDERS = ['none', 'orange', 'sunset', 'ocean', 'forest', 'violet', 'mono'];

    /** @return list<array<string, mixed>> every widget this user may use */
    public static function catalogue(User $user): array
    {
        return self::catalogueFor($user->role, fn (string $capability) => Permissions::can($user, $capability), Permissions::for($user)['services']);
    }

    /** The widgets someone with only a role's defaults could use, for role layouts. */
    public static function catalogueForRole(string $role): array
    {
        $resolved = Permissions::forRole($role);
        $can = fn (string $capability) => in_array('*', $resolved['capabilities'], true) || in_array($capability, $resolved['capabilities'], true);

        return self::catalogueFor($role, $can, $resolved['services']);
    }

    public static function roles(): array
    {
        return Role::keys();
    }

    private static function catalogueFor(string $role, callable $can, array $services): array
    {
        $widgets = [];
        $text = fn ($value) => is_string($value) && $value !== '' ? (string) __($value) : '';
        foreach (Extension::where('enabled', true)->orderBy('sort')->get() as $extension) {
            if ($extension->id !== 'core' && ! in_array($extension->id, $services, true)) {
                continue;
            }
            foreach ($extension->widgets() as $widget) {
                if (isset($widget['capability']) && ! $can($widget['capability'])) {
                    continue;
                }
                $widgets[] = [
                    'key' => $extension->id.'.'.$widget['id'],
                    'extension' => $extension->id,
                    'extensionName' => $extension->name,
                    'id' => $widget['id'],
                    // Titles, descriptions and settings in the visitor's language.
                    'title' => $text($widget['title']),
                    'description' => $text($widget['description'] ?? ''),
                    'icon' => $widget['icon'] ?? $extension->icon,
                    'sizes' => array_values(array_intersect($widget['sizes'] ?? ['m'], self::SIZES)),
                    'default' => $widget['default'] ?? 'm',
                    'height' => in_array($widget['height'] ?? null, self::HEIGHTS, true) ? $widget['height'] : 'normal',
                    'settings' => array_map(fn ($field) => array_merge($field, [
                        'label' => $text($field['label'] ?? ''),
                    ], isset($field['options']) ? ['options' => array_map(fn ($option) => ['value' => $option['value'], 'label' => $text($option['label'] ?? '')], $field['options'])] : []), $widget['settings'] ?? []),
                    'border' => in_array($widget['border'] ?? null, self::BORDERS, true) ? $widget['border'] : null,
                    // The smallest it may be made, and the size it starts at.
                    'min' => [max(1, min(12, (int) ($widget['min'][0] ?? 2))), max(1, min(12, (int) ($widget['min'][1] ?? 2)))],
                    'w' => self::SIZE_COLS[$widget['default'] ?? 'm'] ?? 4,
                    'h' => self::HEIGHT_ROWS[$widget['height'] ?? 'normal'] ?? 4,
                    'admin' => isset($widget['capability']),
                ];
            }
        }

        return $widgets;
    }

    /** @return list<array<string, mixed>> the desktop layout */
    public static function layout(User $user): array
    {
        $catalogue = self::catalogue($user);
        $saved = $user->dashboard?->widgets;
        if (! is_array($saved)) {
            $saved = self::roleLayout($user->role) ?? self::defaults();
        }

        return self::sanitize($saved, $catalogue);
    }

    /** @return array{items: list<array<string, mixed>>, custom: bool} the phone layout, its own or the desktop's in one column */
    public static function phone(User $user, ?array $desktop = null): array
    {
        $catalogue = self::catalogue($user);
        $desktop ??= self::layout($user);
        $own = $user->dashboard !== null ? $user->dashboard->phone : RoleLayout::find($user->role)?->phone;

        return self::phoneFor($own, $desktop, $catalogue);
    }

    public static function phoneFor(?array $own, array $desktop, array $catalogue): array
    {
        return is_array($own)
            ? ['items' => self::sanitizePhone($own, $catalogue), 'custom' => true]
            : ['items' => self::derivePhone($desktop), 'custom' => false];
    }

    public static function roleLayout(string $role): ?array
    {
        $layout = RoleLayout::find($role)?->widgets;

        return is_array($layout) ? $layout : null;
    }

    public static function rolePhone(string $role): ?array
    {
        $phone = RoleLayout::find($role)?->phone;

        return is_array($phone) ? $phone : null;
    }

    /**
     * Keep only widgets the catalogue allows, once each, placed on the grid:
     * within the twelve columns, no smaller than the widget allows, never on
     * top of another (a widget that would be is moved to the first free
     * place). Layouts saved before free sizing (size and height) are placed
     * in their old order. Settings are cleaned; titles are the widget's own.
     *
     * @return list<array<string, mixed>>
     */
    public static function sanitize(array $items, array $catalogue): array
    {
        $byKey = collect($catalogue)->keyBy('key');
        $seen = [];
        $placed = [];
        $legacy = [];
        foreach ($items as $item) {
            $key = is_array($item) ? (string) ($item['key'] ?? '') : '';
            if (! $byKey->has($key) || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $definition = $byKey[$key];
            [$minW, $minH] = $definition['min'] ?? [2, 2];
            $w = isset($item['w']) ? (int) $item['w'] : (self::SIZE_COLS[$item['size'] ?? ''] ?? $definition['w'] ?? 4);
            $h = isset($item['h']) ? (int) $item['h'] : (self::HEIGHT_ROWS[$item['height'] ?? ''] ?? $definition['h'] ?? 4);
            $entry = ['key' => $key, 'w' => max($minW, min(self::COLS, $w)), 'h' => max($minH, min(self::MAX_ROWS, $h))] + self::extras($item, $definition);
            if (isset($item['x'], $item['y']) && is_numeric($item['x']) && is_numeric($item['y'])) {
                $entry['x'] = max(0, min(self::COLS - $entry['w'], (int) $item['x']));
                $entry['y'] = max(0, min(500, (int) $item['y']));
                $placed[] = $entry;
            } else {
                $legacy[] = $entry;
            }
        }

        // Placed widgets keep their column and rise as high as they can (as in the
        // Design studio); a place that is taken gives the first free one.
        usort($placed, fn ($a, $b) => [$a['y'], $a['x']] <=> [$b['y'], $b['x']]);
        $grid = [];
        $clean = [];
        foreach ([...$placed, ...$legacy] as $entry) {
            if (isset($entry['x']) && self::fits($grid, $entry['x'], $entry['y'], $entry['w'], $entry['h'])) {
                while ($entry['y'] > 0 && self::fits($grid, $entry['x'], $entry['y'] - 1, $entry['w'], $entry['h'])) {
                    $entry['y']--;
                }
            } else {
                [$entry['x'], $entry['y']] = self::firstFree($grid, $entry['w'], $entry['h'], isset($entry['y']) ? $entry['y'] : 0);
            }
            self::occupy($grid, $entry);
            $clean[] = ['key' => $entry['key'], 'x' => $entry['x'], 'y' => $entry['y'], 'w' => $entry['w'], 'h' => $entry['h']] + array_diff_key($entry, array_flip(['key', 'x', 'y', 'w', 'h']));
        }

        return $clean;
    }

    /** The phone's own layout: one column, each widget once with its height. */
    public static function sanitizePhone(array $items, array $catalogue): array
    {
        $byKey = collect($catalogue)->keyBy('key');
        $seen = [];
        $clean = [];
        foreach ($items as $item) {
            $key = is_array($item) ? (string) ($item['key'] ?? '') : '';
            if (! $byKey->has($key) || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $definition = $byKey[$key];
            $h = (int) ($item['h'] ?? $definition['h'] ?? 4);
            $clean[] = ['key' => $key, 'h' => max($definition['min'][1] ?? 2, min(self::MAX_ROWS, $h))] + self::extras($item, $definition);
        }

        return $clean;
    }

    /** The desktop layout in one column: top to bottom, left to right. */
    public static function derivePhone(array $desktop): array
    {
        usort($desktop, fn ($a, $b) => [$a['y'], $a['x']] <=> [$b['y'], $b['x']]);

        return array_map(fn ($item) => ['key' => $item['key'], 'h' => min(8, $item['h'])] + array_diff_key($item, array_flip(['key', 'x', 'y', 'w', 'h'])), $desktop);
    }

    /** A widget's border and settings, cleaned. */
    private static function extras(array $item, array $definition): array
    {
        $extras = [];
        if (in_array($item['border'] ?? null, self::BORDERS, true)) {
            $extras['border'] = $item['border'];
        }
        $settings = self::settings($definition['settings'] ?? [], is_array($item['settings'] ?? null) ? $item['settings'] : []);
        if ($settings) {
            $extras['settings'] = $settings;
        }

        return $extras;
    }

    private static function fits(array $grid, int $x, int $y, int $w, int $h): bool
    {
        if ($x < 0 || $x + $w > self::COLS) {
            return false;
        }
        for ($row = $y; $row < $y + $h; $row++) {
            for ($col = $x; $col < $x + $w; $col++) {
                if (isset($grid[$row][$col])) {
                    return false;
                }
            }
        }

        return true;
    }

    private static function firstFree(array $grid, int $w, int $h, int $from = 0): array
    {
        for ($y = 0; $y < 1000; $y++) {
            for ($x = 0; $x + $w <= self::COLS; $x++) {
                if (self::fits($grid, $x, $y, $w, $h)) {
                    return [$x, $y];
                }
            }
        }

        return [0, 1000];
    }

    private static function occupy(array &$grid, array $entry): void
    {
        for ($row = $entry['y']; $row < $entry['y'] + $entry['h']; $row++) {
            for ($col = $entry['x']; $col < $entry['x'] + $entry['w']; $col++) {
                $grid[$row][$col] = true;
            }
        }
    }

    /** Settings a widget declares in its manifest: text, links, choices, a toggle or a place. */
    private static function settings(array $schema, array $values): array
    {
        $clean = [];
        foreach ($schema as $field) {
            $name = (string) ($field['name'] ?? '');
            if ($name === '' || ! array_key_exists($name, $values)) {
                continue;
            }
            $value = $values[$name];
            switch ($field['type'] ?? 'text') {
                case 'text':
                    $clean[$name] = mb_substr(trim((string) (is_scalar($value) ? $value : '')), 0, (int) ($field['max'] ?? 2000));
                    break;
                case 'links':
                    $links = [];
                    foreach (is_array($value) ? array_slice($value, 0, 20) : [] as $link) {
                        $url = trim((string) ($link['url'] ?? ''));
                        $label = mb_substr(trim(strip_tags((string) ($link['label'] ?? ''))), 0, 60);
                        if (filter_var($url, FILTER_VALIDATE_URL) && preg_match('~^https?://~i', $url)) {
                            $links[] = ['label' => $label !== '' ? $label : (string) parse_url($url, PHP_URL_HOST), 'url' => $url];
                        }
                    }
                    $clean[$name] = $links;
                    break;
                case 'toggle':
                    $clean[$name] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
                    break;
                case 'select':
                    $options = array_map('strval', array_column($field['options'] ?? [], 'value'));
                    if (in_array((string) $value, $options, true)) {
                        $clean[$name] = (string) $value;
                    }
                    break;
                case 'place':
                    if (($place = Weather::cleanPlace($value)) !== null) {
                        $clean[$name] = $place;
                    }
                    break;
                case 'choices':
                    $options = array_column($field['options'] ?? [], 'value');
                    $clean[$name] = array_values(array_intersect(is_array($value) ? array_map('strval', $value) : [], $options));
                    break;
            }
        }

        return $clean;
    }

    /**
     * The system's own dashboard, for every role without one of its own: a
     * greeting beside the weather, the services under it beside the top
     * story. Few widgets; people add the rest.
     */
    public static function defaults(): array
    {
        return [
            ['key' => 'core.greeting', 'x' => 0, 'y' => 0, 'w' => 8, 'h' => 2],
            ['key' => 'core.weather', 'x' => 8, 'y' => 0, 'w' => 4, 'h' => 2],
            ['key' => 'core.launcher', 'x' => 0, 'y' => 2, 'w' => 8, 'h' => 2],
            ['key' => 'core.news-top', 'x' => 8, 'y' => 2, 'w' => 4, 'h' => 2],
        ];
    }
}
