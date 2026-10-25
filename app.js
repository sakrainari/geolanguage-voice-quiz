import { QUESTIONS } from './data.js';
import { judge, makeDeck, loadReview, saveReview } from './core.js';
import { VoiceInput } from './speech.js';
import { LANGS, SCRIPTS } from './catalog.js';

const $ = id => document.getElementById(id);
const MODE_NAMES = { regions: '県・行政地域', cities: '代表的な都市', mixed: '地域優先ミックス' };
const STATUS = { correct: '一発正解', retry: '再挑戦で正解', self: '自己申告', revealed: '答えを確認', skipped: 'スキップ' };
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let review = loadReview(storage, QUESTIONS);
let lang = 'thai', deck = [], index = 0, phase = 'setup', attempts = 0, records = [], currentRecord = null;
let reviewSession = false;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!Recognition && window.isSecureContext;
const voice = new VoiceInput({ Recognition,
  onStatus: (message, active) => {
    if (phase !== 'question' && phase !== 'listening') return;
    phase = active ? 'listening' : 'question';
    $('voice-status').textContent = message;
    $('voice-dot').classList.toggle('active', active);
    $('mic-label').textContent = active ? '録音をやめる' : 'マイクで答える';
  },
  onInterim: text => { $('interim').textContent = text ? `認識中：${text}` : ''; },
  onFinal: transcript => {
    if (phase !== 'listening') return;
    phase = 'question';
    $('voice-dot').classList.remove('active');
    $('mic-label').textContent = 'もう一度、声で答える';
    $('interim').textContent = '';
    const result = judge(deck[index], transcript);
    $('recognition').hidden = false;
    $('transcript').textContent = result.transcript;
    $('extracted').textContent = result.extracted;
    $('reason').textContent = result.reason;
    if (result.ok) complete(attempts ? 'retry' : 'correct');
    else {
      attempts++;
      review.add(deck[index].id);
      persist();
      $('voice-status').textContent = 'まだ一致していません。もう一度答えられます。';
    }
  }
});

function persist() {
  if (!saveReview(storage, review)) $('storage-warning').hidden = false;
}
function saveSettings() {
  try { storage?.setItem('glvq-settings-v1', JSON.stringify({ lang, mode: $('mode').value, count: $('count').value })); } catch {}
}
try {
  const saved = JSON.parse(storage?.getItem('glvq-settings-v1') || 'null');
  if (saved && LANGS[saved.lang]) lang = saved.lang;
  if (saved && MODE_NAMES[saved.mode]) $('mode').value = saved.mode;
  if (saved && ['5','10','20','all'].includes(saved.count)) $('count').value = saved.count;
} catch {}

const lastCountry = { cyrillic: LANGS[lang].script === 'cyrillic' ? lang : 'russian' };
function languageButton(id, info, key, choose) {
  const button = document.createElement('button');
  button.className = 'language';
  button.dataset[key] = id;
  const native = document.createElement('span'); native.className = 'native'; native.lang = info.code; native.textContent = info.native;
  const name = document.createElement('strong'); name.textContent = info.name;
  const en = document.createElement('small'); en.textContent = info.en;
  button.append(native, name, en);
  button.addEventListener('click', choose);
  return button;
}
for (const [id, info] of Object.entries(SCRIPTS)) {
  $('languages').append(languageButton(id, info, 'script', () => {
    lang = id === 'cyrillic' ? lastCountry.cyrillic : info.defaultLang;
    updateSetup(); saveSettings();
  }));
}
for (const [id, info] of Object.entries(LANGS).filter(([, value]) => value.script === 'cyrillic')) {
  $('countries').append(languageButton(id, info, 'lang', () => {
    lang = id; lastCountry.cyrillic = id; updateSetup(); saveSettings();
  }));
}
function updateSetup() {
  const script = LANGS[lang].script;
  for (const button of $('languages').children) button.setAttribute('aria-pressed', String(button.dataset.script === script));
  for (const button of $('countries').children) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  $('country-picker').hidden = script !== 'cyrillic';
  const regional = QUESTIONS.filter(q => q.lang === lang && q.kind === 'regions').length;
  const cities = QUESTIONS.filter(q => q.lang === lang && q.kind === 'cities').length;
  const eligible = QUESTIONS.filter(q => q.lang === lang && ($('mode').value === 'mixed' || q.kind === $('mode').value));
  const stock = eligible.filter(q => review.has(q.id)).length;
  $('coverage').textContent = `収録：県・行政地域 ${regional}問 ／ 代表地名 ${cities}問。` + ($('mode').value === 'mixed' ? ' 地域4問に都市1問を目安に出題します。' : '') + (lang === 'korean' ? ' 旧称の読み取り問題を含みます。' : '');
  $('review-stock').textContent = `選択中の教材の復習ストック：${stock}問`;
  $('review-start').disabled = !stock;
}
function showScreen(id) {
  voice.stop();
  for (const screen of ['setup','game','results']) $(screen).hidden = screen !== id;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function start(isReview = false) {
  voice.stop();
  const options = { lang, mode: $('mode').value, count: $('count').value, reviewIds: isReview ? review : null };
  deck = makeDeck(QUESTIONS, options);
  if (!deck.length) { updateSetup(); return; }
  reviewSession = isReview; index = 0; records = []; currentRecord = null;
  saveSettings(); showScreen('game'); nextQuestion();
}
function nextQuestion() {
  voice.stop();
  phase = 'question'; attempts = 0; currentRecord = null;
  const q = deck[index];
  $('context').textContent = `${LANGS[lang].name} / ${MODE_NAMES[$('mode').value]}${reviewSession ? ' / 復習' : ''}`;
  $('progress-label').textContent = `${index + 1} / ${deck.length}`;
  $('progress').max = deck.length; $('progress').value = index;
  $('kind').textContent = q.kind === 'regions' ? 'REGION / 県・行政地域名' : 'CITY / 代表地名';
  $('prompt').textContent = q.prompt; $('prompt').lang = LANGS[lang].code;
  $('prompt-guide').textContent = q.instruction || 'この地名を、日本語で読んでください';
  $('recognition').hidden = true; $('feedback').hidden = true;
  $('transcript').textContent = ''; $('extracted').textContent = ''; $('reason').textContent = '';
  $('interim').textContent = ''; $('voice-dot').classList.remove('active');
  $('voice-status').textContent = supported ? '準備できたらマイクを押してください。' : '音声認識を利用できません。上の案内をご確認ください。';
  $('mic-label').textContent = 'マイクで答える'; $('mic').disabled = !supported;
  $('reveal').disabled = false; $('skip').disabled = false;
  $('prompt').scrollIntoView({ block: 'nearest' });
}
function complete(outcome) {
  if (!['question','listening'].includes(phase)) return;
  voice.stop(); phase = 'feedback';
  const q = deck[index];
  currentRecord = { question: q, outcome };
  records.push(currentRecord);
  if (outcome === 'correct') review.delete(q.id); else review.add(q.id);
  persist();
  $('mic').disabled = true; $('reveal').disabled = true; $('skip').disabled = true;
  $('voice-dot').classList.remove('active'); $('interim').textContent = '';
  $('voice-status').textContent = STATUS[outcome];
  $('verdict').textContent = outcome === 'correct' ? 'CORRECT / 正解' : STATUS[outcome];
  $('answer').textContent = q.answer;
  $('note').textContent = q.note;
  $('aliases').textContent = `登録されている読み：${q.aliases.join(' ／ ')}`;
  $('rescue').hidden = !['revealed','skipped'].includes(outcome);
  $('rescue-note').hidden = true;
  $('next').textContent = index + 1 === deck.length ? '結果を見る →' : '次の問題へ →';
  $('map').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.map + ', ' + LANGS[lang].mapCountry)}`;
  $('feedback').classList.toggle('wrong', outcome !== 'correct');
  $('feedback').hidden = false;
  $('feedback').focus({ preventScroll: true });
  $('feedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function finish() {
  phase = 'results'; showScreen('results');
  $('result-context').textContent = `${LANGS[lang].name} / ${MODE_NAMES[$('mode').value]} / ${deck.length}問${reviewSession ? ' / 復習' : ''}`;
  $('stats').replaceChildren();
  const correct = records.filter(r => r.outcome === 'correct').length;
  const retry = records.filter(r => r.outcome === 'retry').length;
  const self = records.filter(r => r.outcome === 'self').length;
  for (const [label, value] of [['一発正解',`${correct} / ${deck.length}`],['一発正解率',`${Math.round(correct/deck.length*100)}%`],['再挑戦で正解',retry],['自己申告',self]]) {
    const div = document.createElement('div'); div.className = 'stat';
    const strong = document.createElement('strong'); strong.textContent = String(value);
    const span = document.createElement('span'); span.textContent = label;
    div.append(strong,span); $('stats').append(div);
  }
  $('result-list').replaceChildren();
  for (const { question: q, outcome } of records) {
    const row = document.createElement('div'); row.className = 'result-item';
    const prompt = document.createElement('strong'); prompt.textContent = q.prompt; prompt.lang = LANGS[q.lang].code;
    const answer = document.createElement('span'); answer.textContent = q.answer;
    const status = document.createElement('small'); status.textContent = STATUS[outcome];
    row.append(prompt,answer,status); $('result-list').append(row);
  }
  updateSetup();
  $('result-review').disabled = $('review-start').disabled;
  $('results').focus({ preventScroll: true });
}
function home() { phase = 'setup'; showScreen('setup'); updateSetup(); $('start').focus({ preventScroll: true }); }
$('start').addEventListener('click', () => start());
$('review-start').addEventListener('click', () => start(true));
$('result-review').addEventListener('click', () => start(true));
$('again').addEventListener('click', () => start());
$('home').addEventListener('click', home); $('result-home').addEventListener('click', home);
for (const id of ['mode','count']) $(id).addEventListener('change', () => { updateSetup(); saveSettings(); });
$('mic').addEventListener('click', () => {
  if (phase === 'listening') {
    voice.stop(); phase = 'question'; $('voice-status').textContent = '録音を止めました。もう一度マイクを押すと再開します。';
    $('voice-dot').classList.remove('active'); $('mic-label').textContent = 'マイクで答える'; $('interim').textContent = '';
  } else if (phase === 'question' && supported) voice.start();
});
$('reveal').addEventListener('click', () => complete('revealed'));
$('skip').addEventListener('click', () => complete('skipped'));
$('rescue').addEventListener('click', () => {
  if (phase !== 'feedback' || !currentRecord || !['revealed','skipped'].includes(currentRecord.outcome)) return;
  currentRecord.outcome = 'self'; $('rescue').hidden = true; $('rescue-note').hidden = false; $('verdict').textContent = '自己申告として記録';
});
$('next').addEventListener('click', () => {
  if (phase !== 'feedback') return;
  index++; if (index >= deck.length) finish(); else nextQuestion();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'listening') {
    voice.stop(); phase = 'question'; $('voice-status').textContent = '画面を離れたため録音を停止しました。マイクを押して再開してください。';
    $('voice-dot').classList.remove('active'); $('mic-label').textContent = 'マイクで答える'; $('interim').textContent = '';
  }
});
window.addEventListener('pagehide', () => voice.stop());
if (!supported) {
  $('support').hidden = false;
  $('support').textContent = !window.isSecureContext ? '音声認識にはHTTPSまたはlocalhostで開いてください。' : 'このブラウザーでは音声認識を利用できません。Chromeで開いてください。';
}
updateSetup();
