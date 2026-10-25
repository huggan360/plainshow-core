<?php

namespace App\Http\Controllers;

use App\Support\Assistant\Engine;
use App\Support\Assistant\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

    /**
     * The answer, streamed as lines of JSON: {"stage": "plan" | "act" | "check", "detail": action}
     * as each stage starts, then {"answer": {...}}. The page shows the stages while it waits.
     */
    public function ask(Request $request): StreamedResponse
    {
        abort_unless(Model::installed(), 404);
        $valid = $request->validate([
            'text' => ['required', 'string', 'max:500'],
            // Made by the page each time it opens: "it" and open questions last as long as the page.
            'conversation' => ['nullable', 'string', 'regex:/^[A-Za-z0-9-]{8,40}$/'],
        ]);
        $user = $request->user();

        return response()->stream(function () use ($user, $valid) {
            set_time_limit(180);
            $send = function (array $line) {
                echo json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
                while (ob_get_level() > 0) {
                    ob_end_flush();
                }
                flush();
            };
            $answer = (new Engine($user))->handle($valid['text'], $valid['conversation'] ?? null, fn (string $stage, ?string $detail) => $send(['stage' => $stage, 'detail' => $detail]));
            $send(['answer' => $answer]);
        }, 200, ['Content-Type' => 'application/x-ndjson; charset=utf-8', 'Cache-Control' => 'no-cache, no-transform', 'X-Accel-Buffering' => 'no']);
    }
}
