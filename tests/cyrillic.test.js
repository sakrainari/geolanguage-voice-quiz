import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data.js';
import { LANGS, SCRIPTS } from '../catalog.js';
import { judge, makeDeck, loadReview, saveReview } from '../core.js';

const expected = { ukrainian: [27,12], mongolian: [22,12], bulgarian: [28,12], kyrgyz: [9,12], kazakh: [20,12] };
const find = (lang, prompt) => QUESTIONS.find(q => q.lang === lang && q.prompt === prompt);
test('5か国の行政地域・都市と文字体系・地図の国を対応させる', () => {
  assert.equal(Object.values(LANGS).filter(l => l.script === 'cyrillic').length,6);
  for (const [lang, [regions, cities]] of Object.entries(expected)) {
    const pool = QUESTIONS.filter(q => q.lang === lang);
    assert.equal(pool.filter(q => q.kind === 'regions').length,regions,lang);
    assert.equal(pool.filter(q => q.kind === 'cities').length,cities,lang);
    assert.equal(LANGS[lang].script,'cyrillic');
    assert.ok(LANGS[lang].mapCountry && LANGS[lang].code);
    for (const q of pool) assert.match(q.prompt,/^[\p{Script=Cyrillic}\s()\-]+$/u, q.prompt);
  }
  for (const q of QUESTIONS) assert.ok(LANGS[q.lang],q.id);
  for (const info of Object.values(SCRIPTS)) assert.ok(LANGS[info.defaultLang]);
});
test('国別の慣用カナ・かなの行政語尾・旧称を登録範囲で許容', () => {
  for (const [lang,prompt,answer] of [
    ['ukrainian','Київська область','キエフしゅう'],
    ['ukrainian','Львів','リビウ'],
    ['mongolian','Хөвсгөл аймаг','フブスゴルけん'],
    ['mongolian','Улаанбаатар','ウランバートル市'],
    ['bulgarian','Област Варна','バルナ州'],
    ['kyrgyz','Ысык-Көл облусу','イッシククルしゅう'],
    ['kyrgyz','Жалал-Абад','ジャララバード'],
    ['kazakh','Жетісу облысы','ジェティスー州'],
    ['kazakh','Солтүстік Қазақстан облысы','きたかざふすたんしゅう'],
    ['kazakh','Астана','ヌルスルタン']
  ]) assert.equal(judge(find(lang,prompt),answer).ok,true,`${lang}: ${answer}`);
});
test('似た地域名を誤って正解にせず、ソフィア市と州も区別する', () => {
  assert.equal(judge(find('bulgarian','Област София (столица)'),'ソフィア州').ok,false);
  assert.equal(judge(find('bulgarian','Софийска област'),'ソフィア市').ok,false);
  assert.equal(judge(find('bulgarian','Софийска област'),'ソフィア').ok,false);
  for (const prompt of ['Област София (столица)','Софийска област']) assert.ok(find('bulgarian',prompt).instruction);
  assert.equal(judge(find('mongolian','Өмнөговь аймаг'),'ドルノゴビ').ok,false);
  assert.equal(judge(find('kazakh','Батыс Қазақстан облысы'),'東カザフスタン州').ok,false);
  assert.equal(judge(find('ukrainian','Харківська область'),'ハルキウではない').ok,false);
});
test('復習を各国の問題に限定し、既存329問のIDも維持する', () => {
  assert.equal(QUESTIONS.filter(q=>['thai','russian','greek','korean'].includes(q.lang)).length,329);
  const ids = new Set(Object.keys(expected).map(lang=>QUESTIONS.find(q=>q.lang===lang).id));
  let saved;
  saveReview({setItem:(_key,value)=>{saved=value;}},ids);
  const restored=loadReview({getItem:()=>saved},QUESTIONS);
  for(const lang of Object.keys(expected)) {
    const deck=makeDeck(QUESTIONS,{lang,mode:'mixed',count:'all',reviewIds:restored});
    assert.equal(deck.length,1);
    assert.equal(deck[0].lang,lang);
  }
});
