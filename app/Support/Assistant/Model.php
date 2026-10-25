<?php

namespace App\Support\Assistant;

use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * The small language model that reads a request (Qwen3-0.6B, 4-bit, run by
 * llama.cpp on this server). It never writes prose: a JSON schema holds its
 * answer to a list of actions, and the engine does the rest. The long
 * instructions come first and never change, so llama.cpp keeps them in its
 * cache and each request only reads the new words.
 *
 * The server starts when the first request arrives and stops after half an
 * hour without one (systemd socket activation), so the first answer after a
 * quiet while takes a few seconds longer.
 */
class Model
{
    public const DOES = ['calendar.add', 'calendar.change', 'calendar.remove', 'task.add', 'weather', 'news', 'latex', 'open', 'share', 'files', 'ask', 'say'];

    public const KINDS = ['any', 'audio', 'image', 'video', 'document'];

    public const TOPICS = ['', 'sweden', 'world', 'business', 'sport', 'culture', 'science', 'tech', 'local'];

    /**
     * @param string $context what the engine knows: the date, the calendars, what was just done
     * @return list<array<string, mixed>> the actions, each with "do"
     */
    public function actions(string $context, string $request): array
    {
        $url = rtrim((string) config('plainshow.assistant_url'), '/').'/v1/chat/completions';
        try {
            $response = Http::timeout(90)->connectTimeout(30)->post($url, [
                'messages' => [
                    ['role' => 'system', 'content' => self::instructions()],
                    ['role' => 'user', 'content' => $context."\nRequest: ".$request],
                ],
                'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'actions', 'schema' => self::schema()]],
                'chat_template_kwargs' => ['enable_thinking' => false],
                'temperature' => 0.1,
                'top_p' => 0.9,
                'max_tokens' => 400,
                'cache_prompt' => true,
            ]);
        } catch (Throwable) {
            throw new RuntimeException(__('The assistant is not running.'));
        }
        $content = (string) ($response->json('choices.0.message.content') ?? '');
        $data = json_decode($content, true);
        if (! $response->successful() || ! is_array($data) || ! is_array($data['actions'] ?? null)) {
            throw new RuntimeException(__('The assistant did not understand that.'));
        }

        return array_values(array_filter($data['actions'], fn ($action) => is_array($action) && in_array($action['do'] ?? null, self::DOES, true)));
    }

    /**
     * Wakes the model and has it read the instructions once, so they are in
     * its cache before the first real request (the Assistant page asks this
     * as it opens; typing takes longer than this does).
     */
    public function warm(): void
    {
        try {
            Http::timeout(60)->connectTimeout(30)->post(rtrim((string) config('plainshow.assistant_url'), '/').'/v1/chat/completions', [
                'messages' => [['role' => 'system', 'content' => self::instructions()], ['role' => 'user', 'content' => 'Request: hi']],
                'chat_template_kwargs' => ['enable_thinking' => false], 'max_tokens' => 1, 'cache_prompt' => true,
            ]);
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
                            'go' => ['type' => 'boolean'],
                            'app' => $string, 'kind' => ['type' => 'string', 'enum' => self::KINDS],
                            'person' => $string, 'text' => ['type' => 'string', 'maxLength' => 200],
                        ],
                        'required' => ['do'],
                    ],
                ],
            ],
            'required' => ['actions'],
        ];
    }

    /** The instructions and examples: fixed text, so llama.cpp keeps them cached. */
    public static function instructions(): string
    {
        return <<<'TEXT'
You turn a request into actions for PlainShow, a personal dashboard. Answer only with JSON: {"actions":[...]}. Requests are in English, Swedish or Dutch. Keep titles and texts in the language of the request. Never invent facts.

Actions ("do" and its fields):
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
- ask: text (one short question, only when something needed is missing)
- say: text (only when no other action fits)
Several requests in one message give several actions.

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
{"actions":[{"do":"ask","text":"When is the meeting?"}]}
Request: Hej!
{"actions":[{"do":"say","text":"Hej! Vad vill du göra?"}]}
TEXT;
    }
}
