<?php

use PlainShow\Kit\Platform;

/*
 * What the update runner may install, and how. `release` components build a
 * tag into /srv/plainshow/<id>/releases with their own deploy script and can
 * switch back to any kept release. `checkout` components are served from a
 * git checkout: they move forward to a tag, then run their steps.
 * `{source}`, `{ref}` and `{core}` are filled in by the runner.
 *
 * Addresses, folders and service names come from the platform file
 * (/etc/plainshow/platform.json); only the apps installed here are listed.
 */
$projects = env('PLAINSHOW_PROJECTS', Platform::system('sources', '/home/hugohansson/projects/plainshow'));
$web = Platform::system('web_user', 'www-data');
$health = fn (string $app, string $path) => ($url = Platform::url($app)) === null ? null : $url.$path;
$latexWebsocket = Platform::system('latex_websocket', 'pm2') === 'pm2'
    ? ['plainshow', 'project', 'plainshow-latex', 'pm2', 'restart', 'latex-websocket']
    : ['sudo', '-n', 'systemctl', 'restart', 'plainshow-latex-websocket'];

return [
    // While a component installs, the runner touches <flags>/<host> for its
    // site; Apache then shows the "updating" page (ops/apache/plainshow-errors.conf).
    'flags' => env('PLAINSHOW_UPDATING_FLAGS', '/srv/plainshow/updating'),

    'components' => array_filter([
        'core' => [
            'name' => 'Dashboard', 'kind' => 'release', 'source' => "$projects/core", 'base' => '/srv/plainshow/core',
            'deploy' => ['bash', 'ops/deploy.sh', 'core', '{source}', '{ref}'],
            'health' => $health('core', '/up'),
        ],
        'login' => [
            'name' => 'Login', 'kind' => 'release', 'source' => "$projects/login", 'base' => '/srv/plainshow/login',
            'deploy' => ['bash', '{core}/ops/deploy.sh', 'login', '{source}', '{ref}'],
            'health' => $health('login', '/up'),
        ],
        'blog' => [
            'name' => 'Blog', 'kind' => 'release', 'source' => "$projects/blog", 'base' => '/srv/plainshow/blog',
            'deploy' => ['bash', 'ops/deploy.sh', '{ref}'],
            'health' => $health('blog', '/api/v1/health'),
        ],
        'split' => [
            'name' => 'Split', 'kind' => 'release', 'source' => "$projects/split", 'base' => '/srv/plainshow/split',
            'deploy' => ['bash', 'ops/deploy.sh', '{ref}'],
            'health' => $health('split', '/api/v1/health'),
        ],
        'latex' => [
            'name' => 'LaTeX', 'kind' => 'checkout', 'source' => env('PLAINSHOW_LATEX_SOURCE', Platform::system('latex_dir', '/var/www/html/projects/hugohansson/plainshow-latex')), 'remote' => 'origin',
            'steps' => [
                ['composer', 'install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--no-progress'],
                // Releases before 2.5 have no migrations.
                ['sh', '-c', '[ ! -f bin/migrate.php ] || php bin/migrate.php'],
                $latexWebsocket,
            ],
            'health' => $health('latex', '/'),
        ],
        'cloud' => [
            'name' => 'Cloud', 'kind' => 'checkout', 'source' => env('PLAINSHOW_CLOUD_SOURCE', Platform::system('cloud_dir', '/var/www/html/cloud')), 'remote' => 'origin',
            'steps' => [
                ['composer', 'install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--no-progress', '--working-dir', 'apps/plainshow'],
                ['sudo', '-n', '-u', $web, 'php', 'occ', 'upgrade', '--no-interaction'],
                ['sudo', '-n', '-u', $web, 'php', 'occ', 'maintenance:repair', '--no-interaction'],
                // Nextcloud keeps its routes in APCu; a reload clears them.
                ['sudo', '-n', 'systemctl', 'reload', Platform::system('web_service', 'apache2')],
                ['sudo', '-n', 'systemctl', 'restart', 'notify_push'],
            ],
            'health' => $health('cloud', '/index.php/apps/plainshow/api/v1/health'),
        ],
        'web' => [
            'name' => 'Web', 'kind' => 'checkout', 'source' => '/opt/plainshow', 'remote' => 'web',
            'steps' => [
                ['composer', 'install', '--no-interaction', '--no-progress'],
                ['npm', 'run', 'build'],
                ['php', 'artisan', 'migrate', '--force'],
                ['php', 'artisan', 'route:cache'],
            ],
            'health' => $health('web', '/login'),
        ],
        'kit' => [
            'name' => 'UI kit', 'kind' => 'library', 'source' => "$projects/kit",
        ],
    ], fn (array $component, string $id) => $id === 'kit' ? is_dir($component['source']) : Platform::installed($id), ARRAY_FILTER_USE_BOTH),
];
