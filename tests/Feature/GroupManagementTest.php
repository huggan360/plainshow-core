<?php

namespace Tests\Feature;

use App\Http\Controllers\GroupsController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class GroupManagementTest extends TestCase
{
    public function test_owner_manages_members_and_permissions(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username');
            $table->string('first_name');
            $table->string('last_name');
            $table->string('role');
            $table->string('status');
        });
        Schema::create('core_extensions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->boolean('enabled');
            $table->json('default_access');
            $table->integer('sort');
        });
        Schema::create('core_role_capabilities', function (Blueprint $table) {
            $table->string('role');
            $table->string('capability');
        });
        Schema::create('core_extension_access', function (Blueprint $table) {
            $table->integer('user_id');
            $table->string('extension_id');
            $table->string('effect');
        });
        Schema::create('core_user_capabilities', function (Blueprint $table) {
            $table->integer('user_id');
            $table->string('capability');
            $table->string('effect');
        });
        Schema::create('core_capabilities', function (Blueprint $table) {
            $table->string('name');
        });
        Schema::create('core_linked_accounts', function (Blueprint $table) {
            $table->integer('user_id');
            $table->string('provider');
            $table->string('external_id');
        });
        DB::table('core_extensions')->insert(['id' => 'core', 'enabled' => true, 'default_access' => json_encode(['admin', 'member']), 'sort' => 1]);
        config()->set('plainshow.sudo_command', '/usr/bin/true');
        (require database_path('migrations/2026_10_19_120000_create_groups.php'))->up();
        (require database_path('migrations/2026_10_19_160000_add_color_to_groups.php'))->up();

        DB::table('users')->insert([
            ['id' => 1, 'username' => 'owner', 'first_name' => 'Owner', 'last_name' => '', 'role' => 'admin', 'status' => 'active'],
            ['id' => 2, 'username' => 'member', 'first_name' => 'Member', 'last_name' => '', 'role' => 'member', 'status' => 'active'],
        ]);
        $owner = User::findOrFail(1);
        $member = User::findOrFail(2);
        $controller = new GroupsController;

        $controller->store($this->request('POST', '/groups', ['name' => 'Family', 'color' => '#fc5000'], $owner));
        $group = DB::table('core_groups')->first();
        $this->assertSame('Family', $group->name);

        $controller->addMember($this->request('POST', '/groups/'.$group->id.'/members', ['userId' => 2], $owner), $group->id);
        $this->assertSame('view', json_decode(DB::table('core_group_members')->where('user_id', 2)->value('permissions'), true)['calendar']);

        $controller->permissions($this->request('PUT', '/groups/'.$group->id.'/members/2', [
            'permissions' => ['files' => 'view', 'calendar' => 'edit', 'latex' => 'none', 'albums' => 'view'],
        ], $owner), $group->id, $member);
        $this->assertSame('edit', json_decode(DB::table('core_group_members')->where('user_id', 2)->value('permissions'), true)['calendar']);

        $controller->latexPermission($this->request('PUT', '/groups/'.$group->id.'/members/2/latex', ['permission' => 'edit'], $owner), $group->id, $member);
        $this->assertSame('edit', json_decode(DB::table('core_group_members')->where('user_id', 2)->value('permissions'), true)['latex']);

        $controller->transferOwner($this->request('PUT', '/groups/'.$group->id.'/owner', ['userId' => 2], $owner), $group->id);
        $this->assertSame(2, (int) DB::table('core_groups')->where('id', $group->id)->value('owner_id'));
        $controller->transferOwner($this->request('PUT', '/groups/'.$group->id.'/owner', ['userId' => 1], $owner), $group->id);

        $controller->removeMember($this->request('DELETE', '/groups/'.$group->id.'/members/2', [], $owner), $group->id, $member);
        $this->assertDatabaseMissing('core_group_members', ['group_id' => $group->id, 'user_id' => 2]);
    }

    private function request(string $method, string $path, array $data, User $user): Request
    {
        $request = Request::create($path, $method, $data);
        $request->setLaravelSession(app('session')->driver());
        app()->instance('request', $request);
        Auth::setUser($user);

        return $request;
    }
}
