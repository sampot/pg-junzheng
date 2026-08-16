const EFFECTS = Object.freeze({
  click: "./assets/audio/click.ogg",
  drum: "./assets/audio/drum.ogg",
  battle: "./assets/audio/battle.ogg",
  victory: "./assets/audio/victory.ogg",
});

export class WarAudio {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.music = new Audio("./assets/audio/war-camp-loop.ogg");
    this.music.loop = true;
    this.music.volume = 0.19;
    this.effects = Object.fromEntries(
      Object.entries(EFFECTS).map(([name, path]) => {
        const effect = new Audio(path);
        effect.volume = name === "battle" ? 0.5 : 0.38;
        return [name, effect];
      }),
    );
  }

  async start() {
    this.started = true;
    if (!this.enabled) return;
    try {
      await this.music.play();
    } catch {
      // A later explicit interaction can retry if autoplay is unavailable.
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.music.pause();
    else if (this.started) void this.start();
  }

  play(name) {
    const effect = this.effects[name];
    if (!this.enabled || !effect) return;
    effect.currentTime = 0;
    void effect.play().catch(() => {});
  }
}
