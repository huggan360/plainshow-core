<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extension;
use App\Models\User;
use App\Support\Audit;
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

class UsersController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->query('q', ''));
        $users = User::query()
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
            ]);

        return Inertia::render('Admin/Users', [
            'users' => $users,
            'search' => $search,
            'extensions' => Extension::orderBy('sort')->get()->map->summary(),
            'access' => DB::table('core_extension_access')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('effect', 'extension_id')),
            'roles' => User::ROLES,
            'resetLink' => $request->session()->get('reset_link'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $user = new User;
        $user->forceFill($data + [
            // Unusable until the person sets their own through the reset link.
            'password' => Hash::make(Str::random(64)),
            'status' => 'active',
        ])->save();
        Audit::record('user.created', ['username' => $user->username, 'role' => $user->role], $user->id);

        return back()
            ->with('status', "Account {$user->username} created. Send them the link below to set a password.")
            ->with('reset_link', ['username' => $user->username, 'url' => ResetLinks::create($user)]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $data = $this->validated($request, $user);
        $data['status'] = $request->validate(['status' => ['required', Rule::in(['active', 'disabled'])]])['status'];
        $this->guardLastAdmin($request, $user, $data);

        $before = $user->only(['role', 'status', 'pi_username']);
        $user->forceFill($data)->save();
        if ($data['status'] !== 'active') {
            // Disabled accounts lose every session and token at once.
            DB::table('core_sessions')->where('user_id', $user->id)->delete();
            DB::table('login_sessions')->where('user_id', $user->id)->delete();
            DB::table('oauth_access_tokens')->where('user_id', $user->id)->update(['revoked' => true]);
        }
        Permissions::forget($user);
        Audit::record('user.updated', ['before' => $before, 'after' => $user->only(['role', 'status', 'pi_username'])], $user->id);

        return back()->with('status', "Saved {$user->username}.");
    }

    public function access(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'access' => ['present', 'array'],
            'access.*' => ['required', Rule::in(['default', 'allow', 'deny'])],
        ]);
        $known = Extension::pluck('id')->all();
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
        Permissions::forget($user);
        Audit::record('user.access_changed', ['access' => $data['access']], $user->id);

        return back()->with('status', "Service access saved for {$user->username}.");
    }

    public function resetLink(User $user): RedirectResponse
    {
        return back()->with('reset_link', ['username' => $user->username, 'url' => ResetLinks::create($user)]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'min:2', 'max:32', 'regex:/^[A-Za-z0-9_.-]+$/', Rule::unique('users', 'username')->ignore($user?->id)],
            'firstName' => ['required', 'string', 'max:60'],
            'lastName' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'role' => ['required', Rule::in(User::ROLES)],
            'piUsername' => ['nullable', 'string', 'max:32', 'regex:/^[a-z_][a-z0-9_-]*$/', Rule::unique('users', 'pi_username')->ignore($user?->id)],
        ]);

        return [
            'username' => $data['username'],
            'first_name' => trim($data['firstName']),
            'last_name' => trim((string) ($data['lastName'] ?? '')),
            'email' => isset($data['email']) ? mb_strtolower($data['email']) : null,
            'role' => $data['role'],
            'pi_username' => $data['piUsername'] ?? null,
        ];
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
