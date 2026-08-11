/* ============================================================================
   HUD

   Zombies has no health bar — damage is a blood vignette you learn to read —
   and that is a gift on a phone, because it is one fewer thing occupying the
   screen you are trying to shoot through. What is left is the two numbers that
   actually drive decisions: how many points you have, and what round it is.
   ========================================================================== */
let hitT=0, banT=0, pwT=0, flyT=0, flyAcc=0;

function banner(a,b){
  el.bt.textContent=a; el.bs.textContent=b||"";
  el.banner.style.opacity=1; banT=2.0;
}
function powerBanner(n){ el.pwt.textContent=n; el.pwrup.style.opacity=1; pwT=2.6; }
function flyPoints(n){
  flyAcc = flyT>0 ? flyAcc+n : n;
  el.ptsFly.textContent=(flyAcc>0?"+":"")+flyAcc;
  el.ptsFly.style.opacity=1; flyT=.9;
}
function flashHit(head){
  hitT=.14; el.hitmark.style.opacity=1;
  el.hitmark.querySelector("svg").setAttribute("stroke", head?"#d2273f":"#ffc233");
}
function paintPerks(){
  let h="";
  for(const k in me.perks){
    const P=PERKS[k];
    const c=`rgb(${(P.col[0]*255)|0},${(P.col[1]*255)|0},${(P.col[2]*255)|0})`;
    h+=`<div class="perk" style="background:${c};color:${c}"><span style="color:#0a0c0e">${P.s}</span></div>`;
  }
  el.perks.innerHTML=h;
}
function paintWeapon(){
  const st=wstat(curSlot());
  el.wname.textContent=st.n;
  el.wname.classList.toggle("pap", !!curSlot().pap);
  el.swap.classList.toggle("cool", me.slots.length<2);
}

let fpsAcc=0, fpsN=0, fpsShow=60, lastUse="";
function hud(dt){
  const s=curSlot(), st=wstat(s);
  el.mag.textContent = me.reloading>0 ? "--" : s.mag;
  el.res.textContent = "/"+s.res;
  el.ammo.classList.toggle("low", s.mag<=Math.max(2,st.mag*.22) && me.reloading<=0);
  el.nades.innerHTML = me.nades>0 ? "FRAG <b>"+me.nades+"</b>" : "";
  el.nadeN.textContent = me.nades>0 ? me.nades : "";
  el.nade.classList.toggle("cool", me.nades<=0);
  el.knife.classList.toggle("cool", me.knifeCd>0);
  if(el.wname.textContent!==st.n) paintWeapon();

  /* the contextual prompt is the whole economy, so it has to be instant */
  const u=nearestUse();
  if(u){
    const afford = u.cost<=0 || me.points>=u.cost;
    const k=u.name+"|"+u.cost+"|"+(u.sub||"")+"|"+afford;
    if(k!==lastUse){
      lastUse=k;
      el.useT.innerHTML = u.name + (u.cost>0 ? "  <u>["+u.cost+"]</u>" : "");
      el.useS.textContent = u.sub||"";
      el.use2.classList.toggle("no", !afford && !u.dead);
    }
    el.use2.style.opacity=1;
    el.use.classList.remove("hidden");
    el.use.classList.toggle("cool", !!u.dead || !afford);
  } else {
    el.use2.style.opacity=0; el.use.classList.add("hidden"); lastUse="";
  }

  const tg=bestTarget(2.6);
  el.cross.classList.toggle("aim", !!tg);
  el.gas.style.opacity = me.gasT>0 ? .9 : 0;

  /* the left rail: what the round is doing, and the state of the map */
  let L="";
  if(game.state==="playing"){
    if(game.toSpawn>0||game.alive>0) L+="<i>"+(game.left)+"</i> left<br>";
    else if(game.breakT>0) L+="next round in <i>"+Math.max(1,Math.ceil(T.roundBreak-game.breakT))+"</i><br>";
    if(!game.power) L+="power is <i>off</i><br>";
    if(game.papT>0) L+="projector room <i>"+Math.ceil(game.papT)+"s</i><br>";
    else if(game.link>0) L+="mainframe linked <i>"+Math.ceil(game.link)+"s</i><br>";
    if(me.insta>0) L+="<i>insta-kill</i> "+Math.ceil(me.insta)+"s<br>";
    if(me.dbl>0) L+="<i>double points</i> "+Math.ceil(me.dbl)+"s<br>";
    if(game.fireSale>0) L+="<i>fire sale</i> "+Math.ceil(game.fireSale)+"s<br>";
    const R=roomAt(me.p[0],me.p[1],me.p[2]);
    if(R) L+='<span style="opacity:.55">'+R.name.toLowerCase()+"</span>";
  }
  el.left.innerHTML=L;

  if(mode==="desk"&&game.state==="playing"){
    el.keyhud.innerHTML="<span><b>F</b> buy</span><span><b>R</b> reload</span>"+
      "<span><b>Q</b> swap</span><span><b>V</b> knife</span><span><b>G</b> frag</span>"+
      "<span><b>Shift</b> sprint</span>";
  }

  fpsAcc+=dt; fpsN++;
  if(fpsAcc>.5){
    fpsShow=Math.round(fpsN/fpsAcc); fpsAcc=0; fpsN=0;
    el.diag.innerHTML=fpsShow+" fps<br>"+cv.width+"&times;"+cv.height+
      (S.shad&&shadowOK?"<br>"+NB+"-box shadow":"")+
      "<br>"+game.alive+" up &middot; "+me.kills+" killed";
  }
}
