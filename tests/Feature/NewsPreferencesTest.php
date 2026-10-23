<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\News;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class NewsPreferencesTest extends TestCase
{
    public function test_counties_find_svts_regional_desk(): void
    {
        $this->assertSame('skane', News::region(['name' => 'Lund', 'region' => 'Skåne län', 'countryCode' => 'SE']));
        $this->assertSame('vast', News::region(['name' => 'Göteborg', 'region' => 'Västra Götaland County', 'countryCode' => 'SE']));
        $this->assertSame('smaland', News::region(['name' => 'Växjö', 'region' => 'Kronobergs län', 'countryCode' => 'SE']));
        $this->assertNull(News::region(['name' => 'Utrecht', 'region' => 'Utrecht', 'countryCode' => 'NL']));
        $this->assertNull(News::region(null));
    }

    public function test_preferences_start_from_defaults_and_keep_only_known_choices(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username');
            $table->json('weather')->nullable();
            $table->json('news')->nullable();
            $table->timestamps();
        });
        $user = new User;
        $user->forceFill(['username' => 'hugo', 'weather' => ['home' => ['name' => 'Lund', 'region' => 'Skåne län', 'countryCode' => 'SE', 'lat' => 55.7, 'lon' => 13.19]]])->save();

        $first = News::preferences($user);
        $this->assertFalse($first['setup']);
        $this->assertSame('Lund', $first['place']['name'], 'the weather home is the first guess for the town');
        $this->assertContains('svt', $first['sources']);

        $saved = News::savePreferences($user, ['topics' => ['sport', 'gossip'], 'sources' => ['svt', 'nowhere'], 'place' => null]);
        $this->assertTrue($saved['setup']);
        $this->assertSame(['sport'], $saved['topics']);
        $this->assertSame(['svt'], $saved['sources']);
        $this->assertNull($saved['place']);
    }
}
