const messages = {
  'not-allowed': 'マイクを使えません。アドレスバーのサイト設定でマイクの許可を確認してください。',
  'service-not-allowed': 'このブラウザーでは音声認識サービスを使えません。Chromeで開き直してください。',
  'audio-capture': 'マイクが見つかりません。接続と入力デバイスを確認してください。',
  'no-speech': '声を聞き取れませんでした。もう一度マイクを押してください。',
  'network': '音声認識サービスとの通信に失敗しました。接続を確認して再挑戦してください。',
  'language-not-supported': '日本語の音声認識を利用できません。ブラウザーの言語対応を確認してください。'
};

export class VoiceInput {
  constructor({ Recognition, onStatus, onInterim, onFinal, timeoutMs = 15000, listeningMessage = '聞いています。日本語の地名で答えてください。' }) {
    Object.assign(this, { Recognition, onStatus, onInterim, onFinal, timeoutMs, listeningMessage });
    this.generation = 0;
    this.active = null;
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = null;
    const active = this.active;
    this.active = null;
    if (active) { try { active.abort(); } catch {} }
  }
  start() {
    this.stop();
    const generation = this.generation;
    let recognition;
    try { recognition = new this.Recognition(); }
    catch { this.onStatus('この環境では音声認識を開始できません。', false); return; }
    this.active = recognition;
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 5;
    const current = () => generation === this.generation && this.active === recognition;
    recognition.onstart = () => {
      if (!current()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!current()) return;
        this.stop();
        this.onStatus('録音を終了しました。回答を確定できなかったため、もう一度お試しください。', false);
      }, this.timeoutMs);
      this.onStatus(this.listeningMessage, true);
    };
    recognition.onresult = event => {
      if (!current()) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const candidates = Array.from(result, alternative => alternative?.transcript?.trim()).filter(Boolean);
          if (candidates.length) {
            this.stop();
            this.onFinal(candidates);
            return;
          }
        }
        if (!result.isFinal) interim += result[0]?.transcript || '';
      }
      this.onInterim(interim);
    };
    recognition.onerror = event => {
      if (!current()) return;
      this.stop();
      this.onStatus(messages[event.error] || `音声認識を終了しました（${event.error || 'unknown'}）。もう一度マイクを押してください。`, false);
    };
    recognition.onend = () => {
      if (!current()) return;
      this.stop();
      this.onStatus('回答を確定できませんでした。もう一度マイクを押してください。', false);
    };
    this.onStatus('マイクを準備しています… 許可の案内が出たら確認してください。', true);
    try {
      recognition.start();
    } catch {
      this.stop();
      this.onStatus('音声認識を開始できませんでした。もう一度マイクを押してください。', false);
    }
  }
}
