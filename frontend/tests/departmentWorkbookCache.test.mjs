import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { IDBFactory } from 'fake-indexeddb'

const source = readFileSync(new URL('../src/services/departmentWorkbookCache.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText
function cache(indexedDB) {
  const context = { exports: {}, Blob, indexedDB, setTimeout, clearTimeout }
  vm.runInNewContext(compiled, context)
  return context.exports
}

test('IndexedDB stores binary files across cache-module reloads', async () => {
  const indexedDB = new IDBFactory()
  const first = cache(indexedDB)
  const key = first.workbookFileCacheKey('account1', 'workbook.xlsx', 'generation1')
  await first.writeWorkbookFileCache(key, new Blob(['binary file']))
  const reopened = cache(indexedDB)
  assert.equal(await (await reopened.readWorkbookFileCache(key)).text(), 'binary file')
  assert.equal(await reopened.readWorkbookFileCache(reopened.workbookFileCacheKey('account2', 'workbook.xlsx', 'generation1')), null)
  assert.equal(await reopened.readWorkbookFileCache(reopened.workbookFileCacheKey('account1', 'workbook.xlsx', 'generation2')), null)
})

test('missing or disabled IndexedDB falls back to memory without failing', async () => {
  for (const database of [undefined, { open() { throw new Error('Storage disabled') } }]) {
    const current = cache(database)
    await current.writeWorkbookFileCache('file', new Blob(['cached']))
    assert.equal(await (await current.readWorkbookFileCache('file')).text(), 'cached')
    assert.equal(await current.readWorkbookFileCache('missing'), null)
  }
})

test('cache misses and overwrites return the correct saved blob', async () => {
  const indexedDB = new IDBFactory()
  const current = cache(indexedDB)
  assert.equal(await current.readWorkbookFileCache('file'), null)
  await current.writeWorkbookFileCache('file', new Blob(['first']))
  await current.writeWorkbookFileCache('file', new Blob(['updated']))
  const reopened = cache(indexedDB)
  assert.equal(await (await reopened.readWorkbookFileCache('file')).text(), 'updated')
})

test('explicit invalidation removes both memory and persistent copies', async () => {
  const indexedDB = new IDBFactory()
  const current = cache(indexedDB)
  await current.writeWorkbookFileCache('file', new Blob(['saved workbook']))
  await current.deleteWorkbookFileCache('file')
  assert.equal(await current.readWorkbookFileCache('file'), null)
  assert.equal(await cache(indexedDB).readWorkbookFileCache('file'), null)
})
