import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicCheck } from '../mic-check.js';

function fixture(overrides={}) {
  const states=[], levels=[], frames=new Map(), events=[], instances=[], contexts=[];
  let frameId=0;
  const track={label:'Test USB Microphone',stop(){events.push('track-stop');this.stopped=true;}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const mediaDevices={getUserMedia:async constraints=>{assert.deepEqual(constraints,{audio:true,video:false});return stream;}};
  class AudioContext {
    constructor(){contexts.push(this);}
    async resume(){}
    createAnalyser(){return {fftSize:256,getByteTimeDomainData:buffer=>buffer.fill(160),disconnect(){events.push('analyser-disconnect');}};}
    createMediaStreamSource(){return {connect(){},disconnect(){events.push('source-disconnect');}};}
    async close(){events.push('context-close');this.closed=true;}
  }
  class Recognition {
    constructor(){instances.push(this);}
    start(){events.push('recognition-start');this.onstart?.();}
    abort(){this.onend?.();}
    emit(text,isFinal=true){this.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal})]});}
  }
  const check=new MicCheck({mediaDevices,AudioContext,Recognition,
    requestFrame:callback=>{frames.set(++frameId,callback);return frameId;},
    cancelFrame:id=>frames.delete(id),onUpdate:state=>states.push(state),onLevel:level=>levels.push(level),...overrides});
  check.open();
  return {check,states,levels,frames,events,instances,contexts,track,stream};
}

test('許可・入力機器名・音量の反応を確認し、中断時に全リソースを解放',async()=>{
  const f=fixture();await f.check.startLevel();
  assert.equal(f.check.state.permission,'許可済み');
  assert.equal(f.check.state.device,'Test USB Microphone');
  assert.equal(f.check.state.signal,true);assert.ok(f.levels.at(-1)>0);
  const lateFrame=[...f.frames.values()][0];
  f.check.stop();lateFrame();
  assert.equal(f.track.stopped,true);assert.equal(f.contexts[0].closed,true);
  assert.equal(f.frames.size,0);assert.equal(f.levels.at(-1),0);
});

test('許可待ち中に離脱した後で入力が開いても、即座に停止する',async()=>{
  let resolve;
  const f=fixture({mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}});
  const pending=f.check.startLevel();f.check.stop();resolve(f.stream);await pending;
  assert.equal(f.track.stopped,true);assert.equal(f.check.stream,null);assert.equal(f.contexts.length,0);
  assert.notEqual(f.check.state.permission,'許可済み');
});

test('音量測定を止めてから音声認識を開始し、確定結果だけで完了する',async()=>{
  const f=fixture();await f.check.startLevel();f.check.startRecognition();
  assert.ok(f.events.indexOf('track-stop')<f.events.indexOf('recognition-start'));
  assert.match(f.check.state.status,/マイクのテスト/);
  f.instances[0].emit('マイクの',false);assert.equal(f.check.state.recognized,false);
  f.instances[0].emit('マイクのテストです');assert.equal(f.check.state.recognized,true);
  assert.equal(f.check.state.transcript,'マイクのテストです');assert.equal(f.check.state.mode,'idle');
  f.check.open();f.instances[0].emit('古い結果');assert.equal(f.check.state.transcript,'');
});

test('入力許可の拒否・マイク不在・機器使用中を区別して案内',async()=>{
  for(const [name,pattern] of [['NotAllowedError',/許可/],['NotFoundError',/見つかりません/],['NotReadableError',/開けません/]]) {
    const f=fixture({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error(),{name});}}});
    await f.check.startLevel();assert.match(f.check.state.status,pattern);assert.equal(f.check.state.mode,'idle');assert.equal(f.check.stream,null);
  }
});

test('音量測定が未対応でも聞き取り確認へ進め、入力切断でも解放する',async()=>{
  const unavailable=fixture({mediaDevices:undefined});await unavailable.check.startLevel();assert.match(unavailable.check.state.status,/利用できません/);
  unavailable.check.startRecognition();unavailable.instances[0].emit('テスト');assert.equal(unavailable.check.state.recognized,true);
  const noAnalyser=fixture({AudioContext:undefined});await noAnalyser.check.startLevel();assert.equal(noAnalyser.track.stopped,true);assert.match(noAnalyser.check.state.status,/音量バー/);
  const disconnected=fixture();await disconnected.check.startLevel();disconnected.track.onended();assert.equal(disconnected.track.stopped,true);assert.match(disconnected.check.state.status,/接続が切れ/);
});

test('音量確認の上限時間でマイクを解放する',async()=>{
  const f=fixture({levelTimeoutMs:10});await f.check.startLevel();await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(f.track.stopped,true);assert.equal(f.check.state.mode,'idle');assert.match(f.check.state.status,/終了/);
});
