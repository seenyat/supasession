const RELAY_URL = "ws://localhost:17777";
const HEARTBEAT_INTERVAL = 30000;
const STATE_UPDATE_INTERVAL = 1000;
const RECONNECT_DELAYS = [100, 500, 1000, 2000, 5000, 10000];

interface Track {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumArtUrl: string | null;
  albumArtData: string | null; // base64 encoded image
  durationMs: number;
}

interface TrackColors {
  vibrant: string | null;
  prominent: string | null;
  desaturated: string | null;
  lightVibrant: string | null;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMs: number;
  tempo: number | null;
  volume: number;
  shuffleEnabled: boolean;
  repeatMode: "off" | "track" | "context";
  colors: TrackColors | null;
}

interface QueueState {
  current: Track | null;
  next: Track[];
  prev: Track[];
}

interface LyricLine {
  startTime: number;
  text: string;
}

interface LyricsState {
  trackId: string;
  synced: LyricLine[] | null;
  unsynced: string[] | null;
}

const generateSessionId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const resolveImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  
  // Convert spotify:image:xxx to https://i.scdn.co/image/xxx
  if (url.startsWith("spotify:image:")) {
    const imageId = url.replace("spotify:image:", "");
    return `https://i.scdn.co/image/${imageId}`;
  }
  
  // Already an HTTP URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  
  // Unknown format, return as-is
  return url;
};

// Cache for converted images to avoid re-fetching
const imageDataCache = new Map<string, string>();

const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
  if (imageDataCache.has(url)) {
    return imageDataCache.get(url)!;
  }
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        imageDataCache.set(url, base64);
        // Limit cache size
        if (imageDataCache.size > 20) {
          const firstKey = imageDataCache.keys().next().value;
          if (firstKey) imageDataCache.delete(firstKey);
        }
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("[SupaSession] Failed to fetch image:", e);
    return null;
  }
};

const extractTrack = (queueTrack: any): Track => {
  const meta = queueTrack?.contextTrack?.metadata || {};
  const rawImageUrl = meta.image_xlarge_url || meta.image_url || null;
  
  return {
    id: queueTrack?.contextTrack?.uri || "",
    uid: queueTrack?.contextTrack?.uid || "",
    name: meta.title || "",
    artists: meta.artist_name ? [meta.artist_name] : [],
    album: meta.album_title || "",
    albumArtUrl: resolveImageUrl(rawImageUrl),
    albumArtData: null, // Will be populated async
    durationMs: parseInt(meta.duration, 10) || 0,
  };
};

const extractTrackWithImage = async (queueTrack: any): Promise<Track | null> => {
  if (!queueTrack?.contextTrack?.metadata) return null;
  
  const track = extractTrack(queueTrack);
  if (track.albumArtUrl) {
    track.albumArtData = await fetchImageAsBase64(track.albumArtUrl);
  }
  return track;
};

class SupaSessionMessenger {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private reconnectAttempt = 0;
  private reconnectTimeout: number | null = null;
  private heartbeatInterval: number | null = null;
  private stateUpdateWorker: Worker | null = null;
  private lastPlayerState: string = "";
  private lastQueueState: string = "";
  private lastLyricsTrackId: string = "";
  private tempo: number | null = null;
  private colors: TrackColors | null = null;
  private lyricsCache = new Map<string, LyricsState>();

  constructor() {
    this.sessionId = generateSessionId();
    this.init();
  }

  private init() {
    this.connect();
    this.setupSpotifyListeners();
    this.showSessionId();
  }

  private showSessionId() {
    const style = document.createElement("style");
    style.textContent = `
      .supasession-badge {
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: rgba(30, 215, 96, 0.9);
        color: black;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        z-index: 9999;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
        animation: supasession-fadein 0.5s ease-out;
      }
      @keyframes supasession-fadein {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes supasession-pulse {
        0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        50% { box-shadow: 0 4px 20px rgba(30, 215, 96, 0.6); }
      }
      .supasession-badge:hover {
        transform: scale(1.05);
        background: rgba(30, 215, 96, 1);
      }
      .supasession-badge.disconnected {
        background: rgba(255, 100, 100, 0.9);
      }
      .supasession-badge.connecting {
        animation: supasession-pulse 1s ease-in-out infinite;
      }
      .supasession-toast {
        position: fixed;
        bottom: 130px;
        right: 20px;
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .supasession-toast.show {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    const badge = document.createElement("div");
    badge.className = "supasession-badge connecting";
    badge.id = "supasession-badge";
    badge.textContent = `⚡ SupaSession loading...`;
    badge.onclick = () => this.copySessionId();
    document.body.appendChild(badge);

    const toast = document.createElement("div");
    toast.className = "supasession-toast";
    toast.id = "supasession-toast";
    document.body.appendChild(toast);

    this.showToast("SupaSession extension loaded!");
  }

  private copySessionId() {
    navigator.clipboard.writeText(this.sessionId).then(() => {
      this.showToast("Session ID copied!");
    });
  }

  private showToast(message: string) {
    const toast = document.getElementById("supasession-toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2000);
    }
  }

  private updateBadgeStatus(connected: boolean) {
    const badge = document.getElementById("supasession-badge");
    if (badge) {
      badge.classList.remove("connecting", "disconnected");
      if (!connected) {
        badge.classList.add("disconnected");
      }
      badge.textContent = connected
        ? `🎵 ${this.sessionId.slice(0, 8)}...`
        : "⚠️ Disconnected";
    }
  }

  private connect() {
    const url = `${RELAY_URL}?sessionId=${this.sessionId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[SupaSession] Connected to relay");
      this.reconnectAttempt = 0;
      this.updateBadgeStatus(true);

      this.send({
        v: 1,
        sessionId: this.sessionId,
        kind: "hello",
        ts: Date.now(),
        payload: { role: "producer" },
      });

      this.startHeartbeat();
      this.startStateUpdates();
      this.sendCurrentState();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.kind === "control") {
          this.handleControlMessage(msg.payload);
        }
      } catch (e) {
        console.error("[SupaSession] Failed to parse message:", e);
      }
    };

    this.ws.onclose = () => {
      console.log("[SupaSession] Disconnected");
      this.updateBadgeStatus(false);
      this.stopHeartbeat();
      this.stopStateUpdates();
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[SupaSession] WebSocket error:", err);
    };
  }

  private scheduleReconnect() {
    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    this.reconnectAttempt++;
    this.reconnectTimeout = window.setTimeout(() => this.connect(), delay);
  }

  private send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.send({
        v: 1,
        sessionId: this.sessionId,
        kind: "heartbeat",
        ts: Date.now(),
        payload: {},
      });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startStateUpdates() {
    const code = `setInterval(() => postMessage(null), ${STATE_UPDATE_INTERVAL});`;
    const blob = new Blob([code], { type: "application/javascript" });
    this.stateUpdateWorker = new Worker(URL.createObjectURL(blob));
    this.stateUpdateWorker.onmessage = () => this.sendPlayerState();
  }

  private stopStateUpdates() {
    if (this.stateUpdateWorker) {
      this.stateUpdateWorker.terminate();
      this.stateUpdateWorker = null;
    }
  }

  private async fetchTempo() {
    try {
      const audioData = await Spicetify?.getAudioData?.();
      if (audioData?.track?.tempo) {
        this.tempo = audioData.track.tempo;
      }
    } catch {
      this.tempo = null;
    }
  }

  private async fetchColors() {
    try {
      const track = Spicetify?.Queue?.track;
      const uri = track?.contextTrack?.uri;
      if (!uri) {
        this.colors = null;
        return;
      }
      
      const extractedColors = await Spicetify?.colorExtractor?.(uri);
      if (extractedColors) {
        this.colors = {
          vibrant: extractedColors.VIBRANT || null,
          prominent: extractedColors.PROMINENT || null,
          desaturated: extractedColors.DESATURATED || null,
          lightVibrant: extractedColors.LIGHT_VIBRANT || null,
        };
      }
    } catch {
      this.colors = null;
    }
  }

  private async fetchLyrics(trackId: string): Promise<LyricsState> {
    // Check cache first
    if (this.lyricsCache.has(trackId)) {
      return this.lyricsCache.get(trackId)!;
    }

    const result: LyricsState = {
      trackId,
      synced: null,
      unsynced: null,
    };

    try {
      const url = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&vocalRemoval=false&market=from_token`;
      const response = await Spicetify?.CosmosAsync?.get(url);
      
      if (!response?.lyrics?.lines) {
        this.lyricsCache.set(trackId, result);
        return result;
      }

      const lines = response.lyrics.lines;
      
      if (response.lyrics.syncType === "LINE_SYNCED") {
        result.synced = lines.map((line: any) => ({
          startTime: parseInt(line.startTimeMs, 10) || 0,
          text: line.words || "",
        }));
        result.unsynced = result.synced.map((l) => l.text);
      } else {
        result.unsynced = lines.map((line: any) => line.words || "");
      }

      // Cache the result (limit cache size)
      this.lyricsCache.set(trackId, result);
      if (this.lyricsCache.size > 20) {
        const firstKey = this.lyricsCache.keys().next().value;
        if (firstKey) this.lyricsCache.delete(firstKey);
      }
    } catch (e) {
      console.error("[SupaSession] Failed to fetch lyrics:", e);
    }

    return result;
  }

  private async sendLyrics() {
    const track = Spicetify?.Queue?.track;
    const uri = track?.contextTrack?.uri;
    if (!uri) return;

    const trackId = uri.split(":")[2];
    if (!trackId || trackId === this.lastLyricsTrackId) return;

    this.lastLyricsTrackId = trackId;
    const lyrics = await this.fetchLyrics(trackId);

    this.send({
      v: 1,
      sessionId: this.sessionId,
      kind: "lyrics",
      ts: Date.now(),
      payload: lyrics,
    });
  }

  private async getPlayerState(): Promise<PlayerState> {
    const player = Spicetify?.Player;
    const queue = Spicetify?.Queue;
    const currentTrack = queue?.track ? await extractTrackWithImage(queue.track) : null;

    return {
      currentTrack,
      isPlaying: player?.isPlaying?.() ?? false,
      positionMs: player?.getProgress?.() ?? 0,
      tempo: this.tempo,
      volume: player?.getVolume?.() ?? 100,
      shuffleEnabled: player?.getShuffle?.() ?? false,
      repeatMode: this.getRepeatMode(),
      colors: this.colors,
    };
  }

  private getRepeatMode(): "off" | "track" | "context" {
    const repeat = Spicetify?.Player?.getRepeat?.();
    if (repeat === 2) return "track";
    if (repeat === 1) return "context";
    return "off";
  }

  private async getQueueState(): Promise<QueueState> {
    const queue = Spicetify?.Queue;
    
    const current = queue?.track ? await extractTrackWithImage(queue.track) : null;
    
    // Get all tracks, but only fetch images for first few
    const rawNext = (queue?.nextTracks || [])
      .map((t: any) => {
        const track = extractTrack(t);
        return track.id ? { track, raw: t } : null;
      })
      .filter(Boolean) as { track: Track; raw: any }[];
      
    const rawPrev = (queue?.prevTracks || [])
      .map((t: any) => {
        const track = extractTrack(t);
        return track.id ? { track, raw: t } : null;
      })
      .filter(Boolean) as { track: Track; raw: any }[];
    
    // Fetch images for first 2 next/prev tracks (for drag preview)
    const next: Track[] = [];
    for (let i = 0; i < rawNext.length; i++) {
      if (i < 2) {
        const trackWithImage = await extractTrackWithImage(rawNext[i].raw);
        if (trackWithImage) next.push(trackWithImage);
      } else {
        next.push(rawNext[i].track);
      }
    }
    
    // For prev, fetch images for LAST 2 (most recent) since prev is chronological (oldest first)
    const prev: Track[] = [];
    for (let i = 0; i < rawPrev.length; i++) {
      if (i >= rawPrev.length - 2) {
        const trackWithImage = await extractTrackWithImage(rawPrev[i].raw);
        if (trackWithImage) prev.push(trackWithImage);
      } else {
        prev.push(rawPrev[i].track);
      }
    }
    
    return { current, next, prev };
  }

  private async sendPlayerState() {
    const state = await this.getPlayerState();
    // Compare without albumArtData to avoid unnecessary updates
    const stateForComparison = { ...state, currentTrack: state.currentTrack ? { ...state.currentTrack, albumArtData: null } : null };
    const stateStr = JSON.stringify(stateForComparison);

    if (stateStr !== this.lastPlayerState) {
      this.lastPlayerState = stateStr;
      this.send({
        v: 1,
        sessionId: this.sessionId,
        kind: "player_state",
        ts: Date.now(),
        payload: state,
      });
    }
  }

  private async sendQueueState() {
    const queue = await this.getQueueState();
    // Compare without albumArtData
    const queueForComparison = { 
      ...queue, 
      current: queue.current ? { ...queue.current, albumArtData: null } : null 
    };
    const queueStr = JSON.stringify(queueForComparison);

    if (queueStr !== this.lastQueueState) {
      this.lastQueueState = queueStr;
      this.send({
        v: 1,
        sessionId: this.sessionId,
        kind: "queue_update",
        ts: Date.now(),
        payload: queue,
      });
    }
  }

  private async sendCurrentState() {
    await Promise.all([this.fetchTempo(), this.fetchColors()]);
    await this.sendPlayerState();
    await this.sendQueueState();
    await this.sendLyrics();
  }

  private setupSpotifyListeners() {
    Spicetify?.Player?.addEventListener?.("songchange", () => {
      this.fetchTempo();
      setTimeout(() => this.sendCurrentState(), 100);
    });

    Spicetify?.Player?.addEventListener?.("onplaypause", () => {
      this.sendPlayerState();
    });

    Spicetify?.Platform?.PlayerAPI?._events?.addListener(
      "queue_update",
      () => {
        this.sendQueueState();
      }
    );
  }

  private handleControlMessage(payload: any) {
    const player = Spicetify?.Player;
    if (!player) return;

    switch (payload.command) {
      case "play":
        player.play?.();
        break;
      case "pause":
        player.pause?.();
        break;
      case "togglePlayPause":
        player.togglePlay?.();
        break;
      case "next":
        player.next?.();
        break;
      case "previous":
        player.back?.();
        break;
      case "skipPrevious": {
        // Use the undocumented skipToPrevious which doesn't rewind
        const playerAPI = Spicetify?.Platform?.PlayerAPI;
        if (playerAPI?.skipToPrevious) {
          playerAPI.skipToPrevious();
        } else {
          // Fallback to regular back
          player.back?.();
        }
        break;
      }
      case "skipTo": {
        // Use play to jump directly to a specific track in queue
        const playerAPI = Spicetify?.Platform?.PlayerAPI;
        const context = Spicetify?.Player?.data?.context;
        if (playerAPI?.play && payload.trackUri && context) {
          playerAPI.play(
            { uri: context.uri },
            {},
            { skipTo: { uri: payload.trackUri, uid: payload.trackUid } }
          );
        }
        break;
      }
      case "playTrack": {
        // Play a specific track within the current context (works for any track, including history)
        const playerAPI = Spicetify?.Platform?.PlayerAPI;
        const context = Spicetify?.Player?.data?.context;
        if (playerAPI?.play && payload.trackId && context) {
          playerAPI.play(
            { uri: context.uri },
            {},
            { skipTo: { uri: payload.trackId } }
          );
        }
        break;
      }
      case "seek":
        player.seek?.(payload.positionMs);
        break;
      case "setVolume":
        player.setVolume?.(payload.volume / 100);
        break;
      case "debug": {
        // Explore Spicetify APIs and send back through relay
        const playerAPI = Spicetify?.Platform?.PlayerAPI;
        const debugInfo: Record<string, any> = {
          playerDataContext: Spicetify?.Player?.data?.context,
          playerAPIKeys: Object.keys(playerAPI || {}),
          queueTrack: Spicetify?.Queue?.track?.contextTrack,
          queuePrevTrackLast: Spicetify?.Queue?.prevTracks?.[Spicetify?.Queue?.prevTracks?.length - 1]?.contextTrack,
          prevTracksLength: Spicetify?.Queue?.prevTracks?.length,
        };
        
        // Get PlayerAPI methods
        if (playerAPI) {
          debugInfo.playerAPIMethods = {};
          for (const key of Object.keys(playerAPI)) {
            debugInfo.playerAPIMethods[key] = typeof (playerAPI as any)[key];
          }
          // Check prototype
          const proto = Object.getPrototypeOf(playerAPI);
          if (proto) {
            debugInfo.playerAPIProtoMethods = {};
            for (const key of Object.getOwnPropertyNames(proto)) {
              if (key !== 'constructor') {
                debugInfo.playerAPIProtoMethods[key] = typeof proto[key];
              }
            }
          }
          // Check for skip methods
          const methods = ['skipToPrevious', 'skipToNext', 'skipBack', 'skipForward', 'playFromQueue', 'skipTo', 'updateContext'];
          debugInfo.skipMethods = {};
          for (const m of methods) {
            debugInfo.skipMethods[m] = typeof (playerAPI as any)?.[m];
          }
          // Check _state
          if ((playerAPI as any)?._state) {
            debugInfo.playerAPIState = Object.keys((playerAPI as any)._state);
          }
        }
        
        // Check Platform for other APIs
        debugInfo.platformKeys = Object.keys(Spicetify?.Platform || {});
        
        // Send back through relay
        this.send({
          v: 1,
          sessionId: this.sessionId,
          kind: "debug_response",
          ts: Date.now(),
          payload: debugInfo,
        });
        break;
      }
    }
  }
}

(async function main() {
  while (!Spicetify?.Player?.addEventListener || !Spicetify?.Queue) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  new SupaSessionMessenger();
})();
