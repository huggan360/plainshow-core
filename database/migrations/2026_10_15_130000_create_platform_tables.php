<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform tables owned by core. Login reads them to fill token claims
 * (see PlainShow\Kit\Access); only core writes them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        Schema::create('core_extensions', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('name', 60);
            $table->string('description')->default('');
            $table->string('icon', 40)->default('bx-extension');
            $table->string('url')->nullable();
            $table->string('api_url')->nullable();
            $table->string('version', 40)->nullable();
            $table->boolean('enabled')->default(true);
            $table->boolean('system')->default(false);
            $table->json('default_access');
            $table->json('manifest')->nullable();
            $table->unsignedSmallInteger('sort')->default(100);
            $table->timestamps();
        });

        Schema::create('core_capabilities', function (Blueprint $table) {
            $table->string('name', 80)->primary();
            $table->string('extension_id', 32)->index();
            $table->string('label', 120);
            $table->string('description')->default('');
            $table->timestamps();
        });

        Schema::create('core_role_capabilities', function (Blueprint $table) {
            $table->string('role', 16);
            $table->string('capability', 80);
            $table->primary(['role', 'capability']);
        });

        Schema::create('core_user_capabilities', function (Blueprint $table) {
            $table->foreignId('user_id');
            $table->string('capability', 80);
            $table->string('effect', 8);
            $table->timestamps();
            $table->primary(['user_id', 'capability']);
        });

        Schema::create('core_extension_access', function (Blueprint $table) {
            $table->foreignId('user_id');
            $table->string('extension_id', 32);
            $table->string('effect', 8);
            $table->timestamps();
            $table->primary(['user_id', 'extension_id']);
        });

        Schema::create('core_dashboard_layouts', function (Blueprint $table) {
            $table->foreignId('user_id')->primary();
            $table->json('widgets');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['core_dashboard_layouts', 'core_extension_access', 'core_user_capabilities', 'core_role_capabilities', 'core_capabilities', 'core_extensions', 'core_sessions'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
