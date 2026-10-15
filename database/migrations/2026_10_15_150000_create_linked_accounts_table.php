<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Accounts in other systems tied to a PlainShow account, such as a Nextcloud user. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_linked_accounts', function (Blueprint $table) {
            $table->foreignId('user_id');
            $table->string('provider', 32);
            $table->string('external_id', 64);
            $table->string('method', 32)->default('manual');
            $table->timestamps();
            $table->primary(['user_id', 'provider']);
            $table->unique(['provider', 'external_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_linked_accounts');
    }
};
