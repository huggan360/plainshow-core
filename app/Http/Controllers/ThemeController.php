<?php

namespace App\Http\Controllers;

use App\Support\AccentCookie;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use PlainShow\Kit\Theme;

/** The theme colour, chosen in the Design studio: kept on the account and set for every PlainShow site. */
class ThemeController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $accent = $request->validate(['accent' => ['required', 'string', Rule::in(array_keys(Theme::ACCENTS))]])['accent'];
        $user = $request->user();
        $user->forceFill(['accent' => $accent === Theme::DEFAULT ? null : $accent])->save();
        AccentCookie::queue($accent);

        return back();
    }
}
