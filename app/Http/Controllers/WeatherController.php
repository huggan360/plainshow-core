<?php

namespace App\Http\Controllers;

use App\Support\Weather;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Weather for the dashboard's widgets and the API (see App\Support\Weather). */
class WeatherController extends Controller
{
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

        return response()->json(Weather::radar($lat, $lon, url('/weather/radar/smhi')))->header('Cache-Control', 'private, max-age=60');
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
