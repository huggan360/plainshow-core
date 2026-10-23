<?php

namespace Tests\Feature;

use App\Http\Controllers\WeatherController;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class WeatherPlacesTest extends TestCase
{
    public function test_home_and_saved_places_are_kept_clean_and_once(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username');
            $table->json('weather')->nullable();
            $table->timestamps();
        });
        $user = new User;
        $user->forceFill(['username' => 'hugo'])->save();
        $controller = new WeatherController;
        $call = function (string $method, array $body) use ($user, $controller) {
            $request = Request::create('/weather', 'POST', $body);
            $request->setUserResolver(fn () => $user);

            return $controller->{$method}($request)->getData(true);
        };
        $lund = ['name' => '<b>Lund</b>', 'region' => 'Skåne', 'countryCode' => 'se', 'lat' => 55.7047, 'lon' => 13.191];

        $places = $call('setHome', ['place' => $lund]);
        $this->assertSame('Lund', $places['home']['name']);
        $this->assertSame('SE', $places['home']['countryCode']);

        $call('save', ['place' => $lund]);
        $places = $call('save', ['place' => ['name' => 'Lund again', 'lat' => 55.705, 'lon' => 13.1912]]);
        $this->assertCount(1, $places['saved'], 'the same place is saved once');
        $this->assertSame('Lund again', $places['saved'][0]['name']);

        $places = $call('forget', ['lat' => 55.7047, 'lon' => 13.191]);
        $this->assertSame([], $places['saved']);
        $this->assertSame('Lund', $places['home']['name'], 'forgetting a saved place keeps home');

        $this->assertNull($call('clearHome', [])['home']);
        $this->assertSame(['home' => null, 'saved' => []], $user->fresh()->weather);
    }
}
