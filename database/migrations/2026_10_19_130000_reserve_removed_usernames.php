<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_reserved_usernames', function (Blueprint $table) {
            $table->string('username', 32)->primary();
            $table->foreignId('former_user_id')->index();
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_reserved_usernames');
    }
};
