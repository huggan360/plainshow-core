<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The theme colour each person chose in the Design studio (null: PlainShow orange). */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('accent', 16)->nullable()->after('news');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('accent');
        });
    }
};
