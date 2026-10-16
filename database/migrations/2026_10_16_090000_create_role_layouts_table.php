<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The dashboard a role starts from, saved by an admin in the Design studio. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_role_layouts', function (Blueprint $table) {
            $table->string('role', 16)->primary();
            $table->json('widgets');
            $table->foreignId('updated_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_role_layouts');
    }
};
