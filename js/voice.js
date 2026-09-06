// ============================================================================
// Voice Interview client — connects to the FastAPI realtime gateway, which
// itself relays to OpenAI's Realtime API.
//
// Public surface:
//   VoiceInterview.open(sessionId, mountEl, opts) -> { stop, mute, unmute }
//
// The browser <-> ai-service WebSocket carries OpenAI Realtime events
// transparently. Audio I/O is PCM16 mono 24 kHz, base64-encoded.
// ============================================================================
(function () {
  const SAMPLE_RATE = 24000;

  // -------- AudioWorklet source (inlined as a Blob so no extra file needed) --------
  const WORKLET_SRC = `
    class CaptureProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0];
        if (input && input[0] && input[0].length) {
          // copy: postMessage's transferable contract requires its own buffer
          this.port.postMessage(input[0].slice(0));
        }
        return true;
      }
    }
    registerProcessor('capture-processor', CaptureProcessor);
  `;

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g,
      c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // -------- PCM16 helpers --------
  function floatToPcm16(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  function int16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  function base64ToInt16(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const buf = new ArrayBuffer(len);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    // bytes -> Int16
    return new Int16Array(buf);
  }
  function int16ToFloat32(int16) {
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 0x8000;
    return out;
  }

  // -------- streaming PCM16 player --------
  class PcmPlayer {
    constructor(ctx) {
      this.ctx = ctx;
      this.nextStart = 0;
      this.sources = new Set();
      this.gain = ctx.createGain();
      this.gain.connect(ctx.destination);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.gain.connect(this.analyser);
    }
    enqueueFloat32(f32) {
      if (!f32.length) return;
      const buf = this.ctx.createBuffer(1, f32.length, SAMPLE_RATE);
      buf.copyToChannel(f32, 0, 0);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      const now = this.ctx.currentTime;
      const startAt = Math.max(now + 0.02, this.nextStart);
      src.start(startAt);
      this.nextStart = startAt + buf.duration;
      this.sources.add(src);
      src.onended = () => this.sources.delete(src);
    }
    flush() {
      this.sources.forEach(s => { try { s.stop(0); } catch {} });
      this.sources.clear();
      this.nextStart = this.ctx.currentTime;
    }
  }

  // -------- WebSocket client wrapping the realtime relay --------
  class RelayWS {
    constructor(url) { this.url = url; this.ws = null; this.handlers = {}; }
    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
    onAny(fn) { this._any = fn; return this; }
    connect() {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(e);
        ws.onclose = (e) => this._dispatch('close', e);
        ws.onmessage = (m) => {
          let evt; try { evt = JSON.parse(m.data); } catch { return; }
          if (this._any) this._any(evt);
          this._dispatch(evt.type, evt);
        };
      });
    }
    _dispatch(t, evt) { (this.handlers[t] || []).forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } }); }
    send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
    close() { try { this.ws && this.ws.close(); } catch {} }
  }

  // -------- main controller --------
  async function open(sessionId, mountEl, opts = {}) {
    const log = (...a) => opts.debug && console.log('[voice]', ...a);

    // 1) get the WS URL + a one-shot ticket from the PHP proxy
    const cfg = await fetch('ai_proxy.php?action=voice-config', { credentials: 'include' })
      .then(r => r.json());
    if (!cfg.ws_url) throw new Error('voice-config failed');
    const ticket = await fetch('ai_proxy.php?action=voice-ticket&session_id=' + encodeURIComponent(sessionId),
                               { method: 'POST', credentials: 'include' }).then(r => r.json());
    if (!ticket.token) throw new Error(ticket.error || 'failed to get voice ticket');
    const wsUrl = cfg.ws_url + '?token=' + encodeURIComponent(ticket.token);

    // 2) Render UI
    mountEl.hidden = false;
    mountEl.innerHTML = `
      <div class="voice-shell">
        <div class="voice-status">
          <span class="voice-dot" id="voice-status-dot"></span>
          <span id="voice-status-text">Connecting…</span>
          <span class="voice-spacer"></span>
          <button class="voice-btn voice-mute" id="voice-mute" type="button" disabled>Mute</button>
          <button class="voice-btn voice-stop" id="voice-stop" type="button">End voice</button>
        </div>
        <div class="voice-orbs">
          <canvas id="voice-canvas-ai" class="voice-canvas voice-ai"></canvas>
          <canvas id="voice-canvas-me" class="voice-canvas voice-me"></canvas>
        </div>
        <div class="voice-transcript" id="voice-transcript"></div>
      </div>
    `;
    const $ = (s) => mountEl.querySelector(s);
    const setStatus = (txt, cls) => {
      $('#voice-status-text').textContent = txt;
      const d = $('#voice-status-dot');
      d.className = 'voice-dot ' + (cls || '');
    };

    const transcriptEl = $('#voice-transcript');
    const turns = []; // [{role,text,el}]
    function pushTurn(role) {
      const el = document.createElement('div');
      el.className = 'voice-turn voice-' + role;
      el.innerHTML = `<div class="voice-who">${role === 'interviewer' ? 'Interviewer' : 'You'}</div><div class="voice-body"></div>`;
      transcriptEl.appendChild(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      const t = { role, text: '', el };
      turns.push(t);
      return t;
    }
    function appendText(t, delta) {
      t.text += delta;
      t.el.querySelector('.voice-body').textContent = t.text;
      t.el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // 3) Audio: create one AudioContext at 24 kHz (browsers may resample input).
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioCtx({ sampleRate: SAMPLE_RATE });
    const player = new PcmPlayer(audio);

    // capture
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
    await audio.audioWorklet.addModule(URL.createObjectURL(blob));
    const src = audio.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(audio, 'capture-processor');
    src.connect(node);
    // input analyser for the user "orb"
    const inputAnalyser = audio.createAnalyser();
    inputAnalyser.fftSize = 512;
    src.connect(inputAnalyser);

    // 4) Connect WS
    const ws = new RelayWS(wsUrl);
    let muted = false;
    let aiTurn = null, userTurn = null;

    ws.on('ready',  () => setStatus('Connected · waiting for AI', 'ok'));
    ws.on('session.created',  () => log('session.created'));
    ws.on('session.updated',  () => log('session.updated'));
    ws.on('error',  (e) => { console.error('relay error', e); setStatus('error: ' + (e.error || e.error?.message || 'unknown'), 'err'); });

    // Debug: log all non-audio-delta events to console
    ws.onAny((evt) => {
      if (evt.type !== 'response.output_audio.delta' && evt.type !== 'response.audio.delta')
        console.log('[voice ws]', evt.type, JSON.stringify(evt).slice(0, 200));
    });

    // user is starting to speak -> stop AI playback (barge-in)
    ws.on('input_audio_buffer.speech_started', () => {
      player.flush();
      setStatus('Listening…', 'live');
    });
    ws.on('input_audio_buffer.speech_stopped', () => {
      setStatus('Thinking…', 'wait');
    });

    // user transcript (final, from whisper)
    ws.on('conversation.item.input_audio_transcription.completed', (e) => {
      const text = (e.transcript || '').trim();
      if (!text) return;
      if (!userTurn) userTurn = pushTurn('candidate');
      appendText(userTurn, (userTurn.text ? '\n' : '') + text);
      userTurn = null; // next user phrase = new turn
    });

    // assistant audio playback — handle both GA name and legacy beta name
    function handleAudioDelta(e) {
      if (!e.delta) return;
      const i16 = base64ToInt16(e.delta);
      const f32 = int16ToFloat32(i16);
      player.enqueueFloat32(f32);
      setStatus('AI speaking…', 'speak');
    }
    ws.on('response.output_audio.delta', handleAudioDelta);  // GA name
    ws.on('response.audio.delta', handleAudioDelta);          // legacy beta name
    ws.on('response.output_audio.done', () => setStatus('Listening…', 'live'));
    ws.on('response.audio.done', () => setStatus('Listening…', 'live'));

    // assistant transcript deltas — handle both names
    function handleTranscriptDelta(e) {
      if (!aiTurn) aiTurn = pushTurn('interviewer');
      appendText(aiTurn, e.delta || '');
    }
    ws.on('response.output_audio_transcript.delta', handleTranscriptDelta);
    ws.on('response.audio_transcript.delta', handleTranscriptDelta);
    ws.on('response.output_audio_transcript.done', () => { aiTurn = null; });
    ws.on('response.audio_transcript.done', () => { aiTurn = null; });

    ws.on('close', () => setStatus('Disconnected', 'err'));

    await ws.connect();
    // Ensure AudioContext is resumed (browsers start it suspended)
    if (audio.state === 'suspended') await audio.resume();
    setStatus('Connected · streaming audio', 'ok');
    $('#voice-mute').disabled = false;

    // 5) Stream mic -> WS
    node.port.onmessage = (ev) => {
      if (muted) return;
      const f32 = ev.data;          // Float32Array @ 24 kHz (or close)
      const i16 = floatToPcm16(f32);
      const b64 = int16ToBase64(i16);
      ws.send({ type: 'input_audio_buffer.append', audio: b64 });
    };

    // 6) Visualizers
    const canvasAI = $('#voice-canvas-ai');
    const canvasME = $('#voice-canvas-me');
    const draw = () => {
      drawOrb(canvasAI, player.analyser, '#a78bfa');
      drawOrb(canvasME, inputAnalyser, '#34d399');
      rafId = requestAnimationFrame(draw);
    };
    let rafId = requestAnimationFrame(draw);

    // 7) Controls
    $('#voice-mute').addEventListener('click', () => {
      muted = !muted;
      $('#voice-mute').textContent = muted ? 'Unmute' : 'Mute';
      $('#voice-mute').classList.toggle('on', muted);
    });
    function stop() {
      try { ws.send({ type: 'client.bye' }); } catch {}
      try { ws.close(); } catch {}
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      try { audio.close(); } catch {}
      cancelAnimationFrame(rafId);
      setStatus('Ended', 'err');
      $('#voice-mute').disabled = true;
    }
    $('#voice-stop').addEventListener('click', stop);

    return {
      stop,
      mute: () => { muted = true; $('#voice-mute').textContent = 'Unmute'; },
      unmute: () => { muted = false; $('#voice-mute').textContent = 'Mute'; },
    };
  }

  // -------- visualizer --------
  function drawOrb(canvas, analyser, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * devicePixelRatio;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / data.length);
    const r = Math.min(w, h) * 0.18 + Math.min(w, h) * 0.32 * rms;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.6, color + '88');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(w/2, h/2, r, 0, Math.PI * 2); ctx.fill();
  }

  window.VoiceInterview = { open };
})();
