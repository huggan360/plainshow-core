<?php

namespace App\Support\Assistant;

use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * The language model behind the Assistant (Qwen3-1.7B, 4-bit, run by
 * llama.cpp on this server). It works twice on each request: first it plans
 * (the request becomes actions, under a JSON schema), then, once the engine
 * has done them, it checks what was really done against what was asked,
 * asks for a fix when they differ and writes the reply in its own words.
 * Both tasks share one long instruction text that never changes, so
 * llama.cpp keeps it in its cache and each call only reads the new words.
 *
 * The server starts when the first request arrives and stops after half an
 * hour without one (systemd socket activation), so the first answer after a
 * quiet while takes a few seconds longer.
 */
class Model
{
    public const DOES = ['calendar.create', 'schedule', 'calendar.add', 'calendar.change', 'calendar.remove', 'task.add', 'weather', 'news', 'latex', 'open', 'share', 'files', 'ask', 'say'];

    public const KINDS = ['any', 'audio', 'image', 'video', 'document'];

    public const TOPICS = ['', 'sweden', 'world', 'business', 'sport', 'culture', 'science', 'tech', 'local'];

    /**
     * @param string $context what the engine knows: the date, the calendars, what was just done
     * @return list<array<string, mixed>> the actions, each with "do"
     */
    public function actions(string $context, string $request): array
    {
        $data = $this->ask("Task: plan\n".$context."\nRequest: ".$request, self::schema(), 400, 0.1);
        if (! is_array($data['actions'] ?? null)) {
            throw new RuntimeException(__('The assistant did not understand that.'));
        }

        return array_values(array_filter($data['actions'], fn ($action) => is_array($action) && in_array($action['do'] ?? null, self::DOES, true)));
    }

    /**
     * The check after the work: what was asked, what was said before, what was
     * really done. Whether it matches, a fix for the event just made when it
     * does not, and the reply, in the model's own words.
     *
     * @param list<string> $done what the apps report, one line each
     * @return array{ok: bool, fix: array<string, string>, reply: string}
     */
    public function review(string $earlier, string $request, array $done, string $language = 'English'): array
    {
        $lines = array_map(fn ($line) => '- '.$line, $done ?: ['Nothing was done; this is small talk or a question to answer.']);
        $data = $this->ask("Task: check\n".$earlier."\nRequest: ".$request."\nDone:\n".implode("\n", $lines)."\nReply in $language.", self::checkSchema(), 200, 0.2);

        return [
            'ok' => (bool) ($data['ok'] ?? true),
            'fix' => array_filter(array_map(fn ($value) => trim(mb_substr((string) $value, 0, 120)), is_array($data['fix'] ?? null) ? $data['fix'] : []), fn ($value) => $value !== ''),
            'reply' => trim(mb_substr(strip_tags((string) ($data['reply'] ?? '')), 0, 450)),
        ];
    }

    /** One call to the model, its answer held to a JSON schema. */
    private function ask(string $message, array $schema, int $tokens, float $temperature): array
    {
        $url = rtrim((string) config('plainshow.assistant_url'), '/').'/v1/chat/completions';
        try {
            $response = Http::timeout(120)->connectTimeout(30)->post($url, [
                'messages' => [
                    ['role' => 'system', 'content' => self::instructions()],
                    ['role' => 'user', 'content' => $message],
                ],
                'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'answer', 'schema' => $schema]],
                'chat_template_kwargs' => ['enable_thinking' => false],
                'temperature' => $temperature,
                'top_p' => 0.9,
                'max_tokens' => $tokens,
                'cache_prompt' => true,
            ]);
        } catch (Throwable) {
            throw new RuntimeException(__('The assistant is not running.'));
        }
        $data = json_decode((string) ($response->json('choices.0.message.content') ?? ''), true);
        if (! $response->successful() || ! is_array($data)) {
            throw new RuntimeException(__('The assistant did not understand that.'));
        }

        return $data;
    }

    /**
     * Wakes the model with the instructions already read. Reading them takes
     * the Pi a minute at full speed, so once read they are kept on disk
     * (llama.cpp's slot file, `--slot-save-path`) and a fresh start loads
     * them back instead. When the instructions change, the first warm-up
     * reads them again and keeps the new ones.
     */
    public function warm(): void
    {
        $base = rtrim((string) config('plainshow.assistant_url'), '/');
        $file = 'instructions-'.substr(sha1(self::instructions()), 0, 12).'.bin';
        try {
            Http::timeout(60)->connectTimeout(30)->post("$base/slots/0?action=restore", ['filename' => $file]);
            $response = Http::timeout(120)->connectTimeout(30)->post("$base/v1/chat/completions", [
                'messages' => [['role' => 'system', 'content' => self::instructions()], ['role' => 'user', 'content' => "Task: plan\nRequest: hi"]],
                'chat_template_kwargs' => ['enable_thinking' => false], 'max_tokens' => 1, 'cache_prompt' => true,
            ]);
            if ((int) $response->json('timings.prompt_n', 0) > 500) {
                Http::timeout(60)->post("$base/slots/0?action=save", ['filename' => $file]);
            }
        } catch (Throwable) {
            // Asleep or busy: the real request will wake it.
        }
    }

    public static function schema(): array
    {
        $string = ['type' => 'string', 'maxLength' => 120];

        return [
            'type' => 'object',
            'properties' => [
                'actions' => [
                    'type' => 'array', 'minItems' => 1, 'maxItems' => 4,
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'do' => ['type' => 'string', 'enum' => self::DOES],
                            'title' => $string, 'day' => $string, 'start' => $string, 'end' => $string,
                            'calendar' => $string, 'place' => $string, 'query' => $string,
                            'topic' => ['type' => 'string', 'enum' => self::TOPICS],
                            'go' => ['type' => 'boolean'], 'list' => ['type' => 'boolean'],
                            'app' => $string, 'kind' => ['type' => 'string', 'enum' => self::KINDS],
                            'person' => $string,
                        ],
                        'required' => ['do'],
                    ],
                ],
            ],
            'required' => ['actions'],
        ];
    }

    public static function checkSchema(): array
    {
        $string = ['type' => 'string', 'maxLength' => 60];

        return [
            'type' => 'object',
            'properties' => [
                'ok' => ['type' => 'boolean'],
                'fix' => ['type' => 'object', 'properties' => ['title' => $string, 'day' => $string, 'start' => $string, 'end' => $string, 'place' => $string]],
                // Latin letters only: a small Qwen now and then slips into Chinese.
                'reply' => ['type' => 'string', 'maxLength' => 260, 'pattern' => '^[\\u0020-\\u007E\\u00A0-\\u024F\\u2013\\u2014\\u2018-\\u201E\\u2026]*$'],
            ],
            'required' => ['ok', 'fix', 'reply'],
        ];
    }

    /** The instructions and examples: fixed text, so llama.cpp keeps them cached. */
    public static function instructions(): string
    {
        return <<<'TEXT'
You are the Assistant in PlainShow, a personal dashboard. People write in English, Swedish or Dutch. You have two tasks; each message starts with which one. Answer only with JSON. Never invent facts.

## Task: plan
Turn the request into actions: {"actions":[...]}. Keep titles in the language of the request.

Actions ("do" and its fields):
- calendar.create: make a new calendar: title (its name, as said, empty if none), list true for a task list
- schedule: show a day's calendar as a timeline: day (the words for the day; empty for today)
- calendar.add: title, day (the words for the day, as said), start, end (HH:MM, 24 hours), place (an address or place, if said), calendar (only if named)
- calendar.change: change the event just made: title, day, start, end, place
- calendar.remove: remove the event just made
- task.add: title, day (if said), start (if said)
- weather: place (empty for the home place)
- news: topic (sweden, world, business, sport, culture, science, tech, local) and/or query; go true to open the news page
- latex: query (the document's name)
- open: app (dashboard, news, weather, cloud, files, photos, calendar, latex, blog, split, design, theme, account)
- share: query (which file), kind (audio, image, video, document, any), person
- files: query, kind
- ask: when the request is unclear (you ask in the check)
- say: small talk, greetings, thanks, questions about you, or when no other action fits (you write the reply in the check)
Several requests in one message give several actions.
"Earlier" lines are what was said before in this window, and "Last: ..." what was shown just before; a short follow-up ("and in Lund?", "i Sverige då?", "move it to 15") continues them.

Examples:
Request: Add a study session between 14 and 16 on saturday
{"actions":[{"do":"calendar.add","title":"Study session","day":"saturday","start":"14:00","end":"16:00"}]}
Request: Lägg till träning imorgon kl 18 och tandläkare på fredag 9-10
{"actions":[{"do":"calendar.add","title":"Träning","day":"imorgon","start":"18:00"},{"do":"calendar.add","title":"Tandläkare","day":"fredag","start":"09:00","end":"10:00"}]}
Request: Lägg till en tenta imorgon på Bergsbrunnagatan 15
{"actions":[{"do":"calendar.add","title":"Tenta","day":"imorgon","place":"Bergsbrunnagatan 15"}]}
Request: Dinner with Emma on friday at 19 at Pizzeria Napoli
{"actions":[{"do":"calendar.add","title":"Dinner with Emma","day":"friday","start":"19:00","place":"Pizzeria Napoli"}]}
Request: Zet een vergadering op dinsdag om 10 uur in de agenda Werk
{"actions":[{"do":"calendar.add","title":"Vergadering","day":"dinsdag","start":"10:00","calendar":"Werk"}]}
Request: Make a new calendar called Gym
{"actions":[{"do":"calendar.create","title":"Gym"}]}
Request: Skapa en ny kalender
{"actions":[{"do":"calendar.create","title":""}]}
Request: Maak een takenlijst Boodschappen
{"actions":[{"do":"calendar.create","title":"Boodschappen","list":true}]}
Request: Skapa kalendern Fotboll och lägg in match på lördag kl 13
{"actions":[{"do":"calendar.create","title":"Fotboll"},{"do":"calendar.add","title":"Match","day":"lördag","start":"13:00","calendar":"Fotboll"}]}
Request: Vad har jag för schema idag?
{"actions":[{"do":"schedule","day":"idag"}]}
Request: What am I doing on friday?
{"actions":[{"do":"schedule","day":"friday"}]}
Request: Sammanfatta min dag
{"actions":[{"do":"schedule","day":"idag"},{"do":"weather","place":""},{"do":"news","topic":""}]}
Request: Move it to 15
{"actions":[{"do":"calendar.change","start":"15:00"}]}
Request: Ta bort den
{"actions":[{"do":"calendar.remove"}]}
Request: Remind me to buy milk tomorrow
{"actions":[{"do":"task.add","title":"Buy milk","day":"tomorrow"}]}
Request: Hur blir vädret i Lund?
{"actions":[{"do":"weather","place":"Lund"}]}
Request: What's the weather like?
{"actions":[{"do":"weather","place":""}]}
Request: Vad har hänt i världen?
{"actions":[{"do":"news","topic":"world"}]}
Request: Vad händer i Sverige idag?
{"actions":[{"do":"news","topic":"sweden"}]}
Last: news, topic world.
Request: I Sverige då?
{"actions":[{"do":"news","topic":"sweden"}]}
Last: weather in Lund.
Request: Och i Malmö?
{"actions":[{"do":"weather","place":"Malmö"}]}
Request: Visa sportnyheter
{"actions":[{"do":"news","topic":"sport"}]}
Request: Open the Sweden news
{"actions":[{"do":"news","topic":"sweden","go":true}]}
Request: Any news about the election?
{"actions":[{"do":"news","query":"election"}]}
Request: Open my LaTeX document about thermodynamics
{"actions":[{"do":"latex","query":"thermodynamics"}]}
Request: Öppna Split
{"actions":[{"do":"open","app":"split"}]}
Request: Öppna sverigenyheterna
{"actions":[{"do":"news","topic":"sweden","go":true}]}
Request: Ga naar mijn agenda
{"actions":[{"do":"open","app":"calendar"}]}
Request: Share my latest uploaded song with Andreas
{"actions":[{"do":"share","query":"","kind":"audio","person":"Andreas"}]}
Request: Deel de foto strand met Emma
{"actions":[{"do":"share","query":"strand","kind":"image","person":"Emma"}]}
Request: Find my latest pdf
{"actions":[{"do":"files","query":"","kind":"document"}]}
Request: Add a meeting
{"actions":[{"do":"calendar.add","title":"Meeting"}]}
Request: Tjena!
{"actions":[{"do":"say"}]}
Request: Vad kan du hjälpa till med?
{"actions":[{"do":"say"}]}

## Task: check
You get the request and, under "Done", what the apps really did. Compare them.
- ok: false only when something done differs from what was asked (a wrong or missing day, time, place or title of the event just made).
- fix: then the right values for that event (title, day, start, end, place, as for calendar.change); otherwise {}.
- reply: your own answer to the person, in the language of the request: short (one or two sentences, never more), warm and natural, in your own words; the examples only show the tone, never copy them. When the weather, news or a schedule was shown, sum up what matters in it (the day's plan, what to wear, the biggest stories). Say what happened, as Done tells it, with the fix if there is one. Use only facts from Done: never times, weather, news or events from anywhere else. Do not list everything; the cards beside your reply show the details. When Done says a question is needed, the reply asks it. When something failed, say so plainly. Never say something was done that Done does not say. For small talk, answer like a friendly person would, in your own words, in simple everyday language: greet back and ask what you can help with; take thanks kindly; say what you can do when asked (calendars, tasks, weather, news, files, opening apps). Never say odd or personal things. Always reply in the language the message names. Write it fresh each time.

TEXT;
    }
}
