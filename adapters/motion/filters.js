export function shotFilters(spec) {
  const filters = []; let previous = '0:v';
  spec.layers.forEach((layer, i) => {
    filters.push(`[${i + 1}:v]scale=${layer.width}:-1,format=rgba[layer${i}]`);
    const x = `${layer.x}+${layer.dx ?? 0}*t/${spec.durationSeconds}`;
    const y = `${layer.y}+${layer.dy ?? 0}*t/${spec.durationSeconds}+${layer.bob ?? 0}*sin(2*PI*t)`;
    filters.push(`[${previous}][layer${i}]overlay=x='${x}':y='${y}':eval=frame:shortest=1[scene${i}]`); previous = `scene${i}`;
  });
  filters.push(`[${previous}]format=yuv420p[out]`); return filters.join(';');
}
export function assemblyFilters(spec) {
  const filters = [];
  spec.shots.forEach((shot, i) => filters.push(`[${i}:v]scale=${spec.width}:${spec.height},fps=${spec.fps},trim=duration=${shot.durationSeconds},setpts=PTS-STARTPTS[v${i}]`));
  filters.push(spec.shots.map((_, i) => `[v${i}]`).join('') + `concat=n=${spec.shots.length}:v=1:a=0[out]`);
  spec.audio.forEach((a, i) => filters.push(`[${spec.shots.length + i}:a]volume=${a.gain ?? 1},adelay=${Math.round((a.startSeconds ?? 0) * 1000)}:all=1[a${i}]`));
  if (spec.audio.length) filters.push(spec.audio.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${spec.audio.length}:normalize=0,apad[audio]`);
  return filters.join(';');
}
