import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

test('package metadata matches the Alpha.2 DSH plugin contract', () => {
  assert.equal(pkg.version, '0.2.0')
  assert.equal(pkg.license, 'MIT')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh?.client?.platform, 'web')
  assert.ok(pkg.dsh?.bundle?.patch)
  assert.ok(!pkg.files.includes('dsh.plugin.json'))
  assert.ok(pkg.exports?.['./client']?.default)
})

test('source uses Connection trust checks and declared slot injection', () => {
  const host = readFileSync(path.join(root, 'src', 'index.js'), 'utf8')
  const client = readFileSync(path.join(root, 'src', 'client.js'), 'utf8')
  assert.match(host, /requestRejection\(req\)/)
  assert.match(client, /slots\.inject\('shell\.overlay'/)
  assert.doesNotMatch(client, /ctx\.reflect/)
})
