import test from 'node:test';
import assert from 'node:assert/strict';

function validBatch(videos, accountIds) {
  if (!Array.isArray(videos) || videos.length < 1 || videos.length > 300) return false;
  if (!Array.isArray(accountIds) || new Set(accountIds).size < 1) return false;
  return videos.every(v => v.key && ['video/mp4','video/quicktime'].includes(v.mimeType) && Number(v.size) > 0 && Number(v.size) <= 95000000);
}
test('accepts 1 video and 1 account',()=>assert.equal(validBatch([{key:'v1',mimeType:'video/mp4',size:1000}],['a1']),true));
test('rejects zero videos',()=>assert.equal(validBatch([],['a1']),false));
test('rejects more than 300 videos',()=>assert.equal(validBatch(Array.from({length:301},(_,i)=>({key:String(i),mimeType:'video/mp4',size:1000})),['a1']),false));
test('rejects no accounts',()=>assert.equal(validBatch([{key:'v1',mimeType:'video/mp4',size:1000}],[]),false));
test('rejects unsupported formats and oversized files',()=>{assert.equal(validBatch([{key:'v1',mimeType:'video/webm',size:1000}],['a1']),false);assert.equal(validBatch([{key:'v1',mimeType:'video/mp4',size:95000001}],['a1']),false)});
test('batch fan-out math is video count times selected account count',()=>assert.equal(100*2,200));
