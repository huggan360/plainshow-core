<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Weather for the dashboard and the API: places by name, forecasts and rain
 * radar, all from open services without keys.
 *
 * - Places: Open-Meteo's geocoding.
 * - Forecasts: SMHI (snow1g) in the Nordic countries, Open-Meteo everywhere
 *   else and whenever SMHI does not answer.
 * - Radar: SMHI's Swedish composite (PNG every five minutes, in SWEREF 99 TM)
 *   where it covers the place, RainViewer's world tiles elsewhere.
 *
 * Everything comes back in one shape whatever the source, with conditions
 * named clear, partly, cloudy, overcast, fog, drizzle, rain, heavy-rain,
 * sleet, snow or thunder.
 */
class Weather
{
    private const SMHI_FORECAST = 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/%s/lat/%s/data.json';
    private const SMHI_RADAR = 'https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp';
    private const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
    private const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
    private const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';

    /** The SMHI radar grid: SWEREF 99 TM (UTM zone 33 on GRS 80), from the composite's GeoTIFF. */
    public const SMHI_GRID = ['x0' => 126648.404, 'y0' => 7771252.876, 'cell' => 2014.9581656050955, 'width' => 471, 'height' => 887];

    /** A place from the browser, cleaned: a name, a region, a country code and real coordinates. */
    public static function cleanPlace(mixed $value): ?array
    {
        if (! is_array($value) || ! is_numeric($value['lat'] ?? null) || ! is_numeric($value['lon'] ?? null)
            || abs((float) $value['lat']) > 90 || abs((float) $value['lon']) > 180) {
            return null;
        }

        return [
            'name' => mb_substr(trim(strip_tags((string) ($value['name'] ?? ''))), 0, 80),
            'region' => mb_substr(trim(strip_tags((string) ($value['region'] ?? ''))), 0, 80),
            'countryCode' => strtoupper(substr(preg_replace('/[^A-Za-z]/', '', (string) ($value['countryCode'] ?? '')), 0, 2)),
            'lat' => round((float) $value['lat'], 4),
            'lon' => round((float) $value['lon'], 4),
        ];
    }

    /** Two places are the same when they are within about a kilometre. */
    public static function samePlace(array $a, array $b): bool
    {
        return abs($a['lat'] - $b['lat']) < 0.01 && abs($a['lon'] - $b['lon']) < 0.01;
    }

    /** @return list<array{name: string, region: string, country: string, countryCode: string, lat: float, lon: float}> */
    public static function places(string $query, string $language = 'en'): array
    {
        $query = trim(mb_substr($query, 0, 80));
        if (mb_strlen($query) < 2) {
            return [];
        }
        $language = in_array($language, ['en', 'nl', 'sv'], true) ? $language : 'en';

        return Cache::remember('weather:places:'.$language.':'.mb_strtolower($query), 86400, function () use ($query, $language) {
            try {
                $results = Http::timeout(8)->connectTimeout(4)->acceptJson()
                    ->get(self::GEOCODING, ['name' => $query, 'count' => 6, 'language' => $language, 'format' => 'json'])->json('results');
            } catch (Throwable) {
                return [];
            }

            return array_values(array_map(fn ($place) => [
                'name' => mb_substr((string) ($place['name'] ?? ''), 0, 80),
                'region' => mb_substr((string) ($place['admin1'] ?? ''), 0, 80),
                'country' => mb_substr((string) ($place['country'] ?? ''), 0, 80),
                'countryCode' => strtoupper(substr((string) ($place['country_code'] ?? ''), 0, 2)),
                'lat' => round((float) ($place['latitude'] ?? 0), 4),
                'lon' => round((float) ($place['longitude'] ?? 0), 4),
            ], array_filter(is_array($results) ? $results : [], fn ($place) => is_array($place) && isset($place['latitude'], $place['longitude']))));
        });
    }

    /** The forecast for a point, cached for ten minutes. */
    public static function forecast(float $lat, float $lon): ?array
    {
        $lat = round(max(-90, min(90, $lat)), 2);
        $lon = round(max(-180, min(180, $lon)), 2);

        return Cache::remember("weather:forecast:$lat:$lon", 600, function () use ($lat, $lon) {
            if (self::nordic($lat, $lon) && ($smhi = self::smhi($lat, $lon)) !== null) {
                return $smhi;
            }

            return self::openMeteo($lat, $lon);
        }) ?: null;
    }

    private static function nordic(float $lat, float $lon): bool
    {
        return $lat >= 54 && $lat <= 71.5 && $lon >= 3 && $lon <= 32;
    }

    private static function smhi(float $lat, float $lon): ?array
    {
        try {
            $response = Http::timeout(10)->connectTimeout(4)->acceptJson()->get(sprintf(self::SMHI_FORECAST, $lon, $lat));
            $series = $response->ok() ? $response->json('timeSeries') : null;
        } catch (Throwable) {
            return null;
        }
        if (! is_array($series) || $series === []) {
            return null;
        }

        $zone = new DateTimeZone('Europe/Stockholm');
        $now = time();
        $hours = [];
        foreach ($series as $step) {
            $data = $step['data'] ?? [];
            $time = strtotime((string) ($step['time'] ?? ''));
            if (! $time || ! is_array($data) || ! isset($data['air_temperature'])) {
                continue;
            }
            $start = strtotime((string) ($step['intervalParametersStartTime'] ?? '')) ?: $time - 3600;
            $hours[] = [
                'time' => $time,
                'span' => max(1, ($time - $start) / 3600),
                'temp' => (float) $data['air_temperature'],
                'condition' => self::smhiCondition((int) ($data['symbol_code'] ?? 0)),
                'precip' => max(0, (float) ($data['precipitation_amount_mean'] ?? 0)),
                'chance' => isset($data['probability_of_precipitation']) ? (int) $data['probability_of_precipitation'] : null,
                'wind' => (float) ($data['wind_speed'] ?? 0),
                'gust' => isset($data['wind_speed_of_gust']) ? (float) $data['wind_speed_of_gust'] : null,
                'windDir' => (int) ($data['wind_from_direction'] ?? 0),
                'humidity' => isset($data['relative_humidity']) ? (int) $data['relative_humidity'] : null,
                'pressure' => isset($data['air_pressure_at_mean_sea_level']) ? (float) $data['air_pressure_at_mean_sea_level'] : null,
                'cloud' => isset($data['cloud_area_fraction']) ? (int) $data['cloud_area_fraction'] : null,
            ];
        }
        if ($hours === []) {
            return null;
        }
        // The step closest to now is the current weather.
        usort($hours, fn ($a, $b) => $a['time'] <=> $b['time']);
        $current = $hours[0];
        foreach ($hours as $hour) {
            if (abs($hour['time'] - $now) < abs($current['time'] - $now)) {
                $current = $hour;
            }
        }

        $days = [];
        foreach ($hours as $hour) {
            $date = (new DateTimeImmutable('@'.$hour['time']))->setTimezone($zone);
            $key = $date->format('Y-m-d');
            $day = $days[$key] ?? ['date' => $key, 'min' => $hour['temp'], 'max' => $hour['temp'], 'precip' => 0.0, 'wind' => 0.0, 'condition' => $hour['condition'], 'noon' => 99];
            $day['min'] = min($day['min'], $hour['temp']);
            $day['max'] = max($day['max'], $hour['temp']);
            $day['precip'] += $hour['precip'] * $hour['span'];
            $day['wind'] = max($day['wind'], $hour['wind']);
            // The day's weather is the one around early afternoon.
            $distance = abs((int) $date->format('G') - 13);
            if ($distance < $day['noon']) {
                $day['noon'] = $distance;
                $day['condition'] = $hour['condition'];
            }
            $days[$key] = $day;
        }

        return self::shape('smhi', 'SMHI', $lat, $lon, 'Europe/Stockholm', [
            'temp' => $current['temp'],
            'feels' => self::feelsLike($current['temp'], $current['wind'], $current['humidity']),
            'condition' => $current['condition'],
            'wind' => $current['wind'],
            'gust' => $current['gust'],
            'windDir' => $current['windDir'],
            'humidity' => $current['humidity'],
            'pressure' => $current['pressure'],
            'precip' => $current['precip'],
            'cloud' => $current['cloud'],
        ], array_map(fn ($hour) => [
            'time' => $hour['time'], 'temp' => $hour['temp'], 'condition' => $hour['condition'],
            'precip' => $hour['precip'], 'chance' => $hour['chance'], 'wind' => $hour['wind'], 'windDir' => $hour['windDir'],
        ], array_values(array_filter($hours, fn ($hour) => $hour['span'] <= 1.01))), array_values($days));
    }

    private static function openMeteo(float $lat, float $lon): ?array
    {
        try {
            $data = Http::timeout(10)->connectTimeout(4)->acceptJson()->get(self::OPEN_METEO, [
                'latitude' => $lat, 'longitude' => $lon, 'timezone' => 'auto', 'forecast_days' => 8, 'wind_speed_unit' => 'ms',
                'current' => 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
                'hourly' => 'temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m',
                'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
            ])->json();
        } catch (Throwable) {
            return null;
        }
        if (! is_array($data) || ! isset($data['current']['temperature_2m'])) {
            return null;
        }
        $zone = (string) ($data['timezone'] ?? 'UTC');
        $offset = (int) ($data['utc_offset_seconds'] ?? 0);
        $time = fn (string $local) => strtotime($local.' UTC') - $offset;
        $current = $data['current'];
        $hourly = $data['hourly'] ?? [];
        $hours = [];
        foreach ((array) ($hourly['time'] ?? []) as $index => $local) {
            $hours[] = [
                'time' => $time((string) $local),
                'temp' => (float) ($hourly['temperature_2m'][$index] ?? 0),
                'condition' => self::wmoCondition((int) ($hourly['weather_code'][$index] ?? 0)),
                'precip' => (float) ($hourly['precipitation'][$index] ?? 0),
                'chance' => isset($hourly['precipitation_probability'][$index]) ? (int) $hourly['precipitation_probability'][$index] : null,
                'wind' => (float) ($hourly['wind_speed_10m'][$index] ?? 0),
                'windDir' => (int) ($hourly['wind_direction_10m'][$index] ?? 0),
            ];
        }
        $daily = $data['daily'] ?? [];
        $days = [];
        foreach ((array) ($daily['time'] ?? []) as $index => $date) {
            $days[] = [
                'date' => (string) $date,
                'min' => (float) ($daily['temperature_2m_min'][$index] ?? 0),
                'max' => (float) ($daily['temperature_2m_max'][$index] ?? 0),
                'precip' => (float) ($daily['precipitation_sum'][$index] ?? 0),
                'wind' => (float) ($daily['wind_speed_10m_max'][$index] ?? 0),
                'condition' => self::wmoCondition((int) ($daily['weather_code'][$index] ?? 0)),
            ];
        }

        return self::shape('open-meteo', 'Open-Meteo', $lat, $lon, $zone, [
            'temp' => (float) $current['temperature_2m'],
            'feels' => isset($current['apparent_temperature']) ? (float) $current['apparent_temperature'] : null,
            'condition' => self::wmoCondition((int) ($current['weather_code'] ?? 0)),
            'wind' => (float) ($current['wind_speed_10m'] ?? 0),
            'gust' => isset($current['wind_gusts_10m']) ? (float) $current['wind_gusts_10m'] : null,
            'windDir' => (int) ($current['wind_direction_10m'] ?? 0),
            'humidity' => isset($current['relative_humidity_2m']) ? (int) $current['relative_humidity_2m'] : null,
            'pressure' => isset($current['pressure_msl']) ? (float) $current['pressure_msl'] : null,
            'precip' => (float) ($current['precipitation'] ?? 0),
            'cloud' => isset($current['cloud_cover']) ? (int) $current['cloud_cover'] : null,
        ], $hours, $days);
    }

    /** One shape for every source: now, the next 24 hours and the coming days, with sunrise and sunset. */
    private static function shape(string $source, string $sourceName, float $lat, float $lon, string $zone, array $current, array $hours, array $days): array
    {
        $now = time();
        $tz = new DateTimeZone(in_array($zone, DateTimeZone::listIdentifiers(), true) ? $zone : 'UTC');
        $sun = function (int $at) use ($lat, $lon) {
            $info = date_sun_info($at, $lat, $lon);

            return [is_int($info['sunrise'] ?? null) ? $info['sunrise'] : null, is_int($info['sunset'] ?? null) ? $info['sunset'] : null];
        };
        $isDay = function (int $at) use ($lat, $lon) {
            $info = date_sun_info($at, $lat, $lon);
            $rise = $info['sunrise'] ?? null;
            $set = $info['sunset'] ?? null;
            if ($rise === true || $set === true) {
                return true; // midnight sun
            }
            if ($rise === false || $set === false) {
                return false; // polar night
            }

            return $at >= $rise && $at < $set;
        };
        $iso = fn (int $at) => (new DateTimeImmutable('@'.$at))->setTimezone($tz)->format(DATE_ATOM);
        $round = fn ($value, $decimals = 1) => $value === null ? null : round((float) $value, $decimals);
        [$rise, $set] = $sun((int) (new DateTimeImmutable('today 12:00', $tz))->format('U'));

        $upcoming = array_values(array_filter($hours, fn ($hour) => $hour['time'] >= $now - 3600));
        $today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');

        return [
            'source' => $source,
            'sourceName' => $sourceName,
            'lat' => $lat,
            'lon' => $lon,
            'timezone' => $tz->getName(),
            'updated' => $iso($now),
            'sunrise' => $rise ? $iso($rise) : null,
            'sunset' => $set ? $iso($set) : null,
            'current' => [
                'temp' => $round($current['temp']),
                'feels' => $round($current['feels']),
                'condition' => $current['condition'],
                'isDay' => $isDay($now),
                'wind' => $round($current['wind']),
                'gust' => $round($current['gust']),
                'windDir' => (int) $current['windDir'],
                'humidity' => $current['humidity'],
                'pressure' => $round($current['pressure'], 0),
                'precip' => $round($current['precip']),
                'cloud' => $current['cloud'],
            ],
            'hours' => array_map(fn ($hour) => [
                'time' => $iso($hour['time']),
                'temp' => $round($hour['temp']),
                'condition' => $hour['condition'],
                'isDay' => $isDay($hour['time']),
                'precip' => $round($hour['precip']),
                'chance' => $hour['chance'],
                'wind' => $round($hour['wind']),
                'windDir' => (int) $hour['windDir'],
            ], array_slice($upcoming, 0, 24)),
            'days' => array_map(fn ($day) => [
                'date' => $day['date'],
                'min' => $round($day['min']),
                'max' => $round($day['max']),
                'condition' => $day['condition'],
                'precip' => $round($day['precip']),
                'wind' => $round($day['wind']),
            ], array_slice(array_values(array_filter($days, fn ($day) => $day['date'] >= $today)), 0, 7)),
        ];
    }

    /** SMHI's weather symbols, 1 to 27. */
    private static function smhiCondition(int $symbol): string
    {
        return match (true) {
            $symbol <= 2 => 'clear',
            $symbol <= 4 => 'partly',
            $symbol === 5 => 'cloudy',
            $symbol === 6 => 'overcast',
            $symbol === 7 => 'fog',
            in_array($symbol, [8, 18], true) => 'drizzle',
            in_array($symbol, [9, 19], true) => 'rain',
            in_array($symbol, [10, 20], true) => 'heavy-rain',
            in_array($symbol, [11, 21], true) => 'thunder',
            in_array($symbol, [12, 13, 14, 22, 23, 24], true) => 'sleet',
            default => 'snow',
        };
    }

    /** WMO weather codes, as Open-Meteo gives them. */
    private static function wmoCondition(int $code): string
    {
        return match (true) {
            $code <= 1 => 'clear',
            $code === 2 => 'partly',
            $code === 3 => 'overcast',
            in_array($code, [45, 48], true) => 'fog',
            $code >= 51 && $code <= 57 => 'drizzle',
            in_array($code, [61, 63, 80, 81], true) => 'rain',
            in_array($code, [65, 82], true) => 'heavy-rain',
            in_array($code, [66, 67], true) => 'sleet',
            $code >= 71 && $code <= 86 => 'snow',
            $code >= 95 => 'thunder',
            default => 'cloudy',
        };
    }

    /** Wind chill when it is cold and windy, else the temperature. */
    private static function feelsLike(float $temp, float $wind, ?int $humidity): float
    {
        $kmh = $wind * 3.6;
        if ($temp <= 10 && $kmh > 4.8) {
            return 13.12 + 0.6215 * $temp - 11.37 * $kmh ** 0.16 + 0.3965 * $temp * $kmh ** 0.16;
        }

        return $temp;
    }

    /* ---------- SMHI's warnings ---------- */

    /**
     * SMHI's yellow, orange and red warnings at or near a point, nearest
     * first: `here` when the point is inside the warned area, else how far
     * away it is. Only within $radius km. Read at most every five minutes.
     *
     * @return list<array{id: string, level: string, event: string, title: string, text: list<string>, areas: list<string>, here: bool, km: int, start: ?string, end: ?string}>
     */
    public static function warnings(float $lat, float $lon, int $radius = 80, ?string $language = null): array
    {
        $language = ($language ?? app()->getLocale()) === 'sv' ? 'sv' : 'en';
        $warnings = Cache::remember('weather:smhi-warnings', 300, function () {
            try {
                $data = Http::timeout(8)->connectTimeout(4)->acceptJson()->get('https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json')->json();
            } catch (Throwable) {
                return [];
            }

            return is_array($data) ? $data : [];
        });
        $found = [];
        foreach ($warnings as $warning) {
            foreach ((array) ($warning['warningAreas'] ?? []) as $area) {
                $level = strtolower((string) ($area['warningLevel']['code'] ?? 'MESSAGE'));
                if (! in_array($level, ['yellow', 'orange', 'red'], true)) {
                    continue;
                }
                $km = self::distanceToArea($lat, $lon, (array) ($area['area']['geometry'] ?? []));
                if ($km === null || $km > $radius) {
                    continue;
                }
                $event = (string) ($warning['event'][$language] ?? $warning['event']['sv'] ?? '');
                $found[] = [
                    'id' => (string) ($area['id'] ?? ''),
                    'level' => $level,
                    'event' => $event,
                    'title' => (string) ($area['eventDescription'][$language] ?? $area['eventDescription']['sv'] ?? $event),
                    'text' => array_values(array_filter(array_map(fn ($d) => trim((string) ($d['text'][$language] ?? $d['text']['sv'] ?? '')), (array) ($area['descriptions'] ?? [])))),
                    'areas' => array_values(array_filter(array_map(fn ($a) => (string) ($a[$language] ?? $a['sv'] ?? ''), (array) ($area['affectedAreas'] ?? [])))),
                    'here' => $km === 0.0,
                    'km' => (int) round($km),
                    'start' => $area['approximateStart'] ?? null,
                    'end' => $area['approximateEnd'] ?? null,
                ];
            }
        }
        $rank = ['red' => 0, 'orange' => 1, 'yellow' => 2];
        usort($found, fn ($a, $b) => [$a['km'], $rank[$a['level']]] <=> [$b['km'], $rank[$b['level']]]);

        return array_slice($found, 0, 10);
    }

    /** 0 inside a GeoJSON polygon or multipolygon, else the distance in km to its nearest corner; null without a shape. */
    private static function distanceToArea(float $lat, float $lon, array $geometry): ?float
    {
        $polygons = match ($geometry['type'] ?? '') {
            'Polygon' => [$geometry['coordinates'] ?? []],
            'MultiPolygon' => $geometry['coordinates'] ?? [],
            default => [],
        };
        if ($polygons === []) {
            return null;
        }
        $nearest = INF;
        $cos = cos(deg2rad($lat));
        foreach ($polygons as $polygon) {
            $ring = $polygon[0] ?? [];
            $inside = false;
            $count = count($ring);
            for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
                [$xi, $yi] = $ring[$i];
                [$xj, $yj] = $ring[$j];
                if ((($yi > $lat) !== ($yj > $lat)) && ($lon < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) {
                    $inside = ! $inside;
                }
                $nearest = min($nearest, hypot(($xi - $lon) * 111.32 * $cos, ($yi - $lat) * 110.57));
            }
            if ($inside) {
                return 0.0;
            }
        }

        return is_finite($nearest) ? $nearest : null;
    }

    /* ---------- Radar ---------- */

    /** The last hours of radar (two unless asked), every ten minutes: SMHI where it reaches, RainViewer elsewhere. */
    public static function radar(float $lat, float $lon, string $imageBase, int $hours = 2): array
    {
        $hours = max(1, min(6, $hours));
        if (self::inSmhiRadar($lat, $lon) && ($frames = self::smhiFrames($hours)) !== []) {
            return [
                'provider' => 'smhi',
                'providerName' => 'SMHI',
                'grid' => self::SMHI_GRID + ['projection' => 'utm33'],
                'frames' => array_map(fn ($frame) => ['time' => $frame['time'], 'url' => rtrim($imageBase, '/').'/'.$frame['name'].'.png'], $frames),
            ];
        }

        $maps = Cache::remember('weather:rainviewer', 300, function () {
            try {
                return Http::timeout(8)->connectTimeout(4)->acceptJson()->get(self::RAINVIEWER)->json();
            } catch (Throwable) {
                return null;
            }
        });
        $host = is_array($maps) ? (string) ($maps['host'] ?? '') : '';
        $past = is_array($maps) ? (array) ($maps['radar']['past'] ?? []) : [];

        return [
            'provider' => 'rainviewer',
            'providerName' => 'RainViewer',
            'maxZoom' => 7,
            'frames' => preg_match('~^https://[a-z0-9.-]+$~', $host) ? array_values(array_map(fn ($frame) => [
                'time' => date(DATE_ATOM, (int) $frame['time']),
                'url' => $host.$frame['path'].'/256/{z}/{x}/{y}/2/1_1.png',
            ], array_filter($past, fn ($frame) => is_array($frame) && isset($frame['time'], $frame['path']) && preg_match('~^/[A-Za-z0-9/_-]+$~', (string) $frame['path'])))) : [],
        ];
    }

    /** SMHI's frames of the last hours, ten minutes apart, newest last. */
    private static function smhiFrames(int $hours): array
    {
        return Cache::remember("weather:smhi-frames:$hours", 120, function () use ($hours) {
            $names = [];
            foreach ([new DateTimeImmutable('now', new DateTimeZone('UTC')), new DateTimeImmutable('-1 day', new DateTimeZone('UTC'))] as $day) {
                try {
                    $files = Http::timeout(8)->connectTimeout(4)->acceptJson()->get(self::SMHI_RADAR.'/'.$day->format('Y/m/d'))->json('files');
                } catch (Throwable) {
                    continue;
                }
                foreach (is_array($files) ? $files : [] as $file) {
                    $key = (string) ($file['key'] ?? '');
                    $hasPng = in_array('png', array_column((array) ($file['formats'] ?? []), 'key'), true);
                    if ($hasPng && preg_match('/^radar_(\d{10})$/', $key, $match)) {
                        $names[$match[1]] = $key;
                    }
                }
                if (count($names) >= $hours * 12 + 2) {
                    break;
                }
            }
            ksort($names);
            $frames = [];
            foreach ($names as $stamp => $name) {
                $time = DateTimeImmutable::createFromFormat('ymdHi', (string) $stamp, new DateTimeZone('UTC'));
                if ($time && (int) $time->format('i') % 10 === 0 && $time->getTimestamp() > time() - $hours * 3600 - 300) {
                    $frames[] = ['name' => $name, 'time' => $time->format(DATE_ATOM)];
                }
            }

            return array_slice($frames, -($hours * 6 + 1));
        });
    }

    /** One radar image, kept on disk; old ones are cleared away. */
    public static function smhiImage(string $name): ?string
    {
        if (! preg_match('/^radar_(\d{2})(\d{2})(\d{2})\d{4}$/', $name, $match)) {
            return null;
        }
        $folder = storage_path('app/radar');
        $file = "$folder/$name.png";
        if (is_file($file)) {
            return $file;
        }
        try {
            $response = Http::timeout(10)->connectTimeout(4)->get(self::SMHI_RADAR."/20{$match[1]}/{$match[2]}/{$match[3]}/$name.png");
        } catch (Throwable) {
            return null;
        }
        $body = $response->body();
        if (! $response->ok() || ! str_starts_with($body, "\x89PNG")) {
            return null;
        }
        if (! is_dir($folder)) {
            @mkdir($folder, 0775, true);
        }
        foreach (glob("$folder/radar_*.png") ?: [] as $old) {
            if (filemtime($old) < time() - 6 * 3600) {
                @unlink($old);
            }
        }
        file_put_contents("$file.tmp", $body);
        rename("$file.tmp", $file);

        return $file;
    }

    private static function inSmhiRadar(float $lat, float $lon): bool
    {
        [$east, $north] = self::utm33($lat, $lon);
        $grid = self::SMHI_GRID;
        // A margin inside the edge, so the map is not mostly outside the radar.
        $margin = 60000;

        return $east > $grid['x0'] + $margin && $east < $grid['x0'] + $grid['width'] * $grid['cell'] - $margin
            && $north < $grid['y0'] - $margin && $north > $grid['y0'] - $grid['height'] * $grid['cell'] + $margin;
    }

    /** Latitude and longitude to SWEREF 99 TM (UTM zone 33, GRS 80). The browser has the same (Widgets/weather.ts). */
    public static function utm33(float $lat, float $lon): array
    {
        $a = 6378137.0;
        $f = 1 / 298.257222101;
        $k0 = 0.9996;
        $e2 = $f * (2 - $f);
        $ep2 = $e2 / (1 - $e2);
        $phi = deg2rad($lat);
        $lambda = deg2rad($lon - 15);
        $n = $a / sqrt(1 - $e2 * sin($phi) ** 2);
        $t = tan($phi) ** 2;
        $c = $ep2 * cos($phi) ** 2;
        $A = cos($phi) * $lambda;
        $m = $a * ((1 - $e2 / 4 - 3 * $e2 ** 2 / 64 - 5 * $e2 ** 3 / 256) * $phi
            - (3 * $e2 / 8 + 3 * $e2 ** 2 / 32 + 45 * $e2 ** 3 / 1024) * sin(2 * $phi)
            + (15 * $e2 ** 2 / 256 + 45 * $e2 ** 3 / 1024) * sin(4 * $phi)
            - (35 * $e2 ** 3 / 3072) * sin(6 * $phi));
        $east = 500000 + $k0 * $n * ($A + (1 - $t + $c) * $A ** 3 / 6 + (5 - 18 * $t + $t ** 2 + 72 * $c - 58 * $ep2) * $A ** 5 / 120);
        $north = $k0 * ($m + $n * tan($phi) * ($A ** 2 / 2 + (5 - $t + 9 * $c + 4 * $c ** 2) * $A ** 4 / 24 + (61 - 58 * $t + $t ** 2 + 600 * $c - 330 * $ep2) * $A ** 6 / 720));

        return [$east, $north];
    }
}
