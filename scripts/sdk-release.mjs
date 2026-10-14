import { prerelease, valid } from 'semver'

const FINAL_VERSIONS = new Set(['3.0.0', '0.300.0', '1.10.0'])

export function modeFromArgs(args) {
  if (args.includes('--rc') && args.includes('--final')) throw new Error('Choose --rc or --final, not both')
  return args.includes('--rc') ? 'rc' : 'final'
}

export function packageVersions(target3, mode) {
  if (!['rc', 'final'].includes(mode)) throw new Error(`Unknown package mode: ${mode}`)
  if (target3['@opentelemetry/api'] !== '1.10.0') throw new Error('SDK 3 requires API 1.10.0')
  return Object.fromEntries(Object.entries(target3).map(([name, version]) => {
    if (!FINAL_VERSIONS.has(version)) throw new Error(`Unexpected final dependency: ${name}@${version}`)
    return [name, mode === 'rc' ? `${version}-rc.0` : version]
  }))
}

// Read the exact version, never a dist-tag or a neighboring prerelease.
export function inspectPackage(name, expectedVersion, document, mode, source) {
  const manifest = document?.versions?.[expectedVersion]
  const errors = []
  if (!manifest) errors.push(`${name}@${expectedVersion} is absent from the registry`)
  else {
    if (manifest.name !== name || manifest.version !== expectedVersion) errors.push('Registry manifest name or version does not match the request')
    if (!valid(manifest.version)) errors.push('Registry manifest version is not valid semver')
    else if (mode === 'final' && prerelease(manifest.version) !== null) errors.push('Prerelease manifest cannot satisfy the final gate')
    if (!manifest.dist?.integrity || !manifest.dist?.tarball) errors.push('Published package integrity or tarball is missing')
    if (!document.time?.[expectedVersion] || !Number.isFinite(Date.parse(document.time[expectedVersion]))) errors.push('Publication time is missing or invalid')
  }
  return {
    name,
    expectedVersion,
    version: manifest?.version ?? null,
    engines: manifest?.engines ?? {},
    dependencies: manifest?.dependencies ?? {},
    peerDependencies: manifest?.peerDependencies ?? {},
    peerDependenciesMeta: manifest?.peerDependenciesMeta ?? {},
    integrity: manifest?.dist?.integrity ?? null,
    tarball: manifest?.dist?.tarball ?? null,
    gitHead: manifest?.gitHead ?? null,
    publishedAt: document?.time?.[expectedVersion] ?? null,
    source,
    errors,
  }
}

export function releaseReport(mode, expectedVersions, packages, capturedAt = new Date().toISOString()) {
  const errors = []
  if (!['rc', 'final'].includes(mode)) errors.push(`Unknown package mode: ${mode}`)
  if (Object.keys(expectedVersions).length === 0) errors.push('The expected dependency map is empty')
  for (const [name, version] of Object.entries(expectedVersions)) {
    const final = mode === 'rc' ? version.replace(/-rc\.0$/, '') : version
    if (!FINAL_VERSIONS.has(final) || (mode === 'rc' && version !== `${final}-rc.0`)) errors.push(`Version is not an exact ${mode} target: ${name}@${version}`)
  }
  if (packages.length !== Object.keys(expectedVersions).length) errors.push('The report does not cover the complete dependency map')
  const seen = new Set()
  for (const pkg of packages) {
    if (seen.has(pkg.name)) errors.push(`Duplicate package: ${pkg.name}`)
    seen.add(pkg.name)
    if (expectedVersions[pkg.name] !== pkg.expectedVersion) errors.push(`Unexpected package or version: ${pkg.name}@${pkg.expectedVersion}`)
    errors.push(...pkg.errors.map((error) => `${pkg.name}: ${error}`))
  }
  for (const name of Object.keys(expectedVersions)) if (!seen.has(name)) errors.push(`Missing package: ${name}`)
  const passed = errors.length === 0
  return {
    schema: 1,
    mode,
    capturedAt,
    registry: 'https://registry.npmjs.org',
    expectedVersions,
    expectedPackages: Object.keys(expectedVersions).length,
    verifiedPackages: packages.filter((pkg) => pkg.errors.length === 0).length,
    packageMetadataPassed: passed,
    finalPackageGatePassed: mode === 'final' && passed,
    finalReleaseApproved: false,
    limitation: mode === 'rc'
      ? 'Pinned release-candidate readiness only. This report cannot approve a final release.'
      : 'Package metadata only. Strict compatibility, packed CLI checks and a Reviewer pass are also required.',
    packages,
    errors,
  }
}
