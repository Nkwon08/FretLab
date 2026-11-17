const JamStudio = ({active, legacyLoops = [], loadLegacy}) => {
  const {useState, useRef, useEffect} = React;
  const C = JamCore, V = JamView;
  const [tracks,setTracks] = useState([{id:'first',name:'Guitar 1',volume:.8,muted:false,clips:[]}]);
  const [armed,setArmed] = useState('first'), [selected,setSelected] = useState(null);
  const [position,setPosition] = useState(0), [mode,setMode] = useState('stopped');
  const [settings,setSettings] = useState(false), [devices,setDevices] = useState([]);
  const [input,setInput] = useState(''), [output,setOutput] = useState(''), [channel,setChannel] = useState(0);
  const [bpm,setBpm] = useState(120), [snap,setSnap] = useState(true);
  const [viewport,setViewport] = useState({pixelsPerBeat:30,scrollOffsetBeats:0,trackHeights:{}});
  const [bounds,setBounds] = useState({width:800,height:500,top:0});
  const scrollRef=useRef(null);
  const [message,setMessage] = useState('Choose a track and press Record to capture your first take.');
  const [history,setHistory] = useState([]), [loop,setLoop] = useState(false), [loopBars,setLoopBars] = useState(4);
  const engine = useRef({ctx:null,nodes:[],running:false,recording:null,token:0});
  const latest = useRef({}); latest.current = {tracks,position,mode,loop,bpm,loopBars,active};
  const drag = useRef(null), alive = useRef(true);
  const busy = mode !== 'stopped';
  const loopLength = loopBars*4*60/bpm;
  const duration = Math.max(16*60/bpm, C.end(tracks,bpm)+4, position+4,loopLength);
  const beatSeconds = 60/bpm;
  const laneWidth=Math.max(1,bounds.width-200);
  const visibleStart=viewport.scrollOffsetBeats, visibleEnd=visibleStart+laneWidth/viewport.pixelsPerBeat;
  // Extend the scrollable region beyond the visible range so zooming near the
  // right edge never clamps away the beat under the cursor.
  const totalBeats=Math.max(duration/beatSeconds,visibleEnd+4);
  const grid=V.grid(viewport,laneWidth);
  const trackHeight=V.heightFor(viewport,armed);
  const zoom=viewport.pixelsPerBeat;
  const zoomTimeline=value=>setViewport(v=>V.zoomAt(v,laneWidth/2,value/v.pixelsPerBeat));
  const setTrackHeight=value=>setViewport(v=>V.resizeTrack(v,armed,typeof value==='function'?value(V.heightFor(v,armed)):value));
  const fitTimeline=()=>setViewport(v=>({...v,pixelsPerBeat:Math.max(V.MIN_PPB,Math.min(V.MAX_PPB,laneWidth/(duration/beatSeconds))),scrollOffsetBeats:0}));
  React.useLayoutEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    el.scrollLeft=viewport.scrollOffsetBeats*viewport.pixelsPerBeat;
  },[viewport.scrollOffsetBeats,viewport.pixelsPerBeat,bounds.width]);
  useEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    const measure=()=>{if(el.clientWidth)setBounds({width:el.clientWidth,height:el.clientHeight,top:el.scrollTop});};
    const observer=new ResizeObserver(measure);observer.observe(el);measure();
    const unbindWheel=V.bindWheel(el,setViewport,()=>!!drag.current);
    return ()=>{observer.disconnect();unbindWheel();};
  },[]);
  const onViewportScroll=e=>{
    const el=e.currentTarget;
    setViewport(v=>({...v,scrollOffsetBeats:el.scrollLeft/v.pixelsPerBeat}));
    setBounds(b=>({...b,top:el.scrollTop}));
  };
  const seek=e=>{if(!busy)setPosition(quantize(V.xToBeat(e.clientX-e.currentTarget.getBoundingClientRect().left,viewport)*beatSeconds));};
  let trackTop=54;
  const trackLayouts=tracks.map(track=>{const top=trackTop,height=V.heightFor(viewport,track.id);trackTop+=height+1;return {top,height,visible:top+height>=bounds.top&&top<=bounds.top+bounds.height};});
  const chosen = tracks.flatMap(t=>t.clips).find(c=>c.id===selected);
  const quantize = t => Math.max(0,snap ? Math.round(t/(60/bpm))*(60/bpm) : t);
  const edit = next => {setHistory(h=>[...h.slice(-29),tracks]);setTracks(next);};
  const changeClip = fn => edit(tracks.map(t=>({...t,clips:t.clips.flatMap(c=>c.id===selected?fn(c):[c])})));
  const changeTempo=value=>{
    setTracks(ts=>ts.map(t=>({...t,clips:t.clips.map(c=>C.withTempo(c,value))})));
    setPosition(p=>p*bpm/value);setBpm(value);
  };
  const warpEdit=fn=>{try{changeClip(c=>[fn(c)]);}catch(err){report(err);}};
  const report = err => setMessage(`${err.name === 'NotAllowedError' ? 'Microphone or audio permission denied. Allow access in your browser and try again.' : err.message || err}`);
  async function context() {
    const e=engine.current;
    if(!e.ctx) e.ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
    await e.ctx.resume(); return e.ctx;
  }
  function stopNodes() {engine.current.nodes.forEach(n=>{try{n.stop();}catch{}});engine.current.nodes=[];}
  function stop() {
    const e=engine.current; e.token++; e.running=false;stopNodes();
    if(e.recording) {
      if(e.recording.stopping) return;
      e.recording.stopping=true;setMode('processing');
      e.recording.node.port.postMessage({type:'stop',frame:Math.ceil(e.ctx.currentTime*e.ctx.sampleRate)});
    } else setMode('stopped');
  }
  function transport(ctx, from, recording=false) {
    const e=engine.current;
    e.from=from;e.when=ctx.currentTime+.08;e.running=true;e.isRecording=recording;
    e.nodes=C.schedule(ctx,latest.current.tracks,from,e.when,ctx.destination, !recording && latest.current.loop ? latest.current.loopBars*4*60/latest.current.bpm : 0,latest.current.bpm);
    e.cycle=0;e.scheduledCycle=0;
  }
  async function play() {
    const e=engine.current, token=++e.token;setMode('starting');
    try {const ctx=await context();if(token!==e.token)return;
      transport(ctx,loop&&position>=loopLength?0:position);setMode('playing');
    } catch(err){setMode('stopped');report(err);}
  }
  async function record() {
    const e=engine.current, token=++e.token; setMode('starting');setMessage('Opening audio input…');
    let stream, node, source;
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw Error('Recording needs HTTPS or localhost and a browser with microphone support.');
      const ctx=await context();
      if(!e.worklet) {await ctx.audioWorklet.addModule('assets/js/jam-recorder.js');e.worklet=true;}
      stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:input?{exact:input}:undefined,channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      if(token!==e.token){stream.getTracks().forEach(t=>t.stop());return;}
      if(channel >= (stream.getAudioTracks()[0].getSettings().channelCount || 1)) throw Error('This input does not expose channel 2. Select channel 1 in Audio settings.');
      await refreshDevices();
      if(token!==e.token){stream.getTracks().forEach(t=>t.stop());return;}
      source=ctx.createMediaStreamSource(stream);node=new AudioWorkletNode(ctx,'jam-recorder');
      source.connect(node);node.connect(ctx.destination); // Processor outputs silence: no feedback.
      const from=position;
      transport(ctx,from,true);
      const startFrame=Math.ceil(e.when*ctx.sampleRate);
      const take={node,source,stream,chunks:[],startFrame,from,track:armed,stopping:false};e.recording=take;
      node.port.onmessage=({data})=>{
        if(data.type==='chunk') take.chunks.push(data);
        if(data.type==='done') {
          source.disconnect();node.disconnect();stream.getTracks().forEach(t=>t.stop());e.recording=null;
          if(!alive.current)return;
          const length=take.chunks.reduce((n,c)=>Math.max(n,c.frame-startFrame+c.samples.length),0);
          if(length>0) {
            const buffer=ctx.createBuffer(1,length,ctx.sampleRate), samples=buffer.getChannelData(0);
            take.chunks.forEach(c=>samples.set(c.samples,c.frame-startFrame));
            const clip=C.create(buffer,from,'Guitar take',bpm);
            const old=latest.current.tracks;setHistory(h=>[...h.slice(-29),old]);
            setTracks(old.map(t=>t.id===take.track?{...t,clips:[...t.clips,clip]}:t));setSelected(clip.id);
            setMessage('Take recorded. Drag to move, drag the edges to trim, or split at the playhead.');
          } else setMessage('No audio captured. Try recording a longer take.');
          setMode('stopped');setPosition(from);
        }
      };
      node.onprocessorerror=()=>{source.disconnect();node.disconnect();stream.getTracks().forEach(t=>t.stop());e.recording=null;stop();setMessage('Audio capture failed. Please try again.');};
      stream.getAudioTracks()[0].onended=()=>{if(e.recording===take){stop();setMessage('Audio input disconnected. Your captured audio is being kept.');}};
      node.port.postMessage({type:'start',frame:startFrame,channel});
      setMode('recording');setMessage('Recording — existing tracks play along. Use headphones or your interface’s direct monitor.');
    } catch(err) {
      source?.disconnect();node?.disconnect();stream?.getTracks().forEach(t=>t.stop());
      e.recording=null;e.running=false;stopNodes();setMode('stopped');report(err);
    }
  }
  async function refreshDevices(request=false) {
    let stream;
    try {
      if(!navigator.mediaDevices)throw Error('Audio devices require HTTPS or localhost.');
      if(request) stream=await navigator.mediaDevices.getUserMedia({audio:true});
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } finally {stream?.getTracks().forEach(t=>t.stop());}
  }
  async function selectOutput(value) {
    try {const ctx=await context();await ctx.setSinkId(value);setOutput(value);setMessage('Audio output updated.');}catch(err){report(err);}
  }
  useEffect(()=>{
    alive.current=true;
    const timer=setInterval(()=>{
      const e=engine.current,l=latest.current;if(!e.running)return;
      let p=e.from+Math.max(0,e.ctx.currentTime-e.when);
      if(!e.isRecording && l.loop) {
        const length=l.loopBars*4*60/l.bpm;
        const next=e.when+(e.scheduledCycle+1)*length-e.from;
        if(e.ctx.currentTime+.15>=next){e.nodes.push(...C.schedule(e.ctx,l.tracks,0,next,e.ctx.destination,length,l.bpm));e.scheduledCycle++;}
        p%=length;
      } else if(!e.isRecording && p>=C.end(l.tracks,l.bpm)){stop();p=0;}
      setPosition(p);
    },30);
    const changed=()=>refreshDevices().catch(report);
    navigator.mediaDevices?.addEventListener('devicechange',changed);
    return ()=>{alive.current=false;clearInterval(timer);navigator.mediaDevices?.removeEventListener('devicechange',changed);stop();engine.current.recording?.stream.getTracks().forEach(t=>t.stop());engine.current.ctx?.close();};
  },[]);
  useEffect(()=>{if(!active)stop();},[active]);
  useEffect(()=>{
    const warn=e=>{if(latest.current.tracks.some(t=>t.clips.length)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  function beginDrag(event,clip,edge) {
    if(busy)return;event.stopPropagation();event.preventDefault();setSelected(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={x:event.clientX,clip,edge,original:tracks,changed:false,pixelsPerSecond:viewport.pixelsPerBeat/beatSeconds};
  }
  function moveDrag(event) {
    const d=drag.current;if(!d)return;
    let delta=(event.clientX-d.x)/d.pixelsPerSecond;
    if(snap)delta=Math.round(delta/(60/bpm))*(60/bpm);
    const updated=d.edge?C.trim(d.clip,d.edge,delta,bpm):C.move(d.clip,C.start(d.clip,bpm)+delta,bpm);
    d.changed=updated.startBeat!==d.clip.startBeat||updated.offsetSample!==d.clip.offsetSample||updated.lengthSamples!==d.clip.lengthSamples;
    setTracks(d.original.map(t=>({...t,clips:t.clips.map(c=>c.id===d.clip.id?updated:c)})));
  }
  function endDrag(){if(drag.current){const {original,changed}=drag.current;drag.current=null;if(changed)setHistory(h=>[...h.slice(-29),original]);}}
  async function importAudio(file) {
    if(!file)return;setMode('processing');
    try {const ctx=await context(),buffer=await ctx.decodeAudioData(await file.arrayBuffer());
      const clip=C.create(buffer,position,file.name,bpm);
      edit(tracks.map(t=>t.id===armed?{...t,clips:[...t.clips,clip]}:t));setSelected(clip.id);setMessage('Audio imported.');
    }catch(err){report(err);}finally{setMode('stopped');}
  }
  async function exportMix() {
    setMode('processing');try {
      const ctx=new OfflineAudioContext(2,Math.ceil(C.end(tracks,bpm)*44100),44100);
      C.schedule(ctx,tracks,0,0,ctx.destination,0,bpm);const buffer=await ctx.startRendering();
      const url=URL.createObjectURL(C.wav(buffer)),a=document.createElement('a');a.href=url;a.download='FretLab-mix.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage('WAV mix exported.');
    }catch(err){report(err);}finally{setMode('stopped');}
  }
  async function database() {
    return new Promise((resolve,reject)=>{const r=indexedDB.open('FretLabStudio',1);r.onupgradeneeded=()=>r.result.createObjectStore('sessions');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async function saveSession() {
    setMode('processing');let db;
    try {db=await database();const serialized=tracks.map(t=>({...t,clips:t.clips.map(c=>({...c,buffer:{sampleRate:c.buffer.sampleRate,channels:Array.from({length:c.buffer.numberOfChannels},(_,i)=>c.buffer.getChannelData(i).slice())}}))}));
      await new Promise((resolve,reject)=>{const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put({schemaVersion:3,tracks:serialized,bpm,loopBars},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save aborted'));});setMessage('Session saved in this browser.');
    }catch(err){report(err);}finally{db?.close();setMode('stopped');}
  }
  async function loadSession() {
    setMode('processing');let db;
    try{db=await database();const data=await new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      if(!data)throw Error('No saved studio session yet.');const ctx=await context();
      const restored=data.tracks.map(t=>({...t,clips:t.clips.map(c=>{const b=ctx.createBuffer(c.buffer.channels.length,c.buffer.channels[0].length,c.buffer.sampleRate);c.buffer.channels.forEach((ch,i)=>b.copyToChannel(ch,i));return C.migrate({...c,buffer:b},data.bpm);})}));
      edit(restored);setArmed(restored[0].id);setBpm(data.bpm);setLoopBars(data.loopBars);setPosition(0);setSelected(null);setMessage('Saved session restored. Undo returns to your previous arrangement.');
    }catch(err){report(err);}finally{db?.close();setMode('stopped');}
  }
  const supportsOutput=!!(window.AudioContext||window.webkitAudioContext)?.prototype.setSinkId;
  return <div className="page daw" hidden={!active}>
    <div className="page-heading"><div><div className="eyebrow">Jam Mode / Recording studio</div><h1>Make room for your next idea.</h1><p className="page-description">Record a take. Build a layer. Make it yours.</p></div><button className="fl-btn" aria-expanded={settings} onClick={()=>{setSettings(!settings);refreshDevices().catch(report);}}>⚙ Audio settings</button></div>
    {settings&&<section className="daw-settings fl-panel" aria-label="Audio settings">
      <div><h2>Audio setup</h2><p>Connect your interface, then refresh devices to grant access.</p><button className="fl-btn" disabled={busy} onClick={()=>refreshDevices(true).catch(report)}>Refresh devices</button></div>
      <label>Input device<select disabled={busy} value={input} onChange={e=>setInput(e.target.value)}><option value="">System default input</option>{devices.filter(d=>d.kind==='audioinput'&&d.deviceId).map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Input ${i+1}`}</option>)}</select></label>
      <label>Guitar channel<select disabled={busy} value={channel} onChange={e=>setChannel(+e.target.value)}><option value={0}>Mono · Input 1 / left</option><option value={1}>Mono · Input 2 / right</option></select></label>
      <label>Output device<select disabled={busy||!supportsOutput} value={output} onChange={e=>selectOutput(e.target.value)}><option value="">System default output</option>{devices.filter(d=>d.kind==='audiooutput'&&d.deviceId).map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Output ${i+1}`}</option>)}</select><small>{supportsOutput?'Playback uses this device.':'This browser uses your system output. Change it in your OS audio settings.'}</small></label>
      <p className="daw-note">Input is recorded dry, with noise suppression and automatic gain disabled. Use your interface’s direct monitoring to hear your guitar. No software monitoring or effects.</p>
    </section>}
    <div className="daw-transport fl-panel">
      <button className="fl-btn" disabled={busy||!C.end(tracks,bpm)} onClick={play}>▶ Play</button>
      <button className="fl-btn" disabled={!['playing','recording','starting'].includes(mode)} onClick={stop}>■ Stop</button>
      <button className="fl-btn-danger" disabled={busy} onClick={record}>● Record</button>
      <button className="fl-btn" disabled={busy} onClick={()=>setPosition(0)} aria-label="Return to start">↤</button>
      <output className="daw-time">{Math.floor(position/60).toString().padStart(2,'0')}:{(position%60).toFixed(2).padStart(5,'0')}</output>
      <label>BPM<input type="number" min="30" max="300" value={bpm} disabled={busy} onChange={e=>changeTempo(Math.max(30,Math.min(300,+e.target.value||120)))}/></label>
      <button className={loop?'fl-btn-primary':'fl-btn'} disabled={busy} aria-pressed={loop} onClick={()=>setLoop(!loop)}>↻ Loop playback</button>
      <label>Bars<input type="number" min="1" max="64" disabled={busy} value={loopBars} onChange={e=>setLoopBars(Math.max(1,Math.min(64,+e.target.value||4)))}/></label>
      <span className={'daw-status '+(mode==='recording'?'recording':'')}>{mode}</span>
    </div>
    <div className="daw-tools">
      <button className="fl-btn" disabled={busy} onClick={()=>{const id=C.id();edit([...tracks,{id,name:`Guitar ${tracks.length+1}`,volume:.8,muted:false,clips:[]}]);setArmed(id);}}>＋ Add recording layer</button>
      <button className="fl-btn" disabled={busy||!chosen||position<=C.start(chosen,bpm)+.01||position>=C.start(chosen,bpm)+C.duration(chosen,bpm)-.01} onClick={()=>changeClip(c=>C.split(c,position,bpm))}>Split at playhead</button>
      <button className="fl-btn" disabled={busy||!chosen} onClick={()=>{changeClip(()=>[]);setSelected(null);}}>Delete clip</button>
      <button className="fl-btn" disabled={busy||!history.length} onClick={()=>{const prior=history[history.length-1];setTracks(prior.map(t=>({...t,clips:t.clips.map(c=>C.withTempo(c,bpm))})));if(!prior.some(t=>t.id===armed))setArmed(prior[0].id);setHistory(history.slice(0,-1));}}>Undo</button>
      <button className={snap?'fl-btn-primary':'fl-btn'} aria-pressed={snap} onClick={()=>setSnap(!snap)}>Snap to beat</button>
    </div>
    <div className="daw-view-tools" aria-label="Timeline view controls">
      <div className="daw-zoom-group"><span>Timeline</span>
        <button className="fl-btn" aria-label="Zoom timeline out" disabled={zoom<=V.MIN_PPB} onClick={()=>zoomTimeline(zoom/1.4)}>−</button>
        <input aria-label="Timeline zoom" type="range" min={Math.log2(V.MIN_PPB)} max={Math.log2(V.MAX_PPB)} step=".05" value={Math.log2(zoom)} onChange={e=>zoomTimeline(2**+e.target.value)}/>
        <button className="fl-btn" aria-label="Zoom timeline in" disabled={zoom>=V.MAX_PPB} onClick={()=>zoomTimeline(zoom*1.4)}>＋</button>
        <button className="fl-btn" onClick={fitTimeline}>Fit timeline</button>
      </div>
      <div className="daw-zoom-group"><span>Armed track height</span>
        <button className="fl-btn" aria-label="Decrease track height" disabled={trackHeight<=V.MIN_HEIGHT} onClick={()=>setTrackHeight(h=>Math.max(V.MIN_HEIGHT,h-32))}>−</button>
        <input aria-label="Track height" type="range" min={V.MIN_HEIGHT} max={V.MAX_HEIGHT} value={trackHeight} onChange={e=>setTrackHeight(+e.target.value)}/>
        <button className="fl-btn" aria-label="Increase track height" disabled={trackHeight>=V.MAX_HEIGHT} onClick={()=>setTrackHeight(h=>Math.min(V.MAX_HEIGHT,h+32))}>＋</button>
      </div>
      <span className="daw-view-hint">Ctrl/⌘ + wheel: timeline · Alt/Option + wheel: track height</span>
    </div>
    <div className="daw-scroll" ref={scrollRef} onScroll={onViewportScroll}><div className="daw-arrangement" style={{width:200+totalBeats*zoom}}><div className="daw-window" style={{width:bounds.width}}>
      <div className="daw-ruler"><div className="daw-track-label">TRACKS <small>Bars · beats · 16ths / seconds</small></div><div className="daw-ruler-line" style={{width:laneWidth}} onClick={seek}>
        {grid.filter(t=>t.label).map(t=><span key={t.beat} style={{left:t.x}}><strong>{t.label}</strong><small>{+(t.beat*beatSeconds).toFixed(2)}s</small></span>)}
        {loop&&<div className="daw-loop-region" style={{left:V.beatToX(0,viewport),width:loopBars*4*zoom}}/>}
      </div></div>
      {tracks.map((track,index)=><div key={track.id} className={'daw-track '+(armed===track.id?'armed':'')} style={{'--track-height':`${trackLayouts[index].height}px`}}>
        <div className="daw-track-label"><input aria-label={`Track ${index+1} name`} value={track.name} disabled={busy} onChange={e=>setTracks(tracks.map(t=>t.id===track.id?{...t,name:e.target.value}:t))}/>
          <div className="daw-track-actions"><button disabled={busy} className={armed===track.id?'fl-btn-danger':'fl-btn'} aria-pressed={armed===track.id} onClick={()=>setArmed(track.id)}>{armed===track.id?'● Armed':'Arm'}</button><button disabled={busy} className="fl-btn" aria-pressed={track.muted} onClick={()=>edit(tracks.map(t=>t.id===track.id?{...t,muted:!t.muted}:t))}>{track.muted?'Unmute':'Mute'}</button></div>
          <label className="daw-volume">Level<input aria-label={`${track.name} volume`} type="range" min="0" max="1" step=".01" value={track.volume} disabled={busy} onChange={e=>setTracks(tracks.map(t=>t.id===track.id?{...t,volume:+e.target.value}:t))}/></label>
        </div>
        <div className="daw-lane" data-track-id={track.id} style={{width:laneWidth}} onClick={seek}>
          {trackLayouts[index].visible&&grid.map(t=><i key={t.beat} className={'daw-grid-line '+(t.bar?'bar':'')} style={{left:t.x}}/>)}
          {!track.clips.length&&<span className="daw-empty">{armed===track.id?'Ready to record · your guitar starts here':'Arm this layer to record another part'}</span>}
          {trackLayouts[index].visible&&track.clips.map(clip=>({clip,view:V.audioWindow(clip,bpm,viewport,laneWidth)})).filter(({clip,view})=>view||drag.current?.clip.id===clip.id).map(({clip,view})=>{view=view||{left:V.beatToX(C.start(clip,bpm)/beatSeconds,viewport),width:1,startSample:clip.offsetSample,lengthSamples:1,skipBeats:0,visibleBeats:0,showLeft:false,showRight:false};return <div key={clip.id} role="button" tabIndex={0} aria-label={`${clip.name}, starts at ${C.start(clip,bpm).toFixed(2)} seconds`} aria-pressed={selected===clip.id} className={'daw-clip '+(selected===clip.id?'selected':'')} style={{left:view.left,width:Math.max(1,view.width),opacity:track.muted?.4:1}} onClick={e=>{e.stopPropagation();setSelected(clip.id);}} onKeyDown={e=>{if(busy)return;if(e.key==='Enter')setSelected(clip.id);if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();edit(tracks.map(t=>({...t,clips:t.clips.map(c=>c.id===clip.id?C.moveBeat(c,c.startBeat+(e.key==='ArrowLeft'?-1:1)*(snap?1:.25)):c)})));}}} onPointerDown={e=>beginDrag(e,clip)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <span className="daw-clip-title">{clip.isWarped?'↔ ':''}{clip.name}</span><JamWave clip={clip} bpm={bpm} fromBeat={view.skipBeats} lengthBeats={view.visibleBeats} width={view.width} height={trackLayouts[index].height-60}/>
            {clip.isWarped&&clip.warpMarkers.filter(m=>m.beatPosition>=view.skipBeats&&m.beatPosition<=view.skipBeats+view.visibleBeats).map((m,i)=><i key={i} className="daw-warp-line" style={{left:(m.beatPosition-view.skipBeats)*zoom}}/>)}
            {view.showLeft&&<span className="daw-handle left" title="Trim start" onPointerDown={e=>beginDrag(e,clip,'left')}/>}{view.showRight&&<span className="daw-handle right" title="Trim end" onPointerDown={e=>beginDrag(e,clip,'right')}/>}
          </div>;})}
          {mode==='recording'&&armed===track.id&&<div className="daw-record-region" style={{left:V.beatToX(engine.current.from/beatSeconds,viewport),width:Math.max(2,(position-engine.current.from)/beatSeconds*zoom)}}>Recording…</div>}
        </div>
      </div>)}
      {position/beatSeconds>=visibleStart&&position/beatSeconds<=visibleEnd&&<div className="daw-playhead" style={{left:200+V.beatToX(position/beatSeconds,viewport)}}/>}
    </div></div></div>
    <div className="daw-inspector fl-panel">
      <div><span className="fl-label">{chosen?'Selected clip':'Clip editor'}</span><p>{chosen?chosen.name:'Select a recorded clip to edit its timing.'}</p></div>
      {chosen&&<>
        <label>Position (beats)<input type="number" min="0" step=".25" disabled={busy} value={+chosen.startBeat.toFixed(4)} onChange={e=>changeClip(c=>[C.moveBeat(c,+e.target.value)])}/></label>
        <label>Source trim (s)<input type="number" min="0" step=".01" disabled={busy||chosen.isWarped} value={+C.offset(chosen).toFixed(3)} onChange={e=>changeClip(c=>[C.trim(c,'left',+e.target.value-C.offset(c),bpm)])}/></label>
        <label>Length (beats)<input type="number" min=".001" step=".25" disabled={busy} value={+C.clipBeatRange(chosen,bpm).lengthBeats.toFixed(4)} onChange={e=>warpEdit(c=>c.isWarped?C.setMarker(c,c.warpMarkers.length-1,{beatPosition:+e.target.value}):C.trim(c,'right',(+e.target.value-C.clipBeatRange(c,bpm).lengthBeats)*60/bpm,bpm))}/></label>
        <button className={chosen.isWarped?'fl-btn-primary':'fl-btn'} aria-pressed={chosen.isWarped} disabled={busy} onClick={()=>warpEdit(c=>C.setWarp(c,!c.isWarped,bpm))}>Warp · Repitch</button>
      </>}
    </div>
    {chosen?.isWarped&&<section className="daw-warp-editor fl-panel" aria-label="Warp markers">
      <div className="daw-tools"><strong>Warp markers</strong><button className="fl-btn" disabled={busy||position*bpm/60<=chosen.startBeat||position*bpm/60>=chosen.startBeat+chosen.lengthBeats} onClick={()=>warpEdit(c=>C.addMarker(c,position*bpm/60-c.startBeat))}>Add marker at playhead</button></div>
      <p>Beats are relative to this clip. Source samples and beats must stay in increasing order. Repitch follows tempo and changes pitch.</p>
      {chosen.warpMarkers.map((m,i)=><div className="daw-marker-row" key={`${chosen.id}-${i}-${m.sampleIndex}-${m.beatPosition}`}>
        <span>{i===0?'Start':i===chosen.warpMarkers.length-1?'End':`Marker ${i}`}</span>
        <label>Source sample<input aria-label={`Warp marker ${i+1} source sample`} type="number" step="1" defaultValue={m.sampleIndex} disabled={busy||i===0||i===chosen.warpMarkers.length-1} onBlur={e=>{try{changeClip(c=>[C.setMarker(c,i,{sampleIndex:+e.target.value})]);}catch(err){e.target.value=m.sampleIndex;report(err);}}}/></label>
        <label>Clip beat<input aria-label={`Warp marker ${i+1} beat`} type="number" step=".25" defaultValue={m.beatPosition} disabled={busy||i===0} onBlur={e=>{try{changeClip(c=>[C.setMarker(c,i,{beatPosition:+e.target.value})]);}catch(err){e.target.value=m.beatPosition;report(err);}}}/></label>
        {i>0&&i<chosen.warpMarkers.length-1&&<button className="fl-btn" disabled={busy} onClick={()=>warpEdit(c=>C.validateMarkers(c,c.warpMarkers.filter((_,j)=>j!==i)))}>Remove marker</button>}
      </div>)}
    </section>}
    <p className="daw-message" role="status">{message}</p>
    <div className="daw-tools"><button className="fl-btn" disabled={busy} onClick={saveSession}>Save session</button><button className="fl-btn" disabled={busy} onClick={loadSession}>Restore session</button><button className="fl-btn" disabled={busy||!C.end(tracks,bpm)} onClick={exportMix}>Export WAV mix</button><label className="fl-btn daw-import">Import audio<input type="file" accept="audio/*" disabled={busy} onChange={e=>{importAudio(e.target.files[0]);e.target.value='';}}/></label></div>
    {legacyLoops.length>0&&<details className="daw-legacy"><summary>Previously saved loops ({legacyLoops.length})</summary>{legacyLoops.map(l=><button className="fl-btn" key={l.id} disabled={busy} onClick={async()=>{try{const blob=await loadLegacy(l.id);await importAudio(new File([blob],l.name||'Saved loop',{type:blob.type}));}catch(err){report(err);}}}>Import {l.name||'Saved loop'}</button>)}</details>}
    <p className="daw-note">Drag clips to move them; drag either edge to trim. Click the ruler to place the playhead, then split. Timeline zoom changes horizontal scale; track height changes vertical scale. Neither alters your audio. Save your session before closing. Warped clips stay beat-locked and use Repitch playback. Unwarped clips keep their natural speed; their beat width changes with tempo. Clip starts stay on the same beat. Loop playback repeats the selected number of bars; recording runs freely.</p>
  </div>;
};
const JamWave = React.memo(({clip,bpm,fromBeat,lengthBeats,width,height})=>{
  const ref=React.useRef();
  React.useEffect(()=>{
    const canvas=ref.current,ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
    const pixels=Math.max(1,Math.ceil(width*dpr));canvas.width=pixels;canvas.height=Math.max(1,Math.ceil(height*dpr));
    const buckets=JamView.clipWaveform(clip,bpm,fromBeat,lengthBeats,pixels),mid=canvas.height/2;
    ctx.strokeStyle='#b4d1ae';ctx.beginPath();
    buckets.forEach(([min,max],x)=>{ctx.moveTo(x,mid-max*mid);ctx.lineTo(x,mid-min*mid+1);});ctx.stroke();
  },[clip,bpm,fromBeat,lengthBeats,width,height]);
  return <canvas ref={ref} aria-hidden="true"/>;
});
