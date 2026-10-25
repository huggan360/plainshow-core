<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Which opening of the Assistant page a turn belongs to: memory lasts only as long as the page. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core_assistant_turns', function (Blueprint $table) {
            $table->string('conversation', 40)->nullable()->after('user_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('core_assistant_turns', function (Blueprint $table) {
            $table->dropColumn('conversation');
        });
    }
};
