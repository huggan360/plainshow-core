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
            'limit' => ['nullable', 'integer', 'between:1,150'],
        ]);

        return response()->json(['stories' => News::stories($request->user(), $valid['tab'] ?? 'top', trim((string) ($valid['q'] ?? '')), (int) ($valid['limit'] ?? 80))])
            ->header('Cache-Control', 'private, max-age=120');
    }

    public function savePreferences(Request $request): JsonResponse
    {
        $input = $request->validate([
            'topics' => ['sometimes', 'array'],
            'topics.*' => ['string'],
            'sources' => ['sometimes', 'array'],
            'sources.*' => ['string'],
            'place' => ['sometimes', 'nullable', 'array'],
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
