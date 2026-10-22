<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core_groups', function (Blueprint $table) {
            $table->string('color', 7)->default('#fc5000')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('core_groups', fn (Blueprint $table) => $table->dropColumn('color'));
    }
};
