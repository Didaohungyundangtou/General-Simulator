/*
 * audio.js — 无素材程序化音景
 * 火车行进、站台风声、爆炸、枪声、翻页，全部由 Web Audio 合成。
 */
(function () {
  'use strict';

  class Soundscape {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.scene = null;
      this.ambient = null;
      this._noise = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.72 : 0;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
        return false;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }

    setEnabled(on) {
      this.enabled = !!on;
      if (!this.ctx) {
        if (on) this.init();
        return;
      }
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.enabled ? 0.72 : 0.0001, t, 0.06);
      if (!this.enabled) {
        this._stopAmbient();
      } else if (this.scene) {
        this.setScene(this.scene);
      }
    }

    setScene(scene) {
      this.scene = scene;
      if (!this.ctx || !this.enabled) return;
      this._stopAmbient();
      if (scene === 'train') this._trainAmbient();
      else if (scene === 'station') this._stationAmbient();
      else if (scene === 'road') this._roadAmbient();
    }

    _buffer() {
      if (this._noise) return this._noise;
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 2.2);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.018 * white) / 1.018;
        data[i] = last * 3.2;
      }
      this._noise = buffer;
      return buffer;
    }

    _loopNoise({ type = 'lowpass', freq = 300, q = 0.8, gain = 0.04, rate = 1 } = {}) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer();
      src.loop = true;
      src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter).connect(g).connect(this.master);
      src.start();
      return { src, filter, gain: g };
    }

    _lowHum(freq = 48, gain = 0.018) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 140;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(filter).connect(g).connect(this.master);
      osc.start();
      return { src: osc, filter, gain: g };
    }

    _trainAmbient() {
      const rumble = this._loopNoise({ freq: 260, gain: 0.05, rate: 0.85 });
      const hum = this._lowHum(46, 0.02);
      const clack = () => {
        if (!this.enabled || !this.ctx) return;
        this._clack(0.85);
        this._clack(0.6, 0.14);
      };
      clack();
      let alive = true;
      const tick = () => {
        if (!alive) return;
        clack();
        this.ambient.timer = window.setTimeout(tick, 760 + Math.random() * 160);
      };
      this.ambient = {
        nodes: [rumble, hum],
        timer: window.setTimeout(tick, 800),
        stop: () => { alive = false; }
      };
    }

    _stationAmbient() {
      const wind = this._loopNoise({ freq: 420, gain: 0.038, rate: 0.65 });
      const rumble = this._lowHum(38, 0.01);
      let alive = true;
      const tick = () => {
        if (!alive) return;
        this._clack(0.35, 0, 0.55);
        this.ambient.timer = window.setTimeout(tick, 2900 + Math.random() * 2600);
      };
      this.ambient = {
        nodes: [wind, rumble],
        timer: window.setTimeout(tick, 1800),
        stop: () => { alive = false; }
      };
    }

    _roadAmbient() {
      const wind = this._loopNoise({ freq: 520, gain: 0.034, rate: 0.7 });
      const engine = this._lowHum(57, 0.024);
      this.ambient = {
        nodes: [wind, engine],
        timer: null,
        stop: () => {}
      };
    }

    _stopAmbient() {
      if (!this.ambient) return;
      const a = this.ambient;
      this.ambient = null;
      if (a.timer) window.clearTimeout(a.timer);
      if (a.stop) a.stop();
      const t = this.ctx ? this.ctx.currentTime : 0;
      (a.nodes || []).forEach((n) => {
        try {
          n.gain.gain.cancelScheduledValues(t);
          n.gain.gain.setTargetAtTime(0.0001, t, 0.08);
        } catch (e) { /* noop */ }
      });
      window.setTimeout(() => {
        (a.nodes || []).forEach((n) => {
          try { n.src.stop(); } catch (e) { /* noop */ }
          try { n.src.disconnect(); n.filter.disconnect(); n.gain.disconnect(); } catch (e) { /* noop */ }
        });
      }, 500);
    }

    _clack(volume = 0.7, offset = 0, rate = 1) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime + offset;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer();
      src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1050;
      filter.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.045 * volume, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      src.connect(filter).connect(g).connect(this.master);
      src.start(now);
      src.stop(now + 0.12);
    }

    _noiseBurst({ dur = 0.3, gain = 0.2, type = 'lowpass', from = 1200, to = 150, q = 0.8 } = {}) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer();
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(from, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(to, 30), now + dur);
      filter.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    _tone({ freq = 220, dur = 0.2, gain = 0.03, type = 'sine', slide = 0, delay = 0 } = {}) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    click() {
      this._tone({ freq: 620, dur: 0.045, gain: 0.018, type: 'sine', slide: -220 });
    }

    choice() {
      this._tone({ freq: 176, dur: 0.13, gain: 0.05, type: 'triangle', slide: -40 });
      this._tone({ freq: 420, dur: 0.06, gain: 0.02, type: 'sine', slide: -80, delay: 0.02 });
    }

    page() {
      this._noiseBurst({ dur: 0.18, gain: 0.055, type: 'highpass', from: 1600, to: 700, q: 0.6 });
    }

    explosion() {
      this._noiseBurst({ dur: 1.35, gain: 0.5, type: 'lowpass', from: 900, to: 55, q: 0.7 });
      this._tone({ freq: 58, dur: 1.1, gain: 0.16, type: 'sine', slide: -26 });
      this._tone({ freq: 120, dur: 0.3, gain: 0.08, type: 'sawtooth', slide: -70 });
      this._noiseBurst({ dur: 0.3, gain: 0.16, type: 'highpass', from: 2200, to: 500, q: 0.5 });
    }

    gunshot() {
      this._noiseBurst({ dur: 0.22, gain: 0.34, type: 'highpass', from: 1800, to: 300, q: 0.6 });
      this._tone({ freq: 95, dur: 0.2, gain: 0.09, type: 'square', slide: -50 });
      window.setTimeout(() => this._noiseBurst({ dur: 0.18, gain: 0.22, type: 'highpass', from: 1400, to: 260, q: 0.6 }), 140);
    }

    chime() {
      this._tone({ freq: 146.8, dur: 1.6, gain: 0.055, type: 'sine' });
      this._tone({ freq: 220, dur: 1.4, gain: 0.03, type: 'sine', delay: 0.08 });
      this._tone({ freq: 293.7, dur: 1.2, gain: 0.018, type: 'sine', delay: 0.16 });
    }

    endingSound(name) {
      if (name === 'gunshot') this.gunshot();
      else if (name === 'explosion') this.explosion();
      else this.chime();
    }
  }

  window.Soundscape = new Soundscape();
})();
