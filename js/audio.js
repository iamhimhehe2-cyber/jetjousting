// Procedural Web Audio API Sound Generator for Joust Royale
// Synthesizes all sounds dynamically to avoid external asset loading errors.

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.windNode = null;
        this.windFilter = null;
        this.windGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        try {
            // Create audio context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            
            // Create master volume
            this.masterVolume = this.ctx.createGain();
            this.masterVolume.gain.setValueAtTime(0.5, this.ctx.currentTime);
            this.masterVolume.connect(this.ctx.destination);

            // Set up continuous wind/speed swoosh
            this.setupWindNode();

            this.initialized = true;
            console.log("Web Audio API Initialized Successfully.");
        } catch (e) {
            console.warn("Failed to initialize Web Audio API:", e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setupWindNode() {
        if (!this.ctx) return;

        // Create white noise source for wind
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;

        // Bandpass filter to isolate wind-like frequencies
        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);
        this.windFilter.frequency.setValueAtTime(200, this.ctx.currentTime);

        // Wind volume control
        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

        // Connect graph
        noiseNode.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterVolume);

        // Start playing loop
        noiseNode.start();
        this.windNode = noiseNode;
    }

    /**
     * Updates the continuous wind speed swoosh based on player speed.
     * @param {number} speedRatio Normalized speed (0 to 1)
     */
    updateWind(speedRatio) {
        if (!this.initialized || !this.windGain || !this.windFilter) return;
        this.resume();

        const targetGain = Math.max(0, (speedRatio - 0.3) * 0.4); // Only hear wind when moving faster than 30%
        const targetFreq = 150 + speedRatio * 800; // Frequency sweeps up with speed

        // Smooth parameter transitions
        this.windGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
        this.windFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
    }

    /**
     * Synthesizes a single hoofbeat step.
     * @param {number} volume Volume scaler (0 to 1)
     */
    playHoofbeat(volume = 0.5) {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        
        // 1. Heavy thud (Low Frequency Sine Sweep)
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);

        oscGain.gain.setValueAtTime(volume * 0.4, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

        // 2. Dirt crunch (Low-pass filtered noise)
        const noiseSize = 0.05 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, t);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.6, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

        // Connect nodes
        osc.connect(oscGain);
        oscGain.connect(this.masterVolume);

        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterVolume);

        // Start and stop
        osc.start(t);
        osc.stop(t + 0.09);
        noiseNode.start(t);
        noiseNode.stop(t + 0.07);
    }

    /**
     * Synthesizes a metallic lance impact sound.
     * @param {number} damage Damage amount (scales volume and pitch ring)
     */
    playClash(damage = 20) {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        const intensity = Math.min(1.5, Math.max(0.2, damage / 50));
        
        // 1. High metal ring (Sine oscillators at bell frequencies)
        const freqs = [880, 1200, 1600, 2200];
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * (1 + (Math.random() * 0.05)), t);
            
            // Decays quickly, higher freqs decay faster
            const duration = (0.2 + intensity * 0.3) / (idx + 1);
            gainNode.gain.setValueAtTime(0.12 * intensity, t);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);
            
            osc.connect(gainNode);
            gainNode.connect(this.masterVolume);
            
            osc.start(t);
            osc.stop(t + duration + 0.05);
        });

        // 2. Sudden white noise burst for collision friction
        const noiseSize = 0.15 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1000, t);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4 * intensity, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterVolume);

        noiseNode.start(t);
        noiseNode.stop(t + 0.15);
    }

    /**
     * Synthesizes a horse whinny.
     */
    playWhinny() {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const fmOsc = this.ctx.createOscillator();
        const fmGain = this.ctx.createGain();
        const gainNode = this.ctx.createGain();

        // Modulator oscillator (frequency modulation for horse vibrato/tremolo)
        fmOsc.frequency.setValueAtTime(25, t); // High rate vibrato
        fmGain.gain.setValueAtTime(120, t);   // Amplitude of frequency wobble

        // Carrier oscillator
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, t);
        // Frequency sweep up and down
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.45);

        // Volume envelope
        gainNode.gain.setValueAtTime(0.01, t);
        gainNode.gain.linearRampToValueAtTime(0.12, t + 0.08);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        // Connect FM
        fmOsc.connect(fmGain);
        fmGain.connect(osc.frequency);

        // Connect Carrier
        osc.connect(gainNode);
        gainNode.connect(this.masterVolume);

        // Start
        fmOsc.start(t);
        osc.start(t);
        
        fmOsc.stop(t + 0.55);
        osc.stop(t + 0.55);
    }

    /**
     * Play knight grunting when hit
     */
    playGrunt() {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        
        // Low pitch band-pass filtered noise
        const noiseSize = 0.18 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(180, t);
        filter.Q.setValueAtTime(2.0, t);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.25, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterVolume);

        noiseNode.start(t);
        noiseNode.stop(t + 0.18);
    }

    /**
     * Sound played when triggering charge/boost
     */
    playBoost() {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(450, t + 0.3);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);

        gainNode.gain.setValueAtTime(0.18, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterVolume);

        osc.start(t);
        osc.stop(t + 0.5);
    }

    /**
     * Victory chime (major scale chord)
     */
    playVictory() {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (C Major Chord)
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t + idx * 0.08);

            gainNode.gain.setValueAtTime(0.01, t + idx * 0.08);
            gainNode.gain.linearRampToValueAtTime(0.1, t + idx * 0.08 + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.5);

            osc.connect(gainNode);
            gainNode.connect(this.masterVolume);

            osc.start(t + idx * 0.08);
            osc.stop(t + idx * 0.08 + 0.65);
        });
    }

    /**
     * Defeat jingle (descending minor slider)
     */
    playDefeat() {
        if (!this.initialized || !this.ctx) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t); // A3
        osc.frequency.linearRampToValueAtTime(146.83, t + 0.4); // D3 (heavy downer)

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t);

        gainNode.gain.setValueAtTime(0.18, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterVolume);

        osc.start(t);
        osc.stop(t + 0.7);
    }
}

// Export singleton audio engine
export const audio = new AudioEngine();
export default audio;
