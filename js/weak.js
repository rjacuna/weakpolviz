/*=================== weak polarized relations : quotient of R(h) mod the black box B_k, rendered as matrices ===================*/
let weakMode=false, weakClosing=false, weakK=0, weakCirc=false, WG=null, WN=[], weakT=0, weakTgt=0, weakLayout='graph', weakHoverPileUid=-1, weakTreeMt=0, weakHoverT=0;
function inBk(i,j,r,k){ return i>=k+1 && i<=r-k-1 && j>=k+1 && j<=r-k-1; }        // black box B_k=[k+1,r-k-1]^2 (matrix coords)
function wKey(m,r,k){ let o=''; for(let i=0;i<=r;i++)for(let j=0;j<=r;j++) if(!inBk(i,j,r,k)) o+=m[i][j]+','; return o; }  // data outside B_k
function isPureOutside(m,r,kk){ for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ if(m[i][j]>0 && j+(r-i)!==r && !inBk(i,j,r,kk)) return false; } return true; }
function posetHasse(edgeList,n){ const adj={}; edgeList.forEach(([a,b])=>{(adj[a]=adj[a]||[]).push(b);});   // transitivity + transitive reduction
  const E=new Set(edgeList.map(e=>e[0]+'>'+e[1])); let poset=true;
  outer: for(const [a,b] of edgeList) for(const c of (adj[b]||[])) if(a!==c && !E.has(a+'>'+c)){ poset=false; break outer; }
  const reach=[]; for(let a=0;a<n;a++){ const seen=new Set(), st=[...(adj[a]||[])];
    while(st.length){ const u=st.pop(); if(seen.has(u))continue; seen.add(u); for(const w of (adj[u]||[])) st.push(w); } reach.push(seen); }
  const hasse=[]; for(const [a,b] of edgeList){ let cov=false; for(const c of (adj[a]||[])) if(c!==b && reach[c].has(b)){ cov=true; break; } if(!cov) hasse.push([a,b]); }
  return {isPoset:poset, hasse}; }
function computeWeak(hvec,k){
  let Gs; try{ Gs=cachedComputeGraph(hvec); }catch(e){ return null; } const r=Gs.r; k=Math.max(0,Math.min(r,Math.round(k)));
  const keys=Gs.vertices.map(m=>wKey(m,r,k)), cls=[], cidx=new Map();
  keys.forEach((kk,vi)=>{ if(!cidx.has(kk)){ cidx.set(kk,cls.length); cls.push({rep:Gs.vertices[vi],reps:[]}); } cls[cidx.get(kk)].reps.push(vi); });
  const vclass=keys.map(kk=>cidx.get(kk));
  const eset=new Set(), edges=[]; for(const [a,b] of Gs.edges){ const ca=vclass[a], cb=vclass[b]; if(ca===cb)continue; const kk=ca+'>'+cb; if(!eset.has(kk)){ eset.add(kk); edges.push([ca,cb]); } }
  const rootC=vclass[Gs.root], adj={}, indeg=new Array(cls.length).fill(0);
  edges.forEach(([a,b])=>{ (adj[a]=adj[a]||[]).push(b); indeg[b]++; });
  const rank=new Array(cls.length).fill(0), ind=indeg.slice(), qq=[];             // longest-path ranking (Hasse layers)
  for(let i=0;i<cls.length;i++) if(indeg[i]===0) qq.push(i);
  while(qq.length){ const u=qq.shift(); for(const w of (adj[u]||[])){ rank[w]=Math.max(rank[w],rank[u]+1); if(--ind[w]===0) qq.push(w); } }
  const layers={}; cls.forEach((c,i)=>{ (layers[rank[i]]=layers[rank[i]]||[]).push(i); });
  const radj={}; edges.forEach(([a,b])=>{ (radj[b]=radj[b]||[]).push(a); });
  baryOrder(layers, radj, adj);                                                    // spread each layer to cut crossings / avoid collinear stacks
  const D=(r+2)*MW*1.25, pos=[];
  Object.keys(layers).forEach(R=>{ const arr=layers[R]; arr.forEach((ci,kk)=>{ pos[ci]={x:(kk-(arr.length-1)/2)*D, y:(+R)*D}; }); });
  const kept=cls.map((c)=> k===0 ? true : c.reps.some(vi=>isPureOutside(Gs.vertices[vi],r,k-1)) );  // R_k^o = pure outside B_{k-1}
  const hp=[]; for(let i=k+1;i<=r-k-1;i++) hp.push(hvec[i]);                       // sub-vector h' on the F^k box diagonal
  const full=posetHasse(edges,cls.length);                                         // R_k relation
  const keptEdges=edges.filter(([a,b])=>kept[a]&&kept[b]), sub=posetHasse(keptEdges,cls.length);   // R_k^o subgraph
  const keptIdx=[]; for(let i=0;i<cls.length;i++) if(kept[i]) keptIdx.push(i);      // R_k^o gets its OWN layered layout (ranked among kept only) so a sub-chain renders as a line, not a zig-zag
  const adjC={}, indC={}; keptIdx.forEach(i=>indC[i]=0);
  keptEdges.forEach(([a,b])=>{ (adjC[a]=adjC[a]||[]).push(b); indC[b]++; });
  const rankC=rank.slice(); keptIdx.forEach(i=>rankC[i]=0); const indc=Object.assign({},indC), qc=[];
  keptIdx.forEach(i=>{ if(indC[i]===0) qc.push(i); });
  while(qc.length){ const u=qc.shift(); for(const w of (adjC[u]||[])){ rankC[w]=Math.max(rankC[w],rankC[u]+1); if(--indc[w]===0) qc.push(w); } }
  const layersC={}; keptIdx.forEach(i=>{ (layersC[rankC[i]]=layersC[rankC[i]]||[]).push(i); });
  const radjC={}; keptEdges.forEach(([a,b])=>{ (radjC[b]=radjC[b]||[]).push(a); });
  baryOrder(layersC, radjC, adjC);
  const posC=pos.map(p=>({x:p.x,y:p.y}));
  Object.keys(layersC).forEach(R=>{ const arr=layersC[R]; arr.forEach((ci,kk)=>{ posC[ci]={x:(kk-(arr.length-1)/2)*D, y:(+R)*D}; }); });
  return {r,k,hvec:hvec.slice(),classes:cls,vclass,edges,keptEdges,pos,posC,rank,rankC,rootC,kept,hp,
    isPoset:full.isPoset,hasse:full.hasse, isPosetC:sub.isPoset,hasseC:sub.hasse}; }
function posetTargetsW(){ return (weakCirc && WG.posC)? WG.posC : WG.pos; }     // POSET view only: R_k^o gets its own clean layered subgraph layout
function graphTargetsW(){ const circ=weakCirc&&WG.posC;
  if(graphLayout==='radial'){ const ranks={}; WN.forEach((n,i)=>ranks[i]=((circ?WG.rankC:WG.rank)?(circ?WG.rankC:WG.rank)[i]:0)); return radialLayout(ranks,(WG.r+2)*MW*1.25); }
  const src=circ?WG.posC:WG.pos, p={}; WN.forEach((n,i)=>p[i]=src[i]); return p; }   // GRAPH view: circ uses the R_k^∘ re-ranked layered layout (clean grid), else the full-quotient layout
function buildWN(){ WN=WG.classes.map((c,i)=>({ci:i, rep:c.rep, x:WG.pos[i].x, y:WG.pos[i].y, ry:WG.pos[i].y, vx:0, vy:0, expl:0})); }
function weakForce(){ const r=WG.r, REST=(r+2)*MW*1.25, REP=4*(REST/3.6)*(REST/3.6);
  for(const n of WN){ if((n.expl||0)>0.5)continue; let fx=-n.x*0.02, fy=(n.ry-n.y)*0.16;
    for(const m of WN){ if(m===n||(m.expl||0)>0.5)continue; const dx=n.x-m.x,dy=n.y-m.y,d2=dx*dx+dy*dy+1,f=REP/d2; fx+=dx*f; fy+=dy*f; } n._fx=fx; n._fy=fy; }
  for(const [a,b] of WG.edges){ const n=WN[a],m=WN[b]; if(!n||!m||(n.expl||0)>0.5||(m.expl||0)>0.5)continue;
    const dx=m.x-n.x,dy=m.y-n.y,d=Math.hypot(dx,dy)+0.01,f=(d-REST)*0.03; if(!n.pin){n._fx+=dx/d*f;n._fy+=dy/d*f;} if(!m.pin){m._fx-=dx/d*f;m._fy-=dy/d*f;} }
  for(const n of WN){ if((n.expl||0)>0.5||n.pin)continue; n.vx=(n.vx+n._fx)*0.8; n.vy=(n.vy+n._fy)*0.8; n.x+=n.vx*0.1; n.y+=n.vy*0.1; } }
function wActiveIsPoset(){ return WG? (weakCirc? WG.isPosetC : WG.isPoset) : false; }   // circ-aware (R_k^o may be a poset even if R_k isn't)
function wActiveHasse(){ return WG? (weakCirc? WG.hasseC : WG.hasse) : []; }
function setWeakLayout(l){ if(l==='poset' && WG && !wActiveIsPoset()){ showWarn('Not a poset'); scare(); return; }
  weakLayout=l; renderVizButtons(); autoFrame=true;   // renderVizButtons -> updateChrome keeps the toolbar in sync
  if(l==='tree'){ viz='tree'; playing=false; updatePlayIcon(); finishTree(); tree.forEach(n=>{n.bt=0;n.expl=0;}); weakHoverPileUid=-1; frameTree(); }
  else { buildWN(); frameWeak(); } }
function frameWeak(){ if(!WN.length)return; let a=1e9,b=1e9,c=-1e9,d=-1e9;
  for(let i=0;i<WN.length;i++){ if(weakCirc && !WG.kept[i]) continue; const n=WN[i]; a=Math.min(a,n.x);c=Math.max(c,n.x);b=Math.min(b,n.y);d=Math.max(d,n.y); }
  if(a>c){ a=-1;c=1;b=-1;d=1; } const m=(WG.r+2)*MW*1.4; a-=m;c+=m;b-=m;d+=m; const w=(c-a)||1,h=(d-b)||1;
  cam.tx=(a+c)/2; cam.ty=(b+d)/2; cam.ts=clamp(Math.min(cv.width/w,cv.height/h)*0.9,8,150); }
function wTxt(x,y,U,v,alpha,col){ if(alpha<=0.02)return; ctx.save(); ctx.globalAlpha=ctx.globalAlpha*alpha; ctx.fillStyle=col;
  ctx.font='700 '+Math.max(9,(U*0.5)|0)+'px ui-sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(v),x,y); ctx.restore(); }
function wBoxPath(cx,cy,hd,hs,t,hsy){ hsy=hsy==null?hs:hsy; ctx.beginPath(); const N=28;   // L1 diamond (t=0) morphs to L∞ box (t=1); hsy!=hs ⇒ a rectangle (half-width hs, half-height hsy)
  for(let a=0;a<=N;a++){ const th=a/N*6.2831853, c=Math.cos(th), s=Math.sin(th), ac=Math.abs(c)||1e-9, as=Math.abs(s)||1e-9;
    const rD=hd/((ac+as)||1), rS=Math.min(hs/ac, hsy/as), rr=lerp(rD,rS,t);
    const x=cx+c*rr, y=cy+s*rr; if(a===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); } ctx.closePath(); }
function drawMatrixBox(m,cx,cy,U,r,k,t,hi,hvec){   // diamond (t=0) morphs to upright matrix box (t=1); F^k box + h' diagonal
  wBoxPath(cx,cy,(r+2)*0.62*U,(r/2+0.7)*MW*U,t); ctx.fillStyle='rgba(211,211,211,0.09)'; ctx.fill();
  ctx.strokeStyle=hi||'rgba(211,211,211,0.30)'; ctx.lineWidth=(hi?2.2:1.1)*DPR; ctx.stroke();
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const box=inBk(i,j,r,k);
    const dx=(r-i-j)*0.62, dy=(i-j)*0.62, mx=(j-r/2)*MW, my=(i-r/2)*MW;           // cell: diamond pos (180°) -> matrix pos
    const x=cx+lerp(dx,mx,t)*U, y=cy+lerp(dy,my,t)*U;
    if(box){ if(i===j && hvec){ let out=0; for(let ii=0;ii<=r;ii++){ if(ii<k+1||ii>r-k-1) out+=m[ii][j]; }
        const bd=hvec[j]-out; wTxt(x,y,U,bd,t*(bd>0?1:0.45),'#8fb4e6'); } }                 // box diagonal forced by the column sum: col j must total h^j, so box entry = h^j − (col j outside the box)
    else { const v=m[i][j];
      if(v===1){ ctx.save(); ctx.globalAlpha*=(1-t); ctx.fillStyle='#e9c377'; ctx.beginPath(); ctx.arc(x,y,Math.max(1.5,U*0.13),0,7); ctx.fill(); ctx.restore(); wTxt(x,y,U,1,t,'#f2d38c'); }
      else if(v>1){ wTxt(x,y,U,v,1,'#f2d38c'); }
      else wTxt(x,y,U,0,t*0.45,'#33415e'); } }
  if(weakCirc && k>=1){                                                           // relative box B_{k-1}=[k,r-k]^2 — CIRC ONLY: it contains the black box; the moving F^k entries live in the ring between them
    const lo=(k-r/2)*MW, hi=(r-k-r/2)*MW, pd=MW*0.5, ox=cx+(lo-pd)*U, oy=cy+(lo-pd)*U, ow=(hi-lo+2*pd)*U;
    ctx.save(); ctx.globalAlpha*=t; ctx.fillStyle='rgba(140,165,205,0.11)'; ctx.fillRect(ox,oy,ow,ow);   // subtle fill: the box carrying the moving vector F^k
    ctx.strokeStyle='rgba(140,165,205,0.55)'; ctx.lineWidth=1*DPR; ctx.strokeRect(ox,oy,ow,ow); ctx.restore(); }
  if(r-2*k-2>=0){                                                                 // black box B_k=[k+1,r-k-1]^2 (quotiented): dark diamond (t=0) -> matrix rect (t=1)
    ctx.save(); ctx.globalAlpha*=(1-t)*0.92; const bh=((r-2*k-2)+0.5)*0.62*U;
    ctx.beginPath(); ctx.moveTo(cx,cy-bh); ctx.lineTo(cx+bh,cy); ctx.lineTo(cx,cy+bh); ctx.lineTo(cx-bh,cy); ctx.closePath(); ctx.fillStyle='rgba(6,10,18,0.92)'; ctx.fill(); ctx.restore();
    const lo=(k+1-r/2)*MW, hi2=(r-k-1-r/2)*MW, pd=MW*0.5;
    ctx.save(); ctx.globalAlpha*=t; ctx.strokeStyle='rgba(140,165,205,0.8)'; ctx.lineWidth=1.3*DPR;
    ctx.strokeRect(cx+(lo-pd)*U, cy+(lo-pd)*U, (hi2-lo+2*pd)*U, (hi2-lo+2*pd)*U); ctx.restore(); } }
function drawMatrixPlain(m,cx,cy,U,r,hi){   // upright matrix box WITHOUT the black/relative boxes — the primitive-cohomology view
  wBoxPath(cx,cy,(r+2)*0.62*U,(r/2+0.7)*MW*U,1); ctx.fillStyle='rgba(211,211,211,0.09)'; ctx.fill();
  ctx.strokeStyle=hi||'rgba(211,211,211,0.30)'; ctx.lineWidth=(hi?2.2:1.1)*DPR; ctx.stroke();
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const v=m[i][j], x=cx+(j-r/2)*MW*U, y=cy+(i-r/2)*MW*U;
    if(v===1){ ctx.save(); ctx.fillStyle='#e9c377'; ctx.beginPath(); ctx.arc(x,y,Math.max(1.5,U*0.13),0,7); ctx.fill(); ctx.restore(); }
    else if(v>1){ wTxt(x,y,U,v,1,'#f2d38c'); }
    else wTxt(x,y,U,0,0.45,'#33415e'); } }
function drawWeakNode(nd,U,t){ const [cx,cy]=toScreen(nd.x,nd.y);
  const sc=1+nd.expl*1.7, al=1-nd.expl; if(al<=0.02)return;
  ctx.save(); ctx.globalAlpha=al; drawMatrixBox(nd.rep,cx,cy,U*sc,WG.r,WG.k,t, null, WG.hvec); ctx.restore(); }
function drawMorphMatrix(node,cx,cy,U,r,k){   // the pivot animation in the upright matrix frame, with the F^k box highlighted
  const P=node.pile, mt=node.mt, Pm=P.Pm, Cm=P.Cm, Lv=P.leave;
  const splosh=clamp(mt/0.15,0,1), splat=clamp((mt-0.85)/0.15,0,1), rr=Math.max(1.5,U*0.13);
  wBoxPath(cx,cy,(r+2)*0.62*U,(r/2+0.7)*MW*U,1); ctx.fillStyle='rgba(211,211,211,0.09)'; ctx.fill();
  ctx.strokeStyle='rgba(211,211,211,0.30)'; ctx.lineWidth=1.1*DPR; ctx.stroke();
  ctx.fillStyle='#1a2740'; for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ ctx.beginPath(); ctx.arc(cx+(j-r/2)*MW*U,cy+(i-r/2)*MW*U,Math.max(1,U*0.05),0,7); ctx.fill(); }
  if(r-2*k-2>=0){ const lo=(k+1-r/2)*MW, hi=(r-k-1-r/2)*MW, pd=MW*0.5, x0=cx+(lo-pd)*U, y0=cy+(lo-pd)*U, ww=(hi-lo+2*pd)*U;   // highlighted F^k box
    ctx.save(); ctx.fillStyle='rgba(120,150,200,0.12)'; ctx.fillRect(x0,y0,ww,ww); ctx.strokeStyle='#8fb4e6'; ctx.lineWidth=1.8*DPR; ctx.strokeRect(x0,y0,ww,ww); ctx.restore(); }
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const par=Pm[i][j], ch=Cm[i][j], fx=par-(Lv[i][j]||0);   // cell numerals at matrix positions
    if(par===0&&ch===0)continue; const X=cx+(j-r/2)*MW*U, Y=cy+(i-r/2)*MW*U;
    drawCellVal(X,Y,U,par,1-splosh); drawCellVal(X,Y,U,fx,splosh*(1-splat)); drawCellVal(X,Y,U,ch,splat); }
  const e=easeIO(clamp((mt-0.15)/0.70,0,1));
  for(const pile of P.piles){ const col=mt<0.85? pile.col : mixHex(pile.col,'#e9c377',splat);
    for(const g of pile.grains){ let x,y,sq=1,alpha=1;
      if(mt<0.15){ const t=splosh; x=lerp(g.sc[0],g.ss[0],easeOut(t)); y=lerp(g.sc[1],g.ss[1],easeOut(t)); sq=1+0.5*Math.sin(Math.PI*t); alpha=t; }
      else if(mt<0.85){ const th=e*Math.PI/2, c=Math.cos(th), s=Math.sin(th); const ox=g.ss[0]-g.pivot[0], oy=g.ss[1]-g.pivot[1]; x=g.pivot[0]+ox*c-oy*s; y=g.pivot[1]+ox*s+oy*c; }
      else { const t=splat; x=lerp(g.ds[0],g.dc[0],easeIO(t)); y=lerp(g.ds[1],g.dc[1],easeIO(t)); sq=1+0.6*Math.sin(Math.PI*t); alpha=1-t; }
      const mx=(x+y)*MW/1.24, my=(x-y)*MW/1.24; drawSquish(cx+mx*U, cy+my*U, rr, sq, col, alpha); } } }   // diamond -> matrix (45deg)
function drawWeakMain(){ if(!WG){ return; } const U=cam.s*0.42, r=WG.r, t=easeIO(clamp(weakT,0,1)), Sw=boxHalfW(r), hov=hoverWN>=0, R=Sw*cam.s;
  const EE=(weakLayout==='poset')? wActiveHasse() : WG.edges;   // poset view shows the Hasse (cover relations); circ-aware
  const obs=[]; for(const nd of WN){ if((nd.expl||0)>0.5) continue; const [sx,sy]=toScreen(nd.x,nd.y); obs.push({x:sx,y:sy}); }   // node centres the edges must route around
  const HT=weakHoverT;
  for(const [a,b] of EE){ const na=WN[a], nb=WN[b]; if(!na||!nb)continue; const al0=(1-(na.expl||0))*(1-(nb.expl||0)); if(al0<=0.02)continue;
    const inc=hov&&(a===hoverWN||b===hoverWN), al=al0*(inc? 1 : 1-0.8*HT);   // incoming/outgoing edges stay lit; the rest fade
    const dx=nb.x-na.x, dy=nb.y-na.y, f=edgeFsq(dx,dy,Sw);   // connect to the matrix-box (square) boundary
    const [bx,by]=toScreen(na.x+dx*f,na.y+dy*f), [ex,ey]=toScreen(nb.x-dx*f,nb.y-dy*f);
    drawArrowCurved(bx,by,ex,ey,obs,R,{ seed:hstr(a+'>'+b), alpha:al, width:1.4+(inc?1.2*HT:0),
      color: inc?'rgba(130,180,255,'+(0.7+0.28*HT)+')':'rgba(74,104,143,0.7)', headColor: inc?'rgba(150,190,255,1)':'rgba(110,168,255,0.9)' }); }
  for(const nd of WN){ if((nd.expl||0)>=0.995) continue; drawWeakNode(nd,U,t); } }
function stepWeak(dt){ weakT += (weakTgt-weakT)*0.16; weakHoverT += ((hoverWN>=0?1:0)-weakHoverT)*0.2;   // smooth hover focus
  for(let i=0;i<WN.length;i++){ const tgt=(weakCirc && !WG.kept[i])?1:0; WN[i].expl=(WN[i].expl||0)+(tgt-(WN[i].expl||0))*0.16; }
  if(weakClosing && weakT<0.02){ weakClosing=false; autoFrame=true;   // un-toggling weak returns to the tree view
    viz='tree'; renderVizButtons(); finishTree(); frameTree(); }
  else if(!weakClosing && WG){
    if(weakLayout==='graph'){ if(graphLayout==='force') weakForce();          // graph view obeys the chosen graph layout
      else { const T=graphTargetsW(); for(let i=0;i<WN.length;i++){ if(WN[i].pin)continue; WN[i].x=lerp(WN[i].x,T[i].x,0.14); WN[i].y=lerp(WN[i].y,T[i].y,0.14); WN[i].vx=WN[i].vy=0; } } }
    else { const T=posetTargetsW(); for(let i=0;i<WN.length;i++){ WN[i].x=lerp(WN[i].x,T[i].x,0.14); WN[i].y=lerp(WN[i].y,T[i].y,0.14); WN[i].vx=WN[i].vy=0; } } }   // poset: its own circ-aware layered layout
  if(autoFrame && !abMode) frameWeak(); }   // the a/𝒜 overlay uses its own ambient-rank layout + framing
function katexStr(s){ return window.katex? window.katex.renderToString(s,{throwOnError:false}) : s; }
function updateWeakStat(){ const el=document.getElementById('weakstat'); if(!el)return; if(!weakMode||!WG||abMode){ el.style.display='none'; return; }   // hidden while the a/𝒜 overlay shows its own #abstat pillbox
  const alive=weakCirc? WG.kept.filter(Boolean).length : WG.classes.length;
  const aliveE=weakCirc? WG.edges.filter(([a,b])=>WG.kept[a]&&WG.kept[b]).length : WG.edges.length;
  const name='R'+(weakCirc?'^{\\circ}':'')+'_{'+WG.k+'}(\\underline{h})';
  let html=katexStr(name)+' · '+alive+' classes, '+aliveE+' edges · '+(wActiveIsPoset()?'poset':'not a poset');   // static text — poset view is disconnected (setWeakLayout('poset') kept but no longer wired)
  if(WG.k===0) html+=' · '+katexStr('R_0 = R^{\\circ}_0');
  el.innerHTML=html; el.style.display='block'; }
function openWeak(){ WG=computeWeak(curVec,weakK); if(!WG)return; buildWN();
  weakMode=true; weakClosing=false; weakTgt=1; autoFrame=true;
  primMode=false; document.getElementById('primbtn').classList.remove('active');   // weak takes over; the prim button blows away
  document.getElementById('weakbtn').classList.add('active');
  setWeakLayout('tree'); updateWeakStat(); }   // weak opens on the tree view (hover to animate); graph/poset via the buttons; k/∘ appear left of it
function closeWeak(){ const wasTree=(weakLayout==='tree'); weakMode=false;
  abMode=null; syncAB();                                                          // drop the ambient-poset overlay when leaving weak
  if(wasTree){ weakClosing=false; frameTree(); } else { weakClosing=true; weakTgt=0; }
  renderVizButtons();   // -> updateChrome: transport (in tree pol) + prim button reappear, weak controls explode away
  document.getElementById('weakbtn').classList.remove('active'); document.getElementById('weakstat').style.display='none'; }
function refreshWeak(){ if(!weakMode)return; WG=computeWeak(curVec,weakK); if(!WG)return; buildWN();
  if(weakLayout==='poset' && !wActiveIsPoset()) weakLayout='graph';   // a non-poset can't stay in poset layout
  renderVizButtons(); autoFrame=true; updateWeakStat(); }
function populateWeakK(){ const sel=document.getElementById('weakk'); if(!sel)return;
  const r=(curVec&&curVec.length>1)? curVec.length-1 : 3;
  const kmax=Math.max(0,Math.floor((r-1)/2));   // R_k^o(h) = R_0^o(weight r-2k) is nontrivial iff r-2k>=1
  weakK=Math.max(0,Math.min(weakK,kmax));
  sel.innerHTML=''; for(let k=0;k<=kmax;k++){ const o=document.createElement('option'); o.value=k; o.textContent=k; if(k===weakK)o.selected=true; sel.appendChild(o); } }
document.getElementById('weakbtn').onclick=()=>{ weakMode?closeWeak():openWeak(); };
document.getElementById('weakk').onchange=e=>{ weakK=Math.max(0,parseInt(e.target.value,10)||0); if(weakMode) refreshWeak(); };
document.getElementById('weakcirc').onchange=e=>{ weakCirc=e.target.checked;
  if(!weakCirc && abMode){ abMode=null; syncAB(); }   // the a/𝒜 overlay lives on R_k^∘ — it can't outlive ∘ (its buttons hide, so it'd be stuck on)
  if(weakMode){ if(weakLayout==='poset' && !wActiveIsPoset()){ weakLayout='graph'; renderVizButtons(); }
    autoFrame=true; updateWeakStat(); updateHint(); updateChrome(); } };   // updateChrome re-evaluates the a/𝒜 buttons against the new ∘ state
