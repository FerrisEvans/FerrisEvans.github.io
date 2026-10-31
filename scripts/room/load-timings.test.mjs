import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../../src/scripts/room/load-timings.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createLoadTimings}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('parallel stages retain their own wall-clock intervals instead of being summed into load time',()=>{
  let now=100;
  const timings=createLoadTimings({now:()=>now});
  const atlas=timings.start('atlas.decode',{url:'/desk.webp'});
  now=110;const video=timings.start('video.ready');
  now=140;atlas();
  now=150;video();
  const result=timings.snapshot();
  assert.equal(result.startedAtMs,100);assert.equal(result.elapsedMs,50);
  assert.deepEqual(result.entries.map(({startMs,durationMs,outcome})=>[startMs,durationMs,outcome]),[[0,40,'ok'],[10,40,'ok']]);
});

test('failures, cancellations and unfinished stages stay distinct, and each stage ends once',()=>{
  let now=0;const timings=createLoadTimings({now:()=>now});
  const failed=timings.start('model.decompress'),aborted=timings.start('video.ready');
  timings.start('texture.queued');now=12;failed('error',{error:'bad gzip'});aborted('aborted');
  now=30;failed('ok');
  const entries=timings.snapshot().entries;
  assert.equal(entries[0].outcome,'error');assert.equal(entries[0].durationMs,12);
  assert.equal(entries[1].outcome,'aborted');assert.equal(entries[2].outcome,'pending');
  assert.equal(entries[2].durationMs,undefined);
});

test('bounded snapshots do not share mutable entries or metadata with the collector',()=>{
  const meta={url:'/a'},timings=createLoadTimings({now:()=>0,limit:2});
  timings.mark('asset.headers',meta);meta.url='/changed';
  const end=timings.start('asset.fetch');timings.mark('overflow');end('ok',{bytes:8});
  const first=timings.snapshot();first.entries[0].meta.url='/mutated';first.entries.pop();
  const second=timings.snapshot();
  assert.equal(second.entries.length,2);assert.equal(second.entries[0].meta.url,'/a');
  assert.equal(second.entries[1].meta.bytes,8);assert.equal(second.droppedEntries,1);
});
