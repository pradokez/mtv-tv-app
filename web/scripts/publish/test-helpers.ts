// Shared by the publish tests.

/** A valid catalog with `channels` channels of `perChannel` videos each. */
export function fakeCatalog(channels: number, perChannel: number): string {
  const videos: Record<string, { durationSec: number }> = {};
  const list = Array.from({ length: channels }, (_, c) => {
    const videoIds = Array.from({ length: perChannel }, (_, v) => `c${c}v${v}`);
    for (const id of videoIds) videos[id] = { durationSec: 200 };
    return { id: `c${c}`, name: `Canal ${c}`, icon: "📺", order: c, videoIds };
  });
  return JSON.stringify({ schemaVersion: 1, channels: list, videos });
}
