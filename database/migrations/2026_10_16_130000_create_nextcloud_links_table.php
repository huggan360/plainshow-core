<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * App passwords people grant core in Nextcloud (Login Flow v2), so the
 * dashboard can show their calendar, recent files and Talk. Stored
 * encrypted; revoked in Nextcloud when they disconnect.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_nextcloud_links', function (Blueprint $table) {
            $table->foreignId('user_id')->primary();
            $table->string('nextcloud_user', 190);
            $table->string('login_name', 190);
            $table->text('app_password');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_nextcloud_links');
    }
};
