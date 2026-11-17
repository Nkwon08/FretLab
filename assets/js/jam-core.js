/* Original browser implementation inspired by Audio-Loop-Station's independent
   track buffers and shared transport clock. See docs/jam-mode.md. */
(function (root) {
  const id = () => crypto.randomUUID();
  // Arrangement coordinates are beats. Sample indices address immutable source audio only.
  const samplesToBeats=(samples,sampleRate,bpm)=>(samples/sampleRate)*(bpm/60);
  const beatsToSamples=(beats,sampleRate,bpm)=>beats*(60/bpm)*sampleRate;
  const offset=c=>c.offsetSample/c.buffer.sampleRate;
  const start=(c,bpm=120)=>c.startBeat*60/bpm;
  function clipBeatRange(c,bpm) {
    const lengthBeats=c.type==='midi'||c.isWarped?c.lengthBeats:samplesToBeats(c.lengthSamples,c.buffer.sampleRate,bpm);
    return {startBeat:c.startBeat,lengthBeats,endBeat:c.startBeat+lengthBeats};
  }
  const duration=(c,bpm=120)=>clipBeatRange(c,bpm).lengthBeats*60/bpm;
  const withTempo=(c,bpm)=>({...c,lengthBeats:clipBeatRange(c,bpm).lengthBeats});
  const create=(buffer,at=0,name='Guitar take',bpm=120)=>({id:id(),type:'audio',timebase:'beats',name,buffer,startBeat:at*bpm/60,lengthBeats:samplesToBeats(buffer.length,buffer.sampleRate,bpm),offsetSample:0,lengthSamples:buffer.length,isWarped:false,warpMarkers:[]});
  const moveBeat=(c,beat)=>({...c,startBeat:Math.max(0,beat)});
  const move=(c,seconds,bpm=120)=>moveBeat(c,seconds*bpm/60);
  function migrate(c,bpm=120) {
    if(c.startBeat!==undefined){const restored=withTempo({...c,type:c.type||'audio',isWarped:!!c.isWarped,warpMarkers:c.warpMarkers||[]},bpm);return restored.isWarped?validateMarkers(restored,restored.warpMarkers):restored;}
    const rate=c.buffer.sampleRate;
    return {...create(c.buffer,(c.startSample!==undefined?c.startSample/rate:c.start),c.name,bpm),id:c.id,
      offsetSample:c.offsetSample??Math.round(c.offset*rate),lengthSamples:c.lengthSamples??Math.round(c.duration*rate),
      lengthBeats:samplesToBeats(c.lengthSamples??Math.round(c.duration*rate),rate,bpm)};
  }
  function markers(c,bpm) {
    return c.isWarped?c.warpMarkers:[{sampleIndex:c.offsetSample,beatPosition:0},{sampleIndex:c.offsetSample+c.lengthSamples,beatPosition:clipBeatRange(c,bpm).lengthBeats}];
  }
  function sampleAtBeat(c,beat,bpm=120) {
    const m=markers(c,bpm);beat=Math.max(0,Math.min(m[m.length-1].beatPosition,beat));
    let i=1;while(i<m.length-1&&m[i].beatPosition<beat)i++;
    const a=m[i-1],b=m[i];return a.sampleIndex+(beat-a.beatPosition)/(b.beatPosition-a.beatPosition)*(b.sampleIndex-a.sampleIndex);
  }
  function validateMarkers(c,list) {
    if(list.length<2)throw Error('Keep a start and end warp marker.');
    for(let i=0;i<list.length;i++) {
      const m=list[i];if(!Number.isInteger(m.sampleIndex)||!Number.isFinite(m.beatPosition)||m.sampleIndex<c.offsetSample||m.sampleIndex>c.offsetSample+c.lengthSamples||m.beatPosition<0)throw Error('Warp markers need valid source sample indices and beat positions.');
      if(i&&(m.sampleIndex<=list[i-1].sampleIndex||m.beatPosition<=list[i-1].beatPosition))throw Error('Warp markers must stay in increasing sample and beat order.');
    }
    if(list[0].beatPosition!==0||list[0].sampleIndex!==c.offsetSample||list[list.length-1].sampleIndex!==c.offsetSample+c.lengthSamples)throw Error('Keep the first and last source markers at the clip edges.');
    return {...c,warpMarkers:list,lengthBeats:list[list.length-1].beatPosition};
  }
  function setWarp(c,enabled,bpm) {
    const lengthBeats=samplesToBeats(c.lengthSamples,c.buffer.sampleRate,bpm);
    return {...c,isWarped:enabled,lengthBeats,warpMarkers:enabled?[{sampleIndex:c.offsetSample,beatPosition:0},{sampleIndex:c.offsetSample+c.lengthSamples,beatPosition:lengthBeats}]:[]};
  }
  function setMarker(c,index,patch) {return validateMarkers(c,c.warpMarkers.map((m,i)=>i===index?{...m,...patch}:m));}
  function addMarker(c,beat) {
    if(!c.isWarped||beat<=0||beat>=c.lengthBeats)throw Error('Place the playhead inside the warped clip.');
    const list=[...c.warpMarkers,{sampleIndex:Math.round(sampleAtBeat(c,beat)),beatPosition:beat}].sort((a,b)=>a.beatPosition-b.beatPosition);
    return validateMarkers(c,list);
  }
  function slice(c,from,to,bpm) {
    const a=Math.round(sampleAtBeat(c,from,bpm)),b=Math.round(sampleAtBeat(c,to,bpm));
    if(b<=a)return c;
    const list=c.isWarped?[{sampleIndex:a,beatPosition:0},...c.warpMarkers.filter(m=>m.beatPosition>from&&m.beatPosition<to&&m.sampleIndex>a&&m.sampleIndex<b).map(m=>({...m,beatPosition:m.beatPosition-from})),{sampleIndex:b,beatPosition:to-from}]:[];
    return {...c,startBeat:c.startBeat+from,lengthBeats:to-from,offsetSample:a,lengthSamples:b-a,warpMarkers:list};
  }
  function split(c,time,bpm=120) {
    const at=time*bpm/60-c.startBeat,len=clipBeatRange(c,bpm).lengthBeats;
    if(at<=0||at>=len)return [c];
    const left=slice(c,0,at,bpm),right=slice(c,at,len,bpm);
    if(left===c||right===c)return [c];
    return [left,{...right,id:id()}];
  }
  function trim(c,edge,seconds,bpm=120) {
    const len=clipBeatRange(c,bpm).lengthBeats,min=1e-5;
    if(c.isWarped) {
      const delta=seconds*bpm/60;
      return edge==='left'?slice(c,Math.max(0,Math.min(len-min,delta)),len,bpm):slice(c,0,Math.max(min,Math.min(len,len+delta)),bpm);
    }
    let delta=Math.round(seconds*c.buffer.sampleRate);
    if(edge==='left') {
      delta=Math.max(-c.offsetSample,-Math.floor(beatsToSamples(c.startBeat,c.buffer.sampleRate,bpm)),Math.min(c.lengthSamples-1,delta));
      return withTempo({...c,startBeat:c.startBeat+samplesToBeats(delta,c.buffer.sampleRate,bpm),offsetSample:c.offsetSample+delta,lengthSamples:c.lengthSamples-delta},bpm);
    }
    return withTempo({...c,lengthSamples:Math.max(1,Math.min(c.buffer.length-c.offsetSample,c.lengthSamples+delta))},bpm);
  }
  const end=(tracks,bpm=120)=>Math.max(0,...tracks.flatMap(t=>t.clips.map(c=>start(c,bpm)+duration(c,bpm))));
  function schedule(ctx,tracks,position,when,destination,loopLength=0,bpm=120) {
    const nodes=[];
    tracks.filter(t=>!t.muted).forEach(t=>t.clips.forEach(c=>{
      if(c.type==='midi')return; // MIDI editor/synthesis is outside this audio-recording workspace.
      const list=markers(c,bpm);
      for(let i=1;i<list.length;i++) {
        const a=list[i-1],b=list[i],segmentStart=(c.startBeat+a.beatPosition)*60/bpm,segmentEnd=(c.startBeat+b.beatPosition)*60/bpm;
        const from=Math.max(position,segmentStart),to=Math.min(segmentEnd,loopLength||Infinity);
        if(to<=from)continue;
        const rate=(b.sampleIndex-a.sampleIndex)/c.buffer.sampleRate/(segmentEnd-segmentStart);
        const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=c.buffer;source.playbackRate.value=rate;gain.gain.value=t.volume;
        source.connect(gain).connect(destination);
        const at=when+from-position,sourceOffset=a.sampleIndex/c.buffer.sampleRate+(from-segmentStart)*rate;
        source.start(at,sourceOffset,(to-from)*rate);source.stop(at+to-from);
        source.onended=()=>{source.disconnect();gain.disconnect();};nodes.push(source);
      }
    }));return nodes;
  }
  function wav(buffer) {
    const channels = buffer.numberOfChannels, bytes = buffer.length*channels*2;
    const view = new DataView(new ArrayBuffer(44+bytes));
    const str = (at,s) => [...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    str(0,'RIFF');view.setUint32(4,36+bytes,true);str(8,'WAVE');str(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
    view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);
    view.setUint16(32,channels*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,bytes,true);
    const data = Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
    for(let i=0;i<buffer.length;i++) for(let ch=0;ch<channels;ch++) {
      const s=Math.max(-1,Math.min(1,data[ch][i]));view.setInt16(44+(i*channels+ch)*2,s<0?s*32768:s*32767,true);
    }
    return new Blob([view],{type:'audio/wav'});
  }
  root.JamCore={id,start,offset,duration,samplesToBeats,beatsToSamples,clipBeatRange,withTempo,create,move,moveBeat,migrate,markers,sampleAtBeat,validateMarkers,setWarp,setMarker,addMarker,end,split,trim,schedule,wav};
})(typeof window !== 'undefined' ? window : globalThis);
