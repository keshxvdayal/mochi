import assert from "node:assert/strict";
import { test } from "node:test";
import { stripStageDirections } from "@/lib/stage-directions";
import { speakable } from "@/lib/speech";
import { ttsInput, ttsPrompt } from "@/lib/tts";

test("stage directions are never read aloud", () => {
  assert.equal(speakable("*giggles* Okay that's adorable."), "Okay that's adorable.");
  assert.equal(speakable("Says cheerfully: Hi Asha, good morning!"), "Hi Asha, good morning!");
  assert.equal(speakable("Hey! (smiles warmly) You did it."), "Hey! You did it.");
  assert.equal(speakable("[cheerfully] Let's go!"), "Let's go!");
  assert.equal(speakable("I said no. *sigh* Fine, one more."), "I said no. Fine, one more.");
  assert.equal(speakable("*happily bounces* You did it!"), "You did it!");
  assert.equal(speakable("In a soft voice, I'm here for you."), "I'm here for you.");
});

test("emphasis and normal brackets are kept", () => {
  assert.equal(speakable("That is *really* important."), "That is really important.");
  assert.equal(speakable("I'm *so* proud of you!"), "I'm so proud of you!");
  assert.equal(speakable("I *think* that's smart."), "I think that's smart.");
  assert.equal(stripStageDirections("Call at (9 AM) tomorrow."), "Call at (9 AM) tomorrow.");
  assert.equal(stripStageDirections("We can meet (if you want) later."), "We can meet (if you want) later.");
  assert.equal(stripStageDirections("[mood:happy] Hi!"), "[mood:happy] Hi!", "mood tags are handled elsewhere");
});

test("the voice request keeps the tone apart from the words to speak", () => {
  const p = ttsPrompt("*giggles* Hi there!", "happy");
  const [notes, transcript] = p.split("### TRANSCRIPT");
  assert.equal(transcript.trim(), "Hi there!", "only the words, no actions");
  assert.match(notes, /Tone: cheerful/);
  assert.match(notes, /Never say the notes/);
  assert.ok(!/^Say \w+ly:/.test(p), "no bare 'Say cheerfully:' prefix");
});

test("models that read everything aloud get only the words", () => {
  assert.equal(ttsInput("gemini-3.8-flash-lite-tts", "*giggles* Hi there!", "happy"), "Hi there!");
  assert.match(ttsInput("gemini-3.8-flash-tts", "Hi there!", "happy"), /### TRANSCRIPT\nHi there!$/);
});
