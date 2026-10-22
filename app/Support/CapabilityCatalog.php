<?php

namespace App\Support;

use App\Models\Extension;

final class CapabilityCatalog
{
    /** @return array<string, list<array<string, mixed>>> */
    public static function byExtension(): array
    {
        return Extension::orderBy('sort')->get()->mapWithKeys(function (Extension $extension): array {
            $capabilities = collect((array) ($extension->manifest['capabilities'] ?? []))
                ->filter(fn ($capability) => is_array($capability) && isset($capability['name']))
                ->map(fn (array $capability) => [
                    'name' => (string) $capability['name'],
                    'label' => (string) ($capability['label'] ?? $capability['name']),
                    'description' => (string) ($capability['description'] ?? ''),
                    'tier' => in_array($capability['tier'] ?? null, ['user', 'moderator', 'admin'], true) ? $capability['tier'] : 'user',
                    'group' => (string) ($capability['group'] ?? ''),
                    'implies' => array_values(array_filter((array) ($capability['implies'] ?? []), 'is_string')),
                ])->values()->all();

            return [$extension->id => $capabilities];
        })->all();
    }

    /** Add every prerequisite implied by the granted capabilities. */
    public static function expand(array $capabilities): array
    {
        if ($capabilities === ['*'] || in_array('*', $capabilities, true)) {
            return ['*'];
        }

        $rules = collect(self::byExtension())->flatten(1)->mapWithKeys(
            fn (array $capability) => [$capability['name'] => $capability['implies']],
        )->all();
        $expanded = array_values(array_unique($capabilities));
        for ($index = 0; $index < count($expanded); $index++) {
            foreach ($rules[$expanded[$index]] ?? [] as $required) {
                if (! in_array($required, $expanded, true)) {
                    $expanded[] = $required;
                }
            }
        }

        return $expanded;
    }
}
