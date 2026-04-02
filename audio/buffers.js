export function makeNoiseBuffer(ctx, secs) {
  const size = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function makeBrownNoiseBuffer(ctx, secs) {
  const size = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < size; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5; // normalize to audible range
  }
  return buf;
}
