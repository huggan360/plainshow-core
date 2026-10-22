<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\AccountLifecycle;
use App\Support\Audit;
use App\Support\CloudAccount;
use App\Support\Permissions;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Throwable;

class GroupsController extends Controller
{
    private const RESOURCES = ['files', 'calendar', 'latex', 'albums'];

    public function index(Request $request): Response
    {
        $viewer = $request->user();
        $groups = DB::table('core_groups as groups')
            ->leftJoin('core_group_members as mine', function ($join) use ($viewer) {
                $join->on('mine.group_id', '=', 'groups.id')->where('mine.user_id', '=', $viewer->id);
            })
            ->when(! Permissions::can($viewer, 'core.groups.manage'), fn ($query) => $query->whereNotNull('mine.user_id'))
            ->select('groups.id', 'groups.name', 'groups.color', 'groups.owner_id')
            ->orderBy('groups.name')->get();
        $members = DB::table('core_group_members as membership')
            ->join('users', 'users.id', '=', 'membership.user_id')
            ->whereIn('membership.group_id', $groups->pluck('id'))
            ->select('membership.group_id', 'membership.user_id', 'membership.permissions', 'users.username', 'users.first_name', 'users.last_name', 'users.status')
            ->get()->groupBy('group_id');

        return Inertia::render('Groups', [
            'groups' => $groups->map(fn ($group) => [
                'id' => $group->id,
                'name' => $group->name,
                'color' => $group->color,
                'ownerId' => $group->owner_id,
                'members' => ($members[$group->id] ?? collect())->map(fn ($member) => [
                    'id' => $member->user_id,
                    'username' => $member->username,
                    'name' => trim($member->first_name.' '.$member->last_name) ?: $member->username,
                    'status' => $member->status,
                    'permissions' => json_decode($member->permissions, true),
                ])->values(),
            ]),
            'people' => User::where('status', 'active')->orderBy('first_name')->get()->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name(),
                'username' => $user->username,
            ]),
            'canCreate' => Permissions::can($viewer, 'core.groups.create'),
            'canManageAll' => Permissions::can($viewer, 'core.groups.manage'),
            'viewerId' => $viewer->id,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_unless(Permissions::can($request->user(), 'core.groups.create'), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        $createdGroupId = null;
        try {
            $groupId = DB::transaction(function () use ($request, $data, &$createdGroupId): int {
                $groupId = DB::table('core_groups')->insertGetId([
                    'name' => trim($data['name']),
                    'color' => strtolower($data['color']),
                    'owner_id' => $request->user()->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $createdGroupId = $groupId;
                DB::table('core_group_members')->insert([
                    'group_id' => $groupId,
                    'user_id' => $request->user()->id,
                    'permissions' => json_encode(self::ownerPermissions()),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                AccountLifecycle::cloudGroup('ensure', $groupId, trim($data['name']));
                AccountLifecycle::cloudGroup('add', $groupId, CloudAccount::for($request->user()));

                return $groupId;
            });
        } catch (Throwable $error) {
            if ($createdGroupId !== null) {
                try {
                    AccountLifecycle::cloudGroup('delete', $createdGroupId);
                } catch (RuntimeException $cleanupError) {
                    report($cleanupError);
                }
            }
            if (! $error instanceof RuntimeException) {
                throw $error;
            }
            throw ValidationException::withMessages(['name' => $error->getMessage()]);
        }
        Audit::record('group.created', ['group_id' => $groupId, 'name' => $data['name']], $request->user()->id);

        return back()->with('status', 'Group created.');
    }

    public function update(Request $request, int $group): RedirectResponse
    {
        $current = $this->manageable($request, $group);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        DB::table('core_groups')->where('id', $group)->update(['name' => trim($data['name']), 'color' => strtolower($data['color']), 'updated_at' => now()]);
        Audit::record('group.updated', ['group_id' => $group, 'before' => ['name' => $current->name, 'color' => $current->color], 'after' => $data], $request->user()->id);

        return back()->with('status', 'Group renamed.');
    }

    public function addMember(Request $request, int $group): RedirectResponse
    {
        $this->manageable($request, $group);
        $data = $request->validate(['userId' => ['required', 'integer', Rule::exists('users', 'id')->where('status', 'active')]]);
        if (DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $data['userId']])->exists()) {
            throw ValidationException::withMessages(['userId' => 'Already in this group.']);
        }
        try {
            DB::transaction(function () use ($group, $data): void {
                DB::table('core_group_members')->insert([
                    'group_id' => $group,
                    'user_id' => $data['userId'],
                    'permissions' => json_encode(array_fill_keys(self::RESOURCES, 'view')),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                AccountLifecycle::cloudGroup('add', $group, CloudAccount::for(User::findOrFail($data['userId'])));
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['userId' => $error->getMessage()]);
        }
        Audit::record('group.member_added', ['group_id' => $group, 'user_id' => $data['userId']], $request->user()->id);

        return back()->with('status', 'Person added to group.');
    }

    public function transferOwner(Request $request, int $group): RedirectResponse
    {
        $current = $this->manageable($request, $group);
        $data = $request->validate(['userId' => ['required', 'integer', Rule::exists('users', 'id')->where('status', 'active')]]);
        abort_if((int) $current->owner_id === (int) $data['userId'], 422);
        abort_unless(DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $data['userId']])->exists(), 422);
        DB::transaction(function () use ($group, $data): void {
            DB::table('core_groups')->where('id', $group)->update(['owner_id' => $data['userId'], 'updated_at' => now()]);
            DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $data['userId']])->update([
                'permissions' => json_encode(self::ownerPermissions()),
                'updated_at' => now(),
            ]);
        });
        Audit::record('group.owner_transferred', ['group_id' => $group, 'before' => $current->owner_id, 'after' => $data['userId']], $request->user()->id);

        return back()->with('status', 'Group owner changed.');
    }

    public function permissions(Request $request, int $group, User $member): RedirectResponse
    {
        $current = $this->manageable($request, $group);
        abort_if((int) $current->owner_id === $member->id, 422);
        abort_unless(DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $member->id])->exists(), 404);
        $data = $request->validate(['permissions' => ['required', 'array'], 'permissions.*' => ['required', Rule::in(['none', 'view', 'edit'])]]);
        if (count($data['permissions']) !== count(self::RESOURCES) || array_diff(array_keys($data['permissions']), self::RESOURCES)) {
            throw ValidationException::withMessages(['permissions' => 'Specify permissions for files, calendar, LaTeX, and albums.']);
        }
        DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $member->id])->update([
            'permissions' => json_encode($data['permissions']),
            'updated_at' => now(),
        ]);
        Audit::record('group.permissions_changed', ['group_id' => $group, 'user_id' => $member->id, 'permissions' => $data['permissions']], $request->user()->id);

        return back()->with('status', 'Group permissions saved.');
    }

    public function latexPermission(Request $request, int $group, User $member): RedirectResponse
    {
        $current = $this->manageable($request, $group);
        abort_if((int) $current->owner_id === $member->id, 422);
        $membership = DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $member->id])->first();
        abort_unless($membership, 404);
        $data = $request->validate(['permission' => ['required', Rule::in(['none', 'view', 'edit'])]]);
        $permissions = json_decode($membership->permissions, true);
        $permissions['latex'] = $data['permission'];
        DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $member->id])->update([
            'permissions' => json_encode($permissions),
            'updated_at' => now(),
        ]);
        Audit::record('group.latex_permission_changed', ['group_id' => $group, 'user_id' => $member->id, 'permission' => $data['permission']], $request->user()->id);

        return back()->with('status', 'LaTeX access saved.');
    }

    public function removeMember(Request $request, int $group, User $member): RedirectResponse
    {
        $current = DB::table('core_groups')->where('id', $group)->first();
        abort_unless($current, 404);
        abort_if((int) $current->owner_id === $member->id, 422);
        if ($request->user()->id !== $member->id) {
            $this->manageable($request, $group);
        }
        try {
            AccountLifecycle::cloudGroup('remove', $group, CloudAccount::for($member));
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['member' => $error->getMessage()]);
        }
        DB::table('core_group_members')->where(['group_id' => $group, 'user_id' => $member->id])->delete();
        Audit::record('group.member_removed', ['group_id' => $group, 'user_id' => $member->id], $request->user()->id);

        return back()->with('status', 'Person removed from group.');
    }

    public function destroy(Request $request, int $group): RedirectResponse
    {
        $this->manageable($request, $group);
        try {
            AccountLifecycle::cloudGroup('delete', $group);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['group' => $error->getMessage()]);
        }
        DB::table('core_groups')->where('id', $group)->delete();
        Audit::record('group.deleted', ['group_id' => $group], $request->user()->id);

        return back()->with('status', 'Group deleted.');
    }

    private function manageable(Request $request, int $group): object
    {
        $current = DB::table('core_groups')->where('id', $group)->first();
        abort_unless($current, 404);
        abort_unless((int) $current->owner_id === $request->user()->id || Permissions::can($request->user(), 'core.groups.manage'), 403);

        return $current;
    }

    private static function ownerPermissions(): array
    {
        return array_fill_keys(self::RESOURCES, 'edit');
    }
}
