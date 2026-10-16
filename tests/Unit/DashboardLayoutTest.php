<?php

namespace Tests\Unit;

use App\Support\Dashboard;
use PHPUnit\Framework\TestCase;

class DashboardLayoutTest extends TestCase
{
    private const CATALOGUE = [
        ['key' => 'core.greeting', 'sizes' => ['l', 'full'], 'default' => 'full', 'settings' => []],
        ['key' => 'core.notes', 'sizes' => ['s', 'm'], 'default' => 'm', 'settings' => [['name' => 'text', 'type' => 'text', 'max' => 20]]],
        ['key' => 'core.bookmarks', 'sizes' => ['m'], 'default' => 'm', 'settings' => [['name' => 'links', 'type' => 'links']]],
    ];

    public function test_unknown_and_repeated_widgets_are_dropped(): void
    {
        $layout = Dashboard::sanitize([['key' => 'core.greeting', 'size' => 'full'], ['key' => 'blog.secret', 'size' => 'm'], ['key' => 'core.greeting', 'size' => 'l']], self::CATALOGUE);

        $this->assertSame([['key' => 'core.greeting', 'size' => 'full']], $layout);
    }

    public function test_a_size_the_widget_lacks_falls_back_to_its_default(): void
    {
        $this->assertSame('m', Dashboard::sanitize([['key' => 'core.notes', 'size' => 'full']], self::CATALOGUE)[0]['size']);
    }

    public function test_titles_glows_and_settings_are_cleaned(): void
    {
        [$notes] = Dashboard::sanitize([[
            'key' => 'core.notes', 'size' => 's', 'title' => '<b>Att göra</b>', 'glow' => 'neon',
            'settings' => ['text' => str_repeat('x', 50), 'extra' => 'dropped'],
        ]], self::CATALOGUE);

        $this->assertSame('Att göra', $notes['title']);
        $this->assertArrayNotHasKey('glow', $notes);
        $this->assertSame(['text' => str_repeat('x', 20)], $notes['settings']);
    }

    public function test_only_web_links_are_kept(): void
    {
        [$bookmarks] = Dashboard::sanitize([['key' => 'core.bookmarks', 'size' => 'm', 'settings' => ['links' => [
            ['label' => 'GitHub', 'url' => 'https://github.com'],
            ['label' => 'Bad', 'url' => 'javascript:alert(1)'],
            ['label' => '', 'url' => 'http://example.com/a'],
        ]]]], self::CATALOGUE);

        $this->assertSame([['label' => 'GitHub', 'url' => 'https://github.com'], ['label' => 'example.com', 'url' => 'http://example.com/a']], $bookmarks['settings']['links']);
    }
}
