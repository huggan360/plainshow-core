<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;

/** Which widgets a user may place, and the layout they start with. */
class Dashboard
{
    /** @return list<array<string, mixed>> every widget this user may use */
    public static function catalogue(User $user): array
    {
        $permissions = Permissions::for($user);
        $widgets = [];
        foreach (Extension::where('enabled', true)->orderBy('sort')->get() as $extension) {
            if ($extension->id !== 'core' && ! in_array($extension->id, $permissions['services'], true)) {
                continue;
            }
            foreach ($extension->widgets() as $widget) {
                if (isset($widget['capability']) && ! Permissions::can($user, $widget['capability'])) {
                    continue;
                }
                $widgets[] = [
                    'key' => $extension->id.'.'.$widget['id'],
                    'extension' => $extension->id,
                    'extensionName' => $extension->name,
                    'id' => $widget['id'],
                    'title' => $widget['title'],
                    'icon' => $widget['icon'] ?? $extension->icon,
                    'sizes' => $widget['sizes'] ?? ['m'],
                    'default' => $widget['default'] ?? 'm',
                    'admin' => isset($widget['capability']),
                ];
            }
        }

        return $widgets;
    }

    /** @return list<array{key: string, size: string}> */
    public static function layout(User $user): array
    {
        $catalogue = collect(self::catalogue($user))->keyBy('key');
        $saved = $user->dashboard?->widgets;
        $layout = is_array($saved) ? $saved : self::defaults($catalogue->keys()->all());

        // Drop widgets that are no longer allowed or no longer exist.
        return array_values(array_filter(
            array_map(fn ($item) => ['key' => (string) ($item['key'] ?? ''), 'size' => (string) ($item['size'] ?? 'm')], $layout),
            fn ($item) => $catalogue->has($item['key']) && in_array($item['size'], $catalogue[$item['key']]['sizes'], true),
        ));
    }

    private static function defaults(array $available): array
    {
        $order = [
            ['core.greeting', 'full'], ['core.launcher', 'xl'], ['core.pi-health', 'm'],
            ['core.admin-services', 'm'], ['core.admin-users', 'm'], ['core.admin-security', 'm'],
            ['core.activity', 'm'],
        ];

        return array_values(array_map(
            fn ($entry) => ['key' => $entry[0], 'size' => $entry[1]],
            array_filter($order, fn ($entry) => in_array($entry[0], $available, true)),
        ));
    }
}
