// Copy src/ runtime files into lib/ so the package is injectable/installable
// without a TypeScript build pipeline (src remains the readable source).
import { cpSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'src')
const lib = resolve(root, 'lib')

mkdirSync(lib, { recursive: true })
cpSync(src, lib, { recursive: true, force: true })
console.log('Built lib/ from src/')
