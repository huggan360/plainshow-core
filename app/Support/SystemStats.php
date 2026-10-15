<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/** Server health read from /proc and /sys. Cached briefly; cheap enough for every dashboard. */
class SystemStats
{
    public static function snapshot(): array
    {
        return Cache::remember('core.system-stats', 10, function () {
            $memory = [];
            preg_match_all('/^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/m', (string) @file_get_contents('/proc/meminfo'), $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                $memory[$match[1]] = (int) $match[2] * 1024;
            }
            $memoryTotal = (float) ($memory['MemTotal'] ?? 0);
            $memoryFree = (float) ($memory['MemAvailable'] ?? 0);
            $diskTotal = (float) (@disk_total_space('/') ?: 0);
            $diskFree = (float) (@disk_free_space('/') ?: 0);
            $load = array_map('floatval', sys_getloadavg() ?: [0, 0, 0]);
            $cores = max(1, preg_match_all('/^processor\s*:/m', (string) @file_get_contents('/proc/cpuinfo')));
            $temperatureRaw = @file_get_contents('/sys/class/thermal/thermal_zone0/temp');
            $uptime = (float) strtok((string) @file_get_contents('/proc/uptime'), ' ');
            preg_match('/^Model\s*:\s*(.+)$/m', (string) @file_get_contents('/proc/cpuinfo'), $model);

            return [
                'model' => trim($model[1] ?? php_uname('m')),
                'hostname' => gethostname() ?: 'server',
                'cpuPercent' => round(min(100, ($load[0] / $cores) * 100), 1),
                'load' => array_map(fn ($value) => round($value, 2), array_slice(array_pad($load, 3, 0), 0, 3)),
                'cores' => $cores,
                'memoryPercent' => $memoryTotal > 0 ? round((1 - $memoryFree / $memoryTotal) * 100, 1) : 0,
                'memoryUsed' => self::bytes($memoryTotal - $memoryFree),
                'memoryTotal' => self::bytes($memoryTotal),
                'diskPercent' => $diskTotal > 0 ? round((1 - $diskFree / $diskTotal) * 100, 1) : 0,
                'diskFree' => self::bytes($diskFree),
                'diskTotal' => self::bytes($diskTotal),
                'temperature' => is_string($temperatureRaw) ? round(((float) trim($temperatureRaw)) / 1000, 1) : null,
                'uptime' => self::duration($uptime),
                'takenAt' => now()->toIso8601String(),
            ];
        });
    }

    private static function bytes(float $bytes): string
    {
        return $bytes >= 1024 ** 3 ? number_format($bytes / 1024 ** 3, 1).' GB' : number_format($bytes / 1024 ** 2).' MB';
    }

    private static function duration(float $seconds): string
    {
        $days = intdiv((int) $seconds, 86400);
        $hours = intdiv((int) $seconds % 86400, 3600);

        return $days > 0 ? "{$days} d {$hours} h" : "{$hours} h ".intdiv((int) $seconds % 3600, 60).' min';
    }
}
