const voicedKana = { 'ゔぁ': 'ば', 'ゔぃ': 'び', 'ゔ': 'ぶ', 'ゔぇ': 'べ', 'ゔぉ': 'ぼ' };
const smallKana = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お' };

export function normalize(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/ゔ[ぁぃぇぉ]?/gu, c => voicedKana[c])
    .replace(/[ゃゅょぁぃぅぇぉ]/gu, c => smallKana[c])
    .replace(/[ー\s・･、。,.!！?？「」『』()（）\-‐‑–—]/gu, '');
}

export function extract(text) {
  return String(text ?? '').normalize('NFKC').trim()
    .replace(/^(?:(?:えっとね|えっと|えーと|あのー|あの|うーん|えー|んー)[、,\s]*)*(?:答えは|こたえは)?[、,\s]*/u, '')
    .replace(/(?:だと思います|だと思う|です|かな)[。.!！?？\s]*$/u, '').trim();
}

// Shorten only known administrative labels for the question's own language.
// Keep the original prompt and ID so notes, maps and saved review IDs stay valid.
const administrativeLabels = {
  korean: /(?:통합특별시|특별자치도|특별자치시|광역시|특별시|도|시)$/u,
  russian: /^(?:Республика\s+)|\s+(?:автономная область|автономный округ|область|край)$/u,
  ukrainian: /^(?:Автономна Республіка\s+)|\s+область$/u,
  mongolian: /\s+аймаг$/u,
  bulgarian: /^Област\s+|\s+област$/u,
  kyrgyz: /\s+(?:облусу|шаары)$/u,
  kazakh: /\s+(?:облысы|қаласы)$/u
};

export function displayPrompt(question) {
  const label = question.kind === 'regions' && administrativeLabels[question.lang];
  return label ? question.prompt.replace(label, '').trim() || question.prompt : question.prompt;
}

const spokenSuffixes = [
  ['統合特別市','とうごうとくべつし'],['特別自治道','とくべつじちどう'],
  ['特別自治市','とくべつじちし'],['広域市','こういきし'],['特別市','とくべつし'],
  ['自治管区','じちかんく'],['自治州','じちしゅう'],['共和国','きょうわこく'],
  ['連邦市','れんぽうし'],['地方','ちほう'],['首都州','しゅとしゅう'],['首都県','しゅとけん'],['県','けん'],['州','しゅう'],['市','し']
];

export function acceptedAnswers(question) {
  const names = [question.answer, ...(question.aliases || [])];
  for (const name of [...names]) {
    const suffix = spokenSuffixes.find(([written]) => name.endsWith(written));
    if (suffix) names.push(name.slice(0, -suffix[0].length) + suffix[1]);
  }
  return new Set(names.map(normalize).filter(Boolean));
}

export function judge(question, input) {
  const candidates = Array.isArray(input) ? input : [input];
  const accepted = acceptedAnswers(question);
  let firstFailure;
  for (const [index, candidate] of candidates.entries()) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const transcript = candidate.trim();
    const extracted = extract(transcript);
    const ok = accepted.has(normalize(transcript)) || accepted.has(normalize(extracted));
    let result = { ok, transcript, extracted, reason: ok ? '登録された読み・別名と一致しました。' : '登録された読み・別名と一致しませんでした。聞き取り違いなら再挑戦できます。' };
    if (!ok) {
      const correction = (question.recognitionCorrections || []).find(item =>
        normalize(item.from) === normalize(extracted) && accepted.has(normalize(item.to)));
      if (correction) result = { ok: true, transcript, extracted: correction.to,
        reason: `登録済みの音声認識補正：「${extracted}」→「${correction.to}」で判定しました。` };
    }
    if (result.ok) {
      if (index > 0) result.reason += ` 音声認識の第${index + 1}候補で判定しました。`;
      return result;
    }
    firstFailure ??= result;
  }
  return firstFailure || { ok: false, transcript: '', extracted: '', reason: '音声認識の候補を受け取れませんでした。もう一度マイクを押してください。' };
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function makeDeck(questions, { lang, mode, count, reviewIds = null }, random = Math.random) {
  let pool = questions.filter(q => q.lang === lang && (mode === 'mixed' || q.kind === mode));
  if (reviewIds) pool = pool.filter(q => reviewIds.has(q.id));
  const limit = count === 'all' ? pool.length : Math.min(Number(count) || 10, pool.length);
  if (mode !== 'mixed' || reviewIds) return shuffle(pool, random).slice(0, limit);
  const regions = shuffle(pool.filter(q => q.kind === 'regions'), random);
  const cities = shuffle(pool.filter(q => q.kind === 'cities'), random);
  const chosen = [];
  while (chosen.length < limit && (regions.length || cities.length)) {
    for (let i = 0; i < 4 && regions.length && chosen.length < limit; i++) chosen.push(regions.pop());
    if (cities.length && chosen.length < limit) chosen.push(cities.pop());
  }
  return shuffle(chosen, random);
}

export function loadReview(storage, questions) {
  try {
    const value = JSON.parse(storage.getItem('glvq-review-v1') || '[]');
    if (!Array.isArray(value)) return new Set();
    const ids = new Set(questions.map(q => q.id));
    return new Set(value.filter(id => typeof id === 'string' && ids.has(id)));
  } catch { return new Set(); }
}

export function saveReview(storage, ids) {
  try { storage.setItem('glvq-review-v1', JSON.stringify([...ids])); return true; }
  catch { return false; }
}
