// Integration test of the real app module with a small in-memory DOM and a
// controllable speech service. This does not replace visual browser QA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTIONS } from '../data.js';
import { LANGS } from '../catalog.js';
import { displayPrompt } from '../core.js';

test('実アプリを通して国選択・音声判定・成績・復習・地図リンクを検証', async () => {
  class Element {
    constructor() { this.children=[];this.dataset={};this.handlers={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.classList={toggle(){},remove(){}}; }
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,handler){this.handlers[name]=handler;}
    scrollIntoView(){} focus(){}
    click(){assert.equal(this.disabled,false,'disabled button');this.handlers.click?.();}
  }
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element()]));
  const get=id=>{assert.ok(nodes.has(id),`missing HTML element: ${id}`);return nodes.get(id);};
  get('mode').value='regions';get('count').value='5';
  const saved=new Map();
  const instances=[];
  class Recognition {
    constructor(){instances.push(this);}
    start(){this.onstart?.();}
    abort(){this.onend?.();}
    emit(text,isFinal=true){this.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal})]});}
  }
  const documentEvents=new Map();
  globalThis.document={getElementById:get,createElement:()=>new Element(),addEventListener:(name,handler)=>documentEvents.set(name,handler)};
  globalThis.window={isSecureContext:true,SpeechRecognition:Recognition,localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},scrollTo(){},addEventListener(){}};
  await import('../app.js');
  assert.equal(get('languages').children.length,4);
  assert.equal(get('countries').children.length,6);
  get('languages').children.find(node=>node.dataset.script==='cyrillic').click();
  assert.equal(get('country-picker').hidden,false);
  get('setup-mic-check').click();
  assert.equal(get('mic-check').hidden,false);
  assert.equal(get('game').hidden,true);
  assert.equal(get('check-continue').disabled,true);
  get('check-speech').click();
  const staleCheckRecognition=instances.at(-1);
  staleCheckRecognition.emit('マイクのテストです');
  assert.equal(get('check-transcript').textContent,'マイクのテストです');
  assert.equal(get('check-continue').disabled,false);
  get('check-continue').click();
  assert.equal(get('setup').hidden,false);
  assert.equal(get('game').hidden,true);
  assert.equal(nodes.has('game-mic-check'),false);
  for(const lang of ['ukrainian','mongolian','bulgarian','kyrgyz','kazakh','russian']) {
    get('countries').children.find(node=>node.dataset.lang===lang).click();
    assert.equal(get('countries').children.filter(node=>node.attributes['aria-pressed']==='true').length,1);
    get('start').click();
    assert.equal(get('game').hidden,false);
    assert.equal(get('mic-check').hidden,true);
    for(let i=0;i<5;i++) {
      assert.equal(get('prompt').lang,LANGS[lang].code);
      const q=QUESTIONS.find(item=>item.id===get('prompt').dataset.questionId);
      assert.ok(q);
      assert.equal(q.lang,lang);
      assert.equal(get('prompt').textContent,displayPrompt(q));
      if(i===0) {
        staleCheckRecognition.emit(q.answer);
        assert.equal(get('feedback').hidden,true);
      }
      if(i<3) {
        get('mic').click();
        if(i===0) {
          instances.at(-1).emit(q.answer,false);
          assert.equal(get('feedback').hidden,true);
          instances.at(-1).emit('東京');
          assert.equal(get('feedback').hidden,true);
          get('mic').click();
        }
        instances.at(-1).emit(q.aliases.at(-1));
      } else if(i===3) get('skip').click();
      else {get('reveal').click();get('rescue').click();}
      assert.equal(get('feedback').hidden,false);
      assert.equal(get('answer').textContent,q.answer);
      if(displayPrompt(q)!==q.prompt) assert.ok(get('note').textContent.includes(q.prompt));
      assert.ok(decodeURIComponent(get('map').href).includes(LANGS[lang].mapCountry));
      get('next').click();
    }
    assert.equal(get('results').hidden,false);
    assert.deepEqual(get('stats').children.map(node=>node.children[0].textContent),['2 / 5','40%','1','1']);
    assert.equal(get('result-list').children.length,5);
    assert.equal(get('result-review').disabled,false);
    get('result-review').click();
    assert.ok(get('context').textContent.includes('復習'));
    get('home').click();
  }
  get('languages').children.find(node=>node.dataset.script==='greek').click();
  assert.equal(get('country-picker').hidden,true);
  get('languages').children.find(node=>node.dataset.script==='cyrillic').click();
  assert.equal(get('countries').children.find(node=>node.dataset.lang==='russian').attributes['aria-pressed'],'true');
  get('setup-mic-check').click();
  get('check-speech').click();
  const abandonedCheck=instances.at(-1);
  document.hidden=true;documentEvents.get('visibilitychange')();document.hidden=false;
  assert.match(get('check-status').textContent,/マイクを停止/);
  abandonedCheck.emit('離脱後の結果');
  assert.equal(get('check-transcript').textContent,'');
  get('check-skip').click();
  assert.equal(get('setup').hidden,false);

  get('languages').children.find(node=>node.dataset.script==='thai').click();
  get('count').value='all';get('start').click();
  let skips=0;
  while(get('prompt').textContent!=='ลำพูน' && skips++<77) {get('skip').click();get('next').click();}
  assert.equal(get('prompt').textContent,'ลำพูน');
  get('mic').click();instances.at(-1).emit('ランプ');
  assert.equal(get('feedback').hidden,false);
  assert.equal(get('transcript').textContent,'ランプ');
  assert.equal(get('extracted').textContent,'ランプーン');
  assert.match(get('reason').textContent,/補正/);
  assert.equal(get('answer').textContent,'ランプーン');
  get('home').click();

  get('languages').children.find(node=>node.dataset.script==='korean').click();
  get('start').click();
  skips=0;
  while(get('prompt').textContent!=='제주' && skips++<18) {get('skip').click();get('next').click();}
  assert.equal(get('prompt').textContent,'제주');
  get('mic').click();instances.at(-1).emit('チェジュ');
  assert.equal(get('feedback').hidden,false);
  assert.ok(get('note').textContent.includes('제주특별자치도'));
  get('home').click();

  get('setup-mic-check').click();get('check-speech').click();
  instances.at(-1).emit('ランプ');
  assert.equal(get('check-transcript').textContent,'ランプ');
  get('check-skip').click();
});
