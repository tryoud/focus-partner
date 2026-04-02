import { makeNoiseBuffer, makeBrownNoiseBuffer } from "./buffers.js";

// ── Shared audio helper functions ─────────────────────────────────────────────

/** Subtle high-frequency air layer so the EQ has full-spectrum content. */
export function addAir(ctx, master, nodes, vol = 0.012) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 4);
  src.loop = true;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 800;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(hpf);
  hpf.connect(g);
  g.connect(master);
  src.start();
  nodes.push(src);
}

/**
 * Isochronic amplitude modulation — carrier tones AM-modulated at beatHz.
 * Works without headphones (unlike binaural beats).
 */
export function mkIsochronic(ctx, master, nodes, beatHz, carrierFreqs) {
  const amGain = ctx.createGain();
  amGain.gain.value = 0;
  const dc = ctx.createConstantSource();
  dc.offset.value = 0.5;
  dc.connect(amGain.gain);
  dc.start();
  nodes.push(dc);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = beatHz;
  const lfoD = ctx.createGain();
  lfoD.gain.value = 0.5;
  lfo.connect(lfoD);
  lfoD.connect(amGain.gain);
  lfo.start();
  nodes.push(lfo);
  carrierFreqs.forEach(([freq, vol]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    osc.connect(g);
    g.connect(amGain);
    osc.start();
    nodes.push(osc);
  });
  amGain.connect(master);
}

/** Binaural beat pair — requires headphones to work. */
export function mkBinaural(ctx, master, nodes, baseFreq, beatHz) {
  const mk = (freq, pan) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const g = ctx.createGain();
    g.gain.value = 0.42;
    osc.connect(panner);
    panner.connect(g);
    g.connect(master);
    osc.start();
    nodes.push(osc);
  };
  mk(baseFreq, -1);
  mk(baseFreq + beatHz, 1);
}

// ── Individual sound type builders ───────────────────────────────────────────
// Each function wires nodes into `master` and pushes stoppable nodes into `nodes`.

export function createRainSound(ctx, master, nodes) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 4);
  src.loop = true;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 450;
  lpf.Q.value = 0.8;
  src.connect(lpf);
  lpf.connect(master);
  src.start();
  nodes.push(src);
  master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.5);
}

export function createNoiseSound(ctx, master, nodes) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 4);
  src.loop = true;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 250;
  src.connect(hpf);
  hpf.connect(master);
  src.start();
  nodes.push(src);
  master.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.5);
}

export function createBrownSound(ctx, master, nodes) {
  const src = ctx.createBufferSource();
  src.buffer = makeBrownNoiseBuffer(ctx, 6);
  src.loop = true;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 700;
  lpf.Q.value = 0.5;
  src.connect(lpf);
  lpf.connect(master);
  src.start();
  nodes.push(src);
  master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.5);
}

export function createOceanSound(ctx, master, nodes) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 8);
  src.loop = true;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 320;
  lpf.Q.value = 0.6;
  const waveGain = ctx.createGain();
  waveGain.gain.value = 0.5;
  src.connect(lpf);
  lpf.connect(waveGain);
  waveGain.connect(master);
  src.start();
  nodes.push(src);
  // LFO for wave swell
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.22;
  lfo.connect(lfoDepth);
  lfoDepth.connect(waveGain.gain);
  lfo.start();
  nodes.push(lfo);
  master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.5);
}

export function createNeuralSound(ctx, master, nodes) {
  // Alpha hybrid: binaural (headphones) + isochronic AM (without headphones)
  // Both at 10 Hz alpha — relaxed focus & learning
  mkBinaural(ctx, master, nodes, 200, 10);
  addAir(ctx, master, nodes, 0.010);
  mkIsochronic(ctx, master, nodes, 10, [[220, 0.025], [330, 0.018], [440, 0.012]]);
  [[220, 0.045], [330, 0.032], [440, 0.022], [550, 0.014], [660, 0.009]].forEach(([freq, vol], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + i * 0.013;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = vol * 0.4;
    const oscGain = ctx.createGain();
    oscGain.gain.value = vol;
    lfo.connect(lfoDepth);
    lfoDepth.connect(oscGain.gain);
    osc.connect(oscGain);
    oscGain.connect(master);
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.value = 1.5;
    filt.frequency.setValueAtTime(300 + i * 80, ctx.currentTime);
    filt.frequency.linearRampToValueAtTime(700 + i * 60, ctx.currentTime + 40);
    filt.frequency.linearRampToValueAtTime(300 + i * 80, ctx.currentTime + 80);
    oscGain.connect(filt);
    filt.connect(master);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2.5);
}

export function createBetaSound(ctx, master, nodes) {
  // Beta binaural (18 Hz) — active concentration, studying, problem solving
  mkBinaural(ctx, master, nodes, 200, 18);
  addAir(ctx, master, nodes, 0.014);
  [[250, 0.03], [375, 0.02], [500, 0.013]].forEach(([freq, vol], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.1 + i * 0.05;
    const ld = ctx.createGain();
    ld.gain.value = vol * 0.3;
    lfo.connect(ld);
    ld.connect(g.gain);
    osc.connect(g);
    g.connect(master);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2);
}

export function createThetaSound(ctx, master, nodes) {
  // Theta binaural (6 Hz) — creative flow state, meditation, deep relaxation
  mkBinaural(ctx, master, nodes, 200, 6);
  addAir(ctx, master, nodes, 0.010);
  [[180, 0.04], [270, 0.028], [360, 0.018], [540, 0.01]].forEach(([freq, vol], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.01;
    const ld = ctx.createGain();
    ld.gain.value = vol * 0.5;
    lfo.connect(ld);
    ld.connect(g.gain);
    osc.connect(g);
    g.connect(master);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  master.gain.linearRampToValueAtTime(0.17, ctx.currentTime + 3);
}

export function createFireSound(ctx, master, nodes) {
  // Campfire: brown noise base + bandpass crackle modulated by 4 offset LFOs
  const base = ctx.createBufferSource();
  base.buffer = makeBrownNoiseBuffer(ctx, 6);
  base.loop = true;
  const baseLpf = ctx.createBiquadFilter();
  baseLpf.type = "lowpass";
  baseLpf.frequency.value = 600;
  baseLpf.Q.value = 0.7;
  const baseGain = ctx.createGain();
  baseGain.gain.value = 0.18;
  base.connect(baseLpf);
  baseLpf.connect(baseGain);
  baseGain.connect(master);
  base.start();
  nodes.push(base);

  const crack = ctx.createBufferSource();
  crack.buffer = makeNoiseBuffer(ctx, 4);
  crack.loop = true;
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 1200;
  bpf.Q.value = 0.4;
  const crackGain = ctx.createGain();
  crackGain.gain.value = 0;
  crack.connect(bpf);
  bpf.connect(crackGain);
  crackGain.connect(master);
  crack.start();
  nodes.push(crack);

  const dc = ctx.createConstantSource();
  dc.offset.value = 0.08;
  dc.connect(crackGain.gain);
  dc.start();
  nodes.push(dc);

  [0.3, 0.7, 1.1, 1.7].forEach(hz => {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = hz;
    const ld = ctx.createGain();
    ld.gain.value = 0.045;
    lfo.connect(ld);
    ld.connect(crackGain.gain);
    lfo.start();
    nodes.push(lfo);
  });
  master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.8);
}

export function createWindSound(ctx, master, nodes) {
  // Wind: bandpass noise + 3 offset LFOs for gust variation
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 6);
  src.loop = true;
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 700;
  bpf.Q.value = 0.5;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  src.connect(bpf);
  bpf.connect(windGain);
  windGain.connect(master);
  src.start();
  nodes.push(src);

  const dc = ctx.createConstantSource();
  dc.offset.value = 0.35;
  dc.connect(windGain.gain);
  dc.start();
  nodes.push(dc);

  [[0.07, 0.15], [0.18, 0.08], [0.31, 0.04]].forEach(([hz, depth]) => {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = hz;
    const ld = ctx.createGain();
    ld.gain.value = depth;
    lfo.connect(ld);
    ld.connect(windGain.gain);
    lfo.start();
    nodes.push(lfo);
  });
  master.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 1.2);
}

export function createFocusPlusSound(ctx, master, nodes) {
  // Focus+ — isochronic Beta AM at 15 Hz (works without headphones)
  mkIsochronic(ctx, master, nodes, 15, [[200, 0.18], [300, 0.10], [400, 0.06], [500, 0.03]]);
  addAir(ctx, master, nodes, 0.014);
  master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.5);
}

export function createFlowSound(ctx, master, nodes) {
  // Flow State — isochronic at 12 Hz (alpha/beta border, effortless concentration)
  mkIsochronic(ctx, master, nodes, 12, [[220, 0.16], [330, 0.10], [440, 0.07], [550, 0.04]]);
  // Slow evolving pad underneath
  [[165, 0.03], [247, 0.02], [330, 0.015]].forEach(([freq, vol], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.04 + i * 0.01;
    const ld = ctx.createGain();
    ld.gain.value = vol * 0.4;
    lfo.connect(ld);
    ld.connect(g.gain);
    osc.connect(g);
    g.connect(master);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  addAir(ctx, master, nodes, 0.010);
  master.gain.linearRampToValueAtTime(0.20, ctx.currentTime + 2);
}

export function createDeltaSound(ctx, master, nodes) {
  // Delta — isochronic at 2.5 Hz (deep rest, sleep prep, recovery)
  mkIsochronic(ctx, master, nodes, 2.5, [[100, 0.20], [150, 0.12], [200, 0.07]]);
  // Warm brown noise bed for texture
  const src = ctx.createBufferSource();
  src.buffer = makeBrownNoiseBuffer(ctx, 6);
  src.loop = true;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 300;
  const ng = ctx.createGain();
  ng.gain.value = 0.12;
  src.connect(lpf);
  lpf.connect(ng);
  ng.connect(master);
  src.start();
  nodes.push(src);
  master.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 3);
}

/** Dispatch table: maps ambient type string → creator function. */
export const SOUND_CREATORS = {
  rain:       createRainSound,
  noise:      createNoiseSound,
  brown:      createBrownSound,
  ocean:      createOceanSound,
  neural:     createNeuralSound,
  beta:       createBetaSound,
  theta:      createThetaSound,
  fire:       createFireSound,
  wind:       createWindSound,
  focusPlus:  createFocusPlusSound,
  flow:       createFlowSound,
  delta:      createDeltaSound,
};
