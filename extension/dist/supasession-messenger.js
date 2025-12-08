"use strict";(()=>{var y="ws://localhost:17777";var h=[100,500,1e3,2e3,5e3,1e4],m=()=>{let a=new Uint8Array(16);return crypto.getRandomValues(a),Array.from(a).map(t=>t.toString(16).padStart(2,"0")).join("")},g=a=>a?a.startsWith("spotify:image:")?`https://i.scdn.co/image/${a.replace("spotify:image:","")}`:(a.startsWith("http://")||a.startsWith("https://"),a):null,l=new Map,f=async a=>{if(l.has(a))return l.get(a);try{let e=await(await fetch(a)).blob();return new Promise(s=>{let i=new FileReader;i.onloadend=()=>{let c=i.result;if(l.set(a,c),l.size>20){let r=l.keys().next().value;r&&l.delete(r)}s(c)},i.onerror=()=>s(null),i.readAsDataURL(e)})}catch(t){return console.error("[SupaSession] Failed to fetch image:",t),null}},p=a=>{let t=a?.contextTrack?.metadata||{},e=t.image_xlarge_url||t.image_url||null;return{id:a?.contextTrack?.uri||"",name:t.title||"",artists:t.artist_name?[t.artist_name]:[],album:t.album_title||"",albumArtUrl:g(e),albumArtData:null,durationMs:parseInt(t.duration,10)||0}},u=async a=>{if(!a?.contextTrack?.metadata)return null;let t=p(a);return t.albumArtUrl&&(t.albumArtData=await f(t.albumArtUrl)),t},d=class{constructor(){this.ws=null;this.reconnectAttempt=0;this.reconnectTimeout=null;this.heartbeatInterval=null;this.stateUpdateWorker=null;this.lastPlayerState="";this.lastQueueState="";this.lastLyricsTrackId="";this.tempo=null;this.colors=null;this.lyricsCache=new Map;this.sessionId=m(),this.init()}init(){this.connect(),this.setupSpotifyListeners(),this.showSessionId()}showSessionId(){let t=document.createElement("style");t.textContent=`
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
    `,document.head.appendChild(t);let e=document.createElement("div");e.className="supasession-badge connecting",e.id="supasession-badge",e.textContent="\u26A1 SupaSession loading...",e.onclick=()=>this.copySessionId(),document.body.appendChild(e);let s=document.createElement("div");s.className="supasession-toast",s.id="supasession-toast",document.body.appendChild(s),this.showToast("SupaSession extension loaded!")}copySessionId(){navigator.clipboard.writeText(this.sessionId).then(()=>{this.showToast("Session ID copied!")})}showToast(t){let e=document.getElementById("supasession-toast");e&&(e.textContent=t,e.classList.add("show"),setTimeout(()=>e.classList.remove("show"),2e3))}updateBadgeStatus(t){let e=document.getElementById("supasession-badge");e&&(e.classList.remove("connecting","disconnected"),t||e.classList.add("disconnected"),e.textContent=t?`\u{1F3B5} ${this.sessionId.slice(0,8)}...`:"\u26A0\uFE0F Disconnected")}connect(){let t=`${y}?sessionId=${this.sessionId}`;this.ws=new WebSocket(t),this.ws.onopen=()=>{console.log("[SupaSession] Connected to relay"),this.reconnectAttempt=0,this.updateBadgeStatus(!0),this.send({v:1,sessionId:this.sessionId,kind:"hello",ts:Date.now(),payload:{role:"producer"}}),this.startHeartbeat(),this.startStateUpdates(),this.sendCurrentState()},this.ws.onmessage=e=>{try{let s=JSON.parse(e.data);s.kind==="control"&&this.handleControlMessage(s.payload)}catch(s){console.error("[SupaSession] Failed to parse message:",s)}},this.ws.onclose=()=>{console.log("[SupaSession] Disconnected"),this.updateBadgeStatus(!1),this.stopHeartbeat(),this.stopStateUpdates(),this.scheduleReconnect()},this.ws.onerror=e=>{console.error("[SupaSession] WebSocket error:",e)}}scheduleReconnect(){let t=h[Math.min(this.reconnectAttempt,h.length-1)];this.reconnectAttempt++,this.reconnectTimeout=window.setTimeout(()=>this.connect(),t)}send(t){this.ws?.readyState===WebSocket.OPEN&&this.ws.send(JSON.stringify(t))}startHeartbeat(){this.heartbeatInterval=window.setInterval(()=>{this.send({v:1,sessionId:this.sessionId,kind:"heartbeat",ts:Date.now(),payload:{}})},3e4)}stopHeartbeat(){this.heartbeatInterval&&(clearInterval(this.heartbeatInterval),this.heartbeatInterval=null)}startStateUpdates(){let t="setInterval(() => postMessage(null), 1000);",e=new Blob([t],{type:"application/javascript"});this.stateUpdateWorker=new Worker(URL.createObjectURL(e)),this.stateUpdateWorker.onmessage=()=>this.sendPlayerState()}stopStateUpdates(){this.stateUpdateWorker&&(this.stateUpdateWorker.terminate(),this.stateUpdateWorker=null)}async fetchTempo(){try{let t=await Spicetify?.getAudioData?.();t?.track?.tempo&&(this.tempo=t.track.tempo)}catch{this.tempo=null}}async fetchColors(){try{let e=Spicetify?.Queue?.track?.contextTrack?.uri;if(!e){this.colors=null;return}let s=await Spicetify?.colorExtractor?.(e);s&&(this.colors={vibrant:s.VIBRANT||null,prominent:s.PROMINENT||null,desaturated:s.DESATURATED||null,lightVibrant:s.LIGHT_VIBRANT||null})}catch{this.colors=null}}async fetchLyrics(t){if(this.lyricsCache.has(t))return this.lyricsCache.get(t);let e={trackId:t,synced:null,unsynced:null};try{let s=`https://spclient.wg.spotify.com/color-lyrics/v2/track/${t}?format=json&vocalRemoval=false&market=from_token`,i=await Spicetify?.CosmosAsync?.get(s);if(!i?.lyrics?.lines)return this.lyricsCache.set(t,e),e;let c=i.lyrics.lines;if(i.lyrics.syncType==="LINE_SYNCED"?(e.synced=c.map(r=>({startTime:parseInt(r.startTimeMs,10)||0,text:r.words||""})),e.unsynced=e.synced.map(r=>r.text)):e.unsynced=c.map(r=>r.words||""),this.lyricsCache.set(t,e),this.lyricsCache.size>20){let r=this.lyricsCache.keys().next().value;r&&this.lyricsCache.delete(r)}}catch(s){console.error("[SupaSession] Failed to fetch lyrics:",s)}return e}async sendLyrics(){let e=Spicetify?.Queue?.track?.contextTrack?.uri;if(!e)return;let s=e.split(":")[2];if(!s||s===this.lastLyricsTrackId)return;this.lastLyricsTrackId=s;let i=await this.fetchLyrics(s);this.send({v:1,sessionId:this.sessionId,kind:"lyrics",ts:Date.now(),payload:i})}async getPlayerState(){let t=Spicetify?.Player,e=Spicetify?.Queue;return{currentTrack:e?.track?await u(e.track):null,isPlaying:t?.isPlaying?.()??!1,positionMs:t?.getProgress?.()??0,tempo:this.tempo,volume:t?.getVolume?.()??100,shuffleEnabled:t?.getShuffle?.()??!1,repeatMode:this.getRepeatMode(),colors:this.colors}}getRepeatMode(){let t=Spicetify?.Player?.getRepeat?.();return t===2?"track":t===1?"context":"off"}async getQueueState(){let t=Spicetify?.Queue,e=t?.track?await u(t.track):null,s=(t?.nextTracks||[]).map(n=>{let o=p(n);return o.id?{track:o,raw:n}:null}).filter(Boolean),i=(t?.prevTracks||[]).map(n=>{let o=p(n);return o.id?{track:o,raw:n}:null}).filter(Boolean),c=[];for(let n=0;n<s.length;n++)if(n<2){let o=await u(s[n].raw);o&&c.push(o)}else c.push(s[n].track);let r=[];for(let n=0;n<i.length;n++)if(n<2){let o=await u(i[n].raw);o&&r.push(o)}else r.push(i[n].track);return{current:e,next:c,prev:r}}async sendPlayerState(){let t=await this.getPlayerState(),e={...t,currentTrack:t.currentTrack?{...t.currentTrack,albumArtData:null}:null},s=JSON.stringify(e);s!==this.lastPlayerState&&(this.lastPlayerState=s,this.send({v:1,sessionId:this.sessionId,kind:"player_state",ts:Date.now(),payload:t}))}async sendQueueState(){let t=await this.getQueueState(),e={...t,current:t.current?{...t.current,albumArtData:null}:null},s=JSON.stringify(e);s!==this.lastQueueState&&(this.lastQueueState=s,this.send({v:1,sessionId:this.sessionId,kind:"queue_update",ts:Date.now(),payload:t}))}async sendCurrentState(){await Promise.all([this.fetchTempo(),this.fetchColors()]),await this.sendPlayerState(),await this.sendQueueState(),await this.sendLyrics()}setupSpotifyListeners(){Spicetify?.Player?.addEventListener?.("songchange",()=>{this.fetchTempo(),setTimeout(()=>this.sendCurrentState(),100)}),Spicetify?.Player?.addEventListener?.("onplaypause",()=>{this.sendPlayerState()}),Spicetify?.Platform?.PlayerAPI?._events?.addListener("queue_update",()=>{this.sendQueueState()})}handleControlMessage(t){let e=Spicetify?.Player;if(e)switch(t.command){case"play":e.play?.();break;case"pause":e.pause?.();break;case"togglePlayPause":e.togglePlay?.();break;case"next":e.next?.();break;case"previous":e.back?.();break;case"seek":e.seek?.(t.positionMs);break;case"setVolume":e.setVolume?.(t.volume/100);break}}};(async function(){for(;!Spicetify?.Player?.addEventListener||!Spicetify?.Queue;)await new Promise(t=>setTimeout(t,100));new d})();})();
