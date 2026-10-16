<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Updates are requested in core and carried out by the update runner
 * (php artisan plainshow:updates, run from cron as the deploying user).
 * Core itself never runs a command; it only reads and writes these rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_components', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('name', 60);
            $table->string('kind', 16);
            $table->string('installed', 80)->nullable();
            $table->string('installed_ref', 64)->nullable();
            $table->string('latest', 80)->nullable();
            $table->boolean('update_available')->default(false);
            $table->longText('changelog')->nullable();
            $table->json('releases')->nullable();
            $table->string('error')->nullable();
            $table->timestamp('checked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('core_update_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('component', 32)->index();
            $table->string('action', 16);
            $table->string('target', 120)->nullable();
            $table->string('status', 16)->default('queued')->index();
            $table->longText('log')->nullable();
            $table->foreignId('requested_by')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_update_jobs');
        Schema::dropIfExists('core_components');
    }
};
