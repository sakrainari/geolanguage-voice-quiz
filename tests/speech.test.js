import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInput } from '../speech.js';
function setup(timeoutMs=500,autoStart=true) {
  const sessions=[], finals=[], interim=[], statuses=[];
  class Recognition {
    constructor(){sessions.push(this);}
    start(){if(autoStart)this.onstart?.();}
    abort(){this.aborted=true;this.onend?.();}
  }
  const voice=new VoiceInput({Recognition,onFinal:t=>finals.push(t),onInterim:t=>interim.push(t),onStatus:(message,active)=>statuses.push({message,active}),timeoutMs});
  return {voice,sessions,finals,interim,statuses};
}
function result(text,isFinal){return Object.assign([{transcript:text}],{isFinal});}
test('途中結果では採点せず、確定結果を1回だけ受け付ける',()=>{
  const {voice,sessions,finals,interim}=setup();voice.start();const r=sessions[0];
  assert.equal(r.lang,'ja-JP'); assert.equal(r.maxAlternatives,5);
  r.onresult({resultIndex:0,results:[result('ピエ',false)]});
  assert.deepEqual(interim,['ピエ']);assert.deepEqual(finals,[]);
  const event={resultIndex:0,results:[result('ピエリア',true)]};r.onresult(event);r.onresult(event);
  assert.deepEqual(finals,[['ピエリア']]);assert.equal(r.aborted,true);
});

test('確定結果の全候補を順序を保った配列で渡す',()=>{
  const {voice,sessions,finals}=setup();voice.start();const r=sessions[0];
  const alternatives=[' ランプ ','ランプン','ランプーン','ランパーン','ラムプーン'];
  const browserResult=Object.assign({length:alternatives.length},alternatives.map(transcript=>({transcript})),{isFinal:true});
  r.onresult({resultIndex:0,results:[browserResult]});
  assert.deepEqual(finals,[['ランプ','ランプン','ランプーン','ランパーン','ラムプーン']]);
  assert.equal(voice.active,null);
});

test('空の候補は除き、後続の確定候補を受け付ける',()=>{
  const {voice,sessions,finals}=setup();voice.start();const r=sessions[0];
  r.onresult({resultIndex:0,results:[Object.assign([{transcript:' '},{transcript:'ピエリア'}],{isFinal:true})]});
  assert.deepEqual(finals,[['ピエリア']]);
});
test('連打・再録音・画面移動後の古いイベントを無視',()=>{
  const {voice,sessions,finals,statuses}=setup();voice.start();const old=sessions[0];voice.start();
  const count=statuses.length;
  old.onresult({resultIndex:0,results:[result('誤った古い回答',true)]});old.onerror({error:'network'});old.onend();old.onstart();
  assert.deepEqual(finals,[]);assert.equal(statuses.length,count);
  voice.stop();sessions[1].onresult({resultIndex:0,results:[result('ピエリア',true)]});assert.deepEqual(finals,[]);
});
test('権限拒否、音声なし、ネットワーク障害を終了状態で案内',()=>{
  for(const error of ['not-allowed','no-speech','network','audio-capture']){
    const {voice,sessions,statuses,finals}=setup();voice.start();sessions[0].onerror({error});
    assert.equal(statuses.at(-1).active,false);assert.ok(statuses.at(-1).message.length>10);assert.deepEqual(finals,[]);assert.equal(voice.active,null);
  }
});
test('終了時の案内と15秒相当の録音上限',async()=>{
  const {voice,sessions,statuses}=setup(10);voice.start();sessions[0].onend();assert.equal(statuses.at(-1).active,false);
  voice.start();await new Promise(resolve=>setTimeout(resolve,25));assert.equal(voice.active,null);assert.equal(statuses.at(-1).active,false);assert.match(statuses.at(-1).message,/録音を終了/);
});

test('許可待ちでは時間切れにせず、onstartから15秒間聞き取る',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {voice,sessions,statuses}=setup(15000,false);voice.start();const r=sessions[0];
  t.mock.timers.tick(20000);
  assert.equal(voice.active,r);
  assert.equal(r.aborted,undefined);
  assert.match(statuses.at(-1).message,/準備/);
  r.onstart();
  t.mock.timers.tick(14999);assert.equal(voice.active,r);
  t.mock.timers.tick(1);assert.equal(voice.active,null);
  assert.equal(r.aborted,true);
  assert.match(statuses.at(-1).message,/録音を終了/);
});

test('onstart後の停止と再録音で古いタイマーを残さない',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {voice,sessions,statuses}=setup(15000,false);voice.start();sessions[0].onstart();
  t.mock.timers.tick(10000);voice.start();const current=sessions[1];
  t.mock.timers.tick(20000);assert.equal(voice.active,current);
  current.onstart();t.mock.timers.tick(14999);assert.equal(voice.active,current);
  voice.stop();const count=statuses.length;
  t.mock.timers.tick(20000);assert.equal(statuses.length,count);
  assert.equal(voice.active,null);
});
