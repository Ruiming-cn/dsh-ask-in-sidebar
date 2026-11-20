import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

test('package metadata matches the DSH plugin contract', () => {
  assert.equal(pkg.version, '0.3.0')
  assert.equal(pkg.license, 'MIT')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh?.client?.platform, 'web')
  assert.ok(pkg.dsh?.bundle?.patch)
  assert.ok(!pkg.files.includes('dsh.plugin.json'))
  assert.equal(pkg.exports?.['.']?.types, './lib/index.d.ts')
  assert.equal(pkg.exports?.['./client']?.types, './lib/client.d.ts')
  assert.ok(pkg.exports?.['./client']?.default)
  assert.equal(pkg.exports?.['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.exports?.['./icon'], './icon.svg')
  assert.ok(pkg.files.includes('locale/*.json'))
  assert.ok(pkg.files.includes('icon.svg'))
})

test('display metadata resources declare a title and description', () => {
  for (const locale of ['en', 'zh']) {
    const meta = JSON.parse(readFileSync(path.join(root, 'locale', `${locale}.json`), 'utf8'))
    assert.equal(typeof meta.meta?.title, 'string', `${locale} title`)
    assert.ok(meta.meta.title.length > 0, `${locale} title is not empty`)
    assert.equal(typeof meta.meta?.description, 'string', `${locale} description`)
    assert.ok(meta.meta.description.length > 0, `${locale} description is not empty`)
    assert.equal(meta.meta.detail, undefined, `${locale} has no detail document`)
  }
  assert.match(readFileSync(path.join(root, 'icon.svg'), 'utf8'), /^<svg[\s>]/)
})

test('source uses Connection trust checks and declared slot injection', () => {
  const host = readFileSync(path.join(root, 'src', 'index.js'), 'utf8')
  const client = readFileSync(path.join(root, 'src', 'client.js'), 'utf8')
  assert.match(host, /requestRejection\(req\)/)
  assert.match(client, /slots\.inject\('shell\.overlay'/)
  assert.doesNotMatch(client, /ctx\.reflect/)
})

