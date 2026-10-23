<?php

namespace Tests\Unit;

use App\Support\Dashboard;
use PHPUnit\Framework\TestCase;

class DashboardLayoutTest extends TestCase
{
    private const CATALOGUE = [
        ['key' => 'core.greeting', 'min' => [3, 2], 'w' => 12, 'h' => 2, 'settings' => []],
        ['key' => 'core.notes', 'min' => [2, 2], 'w' => 4, 'h' => 4, 'settings' => [['name' => 'text', 'type' => 'text', 'max' => 20]]],
        ['key' => 'core.bookmarks', 'min' => [2, 2], 'w' => 4, 'h' => 4, 'settings' => [['name' => 'links', 'type' => 'links']]],
        ['key' => 'core.weather', 'min' => [2, 2], 'w' => 4, 'h' => 4, 'settings' => [['name' => 'place', 'type' => 'place']]],
    ];

    public function test_unknown_and_repeated_widgets_are_dropped(): void
    {
        $layout = Dashboard::sanitize([['key' => 'core.greeting', 'size' => 'full'], ['key' => 'blog.secret', 'size' => 'm'], ['key' => 'core.greeting', 'size' => 'l']], self::CATALOGUE);

        $this->assertSame([['key' => 'core.greeting', 'x' => 0, 'y' => 0, 'w' => 12, 'h' => 2]], $layout);
    }

    public function test_old_layouts_are_placed_in_their_order(): void
    {
        $layout = Dashboard::sanitize([['key' => 'core.greeting', 'size' => 'full', 'height' => 'short'], ['key' => 'core.notes', 'size' => 'm'], ['key' => 'core.bookmarks', 'size' => 'm', 'height' => 'tall']], self::CATALOGUE);

        $this->assertSame([0, 0, 12, 2], [$layout[0]['x'], $layout[0]['y'], $layout[0]['w'], $layout[0]['h']]);
        $this->assertSame([0, 2, 4, 4], [$layout[1]['x'], $layout[1]['y'], $layout[1]['w'], $layout[1]['h']]);
        $this->assertSame([4, 2, 4, 6], [$layout[2]['x'], $layout[2]['y'], $layout[2]['w'], $layout[2]['h']]);
    }

    public function test_widgets_never_overlap_and_keep_their_smallest_size(): void
    {
        $layout = Dashboard::sanitize([
            ['key' => 'core.notes', 'x' => 0, 'y' => 0, 'w' => 6, 'h' => 4],
            ['key' => 'core.bookmarks', 'x' => 2, 'y' => 1, 'w' => 1, 'h' => 1],
            ['key' => 'core.weather', 'x' => 11, 'y' => 0, 'w' => 4, 'h' => 30],
        ], self::CATALOGUE);
        $byKey = collect($layout)->keyBy('key');

        $this->assertSame([2, 2], [$byKey['core.bookmarks']['w'], $byKey['core.bookmarks']['h']], 'no smaller than its minimum');
        $this->assertSame([6, 0], [$byKey['core.bookmarks']['x'], $byKey['core.bookmarks']['y']], 'moved to the first free place');
        $this->assertSame([8, 12], [$byKey['core.weather']['x'], $byKey['core.weather']['h']], 'kept inside the grid');
    }

    public function test_the_phone_follows_the_desktop_until_it_has_its_own(): void
    {
        $desktop = Dashboard::sanitize([['key' => 'core.notes', 'x' => 6, 'y' => 0, 'w' => 6, 'h' => 4], ['key' => 'core.greeting', 'x' => 0, 'y' => 0, 'w' => 6, 'h' => 2]], self::CATALOGUE);
        $follows = Dashboard::phoneFor(null, $desktop, self::CATALOGUE);
        $own = Dashboard::phoneFor([['key' => 'core.notes', 'h' => 9], ['key' => 'core.notes', 'h' => 3], ['key' => 'nope']], $desktop, self::CATALOGUE);

        $this->assertFalse($follows['custom']);
        $this->assertSame(['core.greeting', 'core.notes'], array_column($follows['items'], 'key'));
        $this->assertTrue($own['custom']);
        $this->assertSame([['key' => 'core.notes', 'h' => 9]], $own['items']);
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
