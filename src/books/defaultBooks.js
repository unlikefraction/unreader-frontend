import { getItem as storageGet, setItem as storageSet } from '../storage.js';

const LS_KEY = 'default:books';
const JSON_URL = '/epub/default-books.json';

function normalize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(Boolean)
    .map(b => ({
      id: String(b.id || '').trim(),
      google_books_id: (b.google_books_id ? String(b.google_books_id).trim() : ''),
      details: b.details || {},
      bookCover: b.bookCover || '',
      epubFile: b.epubFile || '',
    }))
    .filter(b => b.id);
}

export async function seedDefaultBooks() {
  try {
    const res = await fetch(JSON_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const fresh = await res.json().catch(() => []);
    const freshList = normalize(fresh);
    // No user state anymore; just store fresh list.
    storageSet(LS_KEY, freshList);
  } catch {}
}

export function getDefaultBooks() {
  const raw = storageGet(LS_KEY);
  return normalize(raw);
}

export function getDefaultBookById(id) {
  return getDefaultBooks().find(b => b.id === id) || null;
}
