import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data.js';
import { judge } from '../core.js';

const lamphun = QUESTIONS.find(q => q.id === 'thai-regions-ลำพูน');
test('ランプーンの読み「ランプン」を受け付ける', () => {
  for (const input of ['ランプン','ランプン県','らんぷんけん']) assert.equal(judge(lamphun,input).ok,true,input);
});
test('報告された誤認識「ランプ」をランプーンの問題で補正する', () => {
  const result = judge(lamphun,'ランプ');
  assert.equal(result.ok,true);
  assert.equal(result.transcript,'ランプ');
  assert.equal(result.extracted,'ランプーン');
  assert.match(result.reason,/補正/);
  assert.match(result.reason,/ランプ.*ランプーン/);
  assert.equal(judge(lamphun,'えっと、答えはランプです。').ok,true);
});

test('認識補正は該当問題のみに限定し、否定・断片・別地名を拒否', () => {
  for (const q of QUESTIONS.filter(q=>q.id!==lamphun.id)) assert.equal(judge(q,'ランプ').ok,false,q.id);
  for (const input of ['ランプではない','ランプじゃない','ランプかランパーン','ラン','ランパーン','ランプンではない','ランプの']) assert.equal(judge(lamphun,input).ok,false,input);
  const invalid={answer:'ピエリア',aliases:['ピエリア'],recognitionCorrections:[{from:'ランプ',to:'ランプーン'}]};
  assert.equal(judge(invalid,'ランプ').ok,false);
});

test('韓国の特別自治道は短い地名だけで答えられる', () => {
  for (const [prompt, short] of [['제주특별자치도','チェジュ'],['강원특별자치도','カンウォン'],['전북특별자치도','チョンブク']]) {
    const question = QUESTIONS.find(q=>q.prompt===prompt);
    assert.equal(judge(question,short).ok,true,prompt);
    assert.equal(judge(question,short+'ではない').ok,false,prompt);
  }
});
