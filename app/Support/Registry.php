<?php

namespace App\Support;

use App\Models\Extension;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\Access;
use PlainShow\Kit\Platform;
use RuntimeException;

/**
 * Keeps the extension tables in step with the manifests. Core ships one per
 * service in extensions/; an installed extension's own plainshow.json, when
 * present, takes precedence. Admin choices (enabled, default access) are
 * never overwritten.
 */
class Registry
{
    /** @return array<string, array<string, mixed>> */
    public static function manifests(): array
    {
        $manifests = [];
        foreach (glob(base_path('extensions/*.json')) ?: [] as $file) {
            $manifest = self::read($file);
            $manifests[$manifest['id']] = $manifest;
        }
        foreach (glob(rtrim((string) config('plainshow.releases_root'), '/').'/*/current/plainshow.json') ?: [] as $file) {
            $manifest = self::read($file);
            if (isset($manifests[$manifest['id']])) {
                $manifests[$manifest['id']] = array_replace($manifests[$manifest['id']], $manifest);
            }
        }

        // Addresses come from the platform file: `{url}` is the app's own
        // address there. An app that is not installed here is not registered.
        $installed = [];
        foreach ($manifests as $id => $manifest) {
            $base = Platform::url($id);
            if ($base === null) {
                continue;
            }
            foreach (['url', 'api', 'health'] as $key) {
                if (isset($manifest[$key]) && is_string($manifest[$key])) {
                    $manifest[$key] = self::address($manifest[$key], $id, $base);
                }
            }
            $installed[$id] = $manifest;
        }

        return $installed;
    }

    public static function sync(): array
    {
        $changes = [];
        DB::transaction(function () use (&$changes) {
            foreach (self::manifests() as $id => $manifest) {
                $existing = Extension::find($id);
                Extension::updateOrCreate(['id' => $id], [
                    'name' => $manifest['name'],
                    'description' => $manifest['description'] ?? '',
                    'icon' => $manifest['icon'] ?? 'bx-extension',
                    'url' => $manifest['url'] ?? null,
                    'api_url' => $manifest['api'] ?? null,
                    'version' => $manifest['version'] ?? null,
                    'system' => (bool) ($manifest['system'] ?? false),
                    'sort' => (int) ($manifest['sort'] ?? 100),
                    'manifest' => $manifest,
                    'enabled' => $existing?->enabled ?? true,
                    'default_access' => $existing?->default_access ?? ($manifest['default_access'] ?? ['admin']),
                ]);
                $changes[] = ($existing ? 'Updated ' : 'Added ').$id;

                $names = [];
                foreach ((array) ($manifest['capabilities'] ?? []) as $capability) {
                    $names[] = $capability['name'];
                    DB::table('core_capabilities')->updateOrInsert(
                        ['name' => $capability['name']],
                        ['extension_id' => $id, 'label' => $capability['label'], 'description' => $capability['description'] ?? '', 'updated_at' => now(), 'created_at' => now()],
                    );
                }
                DB::table('core_capabilities')->where('extension_id', $id)->whereNotIn('name', $names)->delete();
            }

            if (! DB::table('core_role_capabilities')->exists()) {
                foreach (Access::defaultRolePatterns() as $role => $patterns) {
                    // The Composer and what it does in Cloud, besides the kit's view and create patterns.
                    if (in_array($role, ['user', 'moderator'], true)) {
                        $patterns = [...$patterns, 'core.assistant.use', 'cloud.calendar.edit', 'cloud.files.share'];
                    }
                    foreach ($patterns as $pattern) {
                        DB::table('core_role_capabilities')->insert(['role' => $role, 'capability' => $pattern]);
                    }
                }
                $changes[] = 'Default role permissions set';
            }
        });
        Permissions::forget();

        return $changes;
    }

    /**
     * `{url}` becomes the app's address. Older app manifests still name their
     * plainshow.se address; that part is swapped for the address here too.
     */
    private static function address(string $value, string $id, string $base): string
    {
        $value = str_replace('{url}', $base, $value);
        $old = $id === 'core' ? 'https://plainshow.se' : "https://$id.plainshow.se";
        if (str_starts_with($value, $old) && ! str_starts_with($value, $old.'.')) {
            $value = $base.substr($value, strlen($old));
        }

        return $value;
    }

    /** @return array<string, mixed> */
    private static function read(string $file): array
    {
        $manifest = json_decode((string) file_get_contents($file), true);
        if (! is_array($manifest) || ! preg_match('/^[a-z][a-z0-9-]{1,31}$/', (string) ($manifest['id'] ?? '')) || empty($manifest['name'])) {
            throw new RuntimeException("Invalid extension manifest: $file");
        }

        return $manifest;
    }
}
