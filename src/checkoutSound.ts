// A short original cash-register sound, generated locally without an audio download.
let audio: AudioContext | null = null;
let registerSound: AudioBuffer | null = null;
let playing: AudioBufferSourceNode | null = null;

function createRegisterSound(context: AudioContext) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .72), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 173;
  for (let index = 0; index < samples.length; index++) {
    const time = index / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    let value = 0;
    for (const onset of [0, .065]) {
      const t = time - onset;
      if (t >= 0 && t < .055) value += .15 * noise * Math.exp(-t * 95) * Math.min(t / .002, 1);
    }
    for (const [onset, frequency, volume] of [[.105, 1568, .23], [.17, 2093, .22]]) {
      const t = time - onset;
      if (t < 0) continue;
      const bell = Math.sin(2 * Math.PI * frequency * t)
        + .3 * Math.sin(2 * Math.PI * frequency * 2.76 * t) * Math.exp(-t * 15)
        + .15 * Math.sin(2 * Math.PI * frequency * 4.07 * t) * Math.exp(-t * 25);
      value += volume * bell * Math.exp(-t * 11) * Math.min(t / .003, 1);
    }
    samples[index] = value * 1.5 * Math.min((.72 - time) / .04, 1);
  }
  return buffer;
}

/** Called during a tap/click/key press so iPad can unlock sound before the API responds. */
export function unlockCheckoutSound() {
  try {
    if (!audio || audio.state === 'closed' || (audio.state as string) === 'interrupted') {
      const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
      playing = null;
      audio = new Constructor();
      registerSound = createRegisterSound(audio);
      // A silent one-frame source also primes older Safari versions during the gesture.
      const silent = audio.createBufferSource();
      silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
      silent.connect(audio.destination);
      silent.onended = () => silent.disconnect();
      silent.start();
    }
    if (audio.state !== 'running') void audio.resume().catch(() => {});
  } catch {
    // Sound is optional; unavailable devices must not interrupt checkout.
  }
}

export function listenForCheckoutSoundUnlock() {
  const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
  const unlock = (event: Event) => {
    if (!event.isTrusted) return;
    if (event instanceof KeyboardEvent && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) return;
    unlockCheckoutSound();
  };
  for (const event of events) document.addEventListener(event, unlock, { capture: true, passive: true });
  return () => { for (const event of events) document.removeEventListener(event, unlock, true); };
}

/** Play once at the successful transaction callback, never from a render/effect. */
export function playCheckoutSound() {
  try {
    if (!audio || audio.state !== 'running' || !registerSound) return;
    playing?.stop();
    const source = audio.createBufferSource();
    source.buffer = registerSound;
    source.connect(audio.destination);
    source.onended = () => {
      source.disconnect();
      if (playing === source) playing = null;
    };
    playing = source;
    source.start();
  } catch {
    // Completion feedback remains visible even when the browser blocks audio.
  }
}
