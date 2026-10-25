import { VoiceInput } from './speech.js';

const captureErrors = {
  NotAllowedError: 'マイクの使用が許可されていません。アドレスバーのサイト設定でマイクを許可し、もう一度お試しください。',
  NotFoundError: 'マイクが見つかりません。接続と入力デバイスを確認してください。',
  NotReadableError: 'マイクを開けません。ほかのアプリでの使用状況や、入力デバイスを確認してください。',
  SecurityError: 'ブラウザーの設定でマイクが制限されています。サイト設定を確認してください。'
};

export class MicCheck {
  constructor({ mediaDevices, AudioContext, Recognition, requestFrame, cancelFrame, onUpdate, onLevel, levelTimeoutMs = 20000 }) {
    Object.assign(this, { mediaDevices, AudioContext, requestFrame, cancelFrame, onUpdate, onLevel, levelTimeoutMs });
    this.epoch = 0;
    this.state = this.initialState();
    this.voice = new VoiceInput({ Recognition,
      listeningMessage: '聞いています。「マイクのテストです」と話してください。',
      onStatus: (status, active) => this.update({ status, mode: active ? 'recognition' : 'idle' }),
      onInterim: interim => this.update({ interim }),
      onFinal: transcript => this.update({ transcript, interim: '', recognized: true, mode: 'idle',
        status: '認識結果を受け取りました。話した内容と合っているか確認してください。' })
    });
  }
  initialState() {
    return { permission: '未確認', device: '未確認', signal: false, recognized: false,
      transcript: '', interim: '', mode: 'idle', status: 'まずマイクの入力を確認し、そのあと日本語の聞き取りを試しましょう。' };
  }
  update(patch) { Object.assign(this.state, patch); this.onUpdate({ ...this.state }); }
  open() { this.stop(); this.state = this.initialState(); this.update({}); }
  stop(status) {
    this.epoch++;
    clearTimeout(this.levelTimer);
    this.voice.stop();
    if (this.frame != null) this.cancelFrame(this.frame);
    this.frame = null;
    const stream = this.stream; this.stream = null;
    if (stream) for (const track of stream.getTracks()) { track.onended = null; track.stop(); }
    if (this.source) { try { this.source.disconnect(); } catch {} this.source = null; }
    if (this.analyser) { try { this.analyser.disconnect(); } catch {} this.analyser = null; }
    const context = this.context; this.context = null;
    if (context) { try { Promise.resolve(context.close()).catch(() => {}); } catch {} }
    this.state.mode = 'idle';
    this.onLevel(0);
    if (status) this.update({ status, interim: '' });
  }
  async startLevel() {
    this.stop();
    const epoch = this.epoch;
    if (!this.mediaDevices?.getUserMedia) {
      this.update({ status: 'この環境では音量の確認を利用できません。HTTPSのページをChromeで開くか、下の聞き取り確認をお試しください。' });
      return;
    }
    this.update({ mode: 'requesting', permission: '確認中', signal: false, recognized: false,
      transcript: '', interim: '', status: 'マイクの許可を待っています。案内が出たら許可してください。' });
    try {
      const stream = await this.mediaDevices.getUserMedia({ audio: true, video: false });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      this.update({ permission: '許可済み', device: track?.label || 'ブラウザーの既定のマイク（名前を取得できませんでした）' });
      if (!this.AudioContext) {
        this.stop('マイクの入力を開けました。この環境では音量バーを使えないため、下の聞き取り確認に進んでください。');
        return;
      }
      const context = new this.AudioContext();
      this.context = context;
      await context.resume();
      if (epoch !== this.epoch) return;
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      this.analyser = analyser;
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(analyser);
      if (track) track.onended = () => { if (epoch === this.epoch) this.stop('マイクの接続が切れました。接続と入力デバイスを確認し、もう一度お試しください。'); };
      this.update({ mode: 'level', status: '声を出して、音量バーが動くか確認してください。入力音は再生されません。' });
      const samples = new Uint8Array(analyser.fftSize);
      const draw = () => {
        if (epoch !== this.epoch) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
        this.onLevel(Math.min(100, Math.round(rms * 400)));
        if (rms > 0.015 && !this.state.signal) this.update({ signal: true });
        this.frame = this.requestFrame(draw);
      };
      draw();
      this.levelTimer = setTimeout(() => {
        if (epoch === this.epoch) this.stop(this.state.signal
          ? '音量の確認を終了しました。下の日本語の聞き取り確認をお試しください。'
          : '入力の反応を確認できませんでした。マイクのミュート・入力機器を確認し、もう一度お試しください。');
      }, this.levelTimeoutMs);
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      this.update({ permission: error.name === 'NotAllowedError' ? '許可されていません' : this.state.permission === '確認中' ? '未確認' : this.state.permission,
        status: captureErrors[error.name] || 'マイク入力の確認を開始できませんでした。接続とサイトのマイク設定を確認してください。' });
    }
  }
  startRecognition() {
    this.stop();
    this.update({ recognized: false, transcript: '', interim: '' });
    this.voice.start();
  }
}
