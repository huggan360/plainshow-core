<?php

namespace Tests\Feature;

use App\Http\Controllers\ThemeController;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ThemeColourTest extends TestCase
{
    private function user(): User
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username');
            $table->string('accent', 16)->nullable();
            $table->timestamps();
        });
        $user = new User;
        $user->forceFill(['username' => 'hugo'])->save();

        return $user;
    }

    private function choose(User $user, string $accent): void
    {
        $request = Request::create('https://plainshow.se/design/theme', 'PUT', ['accent' => $accent]);
        $this->app->instance('request', $request);
        $request->setUserResolver(fn () => $user);
        (new ThemeController)->update($request);
    }

    public function test_a_colour_is_kept_on_the_account_and_set_for_every_site(): void
    {
        $user = $this->user();
        $this->choose($user, 'teal');
        $this->assertSame('teal', $user->fresh()->accent);
        $cookie = Cookie::queued('ps_accent');
        $this->assertSame('teal', $cookie->getValue());
        $this->assertSame('plainshow.se', $cookie->getDomain(), 'the cookie covers every PlainShow site');
        $this->assertFalse($cookie->isHttpOnly(), 'the sites\' scripts read it');

        $this->choose($user, 'orange');
        $this->assertNull($user->fresh()->accent, 'orange is the default and is not stored');
    }

    public function test_only_the_five_colours_are_accepted(): void
    {
        $user = $this->user();
        $this->expectException(ValidationException::class);
        $this->choose($user, 'pink');
    }
}
