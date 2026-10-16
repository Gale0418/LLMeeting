import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberRecoveryPrompt, boundRecoveryPrompts, originalRecoveryPrompt, forgetRecoveryPrompt, MAX_RECOVERY_PROMPT_CHARS } from '../src/shared/recoveryPrompts.js';
import { degradeStateForStorage } from '../src/background/statePersistence.js';
import { buildDebugReport } from '../src/shared/debugReport.js';
import { copyOriginalPrompt, recoveryPromptControls, restoreOriginalPromptFields } from '../src/sidepanel/recoveryPrompt.js';
import { recoverSession, SESSION_RETENTION_MS } from '../src/background/sessionRecovery.js';

const prompt='  Exact 原提示\n```js\nconst x = "<script>literal</script>";\n```\n';
const state=()=>({recoveryPrompts:rememberRecoveryPrompt({}, {provider:'grok',phase:'summary',prompt})});
test('original survives JSON and storage degradation byte-for-byte; never enters debug export',()=>{
  const saved=JSON.parse(JSON.stringify(state()));
  assert.equal(originalRecoveryPrompt(degradeStateForStorage(saved),'grok','summary'),prompt);
  assert.equal(JSON.stringify(buildDebugReport(saved)).includes('Exact 原提示'),false);
  assert.equal(originalRecoveryPrompt(saved,'grok','critique'),null);
});
test('restoring a saved session retains originals, while expiry drops them with the session',()=>{
  const idle=()=>({status:'idle',busy:false,activeProviders:['grok'],recoveryPrompts:{}});
  const stored={...state(),status:'done',savedAt:1000,activeProviders:['grok']};
  assert.equal(originalRecoveryPrompt(recoverSession(stored,idle,1001).state,'grok','summary'),prompt);
  assert.equal(originalRecoveryPrompt(recoverSession(stored,idle,1001+SESSION_RETENTION_MS).state,'grok','summary'),null);
});
test('copy only refers to exact provider and stage; new job replaces old and cleanup is scoped',()=>{
  const s=state();
  s.recoveryPrompts=rememberRecoveryPrompt(s.recoveryPrompts,{provider:'grok',phase:'critique-1',prompt:'next'});
  assert.equal(originalRecoveryPrompt(s,'grok','summary'),null);
  assert.equal(originalRecoveryPrompt(s,'grok','critique'),'next');
  assert.equal(originalRecoveryPrompt({recoveryPrompts:forgetRecoveryPrompt(s.recoveryPrompts,'grok','summary')},'grok','critique'),'next');
  assert.deepEqual(forgetRecoveryPrompt(s.recoveryPrompts,'grok','critique'),{});
  assert.equal(originalRecoveryPrompt({},'grok','summary'),null);
});
test('oversized or corrupt records are marked unavailable, never truncated or guessed',()=>{
  const s={recoveryPrompts:rememberRecoveryPrompt({}, {provider:'grok',phase:'summary',prompt:'x'.repeat(MAX_RECOVERY_PROMPT_CHARS+1)})};
  assert.equal(originalRecoveryPrompt(s,'grok','summary'),null);
  assert.equal(s.recoveryPrompts.grok.unavailable,true);
  assert.deepEqual(boundRecoveryPrompts({unknown:{phase:'summary',prompt},grok:{phase:'not-a-phase',prompt}}),{});
});
test('aggregate budget preserves newest originals and remains stable on repeated persistence',()=>{
  let records=rememberRecoveryPrompt({}, {provider:'chatgpt',phase:'summary',prompt:'a'.repeat(400000)});
  records=rememberRecoveryPrompt(records,{provider:'grok',phase:'summary',prompt:'b'.repeat(400000)});
  assert.equal(records.chatgpt.unavailable,true);
  assert.equal(records.grok.prompt.length,400000);
  assert.deepEqual(boundRecoveryPrompts(records),records);
});
test('clipboard writes only after explicit action; denied clipboard exposes selected original',async()=>{
  const status={textContent:''};const details={open:false};let selected=0;let focused=0;
  const textarea={focus:()=>focused++,select:()=>selected++};
  const root={isConnected:true,querySelector:selector=>selector==='details'?details:selector==='textarea'?textarea:status};
  const button={dataset:{copyPromptProvider:'grok',copyPromptPhase:'summary'},closest:()=>root};
  let copied;
  await copyOriginalPrompt(button,state(),{clipboard:{writeText:async value=>{copied=value;}},translate:s=>s});
  assert.equal(copied,prompt);assert.equal(details.open,false);
  await copyOriginalPrompt(button,state(),{clipboard:{writeText:async()=>{throw new Error('denied');}},translate:s=>s});
  assert.equal(details.open,true);assert.equal(selected,1);assert.equal(focused,1);
});
test('legacy fault offers no fake original; provided text is escaped in readonly field',()=>{
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const options={translate:s=>s,escape};
  assert.doesNotMatch(recoveryPromptControls({},'grok','summary',options),/data-copy-prompt-provider/);
  const html=recoveryPromptControls(state(),'grok','summary',options);
  assert.ok(html.includes('readonly'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('preview restores a leading newline after HTML parsing without replacing the original',()=>{
  const s=state();s.recoveryPrompts.grok.prompt='\n'+prompt;
  const field={value:prompt};
  const button={dataset:{copyPromptProvider:'grok',copyPromptPhase:'summary'},closest:()=>({querySelector:()=>field})};
  restoreOriginalPromptFields({querySelectorAll:()=>[button]},s);
  assert.equal(field.value,'\n'+prompt);
});
