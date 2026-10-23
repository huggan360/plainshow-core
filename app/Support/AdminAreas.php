<?php

namespace App\Support;

use App\Models\User;

/**
 * The parts of the admin area and who may open them. The Administration page,
 * the account menu and the tabs on admin pages all come from here, so a
 * person only ever sees what they can use.
 */
class AdminAreas
{
    /** @return list<array{id: string, href: string, icon: string, label: string, description: string}> */
    public static function for(User $user): array
    {
        $areas = [
            ['id' => 'users', 'capability' => 'core.users.manage', 'href' => '/admin/users', 'icon' => 'bx-group', 'label' => __('Accounts'), 'description' => __('People, their roles and access.')],
            ['id' => 'services', 'capability' => 'core.extensions.manage', 'href' => '/admin/services', 'icon' => 'bx-extension', 'label' => __('Services'), 'description' => __('The services PlainShow runs, and who sees them.')],
            ['id' => 'permissions', 'capability' => 'core.permissions.manage', 'href' => '/admin/permissions', 'icon' => 'bx-key', 'label' => __('Permissions'), 'description' => __('Roles and what each can do.')],
            ['id' => 'updates', 'capability' => 'core.updates.apply', 'href' => '/admin/updates', 'icon' => 'bx-refresh', 'label' => __('Updates'), 'description' => __('New versions, installed with one click.')],
            ['id' => 'audit', 'capability' => 'core.audit.view', 'href' => '/admin/audit', 'icon' => 'bx-list-ul', 'label' => __('Audit log'), 'description' => __('Who did what, and when.')],
        ];

        return array_values(array_map(
            fn (array $area) => array_diff_key($area, ['capability' => true]),
            array_filter($areas, fn (array $area) => Permissions::can($user, $area['capability'])),
        ));
    }
}
