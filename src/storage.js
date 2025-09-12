// Simple localStorage wrapper with optional TTL (days)
// Values are stored as JSON: { v: any, e: epochMs|null }

function toRecord(value, daysToExpire) {
  let e = null
  if (typeof daysToExpire === 'number' && isFinite(daysToExpire) && daysToExpire > 0) {
    e = Date.now() + daysToExpire * 24 * 60 * 60 * 1000
  }
  return { v: value, e }
}

export function setItem(key, value, daysToExpire) {
  try {
    const rec = toRecord(value, daysToExpire)
    localStorage.setItem(key, JSON.stringify(rec))
  } catch {}
}

export function getItem(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return null
    // handle legacy plain values
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object' && 'v' in obj) {
        if (obj.e && Date.now() > Number(obj.e)) {
          try { localStorage.removeItem(key) } catch {}
          return null
        }
        return obj.v
      }
      return obj
    } catch {
      return raw
    }
  } catch {
    return null
  }
}

export function removeItem(key) {
  try { localStorage.removeItem(key) } catch {}
}

