<?php

use App\Http\Middleware\AuthenticateBearer;
use App\Models\Extension;
use App\Models\Role;
use App\Support\CoreWidgets;
use App\Support\CloudAccount;
use App\Support\ExtensionWidgets;
use App\Support\Permissions;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\Widgets;
use PlainShow\Kit\KitException;

$platformDirectory = static function (User $viewer, string $extension): array {
    $roles = Role::query()->get()->keyBy('key');
    $people = User::query()->where('status', 'active')->where('username', 'not like', 'e2e%')->orderBy('first_name')->orderBy('last_name')->get()
        ->filter(fn (User $user) => Permissions::hasService($user, $extension))
        ->map(function (User $user) use ($roles, $extension): array {
            $role = $roles->get($user->role);
            $summary = $user->summary();
            $summary['avatar'] = $user->avatarUrl() ? url($user->avatarUrl()) : null;

            return array_merge($summary, [
                'role' => [
                    'key' => $user->role,
                    'name' => $role?->name ?? ucfirst($user->role),
                    'color' => $role?->color ?? '#777777',
                ],
                'serviceId' => $extension === 'cloud' ? CloudAccount::for($user) : (string) $user->id,
            ]);
        })->values();
    $eligible = $people->pluck('id')->map(fn ($id) => (int) $id)->all();
    $groups = DB::table('core_group_members as mine')
        ->join('core_groups as groups', 'groups.id', '=', 'mine.group_id')
        ->where('mine.user_id', $viewer->id)
        ->select('groups.id', 'groups.name', 'groups.owner_id', 'mine.permissions')
        ->get();
    $members = DB::table('core_group_members as member')
        ->whereIn('member.group_id', $groups->pluck('id'))
        ->whereIn('member.user_id', $eligible)
        ->select('member.group_id', 'member.user_id')
        ->get()->groupBy('group_id');
    $viewerRole = $roles->get($viewer->role);

    return [
        'viewer' => [
            'id' => $viewer->id,
            'services' => Permissions::for($viewer)['services'],
            'capabilities' => Permissions::for($viewer)['capabilities'],
            'role' => [
                'key' => $viewer->role,
                'name' => $viewerRole?->name ?? ucfirst($viewer->role),
                'color' => $viewerRole?->color ?? '#777777',
            ],
        ],
        'people' => $people,
        'groups' => $groups->map(fn ($group) => [
            'id' => $group->id,
            'name' => $group->name,
            'ownerId' => $group->owner_id,
            'permissions' => json_decode($group->permissions, true),
            'memberIds' => ($members[$group->id] ?? collect())->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
        ])->values(),
    ];
};

// plainshow.se/api/core/v1 (bootstrap/app.php sets the prefix).
Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'core']));

Route::get('/groups/for-user', function (Request $request) use ($platformDirectory) {
    $extension = (string) $request->query('extension', '');
    if (! in_array($extension, ['cloud', 'split', 'latex', 'blog'], true)) {
        return response()->json(['error' => 'unknown_extension'], 400);
    }
    try {
        $userId = Widgets::verify($request->query(), 'groups', ExtensionWidgets::secret($extension) ?? '');
    } catch (KitException) {
        return response()->json(['error' => 'invalid_signature'], 403);
    }
    $user = User::find($userId);
    if (! $user || ! Permissions::hasService($user, $extension)) {
        return response()->json(['groups' => [], 'people' => []], 403);
    }

    return response()->json($platformDirectory($user, $extension))->header('Cache-Control', 'no-store');
});

Route::get('/directory/for-cloud-account', function (Request $request) use ($platformDirectory) {
    $account = (string) $request->query('account', '');
    $timestamp = (int) $request->query('ts', 0);
    $signature = (string) $request->query('sig', '');
    $secret = ExtensionWidgets::secret('cloud') ?? '';
    if ($account === '' || $secret === '' || abs(time() - $timestamp) > 60
        || ! hash_equals(hash_hmac('sha256', "cloud-directory|$account|$timestamp", $secret), $signature)) {
        return response()->json(['error' => 'invalid_signature'], 403);
    }
    $userId = DB::table('core_linked_accounts')->where(['provider' => 'nextcloud', 'external_id' => $account])->value('user_id');
    $user = $userId ? User::find($userId) : User::where('username', $account)->first();
    if (! $user || ! Permissions::hasService($user, 'cloud')) {
        return response()->json(['groups' => [], 'people' => []], 403);
    }

    return response()->json($platformDirectory($user, 'cloud'))->header('Cache-Control', 'no-store');
});

Route::middleware([AuthenticateBearer::class.':core', 'throttle:120,1'])->group(function () {
    Route::get('/me', function (Request $request) {
        $user = $request->user();

        return $user->summary() + Permissions::for($user);
    });
    Route::get('/extensions', fn (Request $request) => Extension::where('enabled', true)->orderBy('sort')->get()
        ->filter(fn (Extension $extension) => $extension->id === 'core' || Permissions::hasService($request->user(), $extension->id))
        ->map->summary()->values());
    Route::get('/system', function (Request $request) {
        return CoreWidgets::data('pi-health', $request->user());
    });
});
