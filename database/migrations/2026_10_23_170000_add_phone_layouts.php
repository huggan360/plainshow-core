<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A phone layout of its own, beside the desktop one: null means the phone
 * shows the desktop layout in one column.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['core_dashboard_layouts', 'core_role_layouts'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->json('phone')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['core_dashboard_layouts', 'core_role_layouts'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn('phone');
            });
        }
    }
};
