import type { Candidate, Provider, Track } from '../../shared/types';

export function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function coverage(needle: string, haystack: string) {
  const words = normalize(needle).split(' ').filter(Boolean);
  const found = new Set(normalize(haystack).split(' '));
  return words.length ? words.filter((word) => found.has(word)).length / words.length : 0;
}
export function rank(source: Track, candidates: Track[], destination: Provider): Candidate[] {
  return candidates.map((candidate) => {
    const text = `${candidate.title} ${candidate.artist}`;
    let score = coverage(source.title, text) * 60 + coverage(source.artist, text) * 25;
    if (destination === 'youtube' && /official (music )?video/i.test(candidate.title)) score += 15;
    for (const version of ['live', 'remix', 'cover', 'karaoke', 'acoustic', 'instrumental']) {
      if (normalize(text).split(' ').includes(version) && !normalize(`${source.title} ${source.artist}`).split(' ').includes(version)) score -= 25;
    }
    if (source.duration && candidate.duration) score -= Math.min(20, Math.abs(source.duration - candidate.duration) / 3000);
    return { ...candidate, score: Math.round(Math.max(0, Math.min(100, score))) };
  }).sort((a, b) => b.score - a.score);
}
export function splitVideoTitle(title: string, channel: string) {
  const cleaned = title.replace(/\s*[([].*?(official|video|audio|lyrics).*?[)\]]/gi, '').replace(/\s*\|.*$/, '').trim();
  const parts = cleaned.split(/\s+[-–—]\s+/);
  return parts.length > 1 ? { artist: parts[0], title: parts.slice(1).join(' - ') } : { artist: channel.replace(/\s*-\s*Topic$/i, ''), title: cleaned };
}
