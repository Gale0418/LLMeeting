import test from 'node:test';
import assert from 'node:assert/strict';
import { focusPendingRepairTab } from '../src/background/repairFocus.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fixture = () => ({ transcript: { answers: { gemini: '[錯誤：未確認送出]' } },
  providerDiagnostics: { gemini: { phase: 'first-round', tabId: 20 } } });
test('repair pause activates the failed AI tab once without sending or creating anything', async () => {
  const calls=[];
  const result=await focusPendingRepairTab(fixture(), {
    get: async id=>({id,status:'complete',url:'https://gemini.google.com/app/test'}),
    update: async (id,patch)=>calls.push({id,patch}),
  });
  assert.equal(result,'gemini');
  assert.deepEqual(calls,[{id:20,patch:{active:true}}]);
});
test('closed, navigated, departed, or repaired tabs are never activated', async () => {
  for(const variant of ['closed','navigated','departed','repaired']) {
    const state=fixture();
    if(variant==='departed') state.departedProviders=['gemini'];
    if(variant==='repaired') state.transcript.answers.gemini='Valid reply';
    let updated=false;
    const result=await focusPendingRepairTab(state, {
      get:async()=>{if(variant==='closed') throw new Error('closed'); return {status:'complete',url:'https://example.com/'};},
      update:async()=>{updated=true;},
    });
    assert.equal(result,null,variant); assert.equal(updated,false,variant);
  }
});
test('repair in another window brings that window forward only once', async () => {
  const focused=[];
  await focusPendingRepairTab(fixture(), {
    get:async()=>({windowId:8,status:'complete',url:'https://gemini.google.com/app/test'}),update:async()=>{},
  },()=>{}, {update:async(id,options)=>focused.push({id,options})});
  assert.deepEqual(focused,[{id:8,options:{focused:true}}]);
});
test('cancellation after tab activation prevents a late window focus', async () => {
  let current=true;
  await assert.rejects(focusPendingRepairTab(fixture(), {
    get:async()=>({windowId:8,status:'complete',url:'https://gemini.google.com/app/test'}),
    update:async()=>{current=false;},
  },()=>{if(!current)throw new Error('cancelled');}, {update:async()=>assert.fail('late window focus')}),/cancelled/);
});
test('stop or replacement during tab lookup prevents a late focus change', async () => {
  let current=true;
  await assert.rejects(focusPendingRepairTab(fixture(), {
    get:async()=>{current=false;return {status:'complete',url:'https://gemini.google.com/app/test'};},
    update:async()=>assert.fail('stale focus'),
  },()=>{if(!current) throw new Error('cancelled');}),/cancelled/);
});

test('runtime publishes the repair pause before activating its failed tab', async () => {
  const source=await readFile('src/background/service-worker.js','utf8');
  const body=source.slice(source.indexOf('async function pauseForReplyRepair('),source.indexOf('async function resumeRepairedMeeting('));
  const order=[];
  const state=fixture();
  const context=vm.createContext({runtimeState:{...state,phase:'first-round'},engine:{snapshot:()=>state.transcript},
    runController:{assertCurrent(){}},createRunCancelledError:()=>new Error('cancelled'),focusPendingRepairTab,
    publishState:async()=>{assert.equal(context.runtimeState.busy,false);assert.ok(context.runtimeState.repairPause);order.push('paused');},
    chrome:{tabs:{get:async()=>({status:'complete',url:'https://gemini.google.com/app/test'}),update:async()=>order.push('focused')}},
  });
  vm.runInContext(body,context);
  await context.pauseForReplyRepair([{provider:'meta'}],'answer',{type:'interactive'},1);
  assert.deepEqual(order,['paused','focused']);
  assert.equal(context.runtimeState.repairPause.remainingJobs.length,1);
});
