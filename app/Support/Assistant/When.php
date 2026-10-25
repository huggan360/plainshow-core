<?php

namespace App\Support\Assistant;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Days and times as people say them, in English, Swedish and Dutch: "saturday",
 * "i morgon", "volgende vrijdag", "31 oktober", "2026-11-02"; "14", "14.30",
 * "2pm", "kl 14". The model copies the words; this turns them into dates, so a
 * small model never has to count days.
 */
class When
{
    private const WEEKDAYS = [
        1 => ['monday', 'mon', 'måndag', 'mandag', 'maandag'],
        2 => ['tuesday', 'tue', 'tisdag', 'dinsdag'],
        3 => ['wednesday', 'wed', 'onsdag', 'woensdag'],
        4 => ['thursday', 'thu', 'torsdag', 'donderdag'],
        5 => ['friday', 'fri', 'fredag', 'vrijdag'],
        6 => ['saturday', 'sat', 'lördag', 'lordag', 'zaterdag'],
        7 => ['sunday', 'sun', 'söndag', 'sondag', 'zondag'],
    ];

    private const MONTHS = [
        1 => ['january', 'jan', 'januari'], 2 => ['february', 'feb', 'februari'], 3 => ['march', 'mar', 'mars', 'maart', 'mrt'],
        4 => ['april', 'apr'], 5 => ['may', 'maj', 'mei'], 6 => ['june', 'jun', 'juni'], 7 => ['july', 'jul', 'juli'],
        8 => ['august', 'aug', 'augusti', 'augustus'], 9 => ['september', 'sep', 'sept'], 10 => ['october', 'oct', 'oktober', 'okt'],
        11 => ['november', 'nov'], 12 => ['december', 'dec'],
    ];

    public function __construct(private readonly DateTimeImmutable $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Stockholm')))
    {
    }

    public static function zone(): DateTimeZone
    {
        return new DateTimeZone('Europe/Stockholm');
    }

    /** A date (Y-m-d) from words such as "saturday" or "imorgon", or null when the words say no day. */
    public function day(?string $words): ?string
    {
        $text = $this->fold((string) $words);
        if ($text === '') {
            return null;
        }
        $today = $this->now->setTime(0, 0);
        if (preg_match('/\b(\d{4})-(\d{2})-(\d{2})\b/', $text, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return "$m[1]-$m[2]-$m[3]";
        }
        if (preg_match('/\b(day after tomorrow|overmorgon|i overmorgon|overmorgen)\b/', $text)) {
            return $today->modify('+2 days')->format('Y-m-d');
        }
        if (preg_match('/\b(tomorrow|imorgon|i morgon|morgen)\b/', $text)) {
            return $today->modify('+1 day')->format('Y-m-d');
        }
        if (preg_match('/\b(today|idag|i dag|vandaag|tonight|ikvall|i kvall|vanavond)\b/', $text)) {
            return $today->format('Y-m-d');
        }
        // "31 oktober", "31/10", "october 31"
        foreach (self::MONTHS as $month => $names) {
            $alternatives = implode('|', $names);
            if (preg_match('/\b(\d{1,2})(?:st|nd|rd|th|e|:e)?\.? (?:of )?('.$alternatives.')\b/', $text, $m) || preg_match('/\b('.$alternatives.') (\d{1,2})(?:st|nd|rd|th)?\b/', $text, $m)) {
                $day = (int) (is_numeric($m[1]) ? $m[1] : $m[2]);

                return $this->nextDate($month, $day);
            }
        }
        if (preg_match('/\b(\d{1,2})\/(\d{1,2})\b/', $text, $m) && checkdate((int) $m[2], (int) $m[1], (int) $this->now->format('Y'))) {
            return $this->nextDate((int) $m[2], (int) $m[1]);
        }
        $next = (bool) preg_match('/\b(next|nasta|volgende)\b/', $text);
        foreach (self::WEEKDAYS as $weekday => $names) {
            if (preg_match('/\b('.implode('|', $names).')s?\b/', $text)) {
                $ahead = ($weekday - (int) $today->format('N') + 7) % 7;
                if ($next && $ahead < 7) {
                    $ahead += $ahead === 0 ? 7 : 0;
                }

                return $today->modify("+$ahead days")->format('Y-m-d');
            }
        }
        if (preg_match('/\b(next week|nasta vecka|volgende week)\b/', $text)) {
            return $today->modify('next monday')->format('Y-m-d');
        }
        if (preg_match('/\bin (\d{1,2}) days?\b|\bom (\d{1,2}) dagar\b|\bover (\d{1,2}) dagen\b/', $text, $m)) {
            return $today->modify('+'.(int) max($m[1] ?? 0, $m[2] ?? 0, $m[3] ?? 0).' days')->format('Y-m-d');
        }

        return null;
    }

    /** A time (H:i) from "14", "14.30", "2pm", "kl 14", or null. */
    public function time(?string $words): ?string
    {
        $text = $this->fold((string) $words);
        if (! preg_match('/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/', $text, $m)) {
            return null;
        }
        $hour = (int) $m[1];
        $minute = (int) ($m[2] ?? 0);
        $half = $m[3] ?? '';
        if ($half === 'pm' && $hour < 12) {
            $hour += 12;
        } elseif ($half === 'am' && $hour === 12) {
            $hour = 0;
        }
        if ($hour > 23 || $minute > 59) {
            return null;
        }

        return sprintf('%02d:%02d', $hour, $minute);
    }

    public function today(): string
    {
        return $this->now->format('Y-m-d');
    }

    /** This year's date, or next year's when it has passed. */
    private function nextDate(int $month, int $day): ?string
    {
        $year = (int) $this->now->format('Y');
        if (! checkdate($month, $day, $year)) {
            return null;
        }
        $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
        if ($date < $this->now->format('Y-m-d') && checkdate($month, $day, $year + 1)) {
            $date = sprintf('%04d-%02d-%02d', $year + 1, $month, $day);
        }

        return $date;
    }

    /** Lower case without accents, so "lördag" and "lordag" match. */
    private function fold(string $text): string
    {
        $text = mb_strtolower(trim($text));

        return strtr($text, ['å' => 'a', 'ä' => 'a', 'ö' => 'o', 'é' => 'e', 'ë' => 'e', 'ï' => 'i', 'ü' => 'u']);
    }
}
