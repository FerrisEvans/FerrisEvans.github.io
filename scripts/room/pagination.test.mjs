import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/content.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {pageInfo}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('empty and one-page catalogues have no enabled pagination',()=>{
  for(const count of [0,1,5])assert.deepEqual(pageInfo(count,10),{page:0,pages:1,previous:false,next:false});
});
test('partial last pages clamp navigation consistently for Canvas and native controls',()=>{
  assert.deepEqual(pageInfo(12,0),{page:0,pages:3,previous:false,next:true});
  assert.deepEqual(pageInfo(12,1),{page:1,pages:3,previous:true,next:true});
  assert.deepEqual(pageInfo(12,99),{page:2,pages:3,previous:true,next:false});
  for(const value of [-5,NaN,Infinity])assert.equal(pageInfo(12,value).page,0);
});
