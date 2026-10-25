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
 * The assistant behind the Assistant: one request in, an answer out. The
 * model plans the words into actions (Model); this does them through the
 * apps' APIs, as the person, and gathers what really happened. The model
 * then checks that against the request (a missing time is fixed on the
 * spot) and answers in its own words under the cards (a schedule, a task,
 * the weather, news, a file), or asks a question, or goes to a page.
 * While the page stays open it knows what was said before in it, so
 * "move it to 15" or "i Sverige då?" follow on; a page opened anew starts
 * afresh. Turns are kept seven days.
 */
class Engine
{
    private const KEEP_DAYS = 7;

    /** How long "it" still means the last thing done. */
    private const MEMORY_MINUTES = 30;

    /** A greeting or thanks on its own, folded: "Tjenare!", "tack så mycket", "good morning", "dank je wel". */
    private const SMALL_TALK = '/^\s*(hej|hejsan|halla|tja|tjena|tjenare|tjabba|morsning|god (morgon|kvall|dag)|tack( sa mycket| sa hemskt mycket)?|hi|hey|hello|good (morning|evening|afternoon)|thanks?( you)?( so much)?|cheers|hoi|hallo|goedemorgen|goedenavond|dank( je| u)?( wel)?|bedankt)[\s!.,?]*(\p{L}+)?[\s!.,?]*$/u';

    /** Words that make a request about the weather, folded. */
    private const WEATHER_WORD = '/vader|vadr|weather|weer|regn|rain|regen|sol|sun|zon|sno|snow|varm|warm|kall|cold|koud|temperatur|grader|degrees|graden|blas|wind|vind|paraply|umbrella|paraplu|forecast|prognos|storm|moln|cloud|wolk/';

    /** Words for a calendar or a list, folded (no accents), on their own: never a name. */
    private const CALENDAR_WORD = '/^(a |en |ett |een |de |the |my |min |mijn )?(new |ny |nytt |nya |nieuwe? )?(calendar|calender|kalender|kalendern|agenda|list|lista|listan|lijst|takenlijst|task list|todo list|to-do list|uppgiftslista|tasks)$/';

    /** A request to make a calendar or list: "new calendar", "skapa en kalender", "maak een takenlijst". */
    private const NEW_CALENDAR = '/\b(create|make|skapa|gor|maak|aanmaken|new|ny|nytt|nya|nieuwe?)\s+((a|an|en|ett|een|de|the|my|min|mitt|mijn)\s+)?((new|ny|nytt|nya|nieuwe?)\s+)?(calendar|calender|kalender\w*|agenda|task list|to-?do list|lista\w*|uppgiftslista|takenlijst|lijst)\b/';

    private When $when;

    /** @var array{cards: list<array>, messages: list<string>, question: ?array, redirect: ?string} */
    private array $out;

    /** What this turn did, for the next one: the last event, a question waiting for its answer. */
    private array $memory = [];

    private ?array $calendarsCache = null;

    /** The request as typed, to check the model against. */
    private string $request = '';

    /** Whether the request holds one dated thing only, so its own words can give the day. */
    private bool $single = false;

    /** The opening of the Assistant page this request came from; memory stays within it. */
    private ?string $conversation = null;

    /** What the last answer on this page showed ("news", "weather"), for follow-ups. */
    private ?array $previous = null;

    /** Whether this turn added or changed an event, so the check may fix it. */
    private bool $madeEvent = false;

    /** What the apps did this turn, in plain lines, for the model's check. */
    private array $done = [];

    /** How many earlier turns of this page the model reads. */
    private const EARLIER = 3;

    public function __construct(private readonly User $user, private readonly Model $model = new Model)
    {
        $this->when = new When;
    }

    /** @return array{cards: list<array>, message: ?string, question: ?array, redirect: ?string, ms: int} */
    public function handle(string $request, ?string $conversation = null): array
    {
        $started = microtime(true);
        $this->conversation = $conversation;
        $request = trim(mb_substr($request, 0, 500));
        $this->request = $request;
        $this->out = ['cards' => [], 'messages' => [], 'question' => null, 'redirect' => null];
        $last = $this->lastMemory();
        $this->memory = array_intersect_key($last, ['event' => true, 'last' => true]);
        $this->previous = $last['last'] ?? null;

        try {
            // The answer to the question asked last time: no model needed.
            if (! empty($last['pending']) && $this->answerPending($last['pending'], $request)) {
                $this->review();

                return $this->finish($request, $started);
            }
            // A greeting or thanks needs no plan, only an answer: the check writes it.
            $actions = preg_match(self::SMALL_TALK, News::fold($request)) ? [['do' => 'say']] : $this->model->actions($this->context($last), $request);
            // "Sammanfatta min dag", "summarize my day": the day's plan, its weather and its news, always all three.
            if (preg_match('/(sammanfatta|summar|samenvat|overzicht|oversikt|briefing).{0,20}\b(dag|dagen|day|today|idag|vandaag)\b/u', News::fold($request))) {
                $have = array_column($actions, 'do');
                foreach ([['do' => 'schedule', 'day' => ''], ['do' => 'weather', 'place' => ''], ['do' => 'news', 'topic' => '']] as $part) {
                    if (! in_array($part['do'], $have, true)) {
                        $actions[] = $part;
                    }
                }
                $actions = array_map(fn ($action) => $action + ['summary' => true], $actions);
            }
            $this->single = count(array_filter($actions, fn ($action) => in_array($action['do'], ['calendar.add', 'calendar.change', 'task.add'], true))) === 1;
            foreach ($actions as $action) {
                $this->run($action);
            }
        } catch (RuntimeException $error) {
            $this->out['messages'][] = $error->getMessage();
        }
        $this->review();
        if (! $this->out['cards'] && ! $this->out['messages'] && ! $this->out['question'] && ! $this->out['redirect']) {
            $this->out['messages'][] = __('I could not do that. Try saying it another way.');
        }

        return $this->finish($request, $started);
    }

    /**
     * The model looks at what was really done, fixes the event just made when
     * it differs from the request, and words the answer itself. Without the
     * model, the engine's own short texts stay.
     */
    private function review(): void
    {
        $done = $this->facts();
        try {
            // No earlier lines here: the model repeats them. It answers this request from what was done.
            $check = $this->model->review('', $this->request, $done, $this->language());
        } catch (RuntimeException) {
            return;
        }
        // A fix counts even when the model still says ok; checked() keeps only what the request says.
        if ($check['fix'] && ($this->memory['event']['uid'] ?? null) !== null && $this->madeEvent) {
            $this->fix($check['fix']);
        }
        if ($check['reply'] === '') {
            return;
        }
        // The model's words take the place of the engine's; errors stay on their cards.
        if ($this->out['question'] !== null) {
            $this->out['question']['text'] = $check['reply'];
        } else {
            $this->out['messages'] = [$check['reply']];
        }
    }

    /** The language the request is written in, from its words; the page's language when they do not tell. */
    private function language(): string
    {
        $words = preg_split('/[^\p{L}]+/u', mb_strtolower($this->request), -1, PREG_SPLIT_NO_EMPTY);
        $swedish = ['jag', 'och', 'har', 'det', 'är', 'vad', 'hur', 'min', 'mitt', 'mina', 'en', 'ett', 'på', 'till', 'idag', 'imorgon', 'tack', 'hej', 'tjena', 'tjenare', 'hejsan', 'visa', 'lägg', 'skapa', 'vädret', 'nyheter', 'då', 'kan', 'du', 'dag', 'sammanfatta', 'kalender', 'ny', 'nya', 'inte', 'som', 'heter', 'vill', 'mig', 'öppna'];
        $dutch = ['ik', 'het', 'een', 'wat', 'hoe', 'mijn', 'van', 'naar', 'vandaag', 'morgen', 'dank', 'hallo', 'hoi', 'toon', 'zet', 'maak', 'weer', 'nieuws', 'agenda', 'is', 'er', 'je', 'jij', 'niet', 'wil', 'graag', 'open', 'gaat'];
        $english = ['i', 'the', 'what', 'how', 'my', 'is', 'a', 'an', 'to', 'today', 'tomorrow', 'thanks', 'thank', 'hello', 'hi', 'show', 'add', 'make', 'weather', 'news', 'calendar', 'and', 'you', 'can', 'me', 'open', 'please', 'new', 'day'];
        $scores = ['Swedish' => 0, 'Dutch' => 0, 'English' => 0];
        foreach ($words as $word) {
            $scores['Swedish'] += in_array($word, $swedish, true) || preg_match('/[åäö]/u', $word) ? 1 : 0;
            $scores['Dutch'] += in_array($word, $dutch, true) || str_contains($word, 'ij') ? 1 : 0;
            $scores['English'] += in_array($word, $english, true) ? 1 : 0;
        }
        arsort($scores);
        if (reset($scores) > 0 && count(array_keys($scores, reset($scores), true)) === 1) {
            return array_key_first($scores);
        }

        return ['sv' => 'Swedish', 'nl' => 'Dutch'][app()->getLocale()] ?? 'English';
    }

    /** The model's fix for the event just made, held to what the request says, put on the card it came from. */
    private function fix(array $fix): void
    {
        $action = $this->checked(['do' => 'calendar.change'] + array_intersect_key($fix, array_flip(['title', 'day', 'start', 'end', 'place'])));
        if (count($action) === 1) {
            return;
        }
        $uid = $this->memory['event']['uid'];
        try {
            $this->changeEvent($action);
        } catch (Throwable $error) {
            report($error);

            return;
        }
        // One card for the event: the fixed one, in the place (and state) of the first.
        $changed = array_pop($this->out['cards']);
        foreach ($this->out['cards'] as $index => $card) {
            if ($card['type'] === 'event' && $card['event']['uid'] === $uid) {
                $this->out['cards'][$index]['event'] = $changed['event'];

                return;
            }
        }
        $this->out['cards'][] = $changed;
    }

    /** What the cards say was done, in plain lines the model can check. */
    private function facts(): array
    {
        $lines = [];
        foreach ($this->out['cards'] as $card) {
            $lines[] = match ($card['type']) {
                'event' => sprintf('Event %s: "%s", %s, place %s, calendar %s.', $card['state'], $card['event']['title'], $this->span($card['event']), $card['event']['place'] ?: 'none', $card['event']['calendar']),
                'task' => sprintf('Task added: "%s"%s, list %s.', $card['task']['title'], $card['task']['due'] ? ', due '.$card['task']['due'] : '', $card['task']['calendar']),
                'calendar' => sprintf('%s "%s" %s.', $card['calendar']['tasks'] ? 'Task list' : 'Calendar', $card['calendar']['name'], $card['state'] === 'exists' ? 'already existed; nothing new was made' : 'was made'),
                'day' => $this->dayFact($card),
                'error' => 'Failed: '.$card['text'],
                'link' => 'Opening '.$card['title'].'.',
                'files' => 'Files found: '.implode(', ', array_map(fn ($file) => $file['name'], $card['files'])).'.',
                'file' => isset($card['sharedWith']) ? 'Shared "'.$card['file']['name'].'" with '.$card['sharedWith']['name'].'.' : 'File: '.$card['file']['name'].'.',
                default => null,
            } ?? '';
        }
        $lines = array_merge(array_filter($lines), $this->done);
        foreach ($this->out['messages'] as $message) {
            $lines[] = 'Note: '.$message;
        }
        if ($this->out['question'] !== null) {
            $lines[] = 'Question needed: '.$this->out['question']['text'].($this->out['question']['choices'] ? ' Choices: '.implode(', ', $this->out['question']['choices']).'.' : '');
        }

        return $lines;
    }

    private function span(array $event): string
    {
        $from = new DateTimeImmutable($event['start']);
        $day = $from->format('l Y-m-d');

        return $event['allDay'] ? "$day, all day" : $day.', '.$from->format('H:i').' to '.(new DateTimeImmutable($event['end']))->format('H:i');
    }

    private function dayFact(array $card): string
    {
        $date = new DateTimeImmutable($card['date']);
        if (! $card['events']) {
            return 'Schedule for '.$date->format('l Y-m-d').': nothing planned.';
        }

        return 'Schedule for '.$date->format('l Y-m-d').': '.implode('; ', array_map(
            fn ($event) => ($event['allDay'] ? 'all day' : (new DateTimeImmutable($event['start']))->format('H:i').'-'.(new DateTimeImmutable($event['end']))->format('H:i')).' '.$event['title'].($event['place'] ? ' at '.$event['place'] : ''),
            $card['events'],
        )).'.';
    }

    /** What was said before on this page, oldest first: the person, and the answer. */
    private function earlier(): string
    {
        if ($this->conversation === null) {
            return '';
        }
        $turns = DB::table('core_assistant_turns')->where('user_id', $this->user->id)->where('conversation', $this->conversation)
            ->where('created_at', '>=', now()->subMinutes(self::MEMORY_MINUTES))->orderByDesc('id')->limit(self::EARLIER)->get(['request', 'result']);
        if ($turns->isEmpty()) {
            return '';
        }
        $lines = ['Earlier:'];
        foreach ($turns->reverse() as $turn) {
            $result = json_decode((string) $turn->result, true) ?: [];
            $said = $result['question']['text'] ?? $result['message'] ?? implode(', ', array_map(fn ($card) => $card['type'], $result['cards'] ?? []));
            $lines[] = 'Person: '.mb_substr((string) $turn->request, 0, 120);
            $lines[] = 'You: '.mb_substr((string) $said, 0, 110);
        }

        return implode("\n", $lines);
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
            'conversation' => $this->conversation,
            'request' => $request,
            'result' => json_encode($result, JSON_UNESCAPED_UNICODE),
            'memory' => json_encode($this->memory, JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);

        return $result;
    }

    private function lastMemory(): array
    {
        if ($this->conversation === null) {
            return [];
        }
        $memory = DB::table('core_assistant_turns')->where('user_id', $this->user->id)->where('conversation', $this->conversation)
            ->where('created_at', '>=', now()->subMinutes(self::MEMORY_MINUTES))
            ->orderByDesc('id')->value('memory');
        $decoded = is_string($memory) ? json_decode($memory, true) : null;

        return is_array($decoded) ? $decoded : [];
    }

    /** What the model is told besides the request: what was said before, the calendars, what "it" is. */
    private function context(array $last): string
    {
        // No date or time here: a small model copies them into its answers. Days are worked out by When.
        $lines = array_filter([$this->earlier()]);
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
        // What was shown last, so "och i Sverige då?" follows on from it.
        $shown = $last['last'] ?? null;
        if (($shown['do'] ?? null) === 'news') {
            $lines[] = 'Last: news'.($shown['topic'] ? ', topic '.$shown['topic'] : '').($shown['query'] ? ', about '.$shown['query'] : '').'.';
        } elseif (($shown['do'] ?? null) === 'weather') {
            $lines[] = 'Last: weather in '.$shown['place'].'.';
        }

        return $lines ? implode("\n", $lines) : 'Nothing else to know.';
    }

    /* ---------- Doing the actions ---------- */

    private function run(array $action): void
    {
        $action = $this->checked($action);
        try {
            match ($action['do']) {
                'calendar.create' => $this->createCalendar($action),
                'schedule' => $this->schedule($action),
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
                // The check words any question itself, from what it knows; nothing is pending.
                'ask' => $this->say(''),
                'say' => $this->say($this->text($action['text'] ?? '')),
            };
        } catch (RuntimeException $error) {
            $this->out['cards'][] = ['type' => 'error', 'text' => $error->getMessage()];
        } catch (Throwable $error) {
            report($error);
            $this->out['cards'][] = ['type' => 'error', 'text' => __('Something went wrong on the way.')];
        }
    }

    /** The model's own words; empty says nothing, so the answer falls back to "could not". */
    private function say(string $text): void
    {
        if ($text !== '') {
            $this->out['messages'][] = $text;
        }
    }

    /** A day's events as a timeline: today unless another day is said. */
    private function schedule(array $action): void
    {
        $day = $this->when->day($action['day'] ?? null) ?? $this->when->day($this->request) ?? $this->when->today();
        $events = ServiceCall::as($this->user, 'cloud', 'GET', '/events?'.http_build_query(['from' => $day, 'days' => 1]))['events'] ?? [];
        $events = array_values(array_filter($events, fn ($event) => substr((string) $event['start'], 0, 10) <= $day));
        $this->out['cards'][] = ['type' => 'day', 'date' => $day, 'events' => array_slice($events, 0, 12), 'url' => Platform::require('cloud').'/apps/plainshow/calendar'];
        $this->memory['last'] = ['do' => 'schedule', 'day' => $day];
    }

    /** A new calendar or task list. Its name has to be in the request; without one, ask for it. */
    private function createCalendar(array $action): void
    {
        $kind = ! empty($action['list']) ? 'tasks' : 'events';
        $name = $this->text($action['title'] ?? '');
        $said = News::fold($this->request);
        if ($name !== '' && (preg_match(self::CALENDAR_WORD, News::fold($name)) || ! str_contains($said, News::fold($name)))) {
            // "calendar" is not a name, and neither is anything the request does not say.
            $name = '';
        }
        if ($name === '') {
            if ($this->out['question'] === null) {
                $this->out['question'] = ['text' => $kind === 'tasks' ? __('What should the new list be called?') : __('What should the new calendar be called?'), 'choices' => []];
                $this->memory['pending'] = ['need' => 'name', 'kind' => $kind];
            }

            return;
        }
        $this->makeCalendar($name, $kind);
    }

    private function makeCalendar(string $name, string $kind): void
    {
        $calendar = ServiceCall::as($this->user, 'cloud', 'POST', '/calendars', ['name' => $name, 'kind' => $kind])['calendar'];
        // The next action may put something in it.
        $this->calendarsCache = null;
        $this->out['cards'][] = ['type' => 'calendar', 'calendar' => $calendar, 'state' => $calendar['already'] ? 'exists' : 'added'];
    }

    private function addEvent(array $action, ?int $calendarId = null): void
    {
        $title = $this->text($action['title'] ?? '') ?: __('Event');
        $day = $action['date'] ?? $this->day($action) ?? $this->when->today();
        $place = $this->text($action['place'] ?? '');
        $start = $action['startTime'] ?? $this->when->time($action['start'] ?? null) ?? $this->saidTime($place);
        $end = $action['endTime'] ?? $this->when->time($action['end'] ?? null);
        $resolved = ['do' => 'calendar.add', 'title' => $title, 'date' => $day, 'startTime' => $start, 'endTime' => $end, 'place' => $place];
        // Neither a day nor a time: ask, and read the answer without the model.
        if (! isset($action['date']) && $this->day($action) === null && $start === null) {
            if ($this->out['question'] === null) {
                $this->out['question'] = ['text' => __('When is “:title”?', ['title' => $title]), 'choices' => []];
                $this->memory['pending'] = ['action' => ['do' => 'calendar.add', 'title' => $title, 'calendar' => $action['calendar'] ?? '', 'place' => $place], 'need' => 'when'];
            }

            return;
        }
        $calendarId ??= $this->chooseCalendar('events', (string) ($action['calendar'] ?? ''), $resolved, __('Which calendar should “:title” go in?', ['title' => $title]));
        if ($calendarId === null) {
            return;
        }
        $body = ['calendar' => $calendarId, 'title' => $title, 'allDay' => $start === null, 'place' => $place];
        if ($start === null) {
            $body += ['start' => $day, 'end' => $day];
        } else {
            $endAt = $end !== null && $end > $start ? $end : (new DateTimeImmutable("$day $start"))->modify('+1 hour')->format('H:i');
            $body += ['start' => "{$day}T$start:00", 'end' => "{$day}T$endAt:00"];
        }
        $event = ServiceCall::as($this->user, 'cloud', 'POST', '/events', $body)['event'];
        $this->memory['event'] = $event;
        $this->madeEvent = true;
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
        if ($this->text($action['place'] ?? '') !== '') {
            $changes['place'] = $this->text($action['place']);
        }
        $day = $this->day($action) ?? substr($event['start'], 0, 10);
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
        $this->madeEvent = true;
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
        $day = $action['date'] ?? $this->day($action);
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
        $this->memory['last'] = ['do' => 'weather', 'place' => $place['name']];
        // The numbers behind the card, so the reply can sum them up.
        $forecast = Weather::forecast((float) $place['lat'], (float) $place['lon']);
        if ($forecast) {
            $now = $forecast['current'];
            $days = array_map(fn ($day) => sprintf('%s %s° to %s°, %s, %s mm', (new DateTimeImmutable($day['date']))->format('l'), $day['min'], $day['max'], $day['condition'], $day['precip']), array_slice($forecast['days'], 0, 2));
            $this->done[] = sprintf('Weather shown for %s: now %s° (feels %s°), %s, wind %s m/s. %s.', $place['name'], $now['temp'], $now['feels'], $now['condition'], $now['wind'], implode('; ', $days));
        }
    }

    private function news(array $action): void
    {
        $topic = in_array($action['topic'] ?? '', Model::TOPICS, true) ? (string) ($action['topic'] ?? '') : '';
        $query = $this->text($action['query'] ?? '');
        $params = array_filter(['tab' => $topic === 'local' ? 'local' : null, 'topic' => $topic !== '' && $topic !== 'local' ? $topic : null, 'q' => $query ?: null]);
        $url = '/news'.($params ? '?'.http_build_query($params) : '');
        $this->memory['last'] = ['do' => 'news', 'topic' => $topic, 'query' => $query];
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
        // Headlines only: every word here is read by the model before it answers.
        $this->done[] = 'News shown ('.($topic ?: ($query ?: 'top')).'): '.implode(' | ', array_map(fn ($story) => mb_substr((string) $story['title'], 0, 110), array_slice($stories, 0, 4))).'.';
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
            $topic = $this->section($app);
            if ($topic !== null) {
                $this->news(['topic' => $topic, 'go' => true]);

                return;
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
        // Numbers that belong to the place ("Bergsbrunnagatan 15") are not times.
        $said = $this->request;
        $place = $this->text($action['place'] ?? '');
        if ($place !== '') {
            $said = str_ireplace($place, ' ', $said);
        }
        preg_match_all('/\d{1,2}/', $said, $found);
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
        $said = News::fold($this->request);
        $previous = $this->previous['do'] ?? null;
        // The news page opens only when asked to ("öppna", "open", "gå till"); otherwise the stories come here.
        if ($action['do'] === 'news' && ! empty($action['go']) && ! preg_match('/\b(open|oppna|go to|ga till|ga naar|openen|take me|ta mig)\b/', $said)) {
            unset($action['go']);
        }
        // Weather only when the words are about weather, or follow on from it: after the news, "i Sverige då?" is more news.
        if ($action['do'] === 'weather' && $previous === 'news' && empty($action['summary']) && ! preg_match(self::WEATHER_WORD, $said)) {
            return ['do' => 'news', 'topic' => $this->section($said) ?? ($this->previous['topic'] ?? ''), 'query' => ''];
        }
        // A reply that only says the request back did not understand it: news words get the news.
        if (in_array($action['do'], ['say', 'ask'], true) && str_word_count($said) >= 3 && similar_text(News::fold($this->text($action['text'] ?? '')), $said, $percent) && $percent > 80) {
            if (preg_match('/nyhet|hant|hander|news|happen|nieuws|gebeurd/', $said)) {
                return ['do' => 'news', 'topic' => $this->section($said) ?? '', 'query' => ''];
            }
            $action = ['do' => 'say', 'text' => ''];
        }
        // "Make a new calendar" is never an event, whatever the model made of it.
        if (in_array($action['do'], ['calendar.add', 'task.add'], true) && preg_match(self::NEW_CALENDAR, News::fold($this->request))
            && $this->when->day($this->request) === null && $this->when->time($action['start'] ?? null) === null) {
            return ['do' => 'calendar.create', 'title' => $action['title'] ?? '', 'list' => (bool) preg_match('/list|lijst/', News::fold($this->request))];
        }
        if ($action['do'] === 'calendar.create' && ! preg_match('/calendar|calender|kalender|agenda|list|lijst/', News::fold($this->request))) {
            return ['do' => 'say', 'text' => __('I could not do that. Try saying it another way.')];
        }
        if (in_array($action['do'], ['calendar.add', 'task.add'], true) && preg_match('/^\s*(open|öppna|oppna|openen|open de|visa|show|go to|gå till)\b/iu', $this->request, $verb)) {
            return ['do' => 'open', 'app' => trim(mb_substr($this->request, mb_strlen($verb[0])))];
        }

        return $action;
    }

    /** The news section some words point at ("sverige", "wereld", "sporten"), or null. */
    private function section(string $words): ?string
    {
        $sections = ['sverige' => 'sweden', 'sweden' => 'sweden', 'zweden' => 'sweden', 'inrikes' => 'sweden', 'varld' => 'world', 'world' => 'world', 'wereld' => 'world', 'utrikes' => 'world',
            'sport' => 'sport', 'ekonomi' => 'business', 'business' => 'business', 'economie' => 'business', 'kultur' => 'culture', 'culture' => 'culture', 'cultuur' => 'culture',
            'vetenskap' => 'science', 'science' => 'science', 'wetenschap' => 'science', 'tech' => 'tech', 'lokal' => 'local', 'local' => 'local', 'lokaal' => 'local'];
        foreach ($sections as $word => $topic) {
            if (str_contains(News::fold($words), $word)) {
                return $topic;
            }
        }

        return null;
    }

    private function findFiles(array $action, int $limit): array
    {
        $kind = in_array($action['kind'] ?? 'any', Model::KINDS, true) ? $action['kind'] ?? 'any' : 'any';
        // "latest", "senaste" and the like are not part of a file name.
        $words = preg_replace('/\b(my|the|a|latest|last|newest|recent|uploaded|min|mitt|mina|senaste|sista|nyaste|uppladdade|mijn|laatste|nieuwste|song|songs|music|track|file|files|photo|photos|picture|pictures|image|video|document|låt|låten|låtar|musik|fil|filen|filer|bild|bilden|bilder|foto|fotot|dokument|liedje|nummer|muziek|bestand|afbeelding)\b/iu', '', $this->text($action['query'] ?? '')) ?? '';

        return ServiceCall::as($this->user, 'cloud', 'GET', '/files/find?'.http_build_query(['kind' => $kind, 'q' => trim($words), 'limit' => $limit]))['files'] ?? [];
    }

    /**
     * With one dated thing in the request, the time its own words give ("kl 14",
     * "at 9:30", "10 uur", "14.00") when the model left it out; numbers in
     * the place are not times.
     */
    private function saidTime(string $place): ?string
    {
        if (! $this->single) {
            return null;
        }
        $said = $place !== '' ? str_ireplace($place, ' ', $this->request) : $this->request;
        if (preg_match('/\b(?:kl\.?|klockan|at|vid|from|från)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)(?!\d)/iu', $said, $found)
            || preg_match('/\b(\d{1,2})\s*uur\b/iu', $said, $found) || preg_match('/\b(\d{1,2}[:.]\d{2})\b/u', $said, $found)) {
            return $this->when->time(str_replace('.', ':', $found[1]));
        }

        return null;
    }

    /** The day of an action: the model's words, or with one dated thing in the request, the request's own. */
    private function day(array $action): ?string
    {
        return $this->when->day($action['day'] ?? null) ?? ($this->single ? $this->when->day($this->request) : null);
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
        if (($pending['need'] ?? null) === 'name') {
            // "Gym", "Call it Gym", "Den ska heta Gym": a short answer is the name; anything longer is a new request.
            $name = trim((string) preg_replace('/^(call it|name it|it is called|kalla den|den ska heta|döp den till|noem hem|noem het|het heet)\s+/iu', '', $this->text($request)), " \t\"'“”.!");
            // "Tack!" or "hej" is not a name; it is something new to answer.
            if ($name === '' || count(preg_split('/\s+/', $name)) > 4 || preg_match(self::SMALL_TALK, News::fold($request))) {
                return false;
            }
            $this->makeCalendar(mb_substr($name, 0, 100), ($pending['kind'] ?? 'events') === 'tasks' ? 'tasks' : 'events');

            return true;
        }
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
