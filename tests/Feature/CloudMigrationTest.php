<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CloudMigrationTest extends TestCase
{
    public function test_cloud_switch_keeps_old_connections_for_rollback(): void
    {
        Schema::create('core_nextcloud_links', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->primary();
            $table->text('app_password');
        });
        DB::table('core_nextcloud_links')->insert(['user_id' => 1, 'app_password' => 'encrypted-fixture']);
        $migration = require database_path('migrations/2026_10_17_200000_drop_nextcloud_links_table.php');
        try {
            $migration->up();
            $this->assertFalse(Schema::hasTable('core_nextcloud_links'));
            $this->assertSame('encrypted-fixture', DB::table('core_nextcloud_links_legacy')->where('user_id', 1)->value('app_password'));
            $migration->down();
            $this->assertFalse(Schema::hasTable('core_nextcloud_links_legacy'));
            $this->assertSame('encrypted-fixture', DB::table('core_nextcloud_links')->where('user_id', 1)->value('app_password'));
        } finally {
            Schema::dropIfExists('core_nextcloud_links');
            Schema::dropIfExists('core_nextcloud_links_legacy');
        }
    }
}
