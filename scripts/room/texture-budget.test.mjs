import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/texture-budget.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {textureBytes}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('texture budgets include every mip, and video/raw half-float targets remain unmipped',()=>{
  assert.equal(textureBytes(4096,4096),89478484);
  assert.equal(textureBytes(4,2),44,'4×2, 2×1 and 1×1 RGBA8');
  assert.equal(textureBytes(960,720,4,false),2764800);
  assert.equal(textureBytes(1440,900,8,false),10368000);
  assert.equal(textureBytes(0,720),0);assert.equal(textureBytes(NaN,720),0);
});
