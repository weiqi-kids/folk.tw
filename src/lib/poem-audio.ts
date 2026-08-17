/** Static audio path convention for generated poem narration files. */
export function poemAudioPath(sourceId: string, locale: string): string {
  return `/audio/poems/${encodeURIComponent(sourceId)}-${encodeURIComponent(locale)}.mp3`;
}
