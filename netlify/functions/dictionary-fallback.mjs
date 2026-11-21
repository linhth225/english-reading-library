import { forms } from './dictionary-free.mjs';

const API = 'https://api.mymemory.translated.net/get';
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function usefulVietnamese(value, word) {
  const result = String(value || '').replace(/\s+/g, ' ').trim();
  if (!result || result.length > 170) return '';
  if (result.toLowerCase() === word.toLowerCase()) return '';
  if (/<[^>]+>|&(?:lt|gt|amp|quot);/i.test(result)) return '';
  if (/^(?:no translation|not found|error|sorry|my memory|undefined|null)/i.test(result)) return '';
  // Reject English-only responses and other obvious non-Vietnamese failures.
  // This is deliberately conservative; passing the check does NOT prove semantic accuracy.
  if (!/[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(result)
      && /^[a-z\s\-'.]+$/i.test(result) && result.split(/\s+/).length > 1) return '';
  return result;
}

async function translate(word) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    const url = `${API}?q=${encodeURIComponent(word)}&langpair=en%7Cvi`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return '';
    const data = await response.json();
    if (data.responseStatus && Number(data.responseStatus) !== 200) return '';
    return usefulVietnamese(data.responseData?.translatedText, word);
  } catch (error) {
    console.warn('MyMemory fallback unavailable:', error?.message || error);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(request.url);
  const word = String(url.searchParams.get('word') || '').trim();
  if (!/^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(word) || word.length > 60) {
    return json({ error: 'Invalid word' }, 400);
  }

  // MyMemory is an uncontrolled machine/translation-memory source.
  // We never present its output as a verified dictionary definition.
  // The canonical dictionary has already been checked by dictionary-free.
  // For variants, try a plausible lemma first if available; otherwise try the clicked spelling.
  const candidates = forms(word).filter(item => item.lemma !== word.toLowerCase());
  const candidatesToTry = [...new Set([
    ...(candidates.length === 1 ? [candidates[0].lemma] : []),
    word.toLowerCase()
  ])].slice(0, 2);

  for (const candidate of candidatesToTry) {
    const translation = await translate(candidate);
    if (translation) {
      return json({
        ok: true,
        word,
        queried_form: candidate,
        meaning_vi: translation,
        source: 'mymemory',
        confidence: 'unverified_machine_translation'
      });
    }
  }
  return json({ ok: false, word, meaning_vi: '', source: 'none' });
}
