<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extension;
use App\Models\Role;
use App\Models\User;
use App\Support\Audit;
use App\Support\CapabilityCatalog;
use App\Support\Permissions;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use PlainShow\Kit\Access;

/**
 * The permissions manager: which services and capabilities each role has,
 * and the allows and denies that single people have on top of their role.
 * Core applies changes at once; other services at their next sign-in.
 */
class PermissionsController extends Controller
{
    public function index(): Response
    {
        $capabilities = CapabilityCatalog::byExtension();
        $known = DB::table('core_capabilities')->pluck('name')->all();
        $roles = Role::orderBy('sort')->orderBy('name')->get()->map(function (Role $role) use ($known) {
            $patterns = DB::table('core_role_capabilities')->where('role', $role->key)->pluck('capability')->all();
            return $role->summary() + [
                'patterns' => $patterns,
                'granted' => $role->key === 'admin' ? $known : Access::expand($patterns, $known),
            ];
        })->values();

        return Inertia::render('Admin/Permissions', [
            'extensions' => Extension::orderBy('sort')->get()->map(fn (Extension $extension) => [
                'id' => $extension->id,
                'name' => $extension->name,
                'icon' => $extension->icon,
                'enabled' => $extension->enabled,
                'system' => $extension->system,
                'defaultAccess' => $extension->default_access ?? [],
                'capabilities' => $capabilities[$extension->id] ?? [],
            ]),
            'roles' => $roles,
            'people' => User::orderBy('first_name')->orderBy('username')->get()->map(fn (User $user) => $user->summary() + [
                'effective' => Permissions::for($user),
            ]),
            'overrides' => [
                'access' => DB::table('core_extension_access')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('effect', 'extension_id')),
                'capabilities' => DB::table('core_user_capabilities')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('effect', 'capability')),
            ],
        ]);
    }

    /** Saves the whole role matrix: capabilities per role and who may open each service. */
    public function updateRoles(Request $request): RedirectResponse
    {
        $known = DB::table('core_capabilities')->pluck('name')->all();
        $roleKeys = Role::keys();
        $data = $request->validate([
            'capabilities' => ['required', 'array'],
            'capabilities.*' => ['present', 'array'],
            'capabilities.*.*' => ['string', Rule::in($known)],
            'access' => ['required', 'array'],
            'access.*' => ['present', 'array'],
            'access.*.*' => ['string', Rule::in($roleKeys)],
        ]);

        $changes = [];
        DB::transaction(function () use ($data, $known, $roleKeys, &$changes) {
            foreach (array_values(array_diff($roleKeys, ['admin'])) as $role) {
                if (! array_key_exists($role, $data['capabilities'])) {
                    continue;
                }
                $old = DB::table('core_role_capabilities')->where('role', $role)->pluck('capability')->all();
                $wanted = array_values(array_unique($data['capabilities'][$role]));
                $defaults = Access::defaultRolePatterns();
                $defaults['user'] = $defaults['user'] ?? $defaults['member'] ?? [];
                $stored = self::compact(array_merge($old, $defaults[$role] ?? []), $wanted, $known);
                $before = Access::expand($old, $known);
                $added = array_values(array_diff($wanted, $before));
                $removed = array_values(array_diff($before, $wanted));
                if (! $added && ! $removed) {
                    continue;
                }
                DB::table('core_role_capabilities')->where('role', $role)->delete();
                DB::table('core_role_capabilities')->insert(array_map(fn ($capability) => ['role' => $role, 'capability' => $capability], $stored));
                $changes[] = ['role' => $role, 'added' => $added, 'removed' => $removed];
            }

            foreach (Extension::all() as $extension) {
                if (! array_key_exists($extension->id, $data['access'])) {
                    continue;
                }
                // Admins can always open everything; system services stay open to all.
                $access = $extension->system ? $roleKeys : array_values(array_unique(array_merge(['admin'], $data['access'][$extension->id])));
                $before = $extension->default_access ?? [];
                if (array_diff($access, $before) || array_diff($before, $access)) {
                    $extension->forceFill(['default_access' => $access])->save();
                    $changes[] = ['extension' => $extension->id, 'before' => $before, 'after' => $access];
                }
            }
        });

        if ($changes) {
            Permissions::forget();
            Cache::forget('core.service-health');
            Audit::record('permissions.role_changed', ['changes' => $changes]);
        }

        return back()->with('status', $changes ? 'Role permissions saved.' : 'Nothing changed.');
    }

    public function storeRole(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('core_roles', 'name')],
            'color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);
        $key = substr(Str::slug($data['name']), 0, 16);
        if ($key === '' || ! preg_match('/^[a-z][a-z0-9-]*$/', $key)) {
            throw ValidationException::withMessages(['name' => __('Use a name that contains letters.')]);
        }
        if (Role::whereKey($key)->exists()) {
            throw ValidationException::withMessages(['name' => __('A role with that name already exists.')]);
        }
        $role = Role::create(['key' => $key, 'name' => trim($data['name']), 'color' => strtolower($data['color']), 'sort' => (Role::max('sort') ?? 0) + 10]);
        Audit::record('permissions.role_created', ['role' => $role->key, 'name' => $role->name]);

        return back()->with('status', $role->name.' created.');
    }

    public function updateRole(Request $request, Role $role): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('core_roles', 'name')->ignore($role->key, 'key')],
            'color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);
        $role->update(['name' => trim($data['name']), 'color' => strtolower($data['color'])]);
        Audit::record('permissions.role_renamed', ['role' => $role->key, 'name' => $role->name]);

        return back()->with('status', __('Role renamed.'));
    }

    public function destroyRole(Role $role): RedirectResponse
    {
        if ($role->protected || User::where('role', $role->key)->exists()) {
            throw ValidationException::withMessages(['role' => __('Move every person to another role before deleting it.')]);
        }
        DB::transaction(function () use ($role): void {
            DB::table('core_role_capabilities')->where('role', $role->key)->delete();
            DB::table('core_role_layouts')->where('role', $role->key)->delete();
            foreach (Extension::all() as $extension) {
                $extension->forceFill(['default_access' => array_values(array_diff($extension->default_access ?? [], [$role->key]))])->save();
            }
            $role->delete();
        });
        Permissions::forget();
        Audit::record('permissions.role_deleted', ['role' => $role->key, 'name' => $role->name]);

        return back()->with('status', __('Role deleted.'));
    }

    /** Saves one person's allows and denies for services and capabilities. */
    public function updateUser(Request $request, User $user): RedirectResponse
    {
        $known = DB::table('core_capabilities')->pluck('name')->all();
        $data = $request->validate([
            'access' => ['present', 'array'],
            'access.*' => ['string', Rule::in(['default', 'allow', 'deny'])],
            'capabilities' => ['present', 'array'],
            'capabilities.*' => ['string', Rule::in(['default', 'allow', 'deny'])],
        ]);
        $extensions = Extension::pluck('id')->all();
        if ($user->id === $request->user()->id && ($data['access']['core'] ?? null) === 'deny') {
            return back()->with('error', 'You cannot shut yourself out of the dashboard.');
        }

        $before = [
            'access' => DB::table('core_extension_access')->where('user_id', $user->id)->pluck('effect', 'extension_id')->all(),
            'capabilities' => DB::table('core_user_capabilities')->where('user_id', $user->id)->pluck('effect', 'capability')->all(),
        ];
        DB::transaction(function () use ($data, $user, $extensions, $known) {
            foreach ($data['access'] as $extension => $effect) {
                if (! in_array($extension, $extensions, true)) {
                    continue;
                }
                $where = ['user_id' => $user->id, 'extension_id' => $extension];
                $effect === 'default'
                    ? DB::table('core_extension_access')->where($where)->delete()
                    : DB::table('core_extension_access')->updateOrInsert($where, ['effect' => $effect, 'updated_at' => now(), 'created_at' => now()]);
            }
            foreach ($data['capabilities'] as $capability => $effect) {
                if (! in_array($capability, $known, true)) {
                    continue;
                }
                $where = ['user_id' => $user->id, 'capability' => $capability];
                $effect === 'default'
                    ? DB::table('core_user_capabilities')->where($where)->delete()
                    : DB::table('core_user_capabilities')->updateOrInsert($where, ['effect' => $effect, 'updated_at' => now(), 'created_at' => now()]);
            }
        });
        $after = [
            'access' => DB::table('core_extension_access')->where('user_id', $user->id)->pluck('effect', 'extension_id')->all(),
            'capabilities' => DB::table('core_user_capabilities')->where('user_id', $user->id)->pluck('effect', 'capability')->all(),
        ];
        Permissions::forget($user);
        if ($before != $after) {
            Audit::record('permissions.user_changed', ['before' => $before, 'after' => $after], $user->id);
        }

        return back()->with('status', 'Permissions for '.$user->name().' saved.');
    }

    /**
     * Stores a role's capabilities compactly: a wildcard rule such as
     * `*.view` stays while everything it covers is still wanted, so new
     * services keep picking it up, and a default rule comes back once all
     * it covers is ticked again; the rest are stored by name.
     */
    private static function compact(array $old, array $wanted, array $known): array
    {
        $stored = [];
        $covered = [];
        foreach (array_unique($old) as $pattern) {
            if (! str_contains($pattern, '*')) {
                continue;
            }
            $matches = Access::expand([$pattern], $known);
            if (! array_diff($matches, $wanted)) {
                $stored[] = $pattern;
                $covered = array_merge($covered, $matches);
            }
        }
        foreach ($wanted as $capability) {
            if (! in_array($capability, $covered, true)) {
                $stored[] = $capability;
            }
        }

        return array_values(array_unique($stored));
    }
}
