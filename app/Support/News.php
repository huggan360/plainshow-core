<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use SimpleXMLElement;
use Throwable;

/**
 * News from open RSS feeds, no keys: SVT first, the Swedish papers, Sveriges
 * Radio, and a few international and Dutch sources. Local news is SVT's
 * regional desk for the person's county, plus any story that names their
 * town. Feeds are read at most every ten minutes. Stories without a picture
 * in the feed (SVT, Sveriges Radio, Al Jazeera) get the one their own page
 * shares (og:image). Pictures are served through core (image()), so the page
 * only ever loads from plainshow.se.
 */
class News
{
    public const TOPICS = ['sweden', 'world', 'business', 'sport', 'culture', 'science', 'tech'];

    /** Every source: name, language, whether it is on by default, and its feeds by topic. */
    public const SOURCES = [
        'svt' => ['name' => 'SVT Nyheter', 'lang' => 'sv', 'default' => true, 'rank' => 10, 'feeds' => [
            'sweden' => 'https://www.svt.se/nyheter/inrikes/rss.xml',
            'world' => 'https://www.svt.se/nyheter/utrikes/rss.xml',
            'business' => 'https://www.svt.se/nyheter/ekonomi/rss.xml',
            'sport' => 'https://www.svt.se/sport/rss.xml',
            'culture' => 'https://www.svt.se/kultur/rss.xml',
            'science' => 'https://www.svt.se/nyheter/vetenskap/rss.xml',
        ]],
        'sr' => ['name' => 'Sveriges Radio Ekot', 'lang' => 'sv', 'default' => true, 'rank' => 8, 'feeds' => ['sweden' => 'https://api.sr.se/api/rss/program/83']],
        'dn' => ['name' => 'Dagens Nyheter', 'lang' => 'sv', 'default' => true, 'rank' => 7, 'feeds' => ['sweden' => 'https://www.dn.se/rss/']],
        'svd' => ['name' => 'Svenska Dagbladet', 'lang' => 'sv', 'default' => true, 'rank' => 7, 'feeds' => ['sweden' => 'https://www.svd.se/feed/articles.rss']],
        'aftonbladet' => ['name' => 'Aftonbladet', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/']],
        'expressen' => ['name' => 'Expressen', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://feeds.expressen.se/nyheter/']],
        'di' => ['name' => 'Dagens industri', 'lang' => 'sv', 'default' => true, 'rank' => 6, 'feeds' => ['business' => 'https://www.di.se/rss']],
        'sydsvenskan' => ['name' => 'Sydsvenskan', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://www.sydsvenskan.se/rss.xml']],
        'bbc' => ['name' => 'BBC News', 'lang' => 'en', 'default' => true, 'rank' => 6, 'feeds' => ['world' => 'https://feeds.bbci.co.uk/news/world/rss.xml']],
        'guardian' => ['name' => 'The Guardian', 'lang' => 'en', 'default' => true, 'rank' => 5, 'feeds' => ['world' => 'https://www.theguardian.com/world/rss']],
        'aljazeera' => ['name' => 'Al Jazeera', 'lang' => 'en', 'default' => false, 'rank' => 4, 'feeds' => ['world' => 'https://www.aljazeera.com/xml/rss/all.xml']],
        'nos' => ['name' => 'NOS', 'lang' => 'nl', 'default' => false, 'rank' => 5, 'feeds' => ['world' => 'https://feeds.nos.nl/nosnieuwsalgemeen']],
        'ars' => ['name' => 'Ars Technica', 'lang' => 'en', 'default' => true, 'rank' => 5, 'feeds' => ['tech' => 'https://feeds.arstechnica.com/arstechnica/index']],
        'verge' => ['name' => 'The Verge', 'lang' => 'en', 'default' => false, 'rank' => 4, 'feeds' => ['tech' => 'https://www.theverge.com/rss/index.xml']],
    ];

    /** SVT's regional desks, by the words in a county's name (any language). */
    private const REGIONS = [
        'blekinge' => 'blekinge', 'dalarna' => 'dalarna', 'gavleborg' => 'gavleborg', 'halland' => 'halland', 'jamtland' => 'jamtland',
        'jonkoping' => 'jonkoping', 'kalmar' => 'smaland', 'kronoberg' => 'smaland', 'norrbotten' => 'norrbotten', 'skane' => 'skane',
        'stockholm' => 'stockholm', 'sodermanland' => 'sormland', 'uppsala' => 'uppsala', 'varmland' => 'varmland', 'vasterbotten' => 'vasterbotten',
        'vasternorrland' => 'vasternorrland', 'vastmanland' => 'vastmanland', 'vastra gotaland' => 'vast', 'orebro' => 'orebro', 'ostergotland' => 'ost',
    ];

    /* ---------- Preferences ---------- */

    /** @return array{setup: bool, topics: list<string>, sources: list<string>, place: ?array} */
    public static function preferences(User $user): array
    {
        $saved = is_array($user->news) ? $user->news : [];
        $topics = array_values(array_intersect((array) ($saved['topics'] ?? self::TOPICS), self::TOPICS));
        $sources = array_values(array_intersect((array) ($saved['sources'] ?? self::defaultSources()), array_keys(self::SOURCES)));
        // Until a town is chosen (or cleared) for the news, the weather home is the guess.
        $place = array_key_exists('place', $saved) ? Weather::cleanPlace($saved['place']) : (isset($user->weather['home']) ? Weather::cleanPlace($user->weather['home']) : null);

        return ['setup' => (bool) ($saved['setup'] ?? false), 'topics' => $topics ?: self::TOPICS, 'sources' => $sources ?: self::defaultSources(), 'place' => $place];
    }

    public static function savePreferences(User $user, array $input): array
    {
        $current = self::preferences($user);
        $next = [
            'setup' => true,
            'topics' => array_key_exists('topics', $input) ? array_values(array_intersect((array) $input['topics'], self::TOPICS)) : $current['topics'],
            'sources' => array_key_exists('sources', $input) ? array_values(array_intersect((array) $input['sources'], array_keys(self::SOURCES))) : $current['sources'],
            'place' => array_key_exists('place', $input) ? Weather::cleanPlace($input['place']) : $current['place'],
        ];
        $user->forceFill(['news' => $next])->save();

        return self::preferences($user->fresh());
    }

    public static function defaultSources(): array
    {
        return array_keys(array_filter(self::SOURCES, fn ($source) => $source['default']));
    }

    /** The sources and topics for the settings, in the visitor's language. */
    public static function catalogue(): array
    {
        return [
            'topics' => array_map(fn ($topic) => ['id' => $topic, 'name' => self::topicName($topic)], self::TOPICS),
            'sources' => array_map(fn ($id) => ['id' => $id, 'name' => self::SOURCES[$id]['name'], 'lang' => self::SOURCES[$id]['lang'], 'topics' => array_keys(self::SOURCES[$id]['feeds'])], array_keys(self::SOURCES)),
        ];
    }

    public static function topicName(string $topic): string
    {
        return match ($topic) {
            'sweden' => __('Sweden'), 'world' => __('World'), 'business' => __('Business'), 'sport' => __('Sport'),
            'culture' => __('Culture'), 'science' => __('Science'), 'tech' => __('Technology'), 'local' => __('Local'), default => ucfirst($topic),
        };
    }

    /** SVT's regional desk for a place in Sweden, from its county. */
    public static function region(?array $place): ?string
    {
        if (! $place || ($place['countryCode'] ?? 'SE') !== 'SE') {
            return null;
        }
        $county = self::fold((string) ($place['region'] ?? ''));
        foreach (self::REGIONS as $words => $slug) {
            if (str_contains($county, $words)) {
                return $slug;
            }
        }

        return null;
    }

    /* ---------- Stories ---------- */

    /**
     * The stories for a person: 'top' is everything from their sources and
     * topics, ranked by how new and how central; 'local' is their county's
     * desk and stories that name their town. A search looks through every
     * source they read.
     *
     * @return list<array<string, mixed>>
     */
    public static function stories(User $user, string $tab = 'top', string $query = '', int $limit = 60): array
    {
        $preferences = self::preferences($user);
        $feeds = [];
        foreach ($preferences['sources'] as $id) {
            foreach (self::SOURCES[$id]['feeds'] as $topic => $url) {
                if ($query !== '' || in_array($topic, $preferences['topics'], true) || $tab === 'local') {
                    $feeds[] = ['source' => $id, 'topic' => $topic, 'url' => $url];
                }
            }
        }
        $region = self::region($preferences['place']);
        if ($tab === 'local' && $region) {
            $feeds[] = ['source' => 'svt', 'topic' => 'local', 'url' => "https://www.svt.se/nyheter/lokalt/$region/rss.xml"];
        }

        $stories = self::read($feeds);
        if ($tab === 'local') {
            $town = $preferences['place'] ? self::fold($preferences['place']['name']) : null;
            $stories = array_values(array_filter($stories, fn ($story) => $story['topic'] === 'local'
                || ($town && mb_strlen($town) > 2 && preg_match('/\b'.preg_quote($town, '/').'\b/u', self::fold($story['title'].' '.$story['summary'])))));
        }
        if ($query !== '') {
            $needle = self::fold($query);
            $stories = array_values(array_filter($stories, fn ($story) => str_contains(self::fold($story['title'].' '.$story['summary']), $needle)));
        }

        // Newer first, but a central source and a picture lift a story a little.
        $now = time();
        usort($stories, function ($a, $b) use ($now) {
            $score = fn ($story) => -($now - $story['time']) / 3600 + (self::SOURCES[$story['source']]['rank'] ?? 4) * 0.25 + ($story['image'] ? 1 : 0);

            return $score($b) <=> $score($a);
        });

        $limit = max(1, min(150, $limit));
        // The front page shows every topic: each gets its share before the rest fill up.
        if ($tab === 'top' && $query === '') {
            $share = max(6, (int) ceil($limit / max(1, count($preferences['topics']))));
            $counts = [];
            $first = [];
            $rest = [];
            foreach ($stories as $story) {
                $counts[$story['topic']] = ($counts[$story['topic']] ?? 0) + 1;
                if ($counts[$story['topic']] <= $share) {
                    $first[] = $story;
                } else {
                    $rest[] = $story;
                }
            }
            $stories = array_merge($first, $rest);
        }

        return array_map(fn ($story) => self::present($story), array_slice($stories, 0, $limit));
    }

    /** What the browser gets: no raw picture addresses, only core's own. */
    private static function present(array $story): array
    {
        return [
            'id' => $story['id'],
            'title' => $story['title'],
            'summary' => $story['summary'],
            'url' => $story['url'],
            'image' => $story['image'] ? url('/news/image/'.self::imageKey($story['image'])) : null,
            'time' => date(DATE_ATOM, $story['time']),
            'source' => $story['source'],
            'sourceName' => self::SOURCES[$story['source']]['name'] ?? $story['source'],
            'topic' => $story['topic'],
            'topicName' => self::topicName($story['topic']),
        ];
    }

    /**
     * All the feeds' stories. A feed is read again when its copy is ten
     * minutes old, but the old copy is served meanwhile and the new one is
     * fetched after the answer has gone out, so nobody waits for the papers.
     * Only a feed never read before is waited for.
     */
    private static function read(array $feeds): array
    {
        $stories = [];
        $missing = [];
        $stale = [];
        foreach ($feeds as $feed) {
            $cached = Cache::get('news:feed:'.md5($feed['url']));
            if (is_array($cached) && isset($cached['items'])) {
                $stories[] = [$feed, $cached['items']];
                if ($cached['at'] < time() - 600) {
                    $stale[] = $feed;
                }
            } else {
                $missing[] = $feed;
            }
        }
        foreach (self::fetch($missing) as [$feed, $items]) {
            $stories[] = [$feed, $items];
        }
        if ($stale && Cache::add('news:refreshing:'.md5(json_encode(array_column($stale, 'url'))), true, 120)) {
            app()->terminating(fn () => self::fetch($stale));
        }

        $all = [];
        foreach ($stories as [$feed, $items]) {
            foreach ($items as $item) {
                // The same story in two feeds of one source (SVT's front page and a section) once.
                $all[$item['id']] ??= $item + ['source' => $feed['source'], 'topic' => $feed['topic']];
                if ($feed['topic'] === 'local') {
                    $all[$item['id']]['topic'] = 'local';
                }
            }
        }

        return array_values($all);
    }

    /** Reads feeds together and keeps them for two days; returns [feed, stories] pairs. */
    private static function fetch(array $feeds): array
    {
        if ($feeds === []) {
            return [];
        }
        $responses = Http::pool(fn (Pool $pool) => array_map(fn ($feed) => $pool->as(md5($feed['url']))->timeout(8)->connectTimeout(4)
            ->withHeaders(['User-Agent' => 'PlainShow/1.0 (+https://plainshow.se)'])->get($feed['url']), $feeds));
        $parsed = [];
        foreach ($feeds as $feed) {
            $response = $responses[md5($feed['url'])] ?? null;
            $items = $response instanceof \Illuminate\Http\Client\Response && $response->ok() ? self::parse($response->body()) : null;
            if ($items !== null) {
                $parsed[] = [$feed, $items];
            }
        }
        $parsed = self::withPictures($parsed);
        foreach ($parsed as [$feed, $items]) {
            Cache::put('news:feed:'.md5($feed['url']), ['at' => time(), 'items' => $items], 2 * 86400);
        }

        return $parsed;
    }

    /** RSS 2.0 or Atom to plain stories. */
    private static function parse(string $xml): ?array
    {
        $previous = libxml_use_internal_errors(true);
        try {
            $feed = new SimpleXMLElement($xml, LIBXML_NONET | LIBXML_NOCDATA);
        } catch (Throwable) {
            return null;
        } finally {
            libxml_use_internal_errors($previous);
        }
        $entries = isset($feed->channel->item) ? $feed->channel->item : ($feed->item ?? $feed->entry ?? []);
        $stories = [];
        foreach ($entries as $entry) {
            $link = (string) ($entry->link['href'] ?? '') ?: trim((string) $entry->link);
            $title = self::text((string) $entry->title, 300);
            if ($title === '' || ! preg_match('~^https?://~', $link)) {
                continue;
            }
            $media = $entry->children('http://search.yahoo.com/mrss/');
            $content = $entry->children('http://purl.org/rss/1.0/modules/content/');
            $summary = (string) ($entry->description ?? '') ?: (string) ($entry->summary ?? '') ?: (string) ($content->encoded ?? '') ?: (string) ($entry->content ?? '');
            $time = strtotime((string) ($entry->pubDate ?? $entry->published ?? $entry->updated ?? '')) ?: time();
            $stories[] = [
                'id' => substr(sha1($link), 0, 16),
                'title' => $title,
                'summary' => self::text($summary, 900),
                'url' => $link,
                'image' => self::picture($entry, $media, $summary),
                'time' => min($time, time()),
            ];
            if (count($stories) >= 60) {
                break;
            }
        }

        return $stories;
    }

    /** The largest picture a feed gives: media:content, media:thumbnail, an image enclosure or an <img> in the text. */
    private static function picture(SimpleXMLElement $entry, SimpleXMLElement $media, string $html): ?string
    {
        $best = null;
        $bestWidth = -1;
        foreach ([$media->content, $media->thumbnail, $media->group->content ?? []] as $list) {
            foreach ($list ?? [] as $node) {
                // A namespaced element's own attributes are only reachable through attributes().
                $attributes = $node->attributes();
                $url = (string) ($attributes['url'] ?? '');
                $type = (string) ($attributes['type'] ?? '');
                $width = (int) ($attributes['width'] ?? 0);
                if ($url !== '' && ($type === '' || str_starts_with($type, 'image/')) && $width >= $bestWidth) {
                    $best = $url;
                    $bestWidth = $width;
                }
            }
        }
        if (! $best) {
            foreach ($entry->enclosure ?? [] as $enclosure) {
                if (str_starts_with((string) $enclosure['type'], 'image/')) {
                    $best = (string) $enclosure['url'];
                    break;
                }
            }
        }
        if (! $best && preg_match('/<img[^>]+src="([^"]+)"/i', $html, $match)) {
            $best = html_entity_decode($match[1]);
        }
        if ($best && str_contains($best, 'ichef.bbci.co.uk')) {
            $best = preg_replace('~/standard/\d+/~', '/standard/800/', $best);
        }

        return $best && preg_match('~^https://~', $best) ? $best : null;
    }

    /**
     * Stories without a picture borrow the one their page shares, looked up
     * once per story (all feeds' lookups together) and remembered for a week.
     *
     * @param  list<array{0: array, 1: array}>  $parsed
     */
    private static function withPictures(array $parsed): array
    {
        $lookups = [];
        foreach ($parsed as $f => [$feed, $items]) {
            $needs = 0;
            foreach ($items as $i => $item) {
                if ($item['image'] || $needs >= 25) {
                    continue;
                }
                $needs++;
                $known = Cache::get('news:og:'.$item['id']);
                if ($known !== null) {
                    $parsed[$f][1][$i]['image'] = $known ?: null;
                } else {
                    $lookups["$f:$i"] = $item['url'];
                }
            }
        }
        $lookups = array_slice($lookups, 0, 120, true);
        if ($lookups) {
            $responses = Http::pool(fn (Pool $pool) => array_map(fn ($key) => $pool->as($key)->timeout(5)->connectTimeout(3)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; PlainShow/1.0; +https://plainshow.se)'])->get($lookups[$key]), array_keys($lookups)), 12);
            foreach ($lookups as $key => $url) {
                [$f, $i] = array_map('intval', explode(':', $key));
                $response = $responses[$key] ?? null;
                $image = null;
                if (! $response instanceof \Illuminate\Http\Client\Response) {
                    continue; // no answer: try again next time
                }
                $head = $response->ok() ? substr($response->body(), 0, 300000) : '';
                // og:image, with its attributes in either order.
                if (preg_match('/<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']/i', $head, $match)
                    || preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image["\']/i', $head, $match)) {
                    $image = html_entity_decode($match[1]);
                }
                $image = $image && preg_match('~^https://~', $image) ? $image : null;
                Cache::put('news:og:'.$parsed[$f][1][$i]['id'], $image ?? '', 7 * 86400);
                $parsed[$f][1][$i]['image'] = $image;
            }
        }

        return $parsed;
    }

    /* ---------- Pictures through core ---------- */

    private static function imageKey(string $url): string
    {
        $key = substr(hash_hmac('sha256', $url, (string) config('app.key')), 0, 32);
        Cache::add("news:image:$key", $url, 3 * 86400);

        return $key;
    }

    /** A story's picture, fetched once and kept on disk for three days. */
    public static function image(string $key): ?string
    {
        if (! preg_match('/^[a-f0-9]{32}$/', $key)) {
            return null;
        }
        $folder = storage_path('app/news-images');
        $file = "$folder/$key";
        if (is_file($file)) {
            return $file;
        }
        $url = Cache::get("news:image:$key");
        if (! is_string($url)) {
            return null;
        }
        try {
            $response = Http::timeout(8)->connectTimeout(4)->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; PlainShow/1.0)'])->get($url);
        } catch (Throwable) {
            return null;
        }
        $body = $response->body();
        if (! $response->ok() || strlen($body) > 6 * 1024 * 1024 || ! @getimagesizefromstring($body)) {
            return null;
        }
        if (! is_dir($folder)) {
            @mkdir($folder, 0775, true);
        }
        foreach (glob("$folder/*") ?: [] as $old) {
            if (filemtime($old) < time() - 3 * 86400) {
                @unlink($old);
            }
        }
        file_put_contents("$file.tmp", $body);
        rename("$file.tmp", $file);

        return $file;
    }

    /* ---------- Text ---------- */

    private static function text(string $html, int $max): string
    {
        $text = html_entity_decode(strip_tags(preg_replace('/<(br|p|\/p|li)[^>]*>/i', ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\s+/u', ' ', $text));

        return mb_strlen($text) > $max ? rtrim(mb_substr($text, 0, $max - 1)).'…' : $text;
    }

    /** Lower case without accents, for matching place names and searches. */
    public static function fold(string $text): string
    {
        $text = mb_strtolower($text);

        return strtr($text, ['å' => 'a', 'ä' => 'a', 'ö' => 'o', 'é' => 'e', 'ü' => 'u', 'ø' => 'o', 'æ' => 'ae']);
    }
}
