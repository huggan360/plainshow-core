<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\RoleLayout;
use App\Models\User;

/**
 * Which widgets a user may place, and the layout they see: their own, else
 * their role's default from the Design studio, else the built-in one.
 */
class Dashboard
{
    public const SIZES = ['s', 'm', 'l', 'xl', 'full'];

    /** Heights in grid rows: short is one, normal two, tall three. */
    public const HEIGHTS = ['short', 'normal', 'tall'];

    public const GLOWS = ['accent', 'green', 'blue', 'violet', 'pink', 'warm', 'cyan', 'none'];

    public const ROLES = ['admin', 'moderator', 'member', 'guest'];

    /** @return list<array<string, mixed>> every widget this user may use */
    public static function catalogue(User $user): array
    {
        return self::catalogueFor($user->role, fn (string $capability) => Permissions::can($user, $capability), Permissions::for($user)['services']);
    }

    /** The widgets someone with only a role's defaults could use, for role layouts. */
    /** The widgets someone with only a role's defaults could use, for role layouts. */
    public static function catalogueForRole(string $role): array
    {
        $resolved = Permissions::forRole($role);
        $can = fn (string $capability) => in_array('*', $resolved['capabilities'], true) || in_array($capability, $resolved['capabilities'], true);

        return self::catalogueFor($role, $can, $resolved['services']);
    }

    private static function catalogueFor(string $role, callable $can, array $services): array
    {
        $widgets = [];
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
                    'title' => $widget['title'],
                    'description' => $widget['description'] ?? '',
                    'icon' => $widget['icon'] ?? $extension->icon,
                    'sizes' => array_values(array_intersect($widget['sizes'] ?? ['m'], self::SIZES)),
                    'default' => $widget['default'] ?? 'm',
                    'height' => in_array($widget['height'] ?? null, self::HEIGHTS, true) ? $widget['height'] : 'normal',
                    'settings' => $widget['settings'] ?? ($extension->id === 'core' ? [] : self::rowsSetting($widget)),
                    'admin' => isset($widget['capability']),
                ];
            }
        }

        return $widgets;
    }

    /** Widgets from other services get a row count unless they declare their own settings. */
    private static function rowsSetting(array $widget): array
    {
        $gallery = str_contains((string) ($widget['id'] ?? ''), 'photo');
        $options = $gallery ? ['6', '9', '12'] : ['3', '5', '8'];

        return [[
            'name' => 'count', 'type' => 'select', 'label' => $gallery ? 'Photos' : 'Rows',
            'options' => array_map(fn ($value) => ['value' => $value, 'label' => $value], $options),
            'default' => $gallery ? '9' : '5',
        ]];
    }

    /** @return list<array<string, mixed>> */
    public static function layout(User $user): array
    {
        $catalogue = self::catalogue($user);
        $saved = $user->dashboard?->widgets;
        if (! is_array($saved)) {
            $saved = self::roleLayout($user->role) ?? self::defaults();
        }

        return self::sanitize($saved, $catalogue);
    }

    public static function roleLayout(string $role): ?array
    {
        $layout = RoleLayout::find($role)?->widgets;

        return is_array($layout) ? $layout : null;
    }

    /**
     * Keep only widgets the catalogue allows, at a size they support, with
     * clean optional settings: a title, a glow and per-widget options.
     *
     * @return list<array<string, mixed>>
     */
    public static function sanitize(array $items, array $catalogue): array
    {
        $byKey = collect($catalogue)->keyBy('key');
        $seen = [];
        $clean = [];
        foreach ($items as $item) {
            $key = is_array($item) ? (string) ($item['key'] ?? '') : '';
            if (! $byKey->has($key) || isset($seen[$key])) {
                continue;
            }
            $definition = $byKey[$key];
            $size = (string) ($item['size'] ?? $definition['default']);
            if (! in_array($size, $definition['sizes'], true)) {
                $size = in_array($definition['default'], $definition['sizes'], true) ? $definition['default'] : $definition['sizes'][0];
            }
            $entry = ['key' => $key, 'size' => $size, 'height' => in_array($item['height'] ?? null, self::HEIGHTS, true) ? $item['height'] : $definition['height']];
            $title = trim(strip_tags((string) ($item['title'] ?? '')));
            if ($title !== '') {
                $entry['title'] = mb_substr($title, 0, 60);
            }
            if (in_array($item['glow'] ?? null, self::GLOWS, true)) {
                $entry['glow'] = $item['glow'];
            }
            $settings = self::settings($definition['settings'], is_array($item['settings'] ?? null) ? $item['settings'] : []);
            if ($settings) {
                $entry['settings'] = $settings;
            }
            $seen[$key] = true;
            $clean[] = $entry;
        }

        return $clean;
    }

    /** Settings a widget declares in its manifest: text, links or a list of choices. */
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
                case 'choices':
                    $options = array_column($field['options'] ?? [], 'value');
                    $clean[$name] = array_values(array_intersect(is_array($value) ? array_map('strval', $value) : [], $options));
                    break;
            }
        }

        return $clean;
    }

    public static function defaults(): array
    {
        // Rows of twelve columns: the welcome and services across, then three to a row.
        $order = [
            ['core.greeting', 'full'], ['core.launcher', 'full'],
            ['core.pi-health', 'm'], ['core.admin-services', 'm'], ['core.admin-users', 'm'],
            ['core.admin-security', 'm'], ['blog.latest-posts', 'm'], ['split.balances', 'm'],
            ['cloud.calendar', 'm'], ['latex.recent-projects', 'm'], ['core.admin-updates', 'm'],
            ['core.activity', 'm'], ['blog.new-photos', 'xl'],
        ];

        return array_map(fn ($entry) => ['key' => $entry[0], 'size' => $entry[1]], $order);
    }
}
