/* ============================================================================
   AUDIO — all of it synthesised, none of it downloaded.

   A zombies map is carried by sound more than by light: you are supposed to
   hear the round arrive behind you. Nothing here is a sample, so the whole
   soundtrack costs about a hundred lines and zero bytes over the wire, and it
   unlocks on the first gesture the way iOS insists.
   ========================================================================== */
let AC=null, noiseBuf=null, master=null, conv=null;
function audioInit(){
  if(AC) return;
  const C=window.AudioContext||window.webkitAudioContext; if(!C) return;
  AC=new C();
  master=AC.createGain(); master.gain.value=.85; master.connect(AC.destination);
  noiseBuf=AC.createBuffer(1, (AC.sampleRate*.6)|0, AC.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.3);
  /* A short synthesised impulse gives the theater some tail. It is one decay
     curve of noise, which is a crude reverb and exactly enough of one. */
  const len=(AC.sampleRate*1.1)|0;
  const imp=AC.createBuffer(2,len,AC.sampleRate);
  for(let ch=0;ch<2;ch++){
    const a=imp.getChannelData(ch);
    for(let i=0;i<len;i++) a[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2)*.55;
  }
  conv=AC.createConvolver(); conv.buffer=imp;
  const wet=AC.createGain(); wet.gain.value=.30;
  conv.connect(wet); wet.connect(master);
}
function ready(){ if(!AC) return false; if(AC.state==="suspended"&&AC.resume) AC.resume(); return true; }
function bus(vol,verb){
  const g=AC.createGain(); g.gain.value=1; g.connect(master);
  if(verb&&conv){ const s=AC.createGain(); s.gain.value=verb; g.connect(s); s.connect(conv); }
  const o=AC.createGain(); o.gain.value=vol; o.connect(g);
  return o;
}
function nz(){ const s=AC.createBufferSource(); s.buffer=noiseBuf; return s; }
function osc(type,f){ const o=AC.createOscillator(); o.type=type; o.frequency.value=f; return o; }
function lp(f,q){ const b=AC.createBiquadFilter(); b.type="lowpass"; b.frequency.value=f; if(q)b.Q.value=q; return b; }
function bp(f,q){ const b=AC.createBiquadFilter(); b.type="bandpass"; b.frequency.value=f; b.Q.value=q||1; return b; }
function hp(f){ const b=AC.createBiquadFilter(); b.type="highpass"; b.frequency.value=f; return b; }

/* Volume from distance, so a shot across the theater is a shot across the
   theater. Cheap stand-in for real panning, which would need a listener. */
function dvol(p,base,range){
  if(!p) return base;
  const d=Math.hypot(p[0]-me.p[0],(p[1]||0)-me.p[1],p[2]-me.p[2]);
  return base*Math.max(0,1-d/(range||34))**1.6;
}

function gunshot(kind,vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol,.34);
  const boom = {pistol:[210,.11],rifle:[150,.15],smg:[190,.10],shotgun:[95,.24],
                lmg:[125,.19],ray:[0,0],thunder:[0,0]}[kind]||[170,.13];
  const s=nz(), f=bp(kind==="shotgun"?720:kind==="pistol"?1550:1180, .8);
  s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+boom[1]);
  s.start(t); s.stop(t+boom[1]+.02);
  if(boom[0]){
    const o=osc("triangle",boom[0]), og=AC.createGain();
    o.frequency.exponentialRampToValueAtTime(boom[0]*.35,t+.09);
    og.gain.setValueAtTime(.7,t); og.gain.exponentialRampToValueAtTime(.001,t+.13);
    o.connect(og); og.connect(g); o.start(t); o.stop(t+.15);
  }
}
function raygun(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol,.5);
  const o=osc("square",1100), o2=osc("sawtooth",560);
  o.frequency.exponentialRampToValueAtTime(180,t+.20);
  o2.frequency.exponentialRampToValueAtTime(90,t+.20);
  const f=lp(2600,7); f.frequency.exponentialRampToValueAtTime(400,t+.22);
  o.connect(f); o2.connect(f); f.connect(g);
  g.gain.setValueAtTime(.9,t); g.gain.exponentialRampToValueAtTime(.001,t+.24);
  o.start(t); o2.start(t); o.stop(t+.26); o2.stop(t+.26);
}
function thundershot(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol,.7);
  const s=nz(), f=lp(340,4);
  f.frequency.setValueAtTime(160,t); f.frequency.exponentialRampToValueAtTime(2200,t+.30);
  s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.62);
  s.start(t); s.stop(t+.64);
  const o=osc("sine",44); o.frequency.exponentialRampToValueAtTime(22,t+.5);
  const og=AC.createGain(); og.gain.setValueAtTime(1,t); og.gain.exponentialRampToValueAtTime(.001,t+.55);
  o.connect(og); og.connect(g); o.start(t); o.stop(t+.6);
}
function sfxHit(head){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(head?.24:.15,.15);
  const o=osc("triangle",head?980:700);
  o.frequency.exponentialRampToValueAtTime(head?1650:1080,t+.055);
  o.connect(g); g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.09);
  o.start(t); o.stop(t+.1);
}
function sfxFlesh(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.2,.2);
  const s=nz(), f=lp(500,2);
  s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.16);
  s.start(t); s.stop(t+.18);
}
function sfxBoom(vol,low){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.5,.6);
  const s=nz(), f=lp(low?260:900,1.6);
  f.frequency.exponentialRampToValueAtTime(70,t+.5);
  s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.62);
  s.start(t); s.stop(t+.64);
  const o=osc("sine",70); o.frequency.exponentialRampToValueAtTime(28,t+.4);
  const og=AC.createGain(); og.gain.setValueAtTime(.9,t); og.gain.exponentialRampToValueAtTime(.001,t+.46);
  o.connect(og); og.connect(g); o.start(t); o.stop(t+.5);
}
/* The moan. Two detuned saws through a slow filter sweep — it is not a voice,
   but at twelve metres in a dark room the difference stops mattering. */
function moan(vol,pitch){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol,.55);
  const f0=(pitch||1)*(72+Math.random()*40);
  const o=osc("sawtooth",f0), o2=osc("sawtooth",f0*1.011);
  const f=lp(300,6);
  f.frequency.setValueAtTime(190,t);
  f.frequency.linearRampToValueAtTime(520+Math.random()*260,t+.45);
  f.frequency.linearRampToValueAtTime(160,t+1.15);
  o.frequency.linearRampToValueAtTime(f0*.86,t+1.1);
  o2.frequency.linearRampToValueAtTime(f0*.87,t+1.1);
  o.connect(f); o2.connect(f); f.connect(g);
  g.gain.setValueAtTime(.01,t); g.gain.linearRampToValueAtTime(1,t+.2);
  g.gain.linearRampToValueAtTime(.001,t+1.2);
  o.start(t); o2.start(t); o.stop(t+1.25); o2.stop(t+1.25);
}
function howl(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol,.65);
  const o=osc("sawtooth",240);
  o.frequency.linearRampToValueAtTime(430,t+.3);
  o.frequency.linearRampToValueAtTime(300,t+1.0);
  const f=lp(1400,5); o.connect(f); f.connect(g);
  g.gain.setValueAtTime(.01,t); g.gain.linearRampToValueAtTime(1,t+.14);
  g.gain.linearRampToValueAtTime(.001,t+1.05);
  o.start(t); o.stop(t+1.1);
}
function sfxClick(vol,f){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.16,.1);
  const s=nz(), b=bp(f||2400,7); s.connect(b); b.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.045);
  s.start(t); s.stop(t+.05);
}
/* A little rising arpeggio for anything that goes right, and a flat buzz for
   anything that does not. Two sounds carry the whole economy. */
function jingle(notes,vol,type){
  if(!ready()) return;
  const t=AC.currentTime;
  notes.forEach((n,i)=>{
    const g=bus((vol||.16)*(1-i*.06),.45);
    const o=osc(type||"triangle",n);
    o.connect(g);
    const s=t+i*.085;
    g.gain.setValueAtTime(.001,s); g.gain.linearRampToValueAtTime(1,s+.012);
    g.gain.exponentialRampToValueAtTime(.001,s+.34);
    o.start(s); o.stop(s+.36);
  });
}
function deny(){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(.13,.1);
  const o=osc("square",150); o.frequency.setValueAtTime(150,t);
  o.frequency.setValueAtTime(110,t+.07);
  o.connect(g); g.gain.setValueAtTime(1,t); g.gain.setValueAtTime(0,t+.14);
  o.start(t); o.stop(t+.15);
}
function sfxPower(){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(.4,.8);
  const o=osc("sawtooth",40); o.frequency.exponentialRampToValueAtTime(220,t+1.4);
  const f=lp(300,9); f.frequency.exponentialRampToValueAtTime(3400,t+1.5);
  o.connect(f); f.connect(g);
  g.gain.setValueAtTime(.05,t); g.gain.linearRampToValueAtTime(1,t+1.2);
  g.gain.exponentialRampToValueAtTime(.001,t+2.2);
  o.start(t); o.stop(t+2.3);
  const s=nz(), b=bp(2000,2); s.connect(b); b.connect(g);
  s.start(t+1.25); s.stop(t+1.6);
}
function sfxTele(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.34,.7);
  const s=nz(), f=bp(400,3);
  f.frequency.exponentialRampToValueAtTime(5200,t+.7);
  s.connect(f); f.connect(g);
  g.gain.setValueAtTime(.1,t); g.gain.linearRampToValueAtTime(1,t+.5);
  g.gain.exponentialRampToValueAtTime(.001,t+.95);
  s.start(t); s.stop(t+1);
}
function sfxZap(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.22,.4);
  const s=nz(), f=hp(2200); s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t);
  for(let i=1;i<7;i++) g.gain.setValueAtTime(i%2?.15:1, t+i*.028);
  g.gain.exponentialRampToValueAtTime(.001,t+.24);
  s.start(t); s.stop(t+.26);
}
function sfxRound(){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(.30,.9);
  const o=osc("sine",58), o2=osc("sawtooth",29);
  const f=lp(420,3);
  o.connect(f); o2.connect(f); f.connect(g);
  g.gain.setValueAtTime(.01,t); g.gain.linearRampToValueAtTime(1,t+.5);
  g.gain.exponentialRampToValueAtTime(.001,t+2.6);
  o.start(t); o2.start(t); o.stop(t+2.7); o2.stop(t+2.7);
}
function sfxStep(vol){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(vol||.05,.12);
  const s=nz(), f=lp(320,1.4); s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.07);
  s.start(t); s.stop(t+.08);
}
function sfxPain(){
  if(!ready()) return;
  const t=AC.currentTime, g=bus(.3,.25);
  const s=nz(), f=lp(360); s.connect(f); f.connect(g);
  g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(.001,t+.26);
  s.start(t); s.stop(t+.28);
}
