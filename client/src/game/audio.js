export let audioCtx = null;
export let audioEnabled = false;
export let bgmNodes = [];
export function stopBGM() {
    for (const node of bgmNodes) {
        if (node instanceof OscillatorNode) {
            try {
                node.stop();
            }
            catch (e) { }
        }
        node.disconnect();
    }
    bgmNodes = [];
}
export function playBGM(level) {
    stopBGM();
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    // Ambient waves (noise)
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds of noise
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        out[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 400; // ocean rumble
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.05;
    // Wave LFO
    const waveLfo = audioCtx.createOscillator();
    waveLfo.type = "sine";
    waveLfo.frequency.value = 0.2; // 5 sec per wave
    const waveLfoGain = audioCtx.createGain();
    waveLfoGain.gain.value = 300;
    waveLfo.connect(waveLfoGain);
    waveLfoGain.connect(noiseFilter.frequency);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseSrc.start(time);
    waveLfo.start(time);
    bgmNodes.push(noiseSrc, noiseFilter, noiseGain, waveLfo, waveLfoGain);
    let frequencies = [];
    if (level === 1)
        frequencies = [261.63, 329.63, 392.00]; // C Major
    else if (level === 2)
        frequencies = [196.00, 233.08, 293.66]; // G Minor
    else if (level === 3)
        frequencies = [146.83, 174.61, 220.00]; // D Minor
    else if (level === 4)
        frequencies = [174.61, 207.65, 261.63]; // F Minor
    else
        frequencies = [130.81, 155.56, 185.00]; // C diminish/minor for kraken
    frequencies.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        // Deeper tone for higher levels
        osc.type = level >= 4 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, time);
        // Slow volume LFO for each note to make it ambient
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.1 + (idx * 0.05); // slightly different rates
        const lfoGain = audioCtx.createGain();
        const baseVol = level === 5 ? 0.08 : 0.05;
        lfoGain.gain.value = baseVol;
        // To modulate volume we need lfo to go 0 to baseVol, so we offset
        lfo.connect(lfoGain);
        // Gain needs a base value to be modulated
        gain.gain.value = baseVol;
        lfoGain.connect(gain.gain);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(time);
        lfo.start(time);
        bgmNodes.push(osc, gain, lfo, lfoGain);
    });
}
export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    audioEnabled = true;
}
function playTone(freq, type, dur, vol = 0.1) {
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + dur);
}
export function playCatchSound() {
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.exponentialRampToValueAtTime(1200, time + 0.1);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.1);
}
export function playHurtSound() {
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.2);
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.2);
}
export function playHoverSound() {
    playTone(400, "sine", 0.1, 0.05);
}
export function playClickSound() {
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.linearRampToValueAtTime(1000, time + 0.05);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
}
export function playPortalSound() {
    if (!audioCtx || !audioEnabled)
        return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, time);
    osc.frequency.linearRampToValueAtTime(800, time + 0.5);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.5);
}
