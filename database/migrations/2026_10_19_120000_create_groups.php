<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->foreignId('owner_id')->index();
            $table->timestamps();
        });

        Schema::create('core_group_members', function (Blueprint $table) {
            $table->foreignId('group_id');
            $table->foreignId('user_id')->index();
            $table->json('permissions');
            $table->timestamps();
            $table->primary(['group_id', 'user_id']);
            $table->foreign('group_id')->references('id')->on('core_groups')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_group_members');
        Schema::dropIfExists('core_groups');
    }
};
