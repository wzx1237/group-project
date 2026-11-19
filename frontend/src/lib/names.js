function nameParts(name = '') {
  const trimmed = name.trim()
  const comma = trimmed.indexOf(',')
  if (comma >= 0) return [trimmed.slice(0, comma).trim(), trimmed.slice(comma + 1).trim()]
  const words = trimmed.split(/\s+/)
  return [words.at(-1), words.slice(0, -1).join(' ')]
}

const compare = (x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' })

export function byLastName(a, b) {
  const [aLast, aFirst] = nameParts(a.name ?? '')
  const [bLast, bFirst] = nameParts(b.name ?? '')
  return compare(aLast, bLast) || compare(aFirst, bFirst) || compare(a.uid, b.uid)
}
