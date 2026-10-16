<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * The Cloud widgets: upcoming events, recent files and Talk, read from
 * Nextcloud as the person with the app password they granted. Without a
 * link the widgets say how to connect.
 */
class NextcloudWidgets
{
    public static function data(string $widget, User $user): ?array
    {
        if (! in_array($widget, ['calendar', 'files', 'talk'], true)) {
            return null;
        }
        $link = Nextcloud::link($user);
        if ($link === null) {
            return ['connected' => false];
        }
        $key = "nextcloud:$widget:{$user->id}";
        if (is_array($cached = Cache::get($key))) {
            return $cached;
        }
        try {
            $data = ['connected' => true] + match ($widget) {
                'calendar' => ['events' => self::events($link)],
                'files' => ['files' => self::files($link)],
                'talk' => ['rooms' => self::rooms($link)],
            };
            Cache::put($key, $data, 90);

            return $data;
        } catch (Throwable $error) {
            report($error);

            return ['connected' => true, 'error' => 'Could not reach Nextcloud.'];
        }
    }

    /* ---------- Calendar ---------- */

    private static function events(array $link): array
    {
        $base = Nextcloud::base();
        $home = '/remote.php/dav/calendars/'.rawurlencode($link['user']).'/';
        $list = Nextcloud::as($link)->withHeaders(['Depth' => '1', 'Content-Type' => 'application/xml'])
            ->send('PROPFIND', $base.$home, ['body' => '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/></d:prop></d:propfind>']);
        $calendars = [];
        foreach (self::responses($list->body()) as $response) {
            if (str_contains($response['xml'], 'calendar') && preg_match('#<[a-z]*:?calendar\s*/>#i', $response['xml']) && ! str_contains($response['href'], 'inbox') && ! str_contains($response['href'], 'outbox') && ! str_contains($response['href'], 'trashbin')) {
                $calendars[] = ['href' => $response['href'], 'name' => self::tag($response['xml'], 'displayname'), 'color' => self::tag($response['xml'], 'calendar-color')];
            }
        }

        $start = CarbonImmutable::now('UTC')->startOfDay();
        $end = $start->addDays(31);
        $range = sprintf('start="%s" end="%s"', $start->format('Ymd\THis\Z'), $end->format('Ymd\THis\Z'));
        $events = [];
        foreach (array_slice($calendars, 0, 12) as $calendar) {
            $report = Nextcloud::as($link)->withHeaders(['Depth' => '1', 'Content-Type' => 'application/xml'])
                ->send('REPORT', $base.$calendar['href'], ['body' => '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand '.$range.'/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range '.$range.'/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>']);
            foreach (self::responses($report->body()) as $response) {
                $ics = html_entity_decode(self::tag($response['xml'], 'calendar-data'), ENT_QUOTES | ENT_XML1);
                foreach (self::vevents($ics) as $event) {
                    $event['calendar'] = $calendar['name'];
                    $event['color'] = preg_match('/^#[0-9a-f]{6}/i', $calendar['color']) ? substr($calendar['color'], 0, 7) : null;
                    $events[] = $event;
                }
            }
        }
        usort($events, fn ($a, $b) => strcmp($a['start'], $b['start']));

        return array_slice(array_values(array_filter($events, fn ($event) => $event['end'] >= now()->toIso8601String())), 0, 30);
    }

    /** VEVENTs from expanded calendar data: title, place, start, end, all day. */
    private static function vevents(string $ics): array
    {
        $ics = preg_replace("/\r?\n[ \t]/", '', $ics); // unfold long lines
        preg_match_all('/BEGIN:VEVENT(.*?)END:VEVENT/s', $ics, $blocks);
        $events = [];
        foreach ($blocks[1] as $block) {
            $start = self::icsDate($block, 'DTSTART');
            if ($start === null) {
                continue;
            }
            $end = self::icsDate($block, 'DTEND') ?? $start;
            $events[] = [
                'title' => self::icsText($block, 'SUMMARY') ?: 'Busy',
                'place' => self::icsText($block, 'LOCATION'),
                'start' => $start['at'],
                'end' => $end['at'],
                'allDay' => $start['allDay'],
            ];
        }

        return $events;
    }

    private static function icsDate(string $block, string $name): ?array
    {
        if (! preg_match('/^'.$name.'(;[^:\r\n]*)?:([0-9TZ]+)\s*$/m', $block, $match)) {
            return null;
        }
        $value = $match[2];
        if (strlen($value) === 8) {
            return ['at' => CarbonImmutable::createFromFormat('!Ymd', $value, 'Europe/Stockholm')->toIso8601String(), 'allDay' => true];
        }
        $zone = str_ends_with($value, 'Z') ? 'UTC' : (preg_match('/TZID=([^;:]+)/', $match[1], $tz) ? $tz[1] : 'Europe/Stockholm');
        try {
            return ['at' => CarbonImmutable::createFromFormat('Ymd\THis', rtrim($value, 'Z'), $zone)->toIso8601String(), 'allDay' => false];
        } catch (Throwable) {
            return null;
        }
    }

    private static function icsText(string $block, string $name): string
    {
        if (! preg_match('/^'.$name.'(;[^:\r\n]*)?:(.*)$/m', $block, $match)) {
            return '';
        }

        return mb_substr(trim(str_replace(['\\,', '\\;', '\\n', '\\N', '\\\\'], [',', ';', ' ', ' ', '\\'], $match[2])), 0, 120);
    }

    /* ---------- Files ---------- */

    private static function files(array $link): array
    {
        $base = Nextcloud::base();
        $user = htmlspecialchars($link['user'], ENT_XML1);
        $search = '<?xml version="1.0"?><d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:basicsearch>'
            .'<d:select><d:prop><d:displayname/><d:getlastmodified/><d:getcontenttype/><oc:fileid/><d:resourcetype/></d:prop></d:select>'
            .'<d:from><d:scope><d:href>/files/'.$user.'</d:href><d:depth>infinity</d:depth></d:scope></d:from>'
            .'<d:where><d:not><d:is-collection/></d:not></d:where>'
            .'<d:orderby><d:order><d:prop><d:getlastmodified/></d:prop><d:descending/></d:order></d:orderby>'
            .'<d:limit><d:nresults>10</d:nresults></d:limit></d:basicsearch></d:searchrequest>';
        $response = Nextcloud::as($link)->withHeaders(['Content-Type' => 'text/xml'])->send('SEARCH', $base.'/remote.php/dav/', ['body' => $search]);
        $files = [];
        foreach (self::responses($response->body()) as $item) {
            $id = self::tag($item['xml'], 'fileid');
            $name = self::tag($item['xml'], 'displayname') ?: rawurldecode(basename($item['href']));
            $path = rawurldecode(preg_replace('#^/remote\.php/dav/files/[^/]+#', '', $item['href']));
            $files[] = [
                'name' => $name,
                'folder' => trim(dirname($path), '/.') ?: null,
                'type' => self::tag($item['xml'], 'getcontenttype'),
                'changed' => ($modified = self::tag($item['xml'], 'getlastmodified')) ? CarbonImmutable::parse($modified)->toIso8601String() : null,
                'url' => $id !== '' ? $base.'/index.php/f/'.rawurlencode($id) : $base.'/apps/files/',
            ];
        }

        return $files;
    }

    /* ---------- Talk ---------- */

    private static function rooms(array $link): array
    {
        $base = Nextcloud::base();
        $rooms = (array) Nextcloud::as($link)->withHeaders(['OCS-APIRequest' => 'true'])->acceptJson()
            ->get($base.'/ocs/v2.php/apps/spreed/api/v4/room')->json('ocs.data');
        $rooms = array_map(fn ($room) => [
            'name' => (string) ($room['displayName'] ?? 'Conversation'),
            'unread' => (int) ($room['unreadMessages'] ?? 0),
            'mention' => (bool) ($room['unreadMention'] ?? false),
            'last' => isset($room['lastMessage']['message']) ? mb_substr(self::talkMessage($room['lastMessage']), 0, 120) : null,
            'by' => $room['lastMessage']['actorDisplayName'] ?? null,
            'at' => isset($room['lastActivity']) ? CarbonImmutable::createFromTimestamp((int) $room['lastActivity'])->toIso8601String() : null,
            'url' => $base.'/call/'.rawurlencode((string) ($room['token'] ?? '')),
        ], array_filter($rooms, fn ($room) => is_array($room) && ($room['type'] ?? 0) !== 4));
        usort($rooms, fn ($a, $b) => [$b['unread'] > 0, $b['at']] <=> [$a['unread'] > 0, $a['at']]);

        return array_slice($rooms, 0, 20);
    }

    /** A Talk message with its {placeholders} filled in from the message parameters. */
    private static function talkMessage(array $message): string
    {
        $text = (string) $message['message'];
        foreach ((array) ($message['messageParameters'] ?? []) as $key => $parameter) {
            $text = str_replace('{'.$key.'}', (string) ($parameter['name'] ?? ''), $text);
        }

        return trim(preg_replace('/\s+/', ' ', $text));
    }

    /* ---------- WebDAV answers ---------- */

    /** @return list<array{href: string, xml: string}> */
    private static function responses(string $xml): array
    {
        preg_match_all('#<([a-z0-9]+:)?response\b[^>]*>(.*?)</\1?response>#si', $xml, $matches);

        return array_map(fn ($body) => ['href' => self::tag($body, 'href'), 'xml' => $body], $matches[2]);
    }

    private static function tag(string $xml, string $name): string
    {
        return preg_match('#<([a-z0-9]+:)?'.preg_quote($name, '#').'\b[^>]*>(.*?)</\1?'.preg_quote($name, '#').'>#si', $xml, $match)
            ? trim($match[2])
            : '';
    }
}
