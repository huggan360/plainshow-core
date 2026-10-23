<?php

namespace App\Http\Controllers;

use App\Support\News;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** The News app (App\Support\News): the page, its stories, preferences and pictures. */
class NewsController extends Controller
{
    public function app(Request $request): Response
    {
        $preferences = News::preferences($request->user());

        return Inertia::render('News', [
            'preferences' => $preferences,
            'region' => News::region($preferences['place']),
            'catalogue' => News::catalogue(),
        ]);
    }

    public function stories(Request $request): JsonResponse
    {
        $valid = $request->validate([
            'tab' => ['nullable', 'in:top,local'],
            'q' => ['nullable', 'string', 'max:80'],
            'topic' => ['nullable', 'string', 'in:'.implode(',', News::TOPICS)],
            'limit' => ['nullable', 'integer', 'between:1,150'],
        ]);
        $user = $request->user();
        $query = trim((string) ($valid['q'] ?? ''));
        $topic = $valid['topic'] ?? null;

        return response()->json([
            'stories' => News::stories($user, $valid['tab'] ?? 'top', $query, (int) ($valid['limit'] ?? 80), $topic),
            // Alerts lead the front page and the local edition.
            'alerts' => $query === '' && ! $topic ? News::alerts(News::preferences($user)['place']) : [],
        ])->header('Cache-Control', 'private, max-age=60');
    }

    public function article(string $id): JsonResponse
    {
        return response()->json(['parts' => News::article($id)])->header('Cache-Control', 'private, max-age=3600');
    }

    public function savePreferences(Request $request): JsonResponse
    {
        $input = $request->validate([
            'topics' => ['sometimes', 'array'],
            'topics.*' => ['string'],
            'sources' => ['sometimes', 'array'],
            'sources.*' => ['string'],
            'place' => ['sometimes', 'nullable', 'array'],
            'levels' => ['sometimes', 'array'],
        ]);
        $preferences = News::savePreferences($request->user(), $input);

        return response()->json(['preferences' => $preferences, 'region' => News::region($preferences['place'])]);
    }

    public function image(string $key): BinaryFileResponse
    {
        $file = News::image($key);
        abort_if($file === null, 404);
        $type = (getimagesize($file)['mime'] ?? 'image/jpeg');

        return response()->file($file, ['Content-Type' => $type, 'Cache-Control' => 'public, max-age=259200, immutable']);
    }
}
