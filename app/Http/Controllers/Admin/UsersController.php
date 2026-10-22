<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extension;
use App\Models\Role;
use App\Models\User;
use App\Support\AccountLifecycle;
use App\Support\Audit;
use App\Support\Avatars;
use App\Support\CloudAccount;
use App\Support\CapabilityCatalog;
use App\Support\Permissions;
use App\Support\ResetLinks;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class UsersController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->query('q', ''));
        $groups = DB::table('core_group_members as member')
            ->join('core_groups as groups', 'groups.id', '=', 'member.group_id')
            ->select('member.user_id', 'groups.name')->orderBy('groups.name')->get()->groupBy('user_id');
        $users = User::query()
            ->where('username', 'not like', 'removed-%')
            ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner
                ->where('username', 'like', "%$search%")
                ->orWhere('first_name', 'like', "%$search%")
                ->orWhere('last_name', 'like', "%$search%")
                ->orWhere('email', 'like', "%$search%")))
            ->orderBy('first_name')->orderBy('username')
            ->get()
            ->map(fn (User $user) => $user->summary() + [
                'email' => $user->email,
                'piUsername' => $user->pi_username,
                'twoFactor' => $user->hasTwoFactor(),
                'lastLogin' => $user->last_login_at?->toIso8601String(),
                'services' => Permissions::for($user)['services'],
                'capabilities' => Permissions::for($user)['capabilities'],
                'accounts' => [
                    'cloud' => DB::table('core_linked_accounts')->where(['user_id' => $user->id, 'provider' => 'nextcloud'])->exists(),
                    'web' => is_string($user->pi_username) && $user->pi_username !== '',
                ],
                'groups' => ($groups[$user->id] ?? collect())->pluck('name')->all(),
            ]);

        return Inertia::render('Admin/Users', [
            'users' => $users,
            'search' => $search,
            'extensions' => Extension::orderBy('sort')->get()->map->summary(),
            'access' => DB::table('core_extension_access')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('effect', 'extension_id')),
            'capabilities' => CapabilityCatalog::byExtension(),
            'capabilityOverrides' => DB::table('core_user_capabilities')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('effect', 'capability')),
            'roles' => Role::orderBy('sort')->orderBy('name')->get()->map->summary(),
            'resetLink' => $request->session()->get('reset_link'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $data = $this->withPiUsername($data, Permissions::forRole($data['role'])['services']);
        if (in_array('cloud', Permissions::forRole($data['role'])['services'], true)) {
            try {
                $cloudExists = DB::table('core_linked_accounts')->where(['provider' => 'nextcloud', 'external_id' => $data['username']])->exists()
                    || AccountLifecycle::cloudExists($data['username']);
            } catch (RuntimeException $error) {
                throw ValidationException::withMessages(['username' => $error->getMessage()]);
            }
            if ($cloudExists) {
                throw ValidationException::withMessages(['username' => 'That Cloud account already exists. Link it before creating this person.']);
            }
        }
        try {
            $user = DB::transaction(function () use ($data): User {
                $user = new User;
                $user->forceFill($data + [
                    'password' => Hash::make(Str::random(64)),
                    'status' => 'active',
                ])->save();
                if (in_array('cloud', Permissions::forRole($data['role'])['services'], true)) {
                    $this->reserveCloudAccount($user, false);
                }

                return $user;
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['username' => $error->getMessage()]);
        }
        Audit::record('user.created', ['username' => $user->username, 'role' => $user->role], $user->id);

        return back()
            ->with('status', "Account {$user->username} created. Send them the link below to set a password.")
            ->with('reset_link', ['username' => $user->username, 'url' => ResetLinks::create($user)]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        abort_if(str_starts_with($user->username, 'removed-'), 404);
        $data = $this->validated($request, $user);
        $data['status'] = $request->validate(['status' => ['required', Rule::in(['active', 'disabled'])]])['status'];
        $this->guardLastAdmin($request, $user, $data);

        $before = $user->only(['role', 'status', 'pi_username']);
        if ($data['username'] !== $user->username) {
            throw ValidationException::withMessages(['username' => 'Changing an existing username needs an account migration.']);
        }
        if ($user->pi_username && $data['pi_username'] !== $user->pi_username) {
            throw ValidationException::withMessages(['piUsername' => 'An existing server account cannot be relinked here.']);
        }
        $beforeServices = Permissions::for($user)['services'];
        $data = $this->withPiUsername($data, Permissions::forRole($data['role'])['services']);
        try {
            DB::transaction(function () use ($user, $data, $beforeServices): void {
                $user->forceFill($data)->save();
                Permissions::forget($user);
                $this->syncServices($user, $beforeServices);
                if ($data['status'] !== 'active') {
                    DB::table('core_sessions')->where('user_id', $user->id)->delete();
                    DB::table('login_sessions')->where('user_id', $user->id)->delete();
                    DB::table('oauth_access_tokens')->where('user_id', $user->id)->update(['revoked' => true]);
                }
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['status' => $error->getMessage()]);
        }
        Audit::record('user.updated', ['before' => $before, 'after' => $user->only(['role', 'status', 'pi_username'])], $user->id);

        return back()->with('status', "Saved {$user->username}.");
    }

    public function access(Request $request, User $user): RedirectResponse
    {
        abort_if(str_starts_with($user->username, 'removed-'), 404);
        $data = $request->validate([
            'access' => ['present', 'array'],
            'access.*' => ['required', Rule::in(['default', 'allow', 'deny'])],
        ]);
        $known = Extension::pluck('id')->all();
        $beforeServices = Permissions::for($user)['services'];
        try {
            DB::transaction(function () use ($user, $data, $known, $beforeServices): void {
                foreach ($data['access'] as $extension => $effect) {
                    if (! in_array($extension, $known, true) || $extension === 'core') {
                        continue;
                    }
                    if ($effect === 'default') {
                        DB::table('core_extension_access')->where(['user_id' => $user->id, 'extension_id' => $extension])->delete();
                    } else {
                        DB::table('core_extension_access')->updateOrInsert(
                            ['user_id' => $user->id, 'extension_id' => $extension],
                            ['effect' => $effect, 'updated_at' => now(), 'created_at' => now()],
                        );
                    }
                }
                if (($data['access']['web'] ?? null) === 'allow' && ! $user->pi_username) {
                    $user->forceFill($this->withPiUsername($user->only(['username', 'pi_username']), ['web']))->save();
                }
                Permissions::forget($user);
                $this->syncServices($user, $beforeServices);
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['access' => $error->getMessage()]);
        }
        Permissions::forget($user);
        Audit::record('user.access_changed', ['access' => $data['access']], $user->id);

        return back()->with('status', "Service access saved for {$user->username}.");
    }

    public function resetLink(User $user): RedirectResponse
    {
        abort_if(str_starts_with($user->username, 'removed-'), 404);
        return back()->with('reset_link', ['username' => $user->username, 'url' => ResetLinks::create($user)]);
    }

    public function destroy(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        abort_if($user->is($request->user()) || str_starts_with($user->username, 'removed-'), 422);
        $removal = $request->validate([
            'confirmUsername' => ['required', Rule::in([$user->username])],
            'services' => ['present', 'array'],
            'services.*' => [Rule::in(['cloud', 'web'])],
            'retainData' => ['required', 'boolean'],
        ]);
        if ($user->pi_username === config('plainshow.protected_pi_username')) {
            throw ValidationException::withMessages(['confirmUsername' => 'The protected server account cannot be removed here.']);
        }
        if ($user->role === 'admin' && User::where('role', 'admin')->where('status', 'active')->whereKeyNot($user->id)->doesntExist()) {
            throw ValidationException::withMessages(['confirmUsername' => 'This is the last active administrator.']);
        }
        if (DB::table('core_groups')->where('owner_id', $user->id)->exists()) {
            throw ValidationException::withMessages(['confirmUsername' => 'Transfer or delete their groups first.']);
        }
        $username = $user->username;
        $memberships = DB::table('core_group_members')->where('user_id', $user->id)->pluck('group_id')->all();
        try {
            $selected = array_values(array_unique($removal['services']));
            AccountLifecycle::cloud($user, ! $removal['retainData'] && in_array('cloud', $selected, true) ? 'delete' : 'disable');
            AccountLifecycle::pi($user, ! $removal['retainData'] && in_array('web', $selected, true) ? 'delete' : 'disable');
            foreach ($memberships as $groupId) {
                AccountLifecycle::cloudGroup('remove', (int) $groupId, CloudAccount::for($user));
            }
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['confirmUsername' => $error->getMessage()]);
        }
        DB::transaction(function () use ($user, $username, $removal): void {
            DB::table('core_reserved_usernames')->insert([
                'username' => strtolower($username),
                'former_user_id' => $user->id,
                'created_at' => now(),
            ]);
            $user->forceFill([
                'username' => 'removed-'.$user->id,
                'first_name' => 'Former',
                'last_name' => 'member',
                'email' => null,
                'phone' => null,
                'password' => Hash::make(Str::random(64)),
                'status' => 'disabled',
                'role' => 'guest',
                'two_factor_secret' => null,
                'two_factor_recovery_codes' => null,
                'two_factor_confirmed_at' => null,
                'remember_token' => null,
                'last_login_ip' => null,
            ])->save();
            DB::table('core_group_members')->where('user_id', $user->id)->delete();
            DB::table('core_sessions')->where('user_id', $user->id)->delete();
            DB::table('login_sessions')->where('user_id', $user->id)->delete();
            DB::table('login_password_reset_tokens')->where('username', $username)->delete();
            DB::table('oauth_refresh_tokens')->whereIn('access_token_id', DB::table('oauth_access_tokens')->where('user_id', $user->id)->select('id'))->update(['revoked' => true]);
            DB::table('oauth_access_tokens')->where('user_id', $user->id)->update(['revoked' => true]);
            DB::table('core_extension_access')->where('user_id', $user->id)->delete();
            DB::table('core_user_capabilities')->where('user_id', $user->id)->delete();
            DB::table('core_dashboard_layouts')->where('user_id', $user->id)->delete();
            if (! $removal['retainData'] && in_array('cloud', $removal['services'], true)) {
                DB::table('core_linked_accounts')->where(['user_id' => $user->id, 'provider' => 'nextcloud'])->delete();
            }
        });
        Avatars::remove($user);
        Permissions::forget($user);
        Audit::record('user.removed', ['previous_username' => $username, 'data_retained' => $removal['retainData'], 'services' => $removal['services']], $user->id);

        return back()->with('status', $removal['retainData'] ? 'Account removed. Shared history and service data remain.' : 'Account and selected service data removed.');
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'min:2', 'max:32', 'regex:/^[A-Za-z0-9_.-]+$/', Rule::unique('users', 'username')->ignore($user?->id)],
            'firstName' => ['required', 'string', 'max:60'],
            'lastName' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'role' => ['required', Rule::in(Role::keys())],
            'piUsername' => ['nullable', 'string', 'max:32', 'regex:/^[a-z_][a-z0-9_-]*$/', Rule::unique('users', 'pi_username')->ignore($user?->id)],
        ]);
        if (str_starts_with($data['username'], 'removed-')) {
            throw ValidationException::withMessages(['username' => 'That username is reserved.']);
        }
        if (DB::table('core_reserved_usernames')->where('username', strtolower($data['username']))->exists()) {
            throw ValidationException::withMessages(['username' => 'That username belonged to a removed account.']);
        }
        if (empty($user?->pi_username) && ! empty($data['piUsername']) && $data['piUsername'] !== strtolower($data['username'])) {
            throw ValidationException::withMessages(['piUsername' => 'The server username must match the PlainShow username.']);
        }

        return [
            'username' => $data['username'],
            'first_name' => trim($data['firstName']),
            'last_name' => trim((string) ($data['lastName'] ?? '')),
            'email' => isset($data['email']) ? mb_strtolower($data['email']) : null,
            'role' => $data['role'],
            'pi_username' => $data['piUsername'] ?? null,
        ];
    }

    private function withPiUsername(array $data, array $services): array
    {
        if (! in_array('web', $services, true) || ! empty($data['pi_username'])) {
            return $data;
        }
        $candidate = strtolower($data['username']);
        if (! preg_match('/^[a-z_][a-z0-9_-]{1,30}$/D', $candidate)) {
            throw ValidationException::withMessages(['username' => 'Web access requires a Linux-compatible username.']);
        }
        if (DB::table('users')->where('pi_username', $candidate)->where('username', '!=', $data['username'])->exists()) {
            throw ValidationException::withMessages(['username' => 'That server username is already in use.']);
        }
        $data['pi_username'] = $candidate;

        return $data;
    }

    private function syncServices(User $user, array $before): void
    {
        $after = Permissions::for($user)['services'];
        $changes = [];
        foreach (['cloud', 'web'] as $service) {
            if (in_array($service, $before, true) !== in_array($service, $after, true)) {
                $changes[] = [$service, in_array($service, $after, true) ? 'enable' : 'disable'];
            }
        }
        $applied = [];
        try {
            foreach ($changes as [$service, $action]) {
                if ($service === 'cloud' && $action === 'enable') {
                    $this->reserveCloudAccount($user);
                }
                AccountLifecycle::$service($user, $action);
                $applied[] = [$service, $action];
            }
        } catch (RuntimeException $error) {
            foreach (array_reverse($applied) as [$service, $action]) {
                try {
                    AccountLifecycle::$service($user, $action === 'enable' ? 'disable' : 'enable');
                } catch (RuntimeException $ignored) {
                    report($ignored);
                }
            }
            Permissions::forget($user);
            throw $error;
        }
    }

    private function reserveCloudAccount(User $user, bool $checkCloud = true): void
    {
        if (DB::table('core_linked_accounts')->where(['user_id' => $user->id, 'provider' => 'nextcloud'])->exists()) {
            return;
        }
        if (DB::table('core_linked_accounts')->where(['provider' => 'nextcloud', 'external_id' => $user->username])->exists()
            || ($checkCloud && AccountLifecycle::cloudExists($user->username))) {
            throw new RuntimeException('That Cloud account already belongs to someone else.');
        }
        DB::table('core_linked_accounts')->insert([
            'user_id' => $user->id,
            'provider' => 'nextcloud',
            'external_id' => $user->username,
            'method' => 'managed',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Nobody can lock the platform out of administration by accident. */
    private function guardLastAdmin(Request $request, User $user, array $data): void
    {
        $losesAdmin = $user->role === 'admin' && ($data['role'] !== 'admin' || $data['status'] !== 'active');
        if ($losesAdmin && User::where('role', 'admin')->where('status', 'active')->whereKeyNot($user->id)->doesntExist()) {
            throw ValidationException::withMessages(['role' => 'This is the last active administrator.']);
        }
        if ($user->is($request->user()) && ($data['role'] !== $user->role || $data['status'] !== 'active')) {
            throw ValidationException::withMessages(['role' => 'Ask another administrator to change your own role or status.']);
        }
    }
}
