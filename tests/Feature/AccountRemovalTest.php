<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\UsersController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AccountRemovalTest extends TestCase
{
    public function test_removal_revokes_access_and_preserves_external_account_reservation(): void
    {
        (require base_path('../login/database/migrations/0001_01_01_000000_create_users_table.php'))->up();
        (require database_path('migrations/2026_10_15_130000_create_platform_tables.php'))->up();
        (require database_path('migrations/2026_10_15_150000_create_linked_accounts_table.php'))->up();
        (require database_path('migrations/2026_10_19_120000_create_groups.php'))->up();
        (require database_path('migrations/2026_10_19_130000_reserve_removed_usernames.php'))->up();
        Schema::create('oauth_access_tokens', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->integer('user_id');
            $table->boolean('revoked');
        });
        Schema::create('oauth_refresh_tokens', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('access_token_id');
            $table->boolean('revoked');
        });
        config()->set('plainshow.sudo_command', '/usr/bin/true');
        $admin = User::forceCreate(['id' => 1, 'username' => 'admin', 'password' => 'unused', 'role' => 'admin', 'status' => 'active']);
        $person = User::forceCreate(['id' => 2, 'username' => 'person', 'first_name' => 'Real', 'last_name' => 'Name', 'email' => 'person@example.com', 'phone' => '0700000000', 'password' => 'unused', 'role' => 'member', 'status' => 'active']);
        DB::table('core_linked_accounts')->insert(['user_id' => 2, 'provider' => 'nextcloud', 'external_id' => 'person', 'method' => 'managed']);
        DB::table('oauth_access_tokens')->insert(['id' => 'access', 'user_id' => 2, 'revoked' => false]);
        DB::table('oauth_refresh_tokens')->insert(['id' => 'refresh', 'access_token_id' => 'access', 'revoked' => false]);
        $request = Request::create('/admin/users/2', 'DELETE', ['confirmUsername' => 'person', 'services' => [], 'retainData' => true]);
        $request->setLaravelSession(app('session')->driver());
        app()->instance('request', $request);
        Auth::setUser($admin);

        (new UsersController)->destroy($request, $person);

        $person->refresh();
        $this->assertSame('removed-2', $person->username);
        $this->assertSame('disabled', $person->status);
        $this->assertNull($person->email);
        $this->assertDatabaseHas('core_linked_accounts', ['user_id' => 2, 'external_id' => 'person']);
        $this->assertDatabaseHas('core_reserved_usernames', ['username' => 'person', 'former_user_id' => 2]);
        $this->assertDatabaseHas('oauth_access_tokens', ['id' => 'access', 'revoked' => true]);
        $this->assertDatabaseHas('oauth_refresh_tokens', ['id' => 'refresh', 'revoked' => true]);
    }
}
