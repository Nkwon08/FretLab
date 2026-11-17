// Capture PCM on the same sample clock used by timeline playback. No input monitoring.
class JamRecorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.start = Infinity; this.end = Infinity; this.channel = 0;
    this.port.onmessage = ({data}) => {
      if (data.type === 'start') { this.start = data.frame; this.channel = data.channel; }
      if (data.type === 'stop') { this.end = data.frame; }
    };
  }
  process(inputs) {
    const input = inputs[0];
    const size = input[0]?.length || 128;
    const from = Math.max(0, this.start - currentFrame);
    const to = Math.min(size, this.end - currentFrame);
    if (to > from) {
      const samples = input[this.channel]?.slice(from, to) || new Float32Array(to - from);
      this.port.postMessage({type: 'chunk', frame: currentFrame + from, samples}, [samples.buffer]);
    }
    if (currentFrame + size >= this.end) {
      this.port.postMessage({type: 'done'}); return false;
    }
    return true;
  }
}
registerProcessor('jam-recorder', JamRecorder);
