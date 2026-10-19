import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installerVariant, releaseInstallers, loadReleases, releaseNoteParts } from '../src/releases.mjs'
test('recognizes installer filenames and rejects unsupported packages', () => {
  assert.equal(installerVariant('Iterlay-0.1.56-arm64.dmg'), 'darwin-arm64')
  assert.equal(installerVariant('Iterlay-0.1.56-x64.dmg'), 'darwin-x64')
  assert.equal(installerVariant('Iterlay Setup 0.1.56.exe'), 'win32-x64')
  assert.equal(installerVariant('Iterlay-0.1.59-arm64.exe'), 'win32-arm64')
  assert.equal(installerVariant('Iterlay-0.1.59-x64.exe'), 'win32-x64')
  assert.equal(installerVariant('Iterlay-0.1.59-ia32.exe'), null)
  assert.equal(installerVariant('source.zip'), null)
})
test('omits drafts and missing platform assets', () => {
  const release = { draft: false, assets: [{ name: 'Iterlay-arm64.dmg' }] }
  assert.equal(releaseInstallers([release], 'darwin-arm64').length, 1)
  assert.equal(releaseInstallers([release], 'darwin-x64').length, 0)
  assert.equal(releaseInstallers([{ ...release, draft: true }], 'darwin-arm64').length, 0)
})
test('handles no releases and API failures', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => [] })
    assert.deepEqual(await loadReleases(), [])
    globalThis.fetch = async () => ({ ok: false })
    await assert.rejects(loadReleases(), /GitHub/)
  } finally { globalThis.fetch = original }
})
test('published issue references link to the same repository without changing original notes', () => {
  const body = 'Fixed export (#42). See https://github.com/other/repo/issues/7#issuecomment-123. Keep color#123 as text.'
  const parts = releaseNoteParts(body)
  assert.equal(parts.map(part => part.text).join(''), body)
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [
    'https://github.com/Davied-H/iterlay/issues/42',
    'https://github.com/other/repo/issues/7#issuecomment-123',
  ])
  assert.deepEqual(releaseNoteParts('Unreleased change, no issue reference.'), [{ text: 'Unreleased change, no issue reference.' }])
})
