<?php

namespace Tests\Unit;

use App\Support\Dashboard;
use PHPUnit\Framework\TestCase;

class DashboardLayoutTest extends TestCase
{
    private const CATALOGUE = [
        ['key' => 'core.greeting', 'sizes' => ['l', 'full'], 'default' => 'full', 'height' => 'short', 'settings' => []],
        ['key' => 'core.notes', 'sizes' => ['s', 'm'], 'default' => 'm', 'height' => 'normal', 'settings' => [['name' => 'text', 'type' => 'text', 'max' => 20]]],
        ['key' => 'core.bookmarks', 'sizes' => ['m'], 'default' => 'm', 'height' => 'normal', 'settings' => [['name' => 'links', 'type' => 'links']]],
        ['key' => 'core.weather', 'sizes' => ['m'], 'default' => 'm', 'height' => 'normal', 'settings' => [['name' => 'place', 'type' => 'place']]],
    ];

    public function test_unknown_and_repeated_widgets_are_dropped(): void
    {
        $layout = Dashboard::sanitize([['key' => 'core.greeting', 'size' => 'full'], ['key' => 'blog.secret', 'size' => 'm'], ['key' => 'core.greeting', 'size' => 'l']], self::CATALOGUE);

        $this->assertSame([['key' => 'core.greeting', 'size' => 'full', 'height' => 'short']], $layout);
    }

    public function test_a_size_the_widget_lacks_falls_back_to_its_default(): void
    {
        $this->assertSame('m', Dashboard::sanitize([['key' => 'core.notes', 'size' => 'full']], self::CATALOGUE)[0]['size']);
    }

    public function test_titles_cannot_be_renamed_and_borders_and_settings_are_cleaned(): void
    {
        [$notes, $weather] = Dashboard::sanitize([[
            'key' => 'core.notes', 'size' => 's', 'title' => '<b>Att göra</b>', 'glow' => 'accent', 'border' => 'neon',
            'settings' => ['text' => str_repeat('x', 50), 'extra' => 'dropped'],
        ], [
            'key' => 'core.weather', 'size' => 'm', 'border' => 'ocean',
            'settings' => ['place' => ['name' => '<i>Lund</i>', 'region' => 'Skåne', 'countryCode' => 'se1', 'lat' => '55.70471', 'lon' => 13.191, 'evil' => 'x']],
        ]], self::CATALOGUE);

        $this->assertArrayNotHasKey('title', $notes);
        $this->assertArrayNotHasKey('glow', $notes);
        $this->assertArrayNotHasKey('border', $notes);
        $this->assertSame(['text' => str_repeat('x', 20)], $notes['settings']);
        $this->assertSame('ocean', $weather['border']);
        $this->assertSame(['name' => 'Lund', 'region' => 'Skåne', 'countryCode' => 'SE', 'lat' => 55.7047, 'lon' => 13.191], $weather['settings']['place']);
    }

    public function test_a_place_needs_real_coordinates(): void
    {
        [$weather] = Dashboard::sanitize([['key' => 'core.weather', 'size' => 'm', 'settings' => ['place' => ['name' => 'Nowhere', 'lat' => 200, 'lon' => 0]]]], self::CATALOGUE);

        $this->assertArrayNotHasKey('settings', $weather);
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
