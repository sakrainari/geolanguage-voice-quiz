import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data.js';
import { LANGS } from '../catalog.js';
import { normalize, extract, judge, makeDeck, loadReview, saveReview } from '../core.js';
const find = prompt => QUESTIONS.find(q => q.prompt === prompt);
test('教材の収録数、IDの一意性、全回答・別名を検証', () => {
  assert.equal(QUESTIONS.length,495);
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
  assert.equal(normalize('カーン'),normalize('カン'));
});

test('全候補を判定し、最上位が不一致でも一致候補で正解にする',()=>{
  const q=find('Πιερία');
  const result=judge(q,['東京','ピレウス','アテネ','ラリサ','えー、ピエリアかな？']);
  assert.equal(result.ok,true);
  assert.equal(result.transcript,'えー、ピエリアかな？');
  assert.equal(result.extracted,'ピエリア');
  assert.match(result.reason,/第5候補/);
  assert.equal(judge(q,['東京','アテネ']).ok,false);
  assert.equal(judge(q,'ピエリア').ok,true);
  assert.equal(judge(q,[]).ok,false);
  assert.equal(judge(q,['',' ']).ok,false);
});

test('長音を削除し、回答側と正解側の両方へ適用する',()=>{
  assert.equal(normalize('カーーン・ﾁｬｰﾝ'),normalize('カンチャン'));
  assert.equal(judge({answer:'ターク'},'タク').ok,true);
  assert.equal(judge({answer:'タク'},['他の地名','ターク']).ok,true);
});

test('ヴァ・ヴィ・ヴ・ヴェ・ヴォをバ行へそろえる',()=>{
  for(const [v,b] of [['ヴァ','バ'],['ヴィ','ビ'],['ヴ','ブ'],['ヴェ','ベ'],['ヴォ','ボ']]) {
    assert.equal(normalize(v),normalize(b),v);
    assert.equal(judge({answer:v+'ーナ'},b+'ナ').ok,true,v);
    assert.equal(judge({answer:b+'ナ'},v+'ーナ').ok,true,b);
  }
  assert.equal(normalize('ｳﾞｧｳﾞｨｳﾞｳﾞｪｳﾞｫ'),normalize('バビブベボ'));
});

test('指定された小書きかなを大きい文字へそろえ、促音は区別する',()=>{
  for(const [small,large] of [['ャ','ヤ'],['ュ','ユ'],['ョ','ヨ'],['ァ','ア'],['ィ','イ'],['ゥ','ウ'],['ェ','エ'],['ォ','オ']]) {
    assert.equal(normalize(small),normalize(large),small);
    assert.equal(judge({answer:'キ'+small},'キ'+large).ok,true,small);
    assert.equal(judge({answer:'キ'+large},'キ'+small).ok,true,large);
  }
  assert.notEqual(normalize('アッタ'),normalize('アツタ'));
});

test('追加の前置きと末尾を取り除き、組み合わせた発話も判定する',()=>{
  const q=find('Πιερία');
  for(const prefix of ['あのー','あの','うーん','えー','んー']) {
    for(const suffix of ['だと思う','かな']) {
      const input=`${prefix}、答えはピエリア${suffix}？`;
      assert.equal(extract(input),'ピエリア',input);
      assert.equal(judge(q,input).ok,true,input);
    }
  }
  assert.equal(extract('うーん、あのー、えっと、ピエリアかな。'),'ピエリア');
  for(const input of ['ピエリアではないかな','ピエリアじゃないと思う','ピエリアとラリサかな','ピエリかな']) assert.equal(judge(q,input).ok,false,input);
});

test('全候補の中の個別補正も適用し、全候補が否定文なら拒否する',()=>{
  const q=find('ลำพูน');
  const result=judge(q,['東京','ランプ']);
  assert.equal(result.ok,true);
  assert.equal(result.transcript,'ランプ');
  assert.equal(result.extracted,'ランプーン');
  assert.match(result.reason,/補正/);
  assert.equal(judge(q,['ランプではない','ランプンじゃない']).ok,false);
});
test('漢字・行政語尾・登録した慣用名', () => {
  for (const [prompt, input] of [['부산','釜山'],['인천','仁川'],['경기도','京畿道'],['Краснодарский край','クラスノダールちほう'],['Γρεβενά','グレベナ県'],['เชียงราย','チェンライ県'],['กรุงเทพมหานคร','バンコク'],['Ρόδος','ロードス']]) assert.equal(judge(find(prompt),input).ok,true, input);
  assert.equal(judge(find('Курская область'),'クルガン').ok,false);
  assert.equal(judge(find('Πιερία'),'ピレウス').ok,false);
  assert.equal(judge(find('충청북도'),'忠清南道').ok,false);
});
test('各言語・各モードのデッキは無重複で要求数以内', () => {
  for (const lang of Object.keys(LANGS)) for (const mode of ['regions','cities','mixed']) for (const count of ['5','10','20','all']) {
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
