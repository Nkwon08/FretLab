// View math has no access to the transport, BPM setters, or editable audio data.
(function(root) {
  const MIN_PPB=2, MAX_PPB=1024, MIN_HEIGHT=112, MAX_HEIGHT=480;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const beatToX=(beat,v)=>(beat-v.scrollOffsetBeats)*v.pixelsPerBeat;
  const xToBeat=(x,v)=>v.scrollOffsetBeats+x/v.pixelsPerBeat;
  function zoomAt(v,x,factor) {
    const anchor=xToBeat(x,v), pixelsPerBeat=clamp(v.pixelsPerBeat*factor,MIN_PPB,MAX_PPB);
    return {...v,pixelsPerBeat,scrollOffsetBeats:Math.max(0,anchor-x/pixelsPerBeat)};
  }
  const wheelPixels=(delta,mode,page=600)=>delta*(mode===1?16:mode===2?page:1);
  const wheelFactor=delta=>Math.exp(-clamp(delta,-1000,1000)*.002);
  const heightFor=(v,id)=>v.trackHeights[id]||133;
  const resizeTrack=(v,id,height)=>({...v,trackHeights:{...v.trackHeights,[id]:clamp(height,MIN_HEIGHT,MAX_HEIGHT)}});
  function bindWheel(el,update,isDragging=()=>false) {
    const wheel=e=>{
      if(e.ctrlKey||e.metaKey) {
        e.preventDefault();if(isDragging())return;
        const x=clamp(e.clientX-el.getBoundingClientRect().left-200,0,Math.max(0,el.clientWidth-200));
        update(v=>zoomAt(v,x,wheelFactor(wheelPixels(e.deltaY,e.deltaMode,el.clientHeight))));
      } else if(e.altKey) {
        const lane=e.target.closest('.daw-lane');if(!lane)return;
        e.preventDefault();if(isDragging())return;
        const id=lane.dataset.trackId;
        update(v=>resizeTrack(v,id,heightFor(v,id)*wheelFactor(wheelPixels(e.deltaY,e.deltaMode,el.clientHeight))));
      }
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>el.removeEventListener('wheel',wheel);
  }
  function grid(v,width) {
    const steps=[.25,.5,1,2,4,8,16,32,64,128,256,512];
    const minor=steps.find(n=>n*v.pixelsPerBeat>=12)||512;
    const label=steps.find(n=>n*v.pixelsPerBeat>=76)||512;
    const from=Math.ceil(v.scrollOffsetBeats/minor),to=Math.floor((v.scrollOffsetBeats+width/v.pixelsPerBeat)/minor);
    return Array.from({length:Math.max(0,to-from+1)},(_,i)=>{
      const beat=(from+i)*minor;
      const bar=Math.floor(beat/4)+1, b=Math.floor(beat%4)+1, sixteenth=Math.round((beat%1)*4)+1;
      return {beat,x:beatToX(beat,v),bar:beat%4===0,label:Math.abs(beat/label-Math.round(beat/label))<1e-6?`${bar}.${b}${label<1?'.'+sixteenth:''}`:null};
    });
  }
  function clipWindow(startBeat,endBeat,v,width) {
    const left=beatToX(startBeat,v),right=beatToX(endBeat,v);
    if(right<=0||left>=width)return null;
    return {left:Math.max(0,left),width:Math.min(width,right)-Math.max(0,left),skipBeats:Math.max(0,-left/v.pixelsPerBeat),showLeft:left>=0,showRight:right<=width};
  }
  function audioWindow(clip,bpm,v,width) {
    const C=root.JamCore,range=C.clipBeatRange(clip,bpm);
    const view=clipWindow(range.startBeat,range.endBeat,v,width);
    if(!view)return null;
    const visibleBeats=view.width/v.pixelsPerBeat;
    const startSample=C.sampleAtBeat(clip,view.skipBeats,bpm),endSample=C.sampleAtBeat(clip,view.skipBeats+visibleBeats,bpm);
    return {...view,visibleBeats,startSample,lengthSamples:endSample-startSample,samplesPerPixel:(endSample-startSample)/view.width};
  }
  function clipWaveform(clip,bpm,fromBeat,lengthBeats,pixels) {
    const C=root.JamCore;
    return waveform(clip.buffer,0,0,pixels,x=>C.sampleAtBeat(clip,fromBeat+x/pixels*lengthBeats,bpm));
  }
  const peakCache=new WeakMap();
  function peaks(buffer) {
    if(peakCache.has(buffer))return peakCache.get(buffer);
    const data=buffer.getChannelData(0),levels=[];let size=64;
    let min=new Float32Array(Math.ceil(data.length/size)),max=new Float32Array(min.length);
    for(let b=0;b<min.length;b++) {let lo=Infinity,hi=-Infinity;for(let i=b*size;i<Math.min(data.length,(b+1)*size);i++){lo=Math.min(lo,data[i]);hi=Math.max(hi,data[i]);}min[b]=lo;max[b]=hi;}
    levels.push({size,min,max});
    while(min.length>1){const nextMin=new Float32Array(Math.ceil(min.length/2)),nextMax=new Float32Array(nextMin.length);for(let i=0;i<nextMin.length;i++){nextMin[i]=Math.min(min[i*2],min[i*2+1]??Infinity);nextMax[i]=Math.max(max[i*2],max[i*2+1]??-Infinity);}size*=2;min=nextMin;max=nextMax;levels.push({size,min,max});}
    peakCache.set(buffer,levels);return levels;
  }
  function waveform(buffer,startSample,length,pixels,sampleAtPixel) {
    const data=buffer.getChannelData(0),levels=peaks(buffer),step=length/pixels;
    const result=[];
    for(let x=0;x<pixels;x++) {
      const a=Math.max(0,Math.floor(sampleAtPixel?sampleAtPixel(x):startSample+x*step)),b=Math.min(data.length,Math.max(a+1,Math.ceil(sampleAtPixel?sampleAtPixel(x+1):startSample+(x+1)*step)));
      let lo=Infinity,hi=-Infinity,cursor=a;
      // Raw samples only at partial 64-sample edges; aggregate the interior
      // using aligned cached buckets. This keeps trimmed-edge peaks exact.
      while(cursor<b&&(cursor%64||b-cursor<64)){lo=Math.min(lo,data[cursor]);hi=Math.max(hi,data[cursor++]);}
      while(cursor+64<=b) {
        let level=0;
        while(level+1<levels.length&&cursor%levels[level+1].size===0&&cursor+levels[level+1].size<=b)level++;
        const bucket=levels[level],i=cursor/bucket.size;
        lo=Math.min(lo,bucket.min[i]);hi=Math.max(hi,bucket.max[i]);cursor+=bucket.size;
      }
      while(cursor<b){lo=Math.min(lo,data[cursor]);hi=Math.max(hi,data[cursor++]);}
      result.push([Number.isFinite(lo)?lo:0,Number.isFinite(hi)?hi:0]);
    }
    return result;
  }
  root.JamView={MIN_PPB,MAX_PPB,MIN_HEIGHT,MAX_HEIGHT,beatToX,xToBeat,zoomAt,wheelPixels,wheelFactor,heightFor,resizeTrack,bindWheel,grid,clipWindow,audioWindow,clipWaveform,peaks,waveform};
})(typeof window!=='undefined'?window:globalThis);
