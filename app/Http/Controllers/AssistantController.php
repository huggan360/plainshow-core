<?php

namespace App\Http\Controllers;

use App\Support\Assistant\Engine;
use App\Support\Assistant\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The Assistant: say what to do, get it done (App\Support\Assistant). */
class AssistantController extends Controller
{
    public function page(Request $request): Response
    {
        abort_unless(Model::installed(), 404);
        return Inertia::render('Assistant', [
            // A request handed over from the Assistant widget, done as the page opens.
            'ask' => mb_substr((string) $request->query('q', ''), 0, 500),
        ]);
    }

    /** The page opened: wake the model while the person types. */
    public function warm(): JsonResponse
    {
        set_time_limit(90);
        (new Model)->warm();

        return response()->json(['ok' => true]);
    }

    public function ask(Request $request): JsonResponse
    {
        abort_unless(Model::installed(), 404);
        $valid = $request->validate([
            'text' => ['required', 'string', 'max:500'],
            // Made by the page each time it opens: "it" and open questions last as long as the page.
            'conversation' => ['nullable', 'string', 'regex:/^[A-Za-z0-9-]{8,40}$/'],
        ]);
        set_time_limit(120);

        return response()->json((new Engine($request->user()))->handle($valid['text'], $valid['conversation'] ?? null));
    }
}
