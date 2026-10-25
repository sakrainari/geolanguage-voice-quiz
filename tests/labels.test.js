import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data.js';
import { displayPrompt, judge } from '../core.js';

test('出題する原語から行政区分の部分を省く', () => {
  for (const [prompt, expected] of [
    ['제주특별자치도','제주'],['서울특별시','서울'],['부산광역시','부산'],
    ['세종특별자치시','세종'],['전남광주통합특별시','전남광주'],['경기도','경기'],
    ['Иркутская область','Иркутская'],['Краснодарский край','Краснодарский'],
    ['Республика Алтай','Алтай'],['Ненецкий автономный округ','Ненецкий'],
    ['Еврейская автономная область','Еврейская'],['Київська область','Київська'],
    ['Автономна Республіка Крим','Крим'],['Хөвсгөл аймаг','Хөвсгөл'],
    ['Област Варна','Варна'],['Софийска област','Софийска'],
    ['Област София (столица)','София (столица)'],
    ['Ош облусу','Ош'],['Ош шаары','Ош'],['Алматы облысы','Алматы'],['Алматы қаласы','Алматы']
  ]) {
    const q=QUESTIONS.find(q=>q.prompt===prompt);
    assert.ok(q,prompt);
    assert.equal(displayPrompt(q),expected,prompt);
  }
});

test('東西南北、地名の一部、都市の名前は削らない', () => {
  for (const prompt of ['Πιερία','นครศรีธรรมราช','บุรีรัมย์','กรุงเทพมหานคร','Владивосток','제주']) {
    const q=QUESTIONS.find(q=>q.prompt===prompt);
    assert.ok(q,prompt);
    assert.equal(displayPrompt(q),prompt);
  }
  assert.equal(displayPrompt({lang:'korean',kind:'cities',prompt:'제주시'}),'제주시');
  for (const [prompt,expected] of [['Батыс Қазақстан облысы','Батыс Қазақстан'],['Солтүстік Қазақстан облысы','Солтүстік Қазақстан'],['충청북도','충청북'],['충청남도','충청남']]) {
    assert.equal(displayPrompt(QUESTIONS.find(q=>q.prompt===prompt)),expected);
  }
});

test('韓国の道は「ド」抜きの読みも明示的に登録する', () => {
  for (const [prompt,readings] of [
    ['충청북도',['チュンチョンブク']],['충청남도',['チュンチョンナム']],
    ['경상북도',['キョンサンブク']],['경상남도',['キョンサンナム']],
    ['전라남도',['チョルラナム','チョンラナム']]
  ]) {
    const q=QUESTIONS.find(q=>q.prompt===prompt);
    for (const reading of readings) assert.equal(judge(q,reading).ok,true,reading);
  }
  const north=QUESTIONS.find(q=>q.prompt==='충청북도');
  assert.equal(judge(north,'チュンチョンナム').ok,false);
});

test('表示を短くしても正式表記・問題ID・復習データを変えない', () => {
  const before=JSON.stringify(QUESTIONS);
  for (const q of QUESTIONS) assert.ok(displayPrompt(q).trim(),q.id);
  assert.equal(JSON.stringify(QUESTIONS),before);
  const osh=QUESTIONS.filter(q=>q.lang==='kyrgyz'&&q.kind==='regions'&&displayPrompt(q)==='Ош');
  assert.equal(osh.length,2);
  assert.equal(new Set(osh.map(q=>q.id)).size,2);
});
