<?php

namespace App\Support;

use App\Models\User;

/**
 * Apps built into the dashboard itself (Composer, News and Weather). They
 * open in the dashboard's own content area, sit above Services in the
 * sidebar, and their widgets can be expanded into them.
 */
class CoreApps
{
    /** @return list<array{id: string, name: string, icon: string, url: string, widgets: list<string>}> */
    public static function for(User $user): array
    {
        $apps = [
            ['id' => 'composer', 'name' => __('Composer'), 'icon' => 'bx-sparkles', 'url' => '/composer', 'widgets' => ['core.composer'], 'capability' => 'core.assistant.use'],
            ['id' => 'news', 'name' => __('News'), 'icon' => 'bx-news', 'url' => '/news', 'widgets' => ['core.news', 'core.news-top', 'core.news-strip']],
            ['id' => 'weather', 'name' => __('Weather'), 'icon' => 'bx-cloud-light-rain', 'url' => '/weather', 'widgets' => ['core.weather', 'core.forecast', 'core.radar']],
        ];

        return array_values(array_filter($apps, fn (array $app) => Permissions::can($user, $app['capability'] ?? 'core.dashboard.use')));
    }
}
