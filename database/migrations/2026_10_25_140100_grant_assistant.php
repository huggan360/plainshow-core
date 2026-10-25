<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The Composer for people who can use the dashboard, and its Cloud actions
     * for whoever already reads that part of Cloud. A new install gets the
     * same from Registry's defaults instead (the table is still empty here).
     */
    public function up(): void
    {
        if (! DB::table('core_role_capabilities')->exists()) {
            return;
        }
        foreach (['user', 'moderator'] as $role) {
            DB::table('core_role_capabilities')->insertOrIgnore(['role' => $role, 'capability' => 'core.assistant.use']);
        }
        $follow = ['cloud.calendar.view' => 'cloud.calendar.edit', 'cloud.files.view' => 'cloud.files.share'];
        foreach ($follow as $view => $new) {
            foreach (DB::table('core_role_capabilities')->where('capability', $view)->pluck('role') as $role) {
                DB::table('core_role_capabilities')->insertOrIgnore(['role' => $role, 'capability' => $new]);
            }
            foreach (DB::table('core_user_capabilities')->where(['capability' => $view, 'effect' => 'allow'])->pluck('user_id') as $user) {
                DB::table('core_user_capabilities')->insertOrIgnore(['user_id' => $user, 'capability' => $new, 'effect' => 'allow', 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        $names = ['core.assistant.use', 'cloud.calendar.edit', 'cloud.files.share'];
        DB::table('core_role_capabilities')->whereIn('capability', $names)->delete();
        DB::table('core_user_capabilities')->whereIn('capability', $names)->delete();
    }
};
