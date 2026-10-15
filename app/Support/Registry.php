<?php

namespace App\Support;

use App\Models\Extension;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\Access;
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

        return $manifests;
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
