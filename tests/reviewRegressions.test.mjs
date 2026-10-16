import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, cp, copyFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import {DebateEngine} from '../src/background/debateEngine.js';
import {buildConversationSummaryPrompt} from '../src/shared/prompts.js';
import {buildRoundZero} from '../src/shared/roundZero.js';

const worker = await readFile('src/background/service-worker.js', 'utf8');

test('the copy-gap report can create its output directory in a clean checkout', async () => {
  const output = path.resolve('output');
  await mkdir(output, {recursive:true});
  const root = await mkdtemp(path.join(output, 'copy-gaps-regression-'));
  try {
    await cp('src', path.join(root, 'src'), {recursive:true});
    await mkdir(path.join(root, 'scripts'));
    await copyFile('scripts/extract-ui-copy.mjs', path.join(root, 'scripts/extract-ui-copy.mjs'));
    const result = spawnSync(process.execPath, ['scripts/extract-ui-copy.mjs', '--gaps'], {cwd:root, encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(root, 'output/ui-copy-render-gaps.json'), 'utf8'));
    assert.ok(Array.isArray(report.entries));
    assert.equal(report.summary.uncoveredUniqueSources, report.entries.length);
  } finally {
    assert.equal(path.dirname(root), output, 'only remove this test-owned output directory');
    await rm(root, {recursive:true, force:true});
  }
});

test('source-summary sends only the new user note, keeping linked quotations in round zero', async () => {
  const source = worker.slice(worker.indexOf('async function startSummaryDebate('), worker.indexOf('async function runDebateRounds('));
  const linked = buildRoundZero([{ok:true, provider:'gemini', content:'PRIVATE_LINKED_QUOTATION'}], 'Only this new note');
  for (const roundZero of [undefined, linked.roundZero, {...linked.roundZero, userText:''}]) {
    const jobs = [];
    const userNote = roundZero ? linked.question : 'Plain note without linked pages';
    const context = {
      DebateEngine, runtimeState:{busy:false}, engine:null,
      requireProFeature:async () => {}, requireSummaryStrategyFeature:async () => {},
      normalizeSummaryStrategy:value => value, normalizeProviderIds:value => value, normalizeDebateRounds:() => 2,
      getActiveProviderTab:async () => ({tab:{id:10}, provider:{id:'chatgpt'}}),
      getEntitlements:async () => ({}), runController:{assertCurrent() {}},
      createIdleState:() => ({errors:[]}), providerLabel:value => value,
      publishState:async () => {}, buildConversationSummaryPrompt,
      sendJob:async job => { jobs.push(job); return {ok:false, error:'Synthetic source-summary stop'}; },
      pauseForReplyRepair:async () => {},
    };
    vm.runInNewContext(source+'\nglobalThis.start = startSummaryDebate;', context);
    await context.start(userNote, {runToken:1, activeProviders:['chatgpt','gemini','grok'],
      preflight:{providerTabs:{chatgpt:10}, results:[]}, roundZero});
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].prompt, buildConversationSummaryPrompt(roundZero?.userText ?? userNote));
    assert.ok(!jobs[0].prompt.includes('PRIVATE_LINKED_QUOTATION'));
    if (roundZero) assert.equal(context.runtimeState.transcript.roundZero.sources[0].content, 'PRIVATE_LINKED_QUOTATION');
  }
});

test('continuous response collection crosses phase timeouts but stops at the fixed content hard cap', async () => {
  const content = await readFile('src/content/provider-page.js', 'utf8');
  const capExpression = content.match(/const RESPONSE_HARD_CAP_MS = ([^;]+);/)[1];
  const hardCap = vm.runInNewContext(capExpression);
  const configuredCap = worker.match(/const PROVIDER_RESPONSE_HARD_CAP_MS = ([^;]+);/)?.[1];
  if (configuredCap) assert.equal(vm.runInNewContext(configuredCap), hardCap, 'worker and content hard caps must agree');
  const source = worker.slice(worker.indexOf('async function collectProviderJob('), worker.indexOf('async function readSubmittedResponseWithRetry('));
  for (const phase of ['first-round','summary','source-summary']) {
    for (const completes of [true,false]) {
      let now = 0;
      const calls = [];
      const context = {
        Date:{now:() => now}, PROVIDER_RESPONSE_HARD_CAP_MS:hardCap,
        getProviderTimeoutMs:stage => stage==='first-round' ? 240000 : 480000,
        runController:{assertCurrent() {}}, chrome:{tabs:{get:async () => ({id:7})}},
        setProviderDiagnostic:async () => {}, activateProviderTab:async () => {},
        runtimeState:{providerDiagnostics:{}, recoveryPrompts:{}}, createWorkflowCheckpoint:() => ({}),
        providerLabel:value => value, phaseLabel:value => value, updateProviderDiagnostic:state => state,
        publishState:async () => {}, isRecoverableReply:() => false, forgetRecoveryPrompt:() => ({}),
        isRunCancelledError:() => false, formatProviderFailure:error => error.message, sanitizeDebugDetails:() => ({}),
        readSubmittedResponseWithRetry:async (job, tabId, deadline) => {
          calls.push({runId:job.runId, deadline});
          now = Math.min(now+60000, deadline);
          return completes && now>=600000 ? {ok:true, content:'Completed long reply'} : {ok:true, pending:true};
        },
      };
      vm.runInNewContext(source+'\nglobalThis.collect = collectProviderJob;', context);
      const result = await context.collect({provider:'grok', phase, tabId:7, runId:'one-submission'}, 1);
      assert.ok(calls.every(call => call.runId==='one-submission' && call.deadline===hardCap));
      assert.equal(now, completes ? 600000 : hardCap);
      assert.equal(result.ok, completes);
      if (!completes) assert.equal(result.code, 'PROVIDER_RESPONSE_TIMEOUT');
    }
  }
});
