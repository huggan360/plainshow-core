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
        'svt' => ['open' => true, 'name' => 'SVT Nyheter', 'lang' => 'sv', 'default' => true, 'rank' => 10, 'feeds' => [
            'sweden' => 'https://www.svt.se/nyheter/inrikes/rss.xml',
            'world' => 'https://www.svt.se/nyheter/utrikes/rss.xml',
            'business' => 'https://www.svt.se/nyheter/ekonomi/rss.xml',
            'sport' => 'https://www.svt.se/sport/rss.xml',
            'culture' => 'https://www.svt.se/kultur/rss.xml',
            'science' => 'https://www.svt.se/nyheter/vetenskap/rss.xml',
        ]],
        'sr' => ['open' => true, 'name' => 'Sveriges Radio Ekot', 'lang' => 'sv', 'default' => true, 'rank' => 8, 'feeds' => ['sweden' => 'https://api.sr.se/api/rss/program/83']],
        'dn' => ['name' => 'Dagens Nyheter', 'lang' => 'sv', 'default' => true, 'rank' => 7, 'feeds' => ['sweden' => 'https://www.dn.se/rss/']],
        'svd' => ['open' => true, 'name' => 'Svenska Dagbladet', 'lang' => 'sv', 'default' => true, 'rank' => 7, 'feeds' => ['sweden' => 'https://www.svd.se/feed/articles.rss']],
        'aftonbladet' => ['open' => true, 'name' => 'Aftonbladet', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/']],
        'expressen' => ['open' => true, 'name' => 'Expressen', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://feeds.expressen.se/nyheter/']],
        'di' => ['name' => 'Dagens industri', 'lang' => 'sv', 'default' => true, 'rank' => 6, 'feeds' => ['business' => 'https://www.di.se/rss']],
        'sydsvenskan' => ['open' => true, 'name' => 'Sydsvenskan', 'lang' => 'sv', 'default' => false, 'rank' => 5, 'feeds' => ['sweden' => 'https://www.sydsvenskan.se/rss.xml']],
        'bbc' => ['open' => true, 'name' => 'BBC News', 'lang' => 'en', 'default' => true, 'rank' => 6, 'feeds' => ['world' => 'https://feeds.bbci.co.uk/news/world/rss.xml']],
        'guardian' => ['open' => true, 'name' => 'The Guardian', 'lang' => 'en', 'default' => true, 'rank' => 5, 'feeds' => ['world' => 'https://www.theguardian.com/world/rss']],
        'aljazeera' => ['open' => true, 'name' => 'Al Jazeera', 'lang' => 'en', 'default' => false, 'rank' => 4, 'feeds' => ['world' => 'https://www.aljazeera.com/xml/rss/all.xml']],
        'nos' => ['open' => true, 'name' => 'NOS', 'lang' => 'nl', 'default' => false, 'rank' => 5, 'feeds' => ['world' => 'https://feeds.nos.nl/nosnieuwsalgemeen']],
        'ars' => ['open' => true, 'name' => 'Ars Technica', 'lang' => 'en', 'default' => true, 'rank' => 5, 'feeds' => ['tech' => 'https://feeds.arstechnica.com/arstechnica/index']],
        'verge' => ['open' => true, 'name' => 'The Verge', 'lang' => 'en', 'default' => false, 'rank' => 4, 'feeds' => ['tech' => 'https://www.theverge.com/rss/index.xml']],
    ];

    /** SVT's regional desks, by the words in a county's name (any language). */
    private const REGIONS = [
        'blekinge' => 'blekinge', 'dalarna' => 'dalarna', 'gavleborg' => 'gavleborg', 'halland' => 'halland', 'jamtland' => 'jamtland',
        'jonkoping' => 'jonkoping', 'kalmar' => 'smaland', 'kronoberg' => 'smaland', 'norrbotten' => 'norrbotten', 'skane' => 'skane',
        'stockholm' => 'stockholm', 'sodermanland' => 'sormland', 'uppsala' => 'uppsala', 'varmland' => 'varmland', 'vasterbotten' => 'vasterbotten',
        'vasternorrland' => 'vasternorrland', 'vastmanland' => 'vastmanland', 'vastra gotaland' => 'vast', 'orebro' => 'orebro', 'ostergotland' => 'ost',
    ];

    /* ---------- Preferences ---------- */

    /**
     * A person's choices. Every topic has a level: 0 skip, 1 show, 2 more of
     * it. `topics` lists the topics they read, the ones they want more of
     * first; that is also the order of the front page's sections.
     *
     * @return array{setup: bool, levels: array<string, int>, topics: list<string>, sources: list<string>, place: ?array}
     */
    public static function preferences(User $user): array
    {
        $saved = is_array($user->news) ? $user->news : [];
        $levels = [];
        foreach (self::TOPICS as $topic) {
            $levels[$topic] = isset($saved['levels'][$topic])
                ? max(0, min(2, (int) $saved['levels'][$topic]))
                : (isset($saved['topics']) ? (in_array($topic, (array) $saved['topics'], true) ? 1 : 0) : 1);
        }
        if (! array_filter($levels)) {
            $levels = array_fill_keys(self::TOPICS, 1);
        }
        $topics = array_keys(array_filter($levels));
        usort($topics, fn ($a, $b) => [$levels[$b], array_search($a, self::TOPICS, true)] <=> [$levels[$a], array_search($b, self::TOPICS, true)]);
        $sources = array_values(array_intersect((array) ($saved['sources'] ?? self::defaultSources()), array_keys(self::SOURCES)));
        // Until a town is chosen (or cleared) for the news, the weather home is the guess.
        $place = array_key_exists('place', $saved) ? Weather::cleanPlace($saved['place']) : (isset($user->weather['home']) ? Weather::cleanPlace($user->weather['home']) : null);

        return ['setup' => (bool) ($saved['setup'] ?? false), 'levels' => $levels, 'topics' => $topics, 'sources' => $sources ?: self::defaultSources(), 'place' => $place];
    }

    public static function savePreferences(User $user, array $input): array
    {
        $current = self::preferences($user);
        $levels = $current['levels'];
        if (isset($input['levels']) && is_array($input['levels'])) {
            foreach (self::TOPICS as $topic) {
                if (isset($input['levels'][$topic])) {
                    $levels[$topic] = max(0, min(2, (int) $input['levels'][$topic]));
                }
            }
        } elseif (isset($input['topics']) && is_array($input['topics'])) {
            foreach (self::TOPICS as $topic) {
                $levels[$topic] = in_array($topic, $input['topics'], true) ? max(1, $levels[$topic]) : 0;
            }
        }
        $next = [
            'setup' => true,
            'levels' => $levels,
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
    public static function stories(User $user, string $tab = 'top', string $query = '', int $limit = 60, ?string $only = null): array
    {
        $preferences = self::preferences($user);
        $only = in_array($only, self::TOPICS, true) ? $only : null;
        $feeds = [];
        foreach ($preferences['sources'] as $id) {
            foreach (self::SOURCES[$id]['feeds'] as $topic => $url) {
                if ($only ? $topic === $only : ($query !== '' || in_array($topic, $preferences['topics'], true) || $tab === 'local')) {
                    $feeds[] = ['source' => $id, 'topic' => $topic, 'url' => $url];
                }
            }
        }
        // A section none of their sources covers is read from every source that does.
        if ($only && $feeds === []) {
            foreach (self::SOURCES as $id => $source) {
                if (isset($source['feeds'][$only])) {
                    $feeds[] = ['source' => $id, 'topic' => $only, 'url' => $source['feeds'][$only]];
                }
            }
        }
        $region = self::region($preferences['place']);
        if ($tab === 'local' && $region && ! $only) {
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

        // Newer first, but a central source, a picture and a topic they want more of lift a story.
        $now = time();
        $levels = $preferences['levels'];
        usort($stories, function ($a, $b) use ($now, $levels) {
            $score = fn ($story) => -($now - $story['time']) / 3600 + (self::SOURCES[$story['source']]['rank'] ?? 4) * 0.25 + ($story['image'] ? 1 : 0)
                + (($levels[$story['topic']] ?? 1) === 2 ? 4 : 0);

            return $score($b) <=> $score($a);
        });

        $limit = max(1, min(150, $limit));
        // The front page shows every topic: each gets its share before the rest fill up.
        if ($tab === 'top' && $query === '' && ! $only) {
            // Topics they want more of get twice the room.
            $weight = array_sum(array_map(fn ($topic) => $levels[$topic], $preferences['topics']));
            $share = fn ($topic) => max(6, (int) ceil($limit * ($levels[$topic] ?? 1) / max(1, $weight)));
            $counts = [];
            $first = [];
            $rest = [];
            foreach ($stories as $story) {
                $counts[$story['topic']] = ($counts[$story['topic']] ?? 0) + 1;
                if ($counts[$story['topic']] <= $share($story['topic'])) {
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
        // The reader asks for the article by id; only addresses from the feeds can be read.
        Cache::add('news:story:'.$story['id'], $story['url'], 3 * 86400);

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
            'full' => self::SOURCES[$story['source']]['open'] ?? false,
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

    /* ---------- The whole article, where the source publishes it openly ---------- */

    /**
     * The text of a story's page: the paragraphs and subheadings of its
     * article, without menus, pictures, share buttons and "read more" lists.
     * Kept for a day. Null when the page gives nothing worth more than the
     * feed's summary (paywalls, video pages).
     *
     * @return ?list<array{type: string, text: string}>
     */
    public static function article(string $id): ?array
    {
        if (! preg_match('/^[a-f0-9]{16}$/', $id)) {
            return null;
        }
        $url = Cache::get("news:story:$id");
        if (! is_string($url)) {
            return null;
        }

        return Cache::remember("news:article:$id", 86400, function () use ($url) {
            try {
                $response = Http::timeout(8)->connectTimeout(4)->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; PlainShow/1.0; +https://plainshow.se)'])->get($url);
            } catch (Throwable) {
                return [];
            }
            $parts = $response->ok() ? self::extract($response->body()) : [];
            $words = array_sum(array_map(fn ($part) => str_word_count($part['text']), $parts));

            return $words >= 120 ? $parts : [];
        }) ?: null;
    }

    private static function extract(string $html): array
    {
        $document = new \DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $document->loadHTML('<?xml encoding="utf-8"?>'.$html, LIBXML_NONET | LIBXML_NOERROR);
        libxml_use_internal_errors($previous);
        $path = new \DOMXPath($document);
        foreach (['//script', '//style', '//noscript', '//figure', '//aside', '//nav', '//footer', '//header', '//form', '//button'] as $query) {
            foreach (iterator_to_array($path->query($query)) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }
        // The <article> (else <main>) with the most paragraph text is the story.
        $best = null;
        $most = 0;
        foreach ([$path->query('//article'), $path->query('//main')] as $candidates) {
            foreach ($candidates as $root) {
                $length = 0;
                foreach ($path->query('.//p', $root) as $paragraph) {
                    $length += mb_strlen(trim($paragraph->textContent));
                }
                if ($length > $most) {
                    $best = $root;
                    $most = $length;
                }
            }
            if ($best) {
                break;
            }
        }
        if (! $best) {
            return [];
        }
        $parts = [];
        foreach ($path->query('.//p|.//h2|.//h3', $best) as $node) {
            $text = trim(preg_replace('/\s+/u', ' ', $node->textContent));
            $heading = $node->nodeName !== 'p';
            if ($heading && preg_match('/recommended|related|more on|most read|read more|läs (också|mer)|relaterat|mest läst|lees ook|meer over|tekstgrootte|dyslexie|deel dit|share/i', $text)) {
                if ($parts) {
                    break; // the story is over; what follows is the site's own lists
                }
                continue;
            }
            if (mb_strlen($text) < ($heading ? 4 : 40) || ($heading && $parts === [])) {
                continue;
            }
            $parts[] = ['type' => $heading ? 'heading' : 'paragraph', 'text' => mb_substr($text, 0, 3000)];
            if (count($parts) >= 80) {
                break;
            }
        }

        return $parts;
    }

    /* ---------- Alerts: VMA, SMHI's warnings and Krisinformation ---------- */

    /**
     * What the authorities say that concerns the person: Viktigt meddelande
     * till allmänheten (Sveriges Radio's VMA feed), SMHI's warnings where
     * their town is inside the warned area, and Krisinformation's news (MSB)
     * for their county or marked important. Most urgent first. Each source is
     * read at most every five minutes.
     *
     * @return list<array{id: string, level: string, title: string, summary: string, body: list<string>, source: string, url: ?string, time: string, area: string}>
     */
    public static function alerts(?array $place): array
    {
        if ($place && ($place['countryCode'] ?? 'SE') !== 'SE') {
            return [];
        }
        $county = $place ? self::fold((string) ($place['region'] ?? '')) : null;
        $here = function (array $areas) use ($county): bool {
            foreach ($areas as $area) {
                $name = self::fold((string) $area);
                if ($name === 'sverige' || $name === 'sweden' || ($county && $name !== '' && (str_contains($county, preg_replace('/ (lan|county)$/', '', $name)) || str_contains($name, preg_replace('/ (lan|county)$/', '', $county))))) {
                    return true;
                }
            }

            return false;
        };
        $english = app()->getLocale() !== 'sv';
        $alerts = [];

        foreach ((array) (self::json('https://vmaapi.sr.se/api/v2/alerts')['alerts'] ?? []) as $vma) {
            $info = (array) ($vma['info'][0] ?? $vma['info'] ?? []);
            $areas = array_map(fn ($area) => $area['areaDesc'] ?? '', (array) ($info['area'] ?? []));
            if ($areas && ! $here($areas)) {
                continue;
            }
            $alerts[] = [
                'id' => 'vma-'.substr(sha1((string) ($vma['identifier'] ?? json_encode($vma))), 0, 12),
                'level' => 'vma',
                'title' => self::text((string) ($info['headline'] ?? $info['event'] ?? 'VMA'), 200),
                'summary' => self::text((string) ($info['description'] ?? ''), 400),
                'body' => array_values(array_filter(array_map('trim', preg_split('/\R+/', (string) ($info['description'] ?? '').' '.($info['instruction'] ?? ''))))),
                'source' => 'Sveriges Radio, VMA',
                'url' => 'https://sverigesradio.se/vma',
                'time' => date(DATE_ATOM, strtotime((string) ($vma['sent'] ?? 'now')) ?: time()),
                'area' => implode(', ', array_filter($areas)),
            ];
        }

        // SMHI's warnings only when the town itself is inside the warned area (the Weather app shows those nearby).
        if ($place) {
            foreach (Weather::warnings((float) $place['lat'], (float) $place['lon'], 0) as $warning) {
                $alerts[] = [
                    'id' => 'smhi-'.$warning['id'],
                    'level' => $warning['level'],
                    'title' => $warning['title'] ?: $warning['event'],
                    'summary' => self::text(implode(' ', $warning['text']), 400),
                    'body' => $warning['text'],
                    'source' => 'SMHI',
                    'url' => 'https://www.smhi.se/vader/varningar-och-brandrisk/varningar-och-meddelanden/varningar',
                    'time' => date(DATE_ATOM, strtotime((string) ($warning['start'] ?? 'now')) ?: time()),
                    'area' => implode(', ', $warning['areas']),
                ];
            }
        }

        // Krisinformation (MSB): what concerns their county, or what they mark as important for everyone.
        foreach ((array) self::json('https://api.krisinformation.se/v3/news?days=2') as $item) {
            $local = array_map(fn ($area) => $area['description'] ?? '', array_filter((array) ($item['area'] ?? []), fn ($area) => ($area['type'] ?? '') !== 'Country'));
            $important = filter_var($item['isPinned'] ?? false, FILTER_VALIDATE_BOOLEAN) || ($item['event'] ?? 'News') !== 'News';
            if (! $important && ! ($local && $county && $here($local))) {
                continue;
            }
            $areas = array_map(fn ($area) => $area['description'] ?? '', (array) ($item['area'] ?? []));
            $alerts[] = [
                'id' => 'kris-'.($item['identifier'] ?? '0'),
                'level' => 'info',
                'title' => self::text((string) ($item['headline'] ?? ''), 200),
                'summary' => self::text((string) ($item['preamble'] ?? ''), 400),
                'body' => array_values(array_filter(array_map('trim', preg_split('/\R+/', (string) ($item['bodyText'] ?? ''))))),
                'source' => 'Krisinformation',
                'url' => is_string($item['web'] ?? null) && str_starts_with($item['web'], 'https://') ? $item['web'] : 'https://www.krisinformation.se',
                'time' => date(DATE_ATOM, strtotime((string) ($item['published'] ?? 'now')) ?: time()),
                'area' => implode(', ', array_filter($areas)),
            ];
        }

        $order = ['vma' => 0, 'red' => 1, 'orange' => 2, 'yellow' => 3, 'info' => 4];
        usort($alerts, fn ($a, $b) => [$order[$a['level']], $b['time']] <=> [$order[$b['level']], $a['time']]);

        return array_slice(array_values(array_filter($alerts, fn ($alert) => $alert['title'] !== '')), 0, 8);
    }

    private static function json(string $url): array
    {
        return Cache::remember('news:alerts:'.md5($url), 300, function () use ($url) {
            try {
                $data = Http::timeout(6)->connectTimeout(3)->acceptJson()->get($url)->json();
            } catch (Throwable) {
                return [];
            }

            return is_array($data) ? $data : [];
        });
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
