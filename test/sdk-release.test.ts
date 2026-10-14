import { expect, test } from 'vitest'

const { inspectPackage, modeFromArgs, packageVersions, releaseReport } = await import(new URL('../scripts/sdk-release.mjs', import.meta.url).href)
const name = '@opentelemetry/sdk-trace'
const target = { [name]: '3.0.0', '@opentelemetry/api': '1.10.0', '@opentelemetry/sdk-node': '0.300.0' }
const published = {
  versions: {
    '3.0.0': {
      name,
      version: '3.0.0',
      engines: { node: '^22.15.0 || >=24.0.0' },
      peerDependencies: { '@opentelemetry/api': '^1.10.0' },
      dist: { integrity: 'sha512-evidence', tarball: 'https://registry.npmjs.org/sdk-trace.tgz' },
      gitHead: 'a'.repeat(40),
    },
  },
  time: { '3.0.0': '2026-10-15T12:00:00.000Z' },
  'dist-tags': { latest: '3.0.0-rc.0' },
}

test('final packages are the default, RC pins are explicit and mixed modes are refused', () => {
  expect(modeFromArgs([])).toBe('final')
  expect(packageVersions(target, 'final')).toEqual(target)
  expect(packageVersions(target, modeFromArgs(['--rc']))).toEqual({
    [name]: '3.0.0-rc.0', '@opentelemetry/api': '1.10.0-rc.0', '@opentelemetry/sdk-node': '0.300.0-rc.0',
  })
  expect(() => modeFromArgs(['--rc', '--final'])).toThrow()
  expect(() => packageVersions({ ...target, [name]: 'canary' }, 'final')).toThrow()
})

test('a latest tag or release candidate does not stand in for a missing final', () => {
  const rcOnly = { versions: { '3.0.0-rc.0': { ...published.versions['3.0.0'], version: '3.0.0-rc.0' } }, 'dist-tags': { latest: '3.0.0-rc.0' } }
  expect(inspectPackage(name, '3.0.0', rcOnly, 'final', 'npm').errors).toContain(`${name}@3.0.0 is absent from the registry`)
  const mislabeled = { ...published, versions: { '3.0.0': rcOnly.versions['3.0.0-rc.0'] } }
  expect(inspectPackage(name, '3.0.0', mislabeled, 'final', 'npm').errors).toContain('Prerelease manifest cannot satisfy the final gate')
})

test('the exact manifest preserves provenance and a partial report fails closed', () => {
  const pkg = inspectPackage(name, '3.0.0', published, 'final', 'npm')
  expect(pkg).toMatchObject({ errors: [], version: '3.0.0', engines: published.versions['3.0.0'].engines, peerDependencies: published.versions['3.0.0'].peerDependencies, integrity: 'sha512-evidence', gitHead: 'a'.repeat(40), publishedAt: published.time['3.0.0'] })
  expect(releaseReport('final', target, [pkg]).finalPackageGatePassed).toBe(false)
  const exact = releaseReport('final', { [name]: '3.0.0' }, [pkg])
  expect(exact.finalPackageGatePassed).toBe(true)
  expect(exact.finalReleaseApproved).toBe(false)
})

test('RC readiness cannot approve finals and missing publication provenance fails', () => {
  const rc = { versions: { '3.0.0-rc.0': { ...published.versions['3.0.0'], version: '3.0.0-rc.0' } }, time: { '3.0.0-rc.0': published.time['3.0.0'] } }
  const pkg = inspectPackage(name, '3.0.0-rc.0', rc, 'rc', 'npm')
  const report = releaseReport('rc', { [name]: '3.0.0-rc.0' }, [pkg])
  expect(report.packageMetadataPassed).toBe(true)
  expect(report.finalPackageGatePassed).toBe(false)
  expect(report.finalReleaseApproved).toBe(false)
  expect(releaseReport('final', { [name]: '3.0.0-rc.0' }, [pkg]).finalPackageGatePassed).toBe(false)
  expect(releaseReport('final', {}, []).finalPackageGatePassed).toBe(false)
  expect(inspectPackage(name, '3.0.0', { ...published, time: {} }, 'final', 'npm').errors).toContain('Publication time is missing or invalid')
})
