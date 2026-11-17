const {test}=require('node:test'),assert=require('node:assert/strict');
require('../assets/js/jam-core.js');require('../assets/js/jam-view.js');
const V=global.JamView,C=global.JamCore;
const view={pixelsPerBeat:80,scrollOffsetBeats:32,trackHeights:{a:150,b:220}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('beat/screen roundtrip and cursor anchoring at arbitrary pan/zoom',()=>{for(const x of [0,15,220,800])for(const factor of [.01,.5,1,2,100]){close(V.beatToX(V.xToBeat(x,view),view),x);const next=V.zoomAt(view,x,factor);if(next.scrollOffsetBeats>0)close(V.xToBeat(x,view),V.xToBeat(x,next));assert.ok(next.pixelsPerBeat>=V.MIN_PPB&&next.pixelsPerBeat<=V.MAX_PPB);}});
test('wheel units and independent track resizing',()=>{assert.equal(V.wheelPixels(2,1),32);assert.equal(V.wheelPixels(1,2,400),400);const next=V.resizeTrack(view,'a',10000);assert.equal(next.trackHeights.a,V.MAX_HEIGHT);assert.equal(next.trackHeights.b,220);assert.equal(view.trackHeights.a,150);assert.equal(next.pixelsPerBeat,80);});
test('culling clips including both edges and fully offscreen clips',()=>{assert.equal(V.clipWindow(0,31,view,800),null);assert.equal(V.clipWindow(42,45,view,800),null);assert.deepEqual(V.clipWindow(30,35,view,800),{left:0,width:240,skipBeats:2,showLeft:false,showRight:true});assert.deepEqual(V.clipWindow(40,48,view,800),{left:640,width:160,skipBeats:0,showLeft:true,showRight:false});});
test('visible grid is bounded, labels spaced, and sixteenths appear at high zoom',()=>{for(const ppb of [2,20,80,400,1024]){const v={...view,pixelsPerBeat:ppb,scrollOffsetBeats:10000.125};const ticks=V.grid(v,1200),labels=ticks.filter(t=>t.label);assert.ok(ticks.length<=102);assert.ok(ticks.every(t=>t.x>=0&&t.x<=1200));for(let i=1;i<labels.length;i++)assert.ok(labels[i].x-labels[i-1].x>=76);if(ppb>=400)assert.ok(labels.some(t=>t.label.split('.').length===3));}});
test('cached peak pyramid preserves transients and close zoom reads exact samples',()=>{let reads=0;const data=new Float32Array(65536);data[1000]=1;data[32000]=-.75;const buffer={getChannelData(){reads++;return data;}};assert.equal(V.peaks(buffer),V.peaks(buffer));assert.equal(reads,1);const buckets=V.waveform(buffer,0,data.length,64);assert.ok(buckets.some(([lo,hi])=>hi===1));assert.ok(buckets.some(([lo,hi])=>lo===-.75));assert.deepEqual(V.waveform(buffer,999,3,3),[[0,0],[1,1],[0,0]]);});
test('zoom/pan/resize cannot affect clip samples or scheduled audio',()=>{const buffer={sampleRate:48000,length:480000};const clip=C.create(buffer,3);const tracks=[{volume:.7,clips:[clip]}],snapshot=JSON.stringify(tracks);function scheduled(){const times=[];const ctx={createBufferSource:()=>({playbackRate:{value:1},stop(){},connect:()=>({connect(){}}),start:(...a)=>times.push(a)}),createGain:()=>({gain:{}})};C.schedule(ctx,tracks,1,10,{});return times;}const before=scheduled();let v=view;for(let i=0;i<100;i++)v=V.resizeTrack(V.zoomAt(v,250,V.wheelFactor(i%2?100:-100)),'a',100+i);assert.equal(JSON.stringify(tracks),snapshot);assert.deepEqual(scheduled(),before);});

test('peak queries do not bleed transients from trimmed-away samples',()=>{const data=new Float32Array(8192);data[63]=1;data[8001]=-1;const b={getChannelData:()=>data};assert.ok(V.waveform(b,64,7936,8).every(([lo,hi])=>lo===0&&hi===0));});

test('native wheel binding anchors Ctrl/Cmd, resizes only hovered track, and cleans up',()=>{
 let state=view,handler,removed=false,prevented=0;
 const el={clientWidth:1000,clientHeight:500,getBoundingClientRect:()=>({left:20}),addEventListener:(name,fn,options)=>{assert.equal(options.passive,false);handler=fn;},removeEventListener:(name,fn)=>{assert.equal(fn,handler);removed=true;}};
 const cleanup=V.bindWheel(el,update=>state=update(state));
 const event={clientX:520,deltaY:-120,deltaMode:0,target:{closest:()=>({dataset:{trackId:'a'}})},preventDefault:()=>prevented++};
 const anchor=V.xToBeat(300,state);
 handler({...event,ctrlKey:true});close(V.xToBeat(300,state),anchor);
 handler({...event,metaKey:true});close(V.xToBeat(300,state),anchor);
 const ppb=state.pixelsPerBeat;handler({...event,altKey:true});assert.ok(state.trackHeights.a>150);assert.equal(state.trackHeights.b,220);assert.equal(state.pixelsPerBeat,ppb);
 handler(event);assert.equal(prevented,3);cleanup();assert.ok(removed);
});

test('tempo converts unwarped samples into beats without changing audio or grid',()=>{
 const buffer={sampleRate:48000,length:192000},clip=C.create(buffer,1),v={...view,pixelsPerBeat:60,scrollOffsetBeats:0};
 const snapshot=JSON.stringify(clip),grid=V.grid(v,2000),ranges=[];
 for(const bpm of [60,120,240]) {
  const range=C.clipBeatRange(clip,bpm),w=V.audioWindow(clip,bpm,v,2000);
  assert.equal(range.lengthBeats,4*bpm/60);assert.equal(range.startBeat,2);
  close(w.width,range.lengthBeats*60);close(w.samplesPerPixel,48000*60/bpm/60);
  close(w.lengthSamples,192000);close(w.startSample,0);ranges.push(w);
  assert.deepEqual(V.grid(v,2000),grid);assert.equal(JSON.stringify(clip),snapshot);
 }
 close(ranges[2].width,ranges[1].width*2);close(ranges[2].samplesPerPixel,ranges[1].samplesPerPixel/2);
});
test('tempo-dependent clipped waveform window selects correct source samples',()=>{
 const clip=C.create({sampleRate:44100,length:441000},0),v={...view,pixelsPerBeat:100,scrollOffsetBeats:4};
 const slow=V.audioWindow(clip,60,v,400),fast=V.audioWindow(clip,120,v,400);
 close(slow.startSample,176400);close(slow.lengthSamples,176400);
 close(fast.startSample,88200);close(fast.lengthSamples,88200);
});
test('musical clip and MIDI note beat coordinates stay fixed when tempo changes',()=>{
 const midi={type:'midi',timebase:'beats',startBeat:8,lengthBeats:4,notes:[{startBeat:.5,lengthBeats:1.25,pitch:60}]};
 const snapshot=JSON.stringify(midi);
 for(const bpm of [30,60,120,300])assert.deepEqual(C.clipBeatRange(midi,bpm),{startBeat:8,lengthBeats:4,endBeat:12});
 assert.equal(JSON.stringify(midi),snapshot);
});
test('sample/beat conversion roundtrips for mixed recording sample rates',()=>{
 for(const rate of [44100,48000,96000])for(const bpm of [73,120,243])for(const samples of [0,1,123456])close(C.beatsToSamples(C.samplesToBeats(samples,rate,bpm),rate,bpm),samples);
});
