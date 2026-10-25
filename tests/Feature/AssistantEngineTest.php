<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Assistant\Engine;
use App\Support\Assistant\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AssistantEngineTest extends TestCase
{
    private User $user;

    /** A model that answers with what the test gives it, and counts how often it was asked. */
    private function model(array $actions, ?array $check = null): Model
    {
        return new class($actions, $check) extends Model
        {
            public int $asked = 0;

            public array $done = [];

            public function __construct(private array $answer, private ?array $check) {}

            public function actions(string $context, string $request): array
            {
                $this->asked++;

                return $this->answer;
            }

            /** No check: the engine's own texts stay, as when the model is away. */
            public function review(string $earlier, string $request, array $done, string $language = 'English'): array
            {
                $this->done = $done;

                return $this->check ?? ['ok' => true, 'fix' => [], 'reply' => ''];
            }
        };
    }

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username');
            $table->string('role')->default('user');
            $table->timestamps();
        });
        Schema::create('core_assistant_turns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id');
            $table->string('conversation', 40)->nullable();
            $table->text('request');
            $table->longText('result');
            $table->text('memory')->nullable();
            $table->timestamp('created_at');
        });
        $this->user = new User;
        $this->user->forceFill(['username' => 'hugo'])->save();
    }

    public function test_a_new_calendar_is_never_an_event_and_its_name_must_be_said(): void
    {
        // The model reached for the last thing done; the request names no calendar.
        $answer = (new Engine($this->user, $this->model([['do' => 'calendar.add', 'title' => 'Tenta']])))->handle('Make a new calender', 'page-one-aaaa');
        $this->assertSame('What should the new calendar be called?', $answer['question']['text']);
        $this->assertSame([], $answer['cards']);
    }

    public function test_the_answer_to_a_question_counts_only_on_the_same_page(): void
    {
        (new Engine($this->user, $this->model([['do' => 'calendar.create', 'title' => '']])))->handle('Skapa en ny kalender', 'page-one-aaaa');

        // Opened anew: "Gym" is a new request for the model, not the name.
        $fresh = $this->model([['do' => 'say', 'text' => 'Hej!']]);
        $answer = (new Engine($this->user, $fresh))->handle('Gym', 'page-two-bbbb');
        $this->assertSame(1, $fresh->asked);
        $this->assertSame('Hej!', $answer['message']);

        // Without a page there is no memory at all.
        (new Engine($this->user, $this->model([['do' => 'calendar.create', 'title' => '']])))->handle('Skapa en ny kalender', null);
        $none = $this->model([['do' => 'say', 'text' => 'Hej!']]);
        (new Engine($this->user, $none))->handle('Gym', null);
        $this->assertSame(1, $none->asked);
    }

    public function test_the_same_page_takes_a_short_answer_as_the_name(): void
    {
        (new Engine($this->user, $this->model([['do' => 'calendar.create', 'title' => '']])))->handle('Skapa en ny kalender', 'page-one-aaaa');
        $same = $this->model([['do' => 'say', 'text' => 'Hej!']]);
        // The name goes to Cloud without the model (which this test has no access to).
        (new Engine($this->user, $same))->handle('Den ska heta Gym', 'page-one-aaaa');
        $this->assertSame(0, $same->asked);

        // A longer reply is a new request.
        (new Engine($this->user, $this->model([['do' => 'calendar.create', 'title' => '']])))->handle('Skapa en ny kalender', 'page-one-aaaa');
        $longer = $this->model([['do' => 'weather', 'place' => '']]);
        (new Engine($this->user, $longer))->handle('Hur blir vädret i morgon eftermiddag i Lund?', 'page-one-aaaa');
        $this->assertSame(1, $longer->asked);
    }

    public function test_a_calendar_needs_the_word_calendar(): void
    {
        $answer = (new Engine($this->user, $this->model([['do' => 'calendar.create', 'title' => 'Tjenare']])))->handle('Tjenare', 'page-one-aaaa');
        $this->assertSame([], $answer['cards']);
        $this->assertNull($answer['question']);
        $this->assertSame('I could not do that. Try saying it another way.', $answer['message']);
    }

    public function test_the_model_words_the_answer_after_seeing_what_was_done(): void
    {
        $model = $this->model([['do' => 'say', 'text' => '']], ['ok' => true, 'fix' => [], 'reply' => 'Tjena! Vad kan jag hjälpa dig med?']);
        $answer = (new Engine($this->user, $model))->handle('Tjenare', 'page-one-aaaa');
        $this->assertSame('Tjena! Vad kan jag hjälpa dig med?', $answer['message']);
        $this->assertSame([], $model->done, 'small talk: nothing done, so the model only answers');

        // A question keeps its choices; the model words it.
        $asking = $this->model([['do' => 'calendar.create', 'title' => '']], ['ok' => true, 'fix' => [], 'reply' => 'Visst! Vad ska den heta?']);
        $answer = (new Engine($this->user, $asking))->handle('Skapa en ny kalender', 'page-one-aaaa');
        $this->assertSame('Visst! Vad ska den heta?', $answer['question']['text']);
        $this->assertNull($answer['message']);
        $this->assertStringContainsString('Question needed', implode("\n", $asking->done));
    }

    public function test_an_echo_is_never_the_answer(): void
    {
        $answer = (new Engine($this->user, $this->model([['do' => 'say', 'text' => 'Vad kan du göra för mig idag?']])))->handle('Vad kan du göra för mig idag?', 'page-one-aaaa');
        $this->assertNotSame('Vad kan du göra för mig idag?', $answer['message']);
    }
}
