<?php

namespace App\Support\Assistant;

use App\Models\User;
use App\Support\CloudAccount;
use App\Support\News;
use App\Support\Permissions;
use App\Support\ServiceCall;
use App\Support\Weather;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\Platform;
use RuntimeException;
use Throwable;

/**
 * The assistant behind the Composer: one request in, an answer out. The
 * model turns the words into actions (Model); this does them through the
 * apps' APIs, as the person, and answers with cards (an event, a task, the
 * weather, news, a file) and now and then a short message, a question or a
 * page to go to. It never shows past answers, but it remembers the last one
 * for a while, so "move it to 15" or the answer to its question works.
 * Turns are kept seven days.
 */
class Engine
{
    private const KEEP_DAYS = 7;

    /** How long "it" still means the last thing done. */
    private const MEMORY_MINUTES = 30;

    private When $when;

    /** @var array{cards: list<array>, messages: list<string>, question: ?array, redirect: ?string} */
    private array $out;

    /** What this turn did, for the next one: the last event, a question waiting for its answer. */
    private array $memory = [];

    private ?array $calendarsCache = null;

    /** The request as typed, to check the model against. */
    private string $request = '';

    public function __construct(private readonly User $user, private readonly Model $model = new Model)
    {
        $this->when = new When;
    }

    /** @return array{cards: list<array>, message: ?string, question: ?array, redirect: ?string, ms: int} */
    public function handle(string $request): array
    {
        $started = microtime(true);
        $request = trim(mb_substr($request, 0, 500));
        $this->request = $request;
        $this->out = ['cards' => [], 'messages' => [], 'question' => null, 'redirect' => null];
        $last = $this->lastMemory();
        $this->memory = array_intersect_key($last, ['event' => true]);

        try {
            // The answer to the question asked last time: no model needed.
            if (! empty($last['pending']) && $this->answerPending($last['pending'], $request)) {
                return $this->finish($request, $started);
            }
            foreach ($this->model->actions($this->context($last), $request) as $action) {
                $this->run($action);
            }
        } catch (RuntimeException $error) {
            $this->out['messages'][] = $error->getMessage();
        }
        if (! $this->out['cards'] && ! $this->out['messages'] && ! $this->out['question'] && ! $this->out['redirect']) {
            $this->out['messages'][] = __('I could not do that. Try saying it another way.');
        }

        return $this->finish($request, $started);
    }

    /* ---------- Turns: what was said, kept a week ---------- */

    private function finish(string $request, float $started): array
    {
        $result = [
            'cards' => $this->out['cards'],
            'message' => $this->out['messages'] ? implode(' ', array_unique($this->out['messages'])) : null,
            'question' => $this->out['question'],
            'redirect' => $this->out['redirect'],
            'ms' => (int) round((microtime(true) - $started) * 1000),
        ];
        DB::table('core_assistant_turns')->where('created_at', '<', now()->subDays(self::KEEP_DAYS))->delete();
        DB::table('core_assistant_turns')->insert([
            'user_id' => $this->user->id,
            'request' => $request,
            'result' => json_encode($result, JSON_UNESCAPED_UNICODE),
            'memory' => json_encode($this->memory, JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);

        return $result;
    }

    private function lastMemory(): array
    {
        $memory = DB::table('core_assistant_turns')->where('user_id', $this->user->id)
            ->where('created_at', '>=', now()->subMinutes(self::MEMORY_MINUTES))
            ->orderByDesc('id')->value('memory');
        $decoded = is_string($memory) ? json_decode($memory, true) : null;

        return is_array($decoded) ? $decoded : [];
    }

    /** What the model is told besides the request: today, the calendars, what "it" is. */
    private function context(array $last): string
    {
        // No date or time here: a small model copies them into its answers. Days are worked out by When.
        $lines = [];
        if (Permissions::hasService($this->user, 'cloud')) {
            try {
                $names = array_map(fn ($calendar) => $calendar['name'], $this->calendars('events'));
                if ($names) {
                    $lines[] = 'Calendars: '.implode(', ', $names).'.';
                }
            } catch (RuntimeException) {
                // Cloud is quiet; the model can still do everything else.
            }
        }
        if (! empty($last['event'])) {
            $event = $last['event'];
            $lines[] = 'Just added: "'.$event['title'].'" '.substr($event['start'], 0, 16).'.';
        }

        return $lines ? implode("\n", $lines) : 'Nothing else to know.';
    }

    /* ---------- Doing the actions ---------- */

    private function run(array $action): void
    {
        $action = $this->checked($action);
        try {
            match ($action['do']) {
                'calendar.add' => $this->addEvent($action),
                'calendar.change' => $this->changeEvent($action),
                'calendar.remove' => $this->removeEvent(),
                'task.add' => $this->addTask($action),
                'weather' => $this->weather($action),
                'news' => $this->news($action),
                'latex' => $this->latex($action),
                'open' => $this->open($action),
                'share' => $this->share($action),
                'files' => $this->files($action),
                'ask' => $this->out['question'] ??= ['text' => $this->text($action['text'] ?? '') ?: __('Can you say a little more?'), 'choices' => []],
                'say' => $this->out['messages'][] = $this->text($action['text'] ?? ''),
            };
        } catch (RuntimeException $error) {
            $this->out['cards'][] = ['type' => 'error', 'text' => $error->getMessage()];
        } catch (Throwable $error) {
            report($error);
            $this->out['cards'][] = ['type' => 'error', 'text' => __('Something went wrong on the way.')];
        }
    }

    private function addEvent(array $action, ?int $calendarId = null): void
    {
        $title = $this->text($action['title'] ?? '') ?: __('Event');
        $day = $action['date'] ?? $this->when->day($action['day'] ?? null) ?? $this->when->today();
        $start = $action['startTime'] ?? $this->when->time($action['start'] ?? null);
        $end = $action['endTime'] ?? $this->when->time($action['end'] ?? null);
        $resolved = ['do' => 'calendar.add', 'title' => $title, 'date' => $day, 'startTime' => $start, 'endTime' => $end];
        // Neither a day nor a time: ask, and read the answer without the model.
        if (! isset($action['date']) && $this->when->day($action['day'] ?? null) === null && $start === null) {
            if ($this->out['question'] === null) {
                $this->out['question'] = ['text' => __('When is “:title”?', ['title' => $title]), 'choices' => []];
                $this->memory['pending'] = ['action' => ['do' => 'calendar.add', 'title' => $title, 'calendar' => $action['calendar'] ?? ''], 'need' => 'when'];
            }

            return;
        }
        $calendarId ??= $this->chooseCalendar('events', (string) ($action['calendar'] ?? ''), $resolved, __('Which calendar should “:title” go in?', ['title' => $title]));
        if ($calendarId === null) {
            return;
        }
        $body = ['calendar' => $calendarId, 'title' => $title, 'allDay' => $start === null];
        if ($start === null) {
            $body += ['start' => $day, 'end' => $day];
        } else {
            $endAt = $end !== null && $end > $start ? $end : (new DateTimeImmutable("$day $start"))->modify('+1 hour')->format('H:i');
            $body += ['start' => "{$day}T$start:00", 'end' => "{$day}T$endAt:00"];
        }
        $event = ServiceCall::as($this->user, 'cloud', 'POST', '/events', $body)['event'];
        $this->memory['event'] = $event;
        $this->out['cards'][] = ['type' => 'event', 'event' => $event, 'state' => 'added'];
    }

    private function changeEvent(array $action): void
    {
        $event = $this->memory['event'] ?? null;
        if (! $event) {
            throw new RuntimeException(__('There is no event to change. Add one first.'));
        }
        $changes = ['calendar' => $event['calendarId'], 'uid' => $event['uid']];
        if ($this->text($action['title'] ?? '') !== '') {
            $changes['title'] = $this->text($action['title']);
        }
        $day = $this->when->day($action['day'] ?? null) ?? substr($event['start'], 0, 10);
        $start = $this->when->time($action['start'] ?? null);
        $end = $this->when->time($action['end'] ?? null);
        if ($start !== null || ($action['day'] ?? '') !== '') {
            $from = new DateTimeImmutable($event['start']);
            $to = new DateTimeImmutable($event['end']);
            $start ??= $event['allDay'] ? null : $from->format('H:i');
            if ($start === null) {
                $changes += ['start' => $day, 'end' => $day, 'allDay' => true];
            } else {
                // Moving the start keeps how long it lasts.
                $length = max(15 * 60, $to->getTimestamp() - $from->getTimestamp());
                $begin = new DateTimeImmutable("$day $start", When::zone());
                $finish = $end !== null ? new DateTimeImmutable("$day $end", When::zone()) : $begin->modify("+$length seconds");
                $changes += ['start' => $begin->format('Y-m-d\TH:i:00'), 'end' => $finish->format('Y-m-d\TH:i:00'), 'allDay' => false];
            }
        }
        $changed = ServiceCall::as($this->user, 'cloud', 'POST', '/events/change', $changes)['event'];
        $this->memory['event'] = $changed;
        $this->out['cards'][] = ['type' => 'event', 'event' => $changed, 'state' => 'changed'];
    }

    private function removeEvent(): void
    {
        $event = $this->memory['event'] ?? null;
        if (! $event) {
            throw new RuntimeException(__('There is no event to remove.'));
        }
        ServiceCall::as($this->user, 'cloud', 'POST', '/events/remove', ['calendar' => $event['calendarId'], 'uid' => $event['uid']]);
        unset($this->memory['event']);
        $this->out['cards'][] = ['type' => 'event', 'event' => $event, 'state' => 'removed'];
    }

    private function addTask(array $action, ?int $calendarId = null): void
    {
        $title = $this->text($action['title'] ?? '') ?: __('Task');
        $day = $action['date'] ?? $this->when->day($action['day'] ?? null);
        $time = $action['startTime'] ?? $this->when->time($action['start'] ?? null);
        $resolved = ['do' => 'task.add', 'title' => $title, 'date' => $day, 'startTime' => $time];
        $calendarId ??= $this->chooseCalendar('tasks', (string) ($action['calendar'] ?? ''), $resolved, __('Which list should “:title” go in?', ['title' => $title]));
        if ($calendarId === null) {
            return;
        }
        $due = $day === null ? null : ($time === null ? $day : "{$day}T$time:00");
        $task = ServiceCall::as($this->user, 'cloud', 'POST', '/tasks', ['calendar' => $calendarId, 'title' => $title, 'due' => $due])['task'];
        $this->out['cards'][] = ['type' => 'task', 'task' => $task];
    }

    private function weather(array $action): void
    {
        $name = $this->text($action['place'] ?? '');
        $place = $name === '' ? ($this->user->weather['home'] ?? null) : (Weather::places($name, app()->getLocale())[0] ?? null);
        if (! $place) {
            throw new RuntimeException($name === '' ? __('Choose a home place in Weather first.') : __('I could not find :place.', ['place' => $name]));
        }
        $this->out['cards'][] = ['type' => 'weather', 'place' => $place];
    }

    private function news(array $action): void
    {
        $topic = in_array($action['topic'] ?? '', Model::TOPICS, true) ? (string) ($action['topic'] ?? '') : '';
        $query = $this->text($action['query'] ?? '');
        $params = array_filter(['tab' => $topic === 'local' ? 'local' : null, 'topic' => $topic !== '' && $topic !== 'local' ? $topic : null, 'q' => $query ?: null]);
        $url = '/news'.($params ? '?'.http_build_query($params) : '');
        if (! empty($action['go'])) {
            $this->out['redirect'] = $url;
            $this->out['cards'][] = ['type' => 'link', 'icon' => 'bx-news', 'title' => $topic !== '' ? News::topicName($topic) : __('News'), 'text' => __('Opening the news'), 'url' => $url];

            return;
        }
        $stories = News::stories($this->user, $topic === 'local' ? 'local' : 'top', $query, 4, $topic !== '' && $topic !== 'local' ? $topic : null);
        if (! $stories) {
            throw new RuntimeException($query !== '' ? __('No news about :query right now.', ['query' => $query]) : __('No news right now.'));
        }
        $this->out['cards'][] = ['type' => 'news', 'title' => $topic !== '' ? News::topicName($topic) : ($query !== '' ? $query : __('Top news')), 'stories' => array_slice($stories, 0, 4), 'url' => $url];
    }

    private function latex(array $action): void
    {
        $query = $this->text($action['query'] ?? '');
        $projects = ServiceCall::as($this->user, 'latex', 'GET', '/projects')['projects'] ?? [];
        $best = $this->bestMatch($projects, $query, fn ($project) => (string) $project['title']);
        if ($best === null) {
            throw new RuntimeException($query !== '' ? __('I found no LaTeX document called :name.', ['name' => $query]) : __('You have no LaTeX documents yet.'));
        }
        $url = Platform::require('latex').'/edit?document_id='.(int) $best['id'];
        $this->out['redirect'] ??= $url;
        $this->out['cards'][] = ['type' => 'link', 'icon' => 'bx-code-curly', 'title' => $best['title'], 'text' => __('Opening it in LaTeX'), 'url' => $url];
    }

    private function open(array $action): void
    {
        $app = mb_strtolower($this->text($action['app'] ?? ''));
        $targets = [
            'dashboard' => ['/', 'bx-grid-alt', __('Dashboard'), null], 'news' => ['/news', 'bx-news', __('News'), null],
            'weather' => ['/weather', 'bx-cloud-light-rain', __('Weather'), null], 'design' => ['/design', 'bx-palette', __('Design'), null],
            'theme' => ['/design#theme', 'bx-brush', __('Theme'), null], 'account' => ['/account', 'bx-user', __('Account'), null],
            'cloud' => ['@cloud/', 'bx-cloud', 'Cloud', 'cloud'], 'files' => ['@cloud/files', 'bx-folder', __('Files'), 'cloud'],
            'photos' => ['@cloud/photos', 'bx-images', __('Photos'), 'cloud'], 'calendar' => ['@cloud/calendar', 'bx-calendar', __('Calendar'), 'cloud'],
            'latex' => ['@latex/', 'bx-code-curly', 'LaTeX', 'latex'], 'blog' => ['@blog/', 'bx-news', 'Blog', 'blog'], 'split' => ['@split/', 'bx-wallet', 'Split', 'split'],
        ];
        // Swedish and Dutch names for the same places.
        $aliases = ['start' => 'dashboard', 'hem' => 'dashboard', 'nyheter' => 'news', 'nieuws' => 'news', 'vader' => 'weather', 'weer' => 'weather',
            'kalender' => 'calendar', 'kalendern' => 'calendar', 'agenda' => 'calendar', 'filer' => 'files', 'bestanden' => 'files', 'foton' => 'photos',
            'bilder' => 'photos', 'fotos' => 'photos', 'konto' => 'account', 'kontot' => 'account', 'tema' => 'theme', 'thema' => 'theme', 'molnet' => 'cloud'];
        $app = $aliases[News::fold($app)] ?? $app;
        // "sverigenyheterna", "wereldnieuws": a news section said as a place.
        if (preg_match('/nyhet|news|nieuws/u', News::fold($app)) && $app !== 'news') {
            $sections = ['sverige' => 'sweden', 'sweden' => 'sweden', 'zweden' => 'sweden', 'inrikes' => 'sweden', 'varld' => 'world', 'world' => 'world', 'wereld' => 'world', 'utrikes' => 'world',
                'sport' => 'sport', 'ekonomi' => 'business', 'business' => 'business', 'economie' => 'business', 'kultur' => 'culture', 'culture' => 'culture', 'cultuur' => 'culture',
                'vetenskap' => 'science', 'science' => 'science', 'wetenschap' => 'science', 'tech' => 'tech', 'lokal' => 'local', 'local' => 'local', 'lokaal' => 'local'];
            foreach ($sections as $word => $topic) {
                if (str_contains(News::fold($app), $word)) {
                    $this->news(['topic' => $topic, 'go' => true]);

                    return;
                }
            }
            $app = 'news';
        }
        $key = $this->bestKey(array_keys($targets), $app);
        if ($key === null) {
            throw new RuntimeException(__('I do not know where :place is.', ['place' => $app]));
        }
        [$path, $icon, $name, $service] = $targets[$key];
        if ($service !== null) {
            if (! Platform::installed($service) || ! Permissions::hasService($this->user, $service)) {
                throw new RuntimeException(__('You do not have access to :name.', ['name' => $name]));
            }
            $path = Platform::require($service).substr($path, strlen("@$service"));
        }
        $this->out['redirect'] ??= $path;
        $this->out['cards'][] = ['type' => 'link', 'icon' => $icon, 'title' => $name, 'text' => __('Opening :name', ['name' => $name]), 'url' => $path];
    }

    private function share(array $action): void
    {
        $person = $this->person($this->text($action['person'] ?? ''));
        $file = $this->findFiles($action, 1)[0] ?? null;
        if ($file === null) {
            throw new RuntimeException(__('I found no such file in your Cloud.'));
        }
        $share = ServiceCall::as($this->user, 'cloud', 'POST', '/shares', ['file' => $file['id'], 'with' => CloudAccount::for($person)])['share'];
        $this->out['cards'][] = ['type' => 'file', 'file' => $share['file'], 'sharedWith' => ['name' => $person->name(), 'avatar' => $person->avatarUrl()]];
        $this->out['messages'][] = $share['already'] ? __(':name already has it.', ['name' => $person->first_name ?: $person->username]) : __('The file is shared with :name!', ['name' => $person->first_name ?: $person->username]);
    }

    private function files(array $action): void
    {
        $files = $this->findFiles($action, 4);
        if (! $files) {
            throw new RuntimeException(__('I found no such file in your Cloud.'));
        }
        $this->out['cards'][] = ['type' => 'files', 'files' => $files];
    }

    /* ---------- Helpers ---------- */

    /**
     * A small model sometimes fills in what was never said. Times count only
     * when their hour is in the request, days only when they are days; and a
     * request to open something is never turned into an event.
     */
    private function checked(array $action): array
    {
        preg_match_all('/\d{1,2}/', $this->request, $found);
        $numbers = array_map('intval', $found[0]);
        foreach (['start', 'end'] as $field) {
            $time = $this->when->time($action[$field] ?? null);
            if ($time !== null) {
                $hour = (int) substr($time, 0, 2);
                if (! in_array($hour, $numbers, true) && ! in_array($hour - 12, $numbers, true)) {
                    unset($action[$field]);
                }
            }
        }
        if (in_array($action['do'], ['calendar.add', 'task.add'], true) && preg_match('/^\s*(open|öppna|oppna|openen|open de|visa|show|go to|gå till)\b/iu', $this->request, $verb)) {
            return ['do' => 'open', 'app' => trim(mb_substr($this->request, mb_strlen($verb[0])))];
        }

        return $action;
    }

    private function findFiles(array $action, int $limit): array
    {
        $kind = in_array($action['kind'] ?? 'any', Model::KINDS, true) ? $action['kind'] ?? 'any' : 'any';
        // "latest", "senaste" and the like are not part of a file name.
        $words = preg_replace('/\b(my|the|a|latest|last|newest|recent|uploaded|min|mitt|mina|senaste|sista|nyaste|uppladdade|mijn|laatste|nieuwste|song|songs|music|track|file|files|photo|photos|picture|pictures|image|video|document|låt|låten|låtar|musik|fil|filen|filer|bild|bilden|bilder|foto|fotot|dokument|liedje|nummer|muziek|bestand|afbeelding)\b/iu', '', $this->text($action['query'] ?? '')) ?? '';

        return ServiceCall::as($this->user, 'cloud', 'GET', '/files/find?'.http_build_query(['kind' => $kind, 'q' => trim($words), 'limit' => $limit]))['files'] ?? [];
    }

    /** Someone else on this PlainShow by first name, full name or username; small typos are forgiven. */
    private function person(string $name): User
    {
        $wanted = News::fold($name);
        if ($wanted === '') {
            throw new RuntimeException(__('Who should get it?'));
        }
        $people = User::query()->where('id', '!=', $this->user->id)->where('status', 'active')->where('username', 'not like', 'removed-%')->get();
        $best = null;
        $score = PHP_INT_MAX;
        foreach ($people as $person) {
            foreach ([$person->first_name, trim($person->first_name.' '.$person->last_name), $person->username] as $candidate) {
                $folded = News::fold((string) $candidate);
                if ($folded === '') {
                    continue;
                }
                $distance = $folded === $wanted ? 0 : (str_starts_with($folded, $wanted) ? 1 : levenshtein($folded, $wanted) + 1);
                if ($distance < $score) {
                    [$best, $score] = [$person, $distance];
                }
            }
        }
        if ($best === null || $score > 3) {
            throw new RuntimeException(__('I do not know anyone called :name here.', ['name' => $name]));
        }

        return $best;
    }

    /**
     * The calendar to write to: the one named, the only one, or a question.
     * The question remembers the action, so the answer finishes it.
     */
    private function chooseCalendar(string $kind, string $named, array $resolved, string $question): ?int
    {
        $calendars = $this->calendars($kind);
        if (! $calendars) {
            throw new RuntimeException($kind === 'tasks' ? __('You have no task list in Cloud.') : __('You have no calendar in Cloud.'));
        }
        if ($named !== '') {
            $match = $this->bestMatch($calendars, $named, fn ($calendar) => $calendar['name']);
            if ($match !== null) {
                return $match['id'];
            }
        }
        if (count($calendars) === 1) {
            return $calendars[0]['id'];
        }
        if ($this->out['question'] === null) {
            $this->out['question'] = ['text' => $question, 'choices' => array_map(fn ($calendar) => $calendar['name'], $calendars)];
            $this->memory['pending'] = ['action' => $resolved, 'kind' => $kind, 'calendars' => $calendars];
        }

        return null;
    }

    private function answerPending(array $pending, string $request): bool
    {
        if (($pending['need'] ?? null) === 'when') {
            $day = $this->when->day($request);
            $times = preg_match_all('/\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/i', $request, $found) ? $found[0] : [];
            $start = $this->when->time($times[0] ?? null);
            if ($day === null && $start === null) {
                return false;
            }
            $this->addEvent($pending['action'] + ['date' => $day ?? $this->when->today(), 'startTime' => $start, 'endTime' => $this->when->time($times[1] ?? null)]);

            return true;
        }
        $match = $this->bestMatch($pending['calendars'] ?? [], $request, fn ($calendar) => $calendar['name']);
        if ($match === null) {
            return false;
        }
        $action = $pending['action'];
        $action['do'] === 'task.add' ? $this->addTask($action, $match['id']) : $this->addEvent($action, $match['id']);

        return true;
    }

    private function calendars(string $kind): array
    {
        $this->calendarsCache ??= ServiceCall::as($this->user, 'cloud', 'GET', '/calendars')['calendars'] ?? [];

        return array_values(array_filter($this->calendarsCache, fn ($calendar) => $calendar[$kind] ?? false));
    }

    /** The item whose name best matches the words (every word found, or close), or null. */
    private function bestMatch(array $items, string $words, callable $name): ?array
    {
        $wanted = array_values(array_filter(explode(' ', News::fold($words))));
        if (! $wanted) {
            return $items[0] ?? null;
        }
        $best = null;
        $bestScore = 0.0;
        foreach ($items as $item) {
            $have = News::fold($name($item));
            $hits = 0;
            foreach ($wanted as $word) {
                $hits += str_contains($have, $word) || ($word !== '' && levenshtein($word, $have) <= 2) ? 1 : 0;
            }
            $score = $hits / count($wanted);
            if ($score > $bestScore) {
                [$best, $bestScore] = [$item, $score];
            }
        }

        return $bestScore >= 0.5 ? $best : null;
    }

    private function bestKey(array $keys, string $word): ?string
    {
        $match = $this->bestMatch(array_map(fn ($key) => ['key' => $key], $keys), $word, fn ($item) => $item['key']);

        return $match['key'] ?? null;
    }

    private function text(mixed $value): string
    {
        return trim(mb_substr(strip_tags((string) $value), 0, 200));
    }
}
