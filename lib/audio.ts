let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

export function warmAudio(): void {
  try {
    context();
  } catch {
    audioContext = null;
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  peak: number,
): void {
  const ctx = context();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration + 0.02);
}

export function playTick(): void {
  try {
    tone(740, 0.035, "square", 0.018);
  } catch {
    audioContext = null;
  }
}

export function playLand(): void {
  try {
    tone(196, 0.22, "triangle", 0.05);
  } catch {
    audioContext = null;
  }
}
