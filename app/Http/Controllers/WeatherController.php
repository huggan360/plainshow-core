<?php

namespace App\Http\Controllers;

use App\Support\Weather;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Weather for the dashboard's widgets and the API (see App\Support\Weather). */
class WeatherController extends Controller
{
    /** The Weather app: the place in the address, else home, else the first saved place. */
    public function app(Request $request): Response
    {
        $places = $this->stored($request);
        $asked = $request->filled(['lat', 'lon']) ? Weather::cleanPlace($request->only(['name', 'region', 'countryCode', 'lat', 'lon'])) : null;

        return Inertia::render('Weather', [
            'home' => $places['home'],
            'saved' => $places['saved'],
            'initial' => $asked ?? $places['home'] ?? ($places['saved'][0] ?? null),
        ]);
    }

    /** Home is the weather widgets' place unless a widget has its own. */
    public function setHome(Request $request): JsonResponse
    {
        $place = Weather::cleanPlace($request->input('place'));
        abort_if($place === null, 422, __('That place has no coordinates.'));

        return $this->store($request, fn (array $places) => ['home' => $place] + $places);
    }

    public function clearHome(Request $request): JsonResponse
    {
        return $this->store($request, fn (array $places) => ['home' => null] + $places);
    }

    public function save(Request $request): JsonResponse
    {
        $place = Weather::cleanPlace($request->input('place'));
        abort_if($place === null, 422, __('That place has no coordinates.'));

        return $this->store($request, function (array $places) use ($place) {
            $saved = array_values(array_filter($places['saved'], fn ($other) => ! Weather::samePlace($other, $place)));
            $saved[] = $place;
            $places['saved'] = array_slice($saved, -12);

            return $places;
        });
    }

    public function forget(Request $request): JsonResponse
    {
        $place = Weather::cleanPlace($request->only(['lat', 'lon']));
        abort_if($place === null, 422);

        return $this->store($request, function (array $places) use ($place) {
            $places['saved'] = array_values(array_filter($places['saved'], fn ($other) => ! Weather::samePlace($other, $place)));

            return $places;
        });
    }

    /** @return array{home: ?array, saved: list<array>} */
    private function stored(Request $request): array
    {
        $weather = $request->user()->weather ?? [];

        return [
            'home' => isset($weather['home']) ? Weather::cleanPlace($weather['home']) : null,
            'saved' => array_values(array_filter(array_map([Weather::class, 'cleanPlace'], (array) ($weather['saved'] ?? [])))),
        ];
    }

    private function store(Request $request, callable $change): JsonResponse
    {
        $places = $change($this->stored($request));
        $request->user()->forceFill(['weather' => ['home' => $places['home'], 'saved' => $places['saved']]])->save();

        return response()->json(['home' => $places['home'], 'saved' => $places['saved']]);
    }

    public function places(Request $request): JsonResponse
    {
        $query = (string) $request->validate(['q' => ['required', 'string', 'max:80']])['q'];

        return response()->json(['places' => Weather::places($query, app()->getLocale())]);
    }

    public function forecast(Request $request): JsonResponse
    {
        [$lat, $lon] = $this->point($request);
        $forecast = Weather::forecast($lat, $lon);
        abort_if($forecast === null, 503, __('The weather service did not answer.'));

        return response()->json($forecast)->header('Cache-Control', 'private, max-age=300');
    }

    public function radar(Request $request): JsonResponse
    {
        [$lat, $lon] = $this->point($request);
        $hours = (int) ($request->validate(['hours' => ['nullable', 'integer', 'between:1,6']])['hours'] ?? 2);

        return response()->json(Weather::radar($lat, $lon, url('/weather/radar/smhi'), $hours))->header('Cache-Control', 'private, max-age=60');
    }

    /** SMHI's warnings at and near a point (in Sweden). */
    public function warnings(Request $request): JsonResponse
    {
        [$lat, $lon] = $this->point($request);

        return response()->json(['warnings' => Weather::warnings($lat, $lon)])->header('Cache-Control', 'private, max-age=120');
    }

    /** SMHI's radar images through core, so the dashboard can read their pixels and they are fetched once. */
    public function radarImage(string $name): BinaryFileResponse
    {
        $file = Weather::smhiImage($name);
        abort_if($file === null, 404);

        return response()->file($file, ['Content-Type' => 'image/png', 'Cache-Control' => 'public, max-age=86400, immutable']);
    }

    /** @return array{0: float, 1: float} */
    private function point(Request $request): array
    {
        $valid = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return [(float) $valid['lat'], (float) $valid['lon']];
    }
}
