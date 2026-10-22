<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core_roles', function (Blueprint $table) {
            $table->string('color', 7)->default('#64748b')->after('name');
        });
        foreach (['admin' => '#ef4444', 'moderator' => '#f59e0b', 'user' => '#22c55e', 'guest' => '#64748b'] as $key => $color) {
            DB::table('core_roles')->where('key', $key)->update(['color' => $color]);
        }
    }

    public function down(): void
    {
        Schema::table('core_roles', fn (Blueprint $table) => $table->dropColumn('color'));
    }
};
