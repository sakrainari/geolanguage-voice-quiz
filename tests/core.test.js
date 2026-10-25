import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data.js';
import { normalize, judge, makeDeck, loadReview, saveReview } from '../core.js';
const find = prompt => QUESTIONS.find(q => q.prompt === prompt);
test('教材の収録数、IDの一意性、全回答・別名を検証', () => {
  assert.equal(QUESTIONS.length,329);
  assert.equal(new Set(QUESTIONS.map(q=>q.id)).size, QUESTIONS.length);
  for (const q of QUESTIONS) {
    assert.ok(q.prompt && q.note && q.map && q.answer);
    for (const name of q.aliases) assert.equal(judge(q,name).ok,true,`${q.id}: ${name}`);
    assert.equal(judge(q,'関係のない地名').ok,false);
    assert.equal(judge(q,q.answer+'ではない').ok,false);
  }
});
test('かな・幅・区切り・限定した前置きと文末', () => {
  const q = find('Πιερία');
  for (const s of ['ぴえりあ','ﾋﾟｴﾘｱ','ピ エ リ ア','ピ・エリア','えっと、答えはピエリアです。','ピエリアけん']) assert.equal(judge(q,s).ok,true,s);
  for (const s of ['ピエリ','ピエリアではない','ピエリアかもしれない','ピエリアとラリサ','南ピエリア','ピエリアですよね','ぴえりや']) assert.equal(judge(q,s).ok,false,s);
  assert.notEqual(normalize('カーン'),normalize('カン'));
});
test('漢字・行政語尾・登録した慣用名', () => {
  for (const [prompt, input] of [['부산','釜山'],['인천','仁川'],['경기도','京畿道'],['Краснодарский край','クラスノダールちほう'],['Γρεβενά','グレベナ県'],['เชียงราย','チェンライ県'],['กรุงเทพมหานคร','バンコク'],['Ρόδος','ロードス']]) assert.equal(judge(find(prompt),input).ok,true, input);
  assert.equal(judge(find('Курская область'),'クルガン').ok,false);
  assert.equal(judge(find('Πιερία'),'ピレウス').ok,false);
  assert.equal(judge(find('충청북도'),'忠清南道').ok,false);
});
test('各言語・各モードのデッキは無重複で要求数以内', () => {
  for (const lang of ['thai','russian','greek','korean']) for (const mode of ['regions','cities','mixed']) for (const count of ['5','10','20','all']) {
    const deck=makeDeck(QUESTIONS,{lang,mode,count});
    assert.ok(deck.length > 0);
    assert.equal(new Set(deck.map(q=>q.id)).size,deck.length);
    assert.ok(deck.every(q=>q.lang===lang && (mode==='mixed'||q.kind===mode)));
    if(count!=='all') assert.ok(deck.length<=Number(count));
  }
  const deck=makeDeck(QUESTIONS,{lang:'greek',mode:'mixed',count:'10'});
  assert.equal(deck.filter(q=>q.kind==='regions').length,8);
  assert.equal(deck.filter(q=>q.kind==='cities').length,2);
});
test('復習デッキの言語・内容絞り込みと破損保存への耐性', () => {
  const ids=new Set([QUESTIONS[0].id,find('Πιερία').id]);
  assert.equal(makeDeck(QUESTIONS,{lang:'greek',mode:'regions',count:'all',reviewIds:ids}).length,1);
  for(const value of ['null','{}','[null,1,"unknown"]','garbage']) assert.equal(loadReview({getItem:()=>value},QUESTIONS).size,0);
  assert.equal(loadReview(null,QUESTIONS).size,0);
  assert.equal(saveReview(null,ids),false);
  let saved;
  assert.equal(saveReview({setItem:(_,v)=>saved=v},ids),true);
  assert.deepEqual([...loadReview({getItem:()=>saved},QUESTIONS)],[...ids]);
});
