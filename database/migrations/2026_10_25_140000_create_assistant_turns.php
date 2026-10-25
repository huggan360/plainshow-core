<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** What was asked of the Composer and what it answered; kept seven days (App\Support\Assistant\Engine). */
    public function up(): void
    {
        Schema::create('core_assistant_turns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->index();
            $table->text('request');
            $table->longText('result');
            $table->text('memory')->nullable();
            $table->timestamp('created_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_assistant_turns');
    }
};
