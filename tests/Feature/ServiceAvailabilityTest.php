<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ServiceAvailabilityTest extends TestCase
{
    public function test_cloud_and_web_are_unavailable_without_linked_accounts(): void
    {
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
        foreach (['core', 'cloud', 'web'] as $extension) {
            DB::table('core_extensions')->insert(['id' => $extension, 'enabled' => true, 'default_access' => json_encode(['admin', 'member']), 'sort' => 1]);
            DB::table('core_capabilities')->insert(['name' => $extension.'.view']);
        }
        DB::table('core_role_capabilities')->insert(['role' => 'member', 'capability' => '*.view']);
        $user = new User(['username' => 'tester', 'role' => 'member']);
        $user->id = 42;

        $before = Permissions::for($user);
        $this->assertSame(['core'], $before['services']);
        $this->assertNotContains('cloud.view', $before['capabilities']);
        $this->assertNotContains('web.view', $before['capabilities']);

        DB::table('core_linked_accounts')->insert(['user_id' => 42, 'provider' => 'nextcloud', 'external_id' => 'tester']);
        $user->pi_username = 'piuser';
        Permissions::forget($user);
        $after = Permissions::for($user);
        $this->assertContains('cloud', $after['services']);
        $this->assertContains('web', $after['services']);
    }
}
