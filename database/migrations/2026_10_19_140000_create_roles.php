<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_roles', function (Blueprint $table) {
            $table->string('key', 16)->primary();
            $table->string('name', 60)->unique();
            $table->boolean('protected')->default(false);
            $table->unsignedSmallInteger('sort')->default(100);
            $table->timestamps();
        });

        $now = now();
        DB::table('core_roles')->insert([
            ['key' => 'admin', 'name' => 'Admin', 'protected' => true, 'sort' => 10, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'moderator', 'name' => 'Moderator', 'protected' => false, 'sort' => 20, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'user', 'name' => 'User', 'protected' => false, 'sort' => 30, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'guest', 'name' => 'Guest', 'protected' => false, 'sort' => 40, 'created_at' => $now, 'updated_at' => $now],
        ]);

        DB::table('users')->where('role', 'member')->update(['role' => 'user']);
        DB::table('core_role_capabilities')->where('role', 'member')->update(['role' => 'user']);
        if (Schema::hasTable('core_role_layouts')) {
            DB::table('core_role_layouts')->where('role', 'member')->update(['role' => 'user']);
        }
        DB::table('core_extensions')->orderBy('id')->each(function ($extension): void {
            $access = json_decode($extension->default_access ?: '[]', true) ?: [];
            $access = array_values(array_unique(array_map(fn ($role) => $role === 'member' ? 'user' : $role, $access)));
            DB::table('core_extensions')->where('id', $extension->id)->update(['default_access' => json_encode($access)]);
        });
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'user')->update(['role' => 'member']);
        DB::table('core_role_capabilities')->where('role', 'user')->update(['role' => 'member']);
        if (Schema::hasTable('core_role_layouts')) {
            DB::table('core_role_layouts')->where('role', 'user')->update(['role' => 'member']);
        }
        DB::table('core_extensions')->orderBy('id')->each(function ($extension): void {
            $access = json_decode($extension->default_access ?: '[]', true) ?: [];
            $access = array_values(array_unique(array_map(fn ($role) => $role === 'user' ? 'member' : $role, $access)));
            DB::table('core_extensions')->where('id', $extension->id)->update(['default_access' => json_encode($access)]);
        });
        Schema::dropIfExists('core_roles');
    }
};
