<?php

namespace App\Http\Controllers;

use App\Support\Assistant\Engine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The Composer: say what to do, get it done (App\Support\Assistant). */
class ComposerController extends Controller
{
    public function page(Request $request): Response
    {
        return Inertia::render('Composer', [
            // A request handed over from the Composer widget, done as the page opens.
            'ask' => mb_substr((string) $request->query('q', ''), 0, 500),
        ]);
    }

    public function ask(Request $request): JsonResponse
    {
        $text = $request->validate(['text' => ['required', 'string', 'max:500']])['text'];
        set_time_limit(120);

        return response()->json((new Engine($request->user()))->handle($text));
    }
}
