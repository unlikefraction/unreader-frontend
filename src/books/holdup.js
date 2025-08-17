// -----holdup.js-----
function getCookie(name) {
    const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[2]) : null;
  }
  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z0-9#]+;/gi, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
  
  export class HoldupManager {
    constructor({ userBookId, roomNameBase = 'book', callbacks = {} } = {}) {
      this.userBookId = userBookId;
      this.roomNameBase = roomNameBase;
  
      this.room = null;
      this.localMicTrack = null;
      this.livekit = null;
  
      this._pendingToggle = false;
      this._connected = false;
      this._lastContext = null;
  
      this._remoteAudioTracks = new Set();  // track objects
      this._remotePubs = new Set();         // publications (to unsubscribe)
  
      this._cb = {
        onEngageStart: typeof callbacks.onEngageStart === 'function' ? callbacks.onEngageStart : null,
        onEngageEnd: typeof callbacks.onEngageEnd === 'function' ? callbacks.onEngageEnd : null,
        onRemoteAudioStart: typeof callbacks.onRemoteAudioStart === 'function' ? callbacks.onRemoteAudioStart : null,
        onRemoteAudioStop: typeof callbacks.onRemoteAudioStop === 'function' ? callbacks.onRemoteAudioStop : null
      };
  
      this._bindHoldUpButton();
    }
  
    _bindHoldUpButton() {
      const btn = document.querySelector('.hold-up');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try { await this.toggleMute(); } catch (e) { console.warn('Holdup toggle error:', e); }
      });
    }
    _setHoldupBtnState({ active = false, label = null } = {}) {
      const btn = document.querySelector('.hold-up');
      if (!btn) return;
      btn.classList.toggle('active', active);
      if (label) btn.textContent = label;
    }
  
    async _ensureLiveKit() {
      if (this.livekit) return this.livekit;
      const mod = await import('https://cdn.jsdelivr.net/npm/livekit-client@latest/dist/livekit-client.esm.mjs');
      this.livekit = {
        Room: mod.Room,
        RoomEvent: mod.RoomEvent,
        createLocalAudioTrack: mod.createLocalAudioTrack,
        DataPacket_Kind: mod.DataPacket_Kind,
      };
      return this.livekit;
    }
  
    async _generateToken({ roomName, metadata }) {
      const token = getCookie('authToken');
      if (!token) throw new Error('Missing auth token');
      const base = window.API_URLS?.BASE;
      if (!base) throw new Error('Missing window.API_URLS.BASE');
  
      const body = { room: roomName, userbook_id: Number(this.userBookId), metadata };
      const res = await fetch(`${base}/holdup/generate-token/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Token request failed (${res.status}): ${t}`);
      }
      const json = await res.json();
      const roomUrl = json.room_url || json.url || json.livekit_url;
      const jwt = json.token;
      if (!roomUrl || !jwt) throw new Error('Token response missing room_url or token');
      return { roomUrl, token: jwt };
    }
  
    _cleanupRemoteAudioTags() {
      document.querySelectorAll('audio[data-lk-remote]').forEach(el => {
        try { el.pause(); } catch {}
        try { el.srcObject = null; } catch {}
        try { el.remove(); } catch {}
      });
    }
  
    _registerRemoteAudio(track, pub) {
      this._remoteAudioTracks.add(track);
      if (pub) this._remotePubs.add(pub);
      try {
        const el = track.attach();
        el.setAttribute('data-lk-remote', '1');
        document.body.appendChild(el);
      } catch {}
      if (this._cb.onRemoteAudioStart) try { this._cb.onRemoteAudioStart(); } catch {}
    }
  
    _unregisterRemoteAudio(track, pub) {
      try { track.detach().forEach(el => { try { el.remove(); } catch {} }); } catch {}
      try { track.stop?.(); } catch {}
      this._remoteAudioTracks.delete(track);
      if (pub) this._remotePubs.delete(pub);
      if (this._remoteAudioTracks.size === 0) {
        if (this._cb.onRemoteAudioStop) try { this._cb.onRemoteAudioStop(); } catch {}
      }
    }
  
    /** Hard-cut all agent output right now */
    cutOffRemoteOutput() {
      try { this._remotePubs.forEach(pub => { try { pub.setSubscribed?.(false); } catch {} }); } catch {}
      this._remoteAudioTracks.forEach(track => { this._unregisterRemoteAudio(track); });
      this._cleanupRemoteAudioTags();
      this._remoteAudioTracks.clear();
      this._remotePubs.clear();
    }
  
    /** Send a context update instantly via data channel */
    async _sendContext(context) {
      if (!context) return;
      this._lastContext = context;
      if (!this.room) return;
      try {
        const payload = {
          type: 'context_update',
          userBookId: this.userBookId,
          pageNumber: context.pageNumber,
          metadata: context.metadata,
          ts: Date.now(),
        };
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        await this.room.localParticipant.publishData(bytes, this.livekit.DataPacket_Kind.RELIABLE);
      } catch (e) {
        console.warn('Holdup context publish failed:', e);
      }
    }
  
    /** Connect once for the whole book; publish mic muted for instant engage */
    async connectOnce(initialContext) {
      await this._ensureLiveKit();
  
      if (this.room && this._connected) {
        await this._sendContext(initialContext || this._lastContext);
        return;
      }
  
      const roomName = `book-${slugify(this.roomNameBase)}-${Number(this.userBookId) || 'anon'}`;
      const { roomUrl, token } = await this._generateToken({ roomName, metadata: initialContext?.metadata });
  
      const { Room, createLocalAudioTrack, RoomEvent } = this.livekit;
      this.room = new Room();
  
      this.room
        .on(RoomEvent.TrackSubscribed, (track, pub) => { if (track.kind === 'audio') this._registerRemoteAudio(track, pub); })
        .on(RoomEvent.TrackUnsubscribed, (track, pub) => { if (track.kind === 'audio') this._unregisterRemoteAudio(track, pub); })
        .on(RoomEvent.TrackMuted, (pub) => { const t = pub?.audioTrack; if (t) this._unregisterRemoteAudio(t, pub); })
        .on(RoomEvent.TrackStopped, (track, pub) => { if (track?.kind === 'audio') this._unregisterRemoteAudio(track, pub); })
        .on(RoomEvent.Reconnecting, () => { console.warn('🔌 Holdup reconnecting…'); })
        .on(RoomEvent.Reconnected, () => {
          console.log('✅ Holdup reconnected');
          // Re-send latest context after reconnection
          this._sendContext(this._lastContext);
        })
        .on(RoomEvent.Disconnected, () => {
          this._setHoldupBtnState({ active: false, label: 'Hold Up' });
          this.localMicTrack = null;
          this.cutOffRemoteOutput();
          this._connected = false;
        });
  
      await this.room.connect(roomUrl, token);
  
      // Publish mic (start muted for instant unmute later)
      this.localMicTrack = await createLocalAudioTrack({
        vad: true,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      });
      await this.room.localParticipant.publishTrack(this.localMicTrack);
      await this.localMicTrack.mute();
  
      this._connected = true;
      this._setHoldupBtnState({ active: false, label: 'Hold Up' });
  
      // Push initial context
      await this._sendContext(initialContext || this._lastContext);
  
      console.log(`🎙️ Holdup connected: ${this.room.name}`);
    }
  
    /** Called by app on page change */
    async updateContext({ pageNumber, metadata }) {
      const ctx = { pageNumber, metadata };
      this._lastContext = ctx;
      if (!this._connected) {
        await this.connectOnce(ctx);
        return;
      }
      await this._sendContext(ctx);
    }
  
    /** Single switch: connect if needed, then mute/unmute instantly */
    async toggleMute() {
      if (this._pendingToggle) return;
      this._pendingToggle = true;
      try {
        if (!this._connected || !this.room || !this.localMicTrack) {
          await this.connectOnce(this._lastContext);
        }
        if (this.localMicTrack.isMuted) {
          await this.localMicTrack.unmute();
          try {
            const bytes = new TextEncoder().encode(JSON.stringify({ type: 'engage_start', ts: Date.now() }));
            await this.room.localParticipant.publishData(bytes, this.livekit.DataPacket_Kind.RELIABLE);
          } catch {}
          this._setHoldupBtnState({ active: true, label: 'Stop' });
          if (this._cb.onEngageStart) try { this._cb.onEngageStart(); } catch {}
        } else {
          await this.localMicTrack.mute();
          this.cutOffRemoteOutput();
          try {
            const bytes = new TextEncoder().encode(JSON.stringify({ type: 'engage_end', ts: Date.now() }));
            await this.room.localParticipant.publishData(bytes, this.livekit.DataPacket_Kind.RELIABLE);
          } catch {}
          this._setHoldupBtnState({ active: false, label: 'Hold Up' });
          if (this._cb.onEngageEnd) try { this._cb.onEngageEnd(); } catch {}
        }
      } finally {
        this._pendingToggle = false;
      }
    }
  
    async disconnect() {
      try { if (this.room) await this.room.disconnect(); }
      catch (e) { console.warn('Holdup disconnect warning:', e); }
      finally {
        this.localMicTrack = null;
        this._setHoldupBtnState({ active: false, label: 'Hold Up' });
        this.cutOffRemoteOutput();
        this.room = null;
        this._connected = false;
      }
    }
  
    // Back-compat: legacy callers can still call this
    async startForPage({ pageIndex, pageNumber, metadata }) {
      await this.connectOnce({ pageNumber, metadata });
      await this.updateContext({ pageNumber, metadata });
    }
  }
  