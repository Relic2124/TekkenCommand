/**
 * Tekken Notation PNGs 폴더 이미지 URL 맵 (빌드 시 정적 분석)
 */
const glob = import.meta.glob<string>('../Tekken Notation PNGs/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

const baseName = (path: string) => path.replace(/\.png$/i, '').replace(/^.*[/\\]/, '');

export const notationImageUrls: Record<string, string> = {};
for (const [path, url] of Object.entries(glob)) {
  notationImageUrls[baseName(path)] = url;
}

export function getNotationImageUrl(name: string): string | undefined {
  return notationImageUrls[name];
}
