<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cloud's widgets no longer need an app password per person: Core signs the
// request and names their Cloud account. (The app passwords themselves are
// removed in Cloud, as devices named "PlainShow dashboard".)
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('core_nextcloud_links')) {
            Schema::rename('core_nextcloud_links', 'core_nextcloud_links_legacy');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('core_nextcloud_links_legacy')) {
            Schema::rename('core_nextcloud_links_legacy', 'core_nextcloud_links');
            return;
        }
        Schema::create('core_nextcloud_links', function (Blueprint $table) {
            $table->foreignId('user_id')->primary();
            $table->string('nextcloud_user', 190);
            $table->string('login_name', 190);
            $table->text('app_password');
            $table->timestamps();
        });
    }
};
