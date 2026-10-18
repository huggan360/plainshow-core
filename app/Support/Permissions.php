<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\Access;

/**
 * What a user may do, from core's tables, using the same rules login uses
 * for its token claims. Core checks this on every request, so changes apply
 * here at once; other apps see them at their next sign-in.
 */
class Permissions
{
    /** @var array<int, array{services: list<string>, capabilities: list<string>}> */
    private static array $cache = [];

    /** @return array{services: list<string>, capabilities: list<string>} */
    public static function for(User $user): array
    {
        return self::$cache[$user->id] ??= self::resolve($user);
    }

    public static function can(User $user, string $capability): bool
    {
        foreach (self::for($user)['capabilities'] as $granted) {
            if ($granted === '*' || $granted === $capability) {
                return true;
            }
        }

        return false;
    }

    public static function hasService(User $user, string $extension): bool
    {
        return in_array($extension, self::for($user)['services'], true);
    }

    public static function forget(?User $user = null): void
    {
        if ($user) {
            unset(self::$cache[$user->id]);
        } else {
            self::$cache = [];
        }
    }

    /** What a role gets with no per-user overrides. */
    public static function forRole(string $role): array
    {
        $resolved = Access::resolve($role, self::extensions(), [], DB::table('core_role_capabilities')->where('role', $role)->pluck('capability')->all(), []);
        if ($resolved['capabilities'] !== ['*']) {
            $resolved['capabilities'] = Access::expand($resolved['capabilities'], DB::table('core_capabilities')->pluck('name')->all());
        }

        return $resolved;
    }

    private static function extensions(): array
    {
        return Extension::orderBy('sort')->get()->map(fn (Extension $extension) => [
            'id' => $extension->id,
            'enabled' => $extension->enabled,
            'default_access' => $extension->default_access ?? [],
        ])->all();
    }

    private static function resolve(User $user): array
    {
        $extensions = self::extensions();
        $patterns = DB::table('core_role_capabilities')->where('role', $user->role)->pluck('capability')->all();
        $resolved = Access::resolve(
            $user->role,
            $extensions,
            DB::table('core_extension_access')->where('user_id', $user->id)->pluck('effect', 'extension_id')->all(),
            $patterns,
            DB::table('core_user_capabilities')->where('user_id', $user->id)->pluck('effect', 'capability')->all(),
        );
        $unavailable = [];
        if (! DB::table('core_linked_accounts')->where(['user_id' => $user->id, 'provider' => 'nextcloud'])->exists()) {
            $unavailable[] = 'cloud';
        }
        if (! is_string($user->pi_username) || $user->pi_username === '') {
            $unavailable[] = 'web';
        }
        $resolved['services'] = array_values(array_diff($resolved['services'], $unavailable));
        if ($resolved['capabilities'] !== ['*']) {
            $resolved['capabilities'] = Access::expand($resolved['capabilities'], DB::table('core_capabilities')->pluck('name')->all());
            $resolved['capabilities'] = array_values(array_filter($resolved['capabilities'], fn (string $capability) => ! in_array(strstr($capability, '.', true), $unavailable, true)));
        }

        return $resolved;
    }
}
