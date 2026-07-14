/*=================== shared state ===================*/
let G=null, BASIS=null, tree=[], byUid={}, parentsOrder=[], gnodes=[], gpos={};
let mode='idle', speed=1, selected=null, _rankY={};
let collapseT=0;
let viz='tree', jitterOn=true, autoGraph=false, autoPoset=false, collapseTarget='graph', graphLayout='layered';
let _hasse=null, _hasseFor=null, curVec=[1,2,2,1], expandT=0, primMode=false;
let matrixMode=false, decompMode=false;                                          // hamburger toggles: upright h-matrix (no box); KPR decomposition panel (graph/poset)
function matrixNodesActive(){ return matrixMode && !weakMode; }   // matrix = a pure SHAPE toggle (diamond↔matrix), independent of prim (which chooses the numbers) and decomp
function focusZoom(r){ return clamp(300/(r+1),44,120); }
function isPoset(){ const E=new Set(G.edges.map(e=>e[0]+'>'+e[1])); const adj={};
  G.edges.forEach(e=>{(adj[e[0]]=adj[e[0]]||[]).push(e[1]);});
  for(const [a,b] of G.edges) for(const c of (adj[b]||[])) if(a!==c && !E.has(a+'>'+c)) return false;
  return true; }
function hasseEdges(){ const N=G.vertices.length, adj={};
  G.edges.forEach(e=>{(adj[e[0]]=adj[e[0]]||[]).push(e[1]);});
  const reach=[]; for(let a=0;a<N;a++){ const seen=new Set(), st=[...(adj[a]||[])];
    while(st.length){ const u=st.pop(); if(seen.has(u))continue; seen.add(u); for(const w of (adj[u]||[])) st.push(w); }
    reach.push(seen); }
  const cov=[]; for(const [a,b] of G.edges){ let covered=false;
    for(const c of (adj[a]||[])) if(c!==b && reach[c].has(b)){ covered=true; break; }
    if(!covered) cov.push([a,b]); } return cov; }
function getHasse(){ if(_hasseFor===G) return _hasse; _hasse=hasseEdges(); _hasseFor=G; return _hasse; }

/*=================== layout ===================*/
function buildTree(){
  tree=[]; byUid={}; let uid=0; const CAP=48;
  const adj={}; G.edges.forEach((e,ei)=>{ (adj[e[0]]=adj[e[0]]||[]).push({to:e[1],move:G.moves[ei]}); });
  const root={uid:uid++,vid:G.root,depth:0,parent:-1,kids:[],born:true,state:'done',x:0,y:0,tx:0,ty:0,mt:1,move:null,pile:null,_done:true,jit:0};
  tree.push(root); byUid[root.uid]=root;
  const q=[root];
  while(q.length && tree.length<CAP){ const node=q.shift();
    for(const k of (adj[node.vid]||[])){ if(tree.length>=CAP)break;
      const c={uid:uid++,vid:k.to,depth:node.depth+1,parent:node.uid,kids:[],
               born:false,state:'hidden',x:0,y:0,tx:0,ty:0,mt:0,move:k.move,pile:null,_done:false,jit:0};
      node.kids.push(c.uid); tree.push(c); byUid[c.uid]=c;
      if(c.depth < (G.r<=2?4:3)) q.push(c); } }
  layoutTree();
  parentsOrder=tree.filter(n=>n.kids.length>0).sort((a,b)=>a.depth-b.depth||a.tx-b.tx).map(n=>n.uid); }
function layoutTree(){ let leafX=0; const XS=3.2,YS=3.8;
  (function assign(u){ const n=byUid[u];
    if(n.kids.length===0){ n.tx=leafX*XS; leafX++; }
    else{ n.kids.forEach(assign); const xs=n.kids.map(k=>byUid[k].tx);
      n.tx=(Math.min(...xs)+Math.max(...xs))/2; }
    n.ty=n.depth*YS; })(tree[0].uid);
  const rx=tree[0].tx; tree.forEach(n=>{ n.tx-=rx; if(!n.born){n.x=0;n.y=0;}else{n.x=n.tx;n.y=n.ty;} }); }
function buildGraph(){
  const vids=[...new Set(tree.map(n=>n.vid))];
  for(let i=0;i<G.vertices.length;i++) if(!vids.includes(i)) vids.push(i);
  gnodes=vids.map(v=>({vid:v,x:0,y:0,vx:0,vy:0,pin:false}));
  const adj={}, indeg={}; gnodes.forEach(n=>indeg[n.vid]=0);                       // longest-path (topological) rank — true DAG level, like the poset/weak layouts
  for(const [a,b] of G.edges){ (adj[a]=adj[a]||[]).push(b); if(indeg[b]!=null) indeg[b]++; }
  const rank={}, ind=Object.assign({},indeg), q=[];
  gnodes.forEach(n=>{ if(ind[n.vid]===0){ rank[n.vid]=0; q.push(n.vid); } });
  while(q.length){ const u=q.shift(); for(const w of (adj[u]||[])){ rank[w]=Math.max(rank[w]||0,(rank[u]||0)+1); if(--ind[w]===0) q.push(w); } }
  const layers={}; gnodes.forEach(n=>{ const r=rank[n.vid]==null?9:rank[n.vid]; (layers[r]=layers[r]||[]).push(n); });
  Object.keys(layers).forEach(r=>{ const arr=layers[r]; arr.forEach((n,k)=>{
    n.x=(k-(arr.length-1)/2)*3.4; n.y=(+r)*5.2; n.grank=(rank[n.vid]==null?9:rank[n.vid]); }); });
  gpos={}; gnodes.forEach(n=>{ gpos[n.vid]=n; _rankY[n.vid]=n.y; n.gx=n.x; n.gy=n.y; }); }
function posetTargets(){ const p={}; gnodes.forEach(n=>{ p[n.vid]={x:n.gx,y:n.gy}; }); return p; }   // poset uses the same layered layout as the graph (longest-path rank == Hasse rank)
let reflowT=0;
function reflow(pos){ gnodes.forEach(n=>{ n._sx=n.x; n._sy=n.y; const t=pos[n.vid]||{x:n.x,y:n.y};
  n._tx=t.x; n._ty=t.y; n.vx=0; n.vy=0; }); mode='reflow'; reflowT=0; autoFrame=true; }
function stepReflow(dt){ reflowT+=dt*speed/850; const tt=clamp(reflowT,0,1);
  gnodes.forEach(n=>{ n.x=lerp(n._sx,n._tx,easeIO(tt)); n.y=lerp(n._sy,n._ty,easeIO(tt)); });
  if(autoFrame) frameGraph(); if(tt>=1) mode='idle'; }
function forceStep(){ const REP=4,REST=3.6;
  for(const n of gnodes){ if(n.pin)continue; let fx=-n.x*0.03, fy=(_rankY[n.vid]-n.y)*0.16;
    for(const m of gnodes){ if(m===n)continue; const dx=n.x-m.x,dy=n.y-m.y,d2=dx*dx+dy*dy+1,f=REP/d2; fx+=dx*f; fy+=dy*f; }
    n._fx=fx; n._fy=fy; }
  for(const [a,b] of G.edges){ const n=gpos[a],m=gpos[b]; if(!n||!m)continue;
    const dx=m.x-n.x,dy=m.y-n.y,d=Math.hypot(dx,dy)+0.01,f=(d-REST)*0.03;
    if(!n.pin){n._fx+=dx/d*f;n._fy+=dy/d*f;} if(!m.pin){m._fx-=dx/d*f;m._fy-=dy/d*f;} }
  for(const n of gnodes){ if(n.pin)continue; n.vx=(n.vx+n._fx)*0.78; n.vy=(n.vy+n._fy)*0.78;
    n.x+=n.vx*0.12; n.y+=n.vy*0.12; n.x=clamp(n.x,-16,16); } }
function radialLayout(ranks,step){ const layers={};                              // vid/idx -> rank ; place each rank on a concentric ring (root centered)
  Object.keys(ranks).forEach(id=>{ const r=ranks[id]; (layers[r]=layers[r]||[]).push(id); });
  const p={}; Object.keys(layers).map(Number).sort((a,b)=>a-b).forEach(r=>{ const arr=layers[r], R=r*step, ph=r*0.6;
    arr.forEach((id,k)=>{ if(R<1e-6){ p[id]={x:0,y:0}; return; } const a=-Math.PI/2+ph+k/arr.length*2*Math.PI; p[id]={x:R*Math.cos(a),y:R*Math.sin(a)}; }); });
  return p; }
function graphTargetsG(){ if(graphLayout==='layered'){ const p={}; gnodes.forEach(n=>p[n.vid]={x:n.gx,y:n.gy}); return p; }
  const ranks={}; gnodes.forEach(n=>ranks[n.vid]=(n.grank==null?9:n.grank)); return radialLayout(ranks,(G.r+2)*1.15); }
function stepGraphLayout(){ if(graphLayout==='force'){ forceStep(); return; }   // layered/radial: ease non-pinned nodes to targets
  const T=graphTargetsG(); for(const n of gnodes){ if(n.pin)continue; const t=T[n.vid]; if(!t)continue; n.x=lerp(n.x,t.x,0.14); n.y=lerp(n.y,t.y,0.14); n.vx=n.vy=0; } }

/*=================== run + transport (step model) ===================*/
let playing=false, autoplay=false, done=0, revealT=0, curReveal=-1, revealOrder=[];
function fitZoom(r){ const md=Math.min(cv.width,cv.height); return clamp(1.15*md/(r+0.7), 16, 240); }
function run(hvec){ autoFrame=true; curVec=hvec; _hasseFor=null;
  try{ G=computeGraph(hvec); }catch(e){ showErr('compute failed: '+e); return; }
  BASIS=G.basis; selected=null; document.getElementById('info').style.display='none'; hideWarn();
  buildTree(); buildGraph();
  revealOrder=[]; for(const puid of parentsOrder){ const p=byUid[puid];
    for(const kuid of p.kids) revealOrder.push({parentUid:puid, child:byUid[kuid]}); }
  mode='grow'; viz='tree'; done=0; revealT=0; curReveal=-1; renderVizButtons();
  if(autoplay){ applyState(); cam.x=cam.tx=tree[0].tx; cam.y=cam.ty=tree[0].ty; cam.s=cam.ts=fitZoom(G.r); playing=true; updatePlayIcon(); }
  else { finishTree(); frameTree(); cam.x=cam.tx; cam.y=cam.ty; cam.s=cam.ts; }   // default: whole tree, settled & static — movie plays only on ▶
}
function applyState(){ for(let i=0;i<revealOrder.length;i++){ const c=revealOrder[i].child;
    if(i<done){ c.born=true; c.state='done'; c._done=true; c.pile=null; c.mt=1; c.x=c.tx; c.y=c.ty; }
    else { c.born=false; c.state='hidden'; c._done=false; c.pile=null; c.mt=0; } }
  curReveal=-1; revealT=0; }
function beginReveal(idx){ const r=revealOrder[idx], c=r.child, p=byUid[r.parentUid];
  c.born=true; c.state='fly'; c.mt=0; c.x=p.x; c.y=p.y;
  c.pile=buildPiles(G.vertices[p.vid], G.vertices[c.vid], G.r, c.move||[]);
  cam.tx=c.tx; cam.ty=c.ty; cam.ts=fitZoom(G.r); autoFrame=false; }
function stepGrow(dt){
  if(done>=revealOrder.length){ if(playing){ playing=false; updatePlayIcon(); onGrowComplete(); } return; }
  if(!playing) return;
  if(curReveal!==done){ beginReveal(done); curReveal=done; }
  revealT += dt*speed/1450;
  const r=revealOrder[done], c=r.child, p=byUid[r.parentUid];
  if(revealT<0.32){ const t=revealT/0.32; c.state='fly'; c.x=lerp(p.x,c.tx,easeOut(t)); c.y=lerp(p.y,c.ty,easeOut(t)); }
  else if(revealT<1){ c.state='seesaw'; c.mt=(revealT-0.32)/0.68; c.x=c.tx; c.y=c.ty; }
  else { c.state='done'; c._done=true; c.pile=null; c.mt=1; c.x=c.tx; c.y=c.ty; done++; revealT=0; curReveal=-1; } }
function onGrowComplete(){ if(autoPoset) collapseTo('poset'); else if(autoGraph) collapseTo('graph'); else { mode='idle'; frameTree(); } }
function frameLeaf(){ const n = done>0? revealOrder[done-1].child : tree[0];
  cam.tx=n.tx; cam.ty=n.ty; cam.ts=fitZoom(G.r); autoFrame=false; }
function ensureTreeGrow(){ if(viz!=='tree'){ viz='tree'; renderVizButtons(); } mode='grow'; }
function togglePlay(){ ensureTreeGrow();
  if(done>=revealOrder.length){ done=0; applyState(); }
  playing=!playing; updatePlayIcon(); }
function stepNext(){ ensureTreeGrow(); playing=false;
  if(done<revealOrder.length) done++; applyState(); frameLeaf(); updatePlayIcon(); }
function stepPrev(){ ensureTreeGrow(); playing=false;
  if(revealT<=0 && done>0) done--; applyState(); frameLeaf(); updatePlayIcon(); }
function updatePlayIcon(){ const b=document.getElementById('playpause'); if(b) b.textContent = playing? '⏸' : '▶'; }
function startCollapse(){ mode='collapse'; collapseT=0; tree.forEach(n=>{n._sx=n.x;n._sy=n.y;}); }
function stepCollapse(dt){ collapseT+=dt*speed/950; const tt=clamp(collapseT,0,1);
  tree.forEach(n=>{ const g=gpos[n.vid]; if(!g)return;
    n.x=lerp(n._sx,g.x,easeIO(tt)); n.y=lerp(n._sy,g.y,easeIO(tt)); });
  if(autoFrame) frameGraph();
  if(tt>=1){ mode='idle';
    if(collapseTarget==='poset'){ if(isPoset()){ viz='poset'; renderVizButtons(); reflow(posetTargets()); return; }
      else { viz='graph'; showWarn('Not a poset'); } }
    else viz='graph';
    renderVizButtons(); } }
function frameGraph(){ if(!gnodes.length)return;
  let a=1e9,b=1e9,c=-1e9,d=-1e9; for(const n of gnodes){ a=Math.min(a,n.x);c=Math.max(c,n.x);b=Math.min(b,n.y);d=Math.max(d,n.y);}
  const w=(c-a)+6,h=(d-b)+6, availW=ppShown? cv.width*0.5 : cv.width;               // the decomposition panel eats the left half
  cam.tx=(a+c)/2; cam.ty=(b+d)/2; cam.ts=clamp(Math.min(availW/w,cv.height/h)*0.9,22,70); }
function toTree(){ tree.forEach(n=>{ n.born=true; n.mt=1; n.state='done'; n.pile=null; n._done=true; n._sx=n.x; n._sy=n.y; });
  viz='tree'; mode='expand'; expandT=0; renderVizButtons(); autoFrame=false; }
function stepExpand(dt){ expandT+=dt*speed/900; const tt=clamp(expandT,0,1);
  tree.forEach(n=>{ n.x=lerp(n._sx,n.tx,easeIO(tt)); n.y=lerp(n._sy,n.ty,easeIO(tt)); });
  frameTree(); if(tt>=1) mode='idle'; }
function frameTree(){ let a=1e9,b=1e9,c=-1e9,d=-1e9;
  for(const n of tree){ if(!n.born)continue; a=Math.min(a,n.tx);c=Math.max(c,n.tx);b=Math.min(b,n.ty);d=Math.max(d,n.ty); }
  const w=(c-a)+4,h=(d-b)+4, availW=ppShown? cv.width*0.5 : cv.width; cam.tx=(a+c)/2; cam.ty=(b+d)/2;   // decomposition panel eats the left half
  cam.ts=clamp(Math.min(availW/w,cv.height/h)*0.9,10,fitZoom(G.r)); }

/*=================== render loop ===================*/
function frame(now){ const dt=Math.min(40,now-(frame._p||now)); frame._p=now;
  cam.x=lerp(cam.x,cam.tx,0.08); cam.y=lerp(cam.y,cam.ty,0.08); cam.s=lerp(cam.s,cam.ts,0.08);
  viewOffsetX=lerp(viewOffsetX, ppShown? cv.width*0.24 : 0, 0.14);               // slide the main view right to clear the decomposition panel
  ctx.clearRect(0,0,cv.width,cv.height);
  if((weakMode || weakClosing) && weakLayout!=='tree'){ stepWeak(dt); drawWeakMain(); requestAnimationFrame(frame); return; }   // weak tree falls through to the tree renderer
  if(mode==='grow') stepGrow(dt);
  else if(mode==='collapse') stepCollapse(dt);
  else if(mode==='expand') stepExpand(dt);
  else if(mode==='reflow') stepReflow(dt);
  else if(viz==='graph'){ stepGraphLayout(); if(autoFrame) frameGraph(); }
  if(viz==='tree' || mode==='collapse') drawTree(); else drawGraph();
  if(ppShown){                                                                    // focus is STICKY: it changes only when a new node is hovered, then holds
    if(viz==='tree'){ if(hoverTreeUid>=0 && byUid[hoverTreeUid]) primStickyVid=byUid[hoverTreeUid].vid; }
    else if(hoverVid>=0) primStickyVid=hoverVid;
    if(primStickyVid<0) primStickyVid=firstLeafVid();
    if(primStickyVid!==primPanelVid){ primPanelVid=primStickyVid; updatePrimPanel(primStickyVid); }
    drawPrimGrid(); }
  requestAnimationFrame(frame); }
function drawTree(){ if(!G)return; const U=cam.s*0.42;
  const wk = weakMode && weakLayout==='tree', wk_k=weakK, mtx=matrixNodesActive();
  const nodeKept = n => { if(!weakCirc||!WG||!WG.vclass) return true; const c=WG.vclass[n.vid]; return c==null? true : !!WG.kept[c]; };
  if(wk) for(const n of tree){ if(!n.born)continue; const et=nodeKept(n)?0:1; n.expl=(n.expl||0)+(et-(n.expl||0))*0.16; }   // circ: nodes not in R_k^o explode away
  const Hw=(G.r+2)*0.62*0.42, Sw=boxHalfW(G.r), hov=hoverTreeUid>=0;   // connect edges to the box boundary (diamond strict, square weak)
  for(const n of tree){ if(!n.born||n.parent<0)continue; const p=byUid[n.parent];
    const eAl=(wk&&weakCirc)? (1-(n.expl||0))*(1-(p.expl||0)) : 1; if(eAl<=0.02) continue;   // fade edges touching exploding nodes
    const inc=hov&&(n.uid===hoverTreeUid||p.uid===hoverTreeUid), dim=hov&&!inc;
    const dx=n.x-p.x, dy=n.y-p.y, f=(wk||mtx)?edgeFsq(dx,dy,Sw):edgeF(dx,dy,Hw);   // shape, not numbers: pol+prim is a diamond (edgeF), matrix/weak are squares (edgeFsq)
    const [x1,y1]=toScreen(p.x+dx*f, p.y+dy*f),[x2,y2]=toScreen(n.x-dx*f, n.y-dy*f);
    ctx.save(); ctx.globalAlpha=eAl; ctx.lineWidth=(inc?2.6:1.4)*DPR; ctx.strokeStyle= inc?'rgba(130,180,255,0.95)':dim?'rgba(74,104,143,0.13)':'rgba(74,104,143,0.45)';
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.bezierCurveTo(x1,(y1+y2)/2,x2,(y1+y2)/2,x2,y2); ctx.stroke(); ctx.restore(); }
  if(wk){ const hn = hoverTreeUid>=0 ? byUid[hoverTreeUid] : null;               // hovered class: replay its incoming pivot
    if(hn && hn.parent>=0 && hn.move && hn.move.length){
      if(weakHoverPileUid!==hn.uid){ weakHoverPileUid=hn.uid; hn.wpile=buildPiles(G.vertices[byUid[hn.parent].vid],G.vertices[hn.vid],G.r,hn.move); weakTreeMt=0; }
      weakTreeMt += 0.012*speed; if(weakTreeMt>1.55) weakTreeMt=0; }                // loop: fall (0..1) then hold, then repeat
    else weakHoverPileUid=-1; }
  else { const hn = (!playing && hoverTreeUid>=0) ? byUid[hoverTreeUid] : null;   // strict tree: hover replays the diamond pivot
    if(hn && hn.parent>=0 && hn.move && hn.move.length && hn.state==='done'){
      if(treeHoverPileUid!==hn.uid){ treeHoverPileUid=hn.uid; hn.hpile=buildPiles(G.vertices[byUid[hn.parent].vid],G.vertices[hn.vid],G.r,hn.move); treeHoverMt=0; }
      treeHoverMt += 0.012*speed; if(treeHoverMt>1.55) treeHoverMt=0; }
    else treeHoverPileUid=-1; }
  for(const n of tree){ if(!n.born)continue; const [sx,sy]=toScreen(n.x,n.y);
    if(wk){
      const ex=n.expl||0; if(ex>=0.995) continue;                                // fully exploded — removed from the R_k^o subtree
      const sc=1+ex*1.7; ctx.save(); ctx.globalAlpha=1-ex;
      if(n.uid===weakHoverPileUid && n.wpile){                                   // hover reveals the actual pivot, in the matrix frame
        const sp=n.pile, sm=n.mt; n.pile=n.wpile; n.mt=Math.min(weakTreeMt,1); drawMorphMatrix(n,sx,sy,U*sc,G.r,wk_k); n.pile=sp; n.mt=sm; }
      else { n.bt=(n.bt||0)+(1-(n.bt||0))*0.16;                                   // static equivalence-class matrix-box
        drawMatrixBox(G.vertices[n.vid],sx,sy,U*sc,G.r,wk_k, easeIO(clamp(n.bt,0,1)), (n.uid===hoverTreeUid?'#6ea8ff':null), curVec); }
      ctx.restore(); }
    else {                                                                         // pol / pol+prim: prim chooses the NUMBERS, matrix chooses the SHAPE
      const num = primMode ? G.primVertices[n.vid] : G.vertices[n.vid];
      if(mtx){                                                                     // matrix shape — animate grow / fly / hover in the matrix frame
        if(n.state==='seesaw' && n.pile) drawMorphMatrix(n,sx,sy,U,G.r,G.r);
        else if(n.state==='fly') drawMatrixPlain(G.vertices[byUid[n.parent].vid],sx,sy,U,G.r,null);
        else if(n.uid===treeHoverPileUid && n.hpile){ const sp=n.pile, sm=n.mt; n.pile=n.hpile; n.mt=Math.min(treeHoverMt,1); drawMorphMatrix(n,sx,sy,U,G.r,G.r); n.pile=sp; n.mt=sm; }
        else drawMatrixPlain(num,sx,sy,U,G.r,(n.uid===hoverTreeUid?'#6ea8ff':null)); }
      else {                                                                       // diamond shape
        if(n.state==='seesaw' && n.pile) drawMorph(n,sx,sy,U);
        else if(n.state==='fly') drawStatic(G.vertices[byUid[n.parent].vid],G.r,sx,sy,U,{});
        else if(n.uid===treeHoverPileUid && n.hpile){ const sp=n.pile, sm=n.mt; n.pile=n.hpile; n.mt=Math.min(treeHoverMt,1); drawMorph(n,sx,sy,U); n.pile=sp; n.mt=sm; }
        else { const active=(mode==='grow' && curReveal===done && revealOrder[done] && revealOrder[done].parentUid===n.uid);
          drawStatic(num,G.r,sx,sy,U,{sel:active,selColor:'#e879f9'}); } } } } }
function drawGraph(){ const U=cam.s*0.42, mtx=matrixNodesActive();
  const EE=(viz==='poset')? getHasse() : G.edges, Hw=(G.r+2)*0.62*0.42, Sw=boxHalfW(G.r), hov=hoverVid>=0;   // connect to diamond (or square, in matrix/prim) boundary
  for(const [a,b] of EE){ const n=gpos[a],m=gpos[b]; if(!n||!m)continue;
    const dx=m.x-n.x, dy=m.y-n.y, f=mtx?edgeFsq(dx,dy,Sw):edgeF(dx,dy,Hw);
    const [bx,by]=toScreen(n.x+dx*f,n.y+dy*f),[ex,ey]=toScreen(m.x-dx*f,m.y-dy*f);
    const ang=Math.atan2(ey-by,ex-bx), inc=hov&&(a===hoverVid||b===hoverVid), dim=hov&&!inc;
    ctx.lineWidth=(inc?2.6:1.5)*DPR;
    ctx.strokeStyle= inc?'rgba(130,180,255,0.98)':dim?'rgba(74,104,143,0.16)':'rgba(74,104,143,0.7)';
    ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.fillStyle= inc?'rgba(150,190,255,1)':dim?'rgba(110,168,255,0.2)':'rgba(110,168,255,0.9)'; ctx.beginPath(); ctx.moveTo(ex,ey);
    ctx.lineTo(ex-Math.cos(ang-0.4)*8*DPR,ey-Math.sin(ang-0.4)*8*DPR);
    ctx.lineTo(ex-Math.cos(ang+0.4)*8*DPR,ey-Math.sin(ang+0.4)*8*DPR); ctx.closePath(); ctx.fill(); }
  for(const n of gnodes){ const [sx,sy]=toScreen(n.x,n.y);
    const hi = (n.vid===primPanelVid && ppShown) ? '#8fb4e6' : (selected===n.vid?'#22c55e':null);   // panel-focused node gets a soft highlight
    const num = primMode ? G.primVertices[n.vid] : G.vertices[n.vid];              // prim = numbers, matrix = shape
    if(mtx) drawMatrixPlain(num,sx,sy,U,G.r,hi);
    else drawStatic(num,G.r,sx,sy,U,{sel:(selected===n.vid||(n.vid===primPanelVid&&ppShown)),selColor:hi||'#22c55e'}); } }

/*=================== primitive-decomposition panel (grid of KPR pieces P_w(-a)) ===================*/
// A pannable "infinite canvas" on the left: rows = primitive weight w, columns = Tate twist a; the cells sum to the focused diamond.
const ppcv=document.getElementById('ppcanvas'), ppctx=ppcv?ppcv.getContext('2d'):null;
let ppcam={x:-0.85,y:-1.05,s:150}, primGridData=null, primPanelVid=-1, ppShown=false, ppHeadCv=null, ppHeadR=-1, ppHeadPrim=null, primStickyVid=-1;
function ppResize(){ if(!ppcv)return; const R=ppcv.getBoundingClientRect(); ppcv.width=Math.max(1,R.width*DPR); ppcv.height=Math.max(1,R.height*DPR); }
function ppFit(){ if(!ppcv||!primGridData)return; const W=ppcv.width;              // wide Σ column (holds the header) + gap + the a-columns
  ppcam.s=clamp((W-130*DPR)/(primGridData.maxCol+3.6), 60, 190);                  // size to the columns (label-readable); tall tables pan vertically
  ppcam.x=-1.15; ppcam.y=-0.9; }                                                  // room on the left for the w= labels; header + first row frame near the top
function firstLeafVid(){ const n=tree.find(t=>t.born&&t.kids.length===0)||tree[0]; return n?n.vid:0; }
function updatePrimPanel(vid){ if(!G)return;
  const useP = primMode && !weakMode, full = primitiveGrid(G.vertices[vid]);        // pol+prim: decompose P(◇) — only each pile's bottom P_w (a=0) survives, no Lefschetz twists
  let rows, maxCol;
  if(useP){ rows = full.rows.map(r=>({w:r.w, cells:[], sum:r.cells[0].mat})); maxCol=0; }   // the a=0 generator P_w per weight; they sum to P(◇)
  else { rows = full.rows; maxCol = full.rows.length? Math.max(...full.rows.map(r=>r.cells.length-1)) : 0; }
  primGridData={vid, r:G.r, grid:{r:G.r, rows}, src: useP? G.primVertices[vid] : G.vertices[vid], maxCol, twists:!useP, totalLabel: useP?'P(◇) =':'◇ ='};
  const t=document.getElementById('pp-title'); if(!t)return;
  if(!ppHeadCv || !ppHeadCv.isConnected || ppHeadR!==G.r || ppHeadPrim!==useP){     // (re)build the equation + inline node; canvas redrawn each frame
    t.innerHTML=katexStr(useP ? 'P(\\Diamond)\\;=\\;\\sum_{w=0}^{'+G.r+'} P_w\\;='
                              : '\\Diamond\\;=\\;\\sum_{w=0}^{'+G.r+'}\\sum_{a=0}^{\\,'+G.r+'-w} P_w(-a)\\;=')
      +'<canvas id="pp-head" style="vertical-align:middle;margin-left:8px"></canvas>';
    ppHeadCv=document.getElementById('pp-head'); ppHeadR=G.r; ppHeadPrim=useP;
    const HH=44; ppHeadCv.width=HH*DPR; ppHeadCv.height=HH*DPR; ppHeadCv.style.width=HH+'px'; ppHeadCv.style.height=HH+'px'; } }
function ppLabel(pctx,x,y,w,a){ pctx.textAlign='left'; pctx.textBaseline='alphabetic';   // "P_w(−a)" with a real subscript (a=0 is the untwisted piece P_w)
  const f1=12*DPR, f2=9*DPR; pctx.font='600 '+f1+'px ui-sans-serif'; const pw=pctx.measureText('P').width;
  pctx.font=f2+'px ui-sans-serif'; const sw=''+w, swW=pctx.measureText(sw).width;
  pctx.font='600 '+f1+'px ui-sans-serif'; const tail=a===0?'':'(−'+a+')', tW=pctx.measureText(tail).width, sx=x-(pw+swW+tW)/2;
  pctx.fillStyle='#7f9bc4'; pctx.fillText('P',sx,y);
  pctx.font=f2+'px ui-sans-serif'; pctx.fillText(sw,sx+pw,y+3*DPR);
  pctx.font='600 '+f1+'px ui-sans-serif'; pctx.fillText(tail,sx+pw+swW,y); }
function ppHeaderSum(pctx,x,y){ pctx.textBaseline='middle'; pctx.fillStyle='#8fb4e6';   // "Σₐ Pw(−a)" centered at (x,y) — the sum column header
  const f1=11*DPR, f2=8*DPR, seg=[['Σ','a'],[' P','w'],['(−a)','']];
  let tot=0; for(const[t,sub]of seg){ pctx.font='600 '+f1+'px ui-sans-serif'; tot+=pctx.measureText(t).width; if(sub){ pctx.font=f2+'px ui-sans-serif'; tot+=pctx.measureText(sub).width; } }
  let sx=x-tot/2; pctx.textAlign='left';
  for(const[t,sub]of seg){ pctx.font='600 '+f1+'px ui-sans-serif'; pctx.fillText(t,sx,y); sx+=pctx.measureText(t).width; if(sub){ pctx.font=f2+'px ui-sans-serif'; pctx.fillText(sub,sx,y+3*DPR); sx+=pctx.measureText(sub).width; } } }
function drawPrimGrid(){ if(!ppctx)return;                                          // table: col 0 = ◇ then the strings Σ_a P_w(-a); each weight row splits into P_w(-a)
  const W=ppcv.width, H=ppcv.height; ppctx.setTransform(1,0,0,1,0,0); ppctx.clearRect(0,0,W,H);
  if(!primGridData)return;
  const r=primGridData.r, s=ppcam.s, OX=104*DPR, OY=36*DPR, diag=0.40*s, RP=1.4, maxCol=primGridData.maxCol, rows=primGridData.grid.rows, twists=primGridData.twists;
  const PG=1.45, EQX=0.72;                                                          // PG: extra gap before the a-columns (room for the Σ header); EQX: the "=" between Σ and pieces
                                                                                    // twists=false on pol+prim: P(◇) is just the pile bottoms, so only the Σ/first column is drawn (no a-expansion)
  const useMatrix = matrixMode && !weakMode;                                       // panel follows the matrix shape toggle (pol and pol+prim)
  const piece=(mat,cx,cy,half)=>{ if(useMatrix) drawMatrixInto(ppctx,mat,r,cx,cy,half/((r/2+0.6)*MW)); else drawDiamondInto(ppctx,mat,r,cx,cy,half/((r+2)*0.62)); };
  const toS=(cx,cy)=>[(cx-ppcam.x)*s+OX,(cy-ppcam.y)*s+OY];
  if(ppHeadCv){ const hc=ppHeadCv.getContext('2d'), hw=ppHeadCv.width, hh=ppHeadCv.height, half=Math.min(hw,hh)*0.44;   // the inline ◇ in the header equation, redrawn each frame (follows focus + matrix toggle)
    hc.setTransform(1,0,0,1,0,0); hc.clearRect(0,0,hw,hh);
    if(useMatrix) drawMatrixInto(hc,primGridData.src,r,hw/2,hh/2,half/((r/2+0.6)*MW)); else drawDiamondInto(hc,primGridData.src,r,hw/2,hh/2,half/((r+2)*0.62)); }
  if(twists){ { const h=toS(0,-0.72); ppHeaderSum(ppctx,h[0],h[1]); }               // column headers: Σₐ Pw(−a), then a = 0,1,…
    ppctx.font=(12.5*DPR)+'px ui-sans-serif'; ppctx.textBaseline='middle';
    for(let a=0;a<=maxCol;a++){ const p=toS(a+PG,-0.72); if(p[0]<OX-40*DPR||p[0]>W+40*DPR)continue; ppctx.fillStyle='#6c86ad'; ppctx.textAlign='center'; ppctx.fillText('a = '+a,p[0],p[1]); } }
  else { const h=toS(0,-0.72); ppctx.textBaseline='middle'; ppctx.fillStyle='#8fb4e6';   // prim: the first column is P_w (the pile bottoms)
    const f1=12*DPR, f2=9*DPR; ppctx.font='600 '+f1+'px ui-sans-serif'; const pw=ppctx.measureText('P').width; ppctx.font=f2+'px ui-sans-serif'; const ww=ppctx.measureText('w').width, sx=h[0]-(pw+ww)/2;
    ppctx.textAlign='left'; ppctx.font='600 '+f1+'px ui-sans-serif'; ppctx.fillText('P',sx,h[1]); ppctx.font=f2+'px ui-sans-serif'; ppctx.fillText('w',sx+pw,h[1]+3*DPR); }
  rows.forEach((row,ri)=>{ const y=ri*RP;                                          // weight rows (no diamond row):  Σ_a P_w(-a)  =  P_w(0)  P_w(-1)  …
    const lp=toS(-0.85,y); ppctx.fillStyle='#6c86ad'; ppctx.textAlign='right'; ppctx.textBaseline='middle'; ppctx.font=(12.5*DPR)+'px ui-sans-serif'; ppctx.fillText('w = '+row.w,lp[0],lp[1]);
    const ps=toS(0,y); piece(row.sum,ps[0],ps[1],diag);
    if(ri<rows.length-1){ const pv=toS(0,(ri+0.5)*RP); ppctx.fillStyle='#6c86ad'; ppctx.textAlign='center'; ppctx.textBaseline='middle'; ppctx.font=(15*DPR)+'px ui-sans-serif'; ppctx.fillText('+',pv[0],pv[1]); }   // + between the string rows (column 0)
    if(twists){ const eq=toS(EQX,y); ppctx.fillStyle='#6c86ad'; ppctx.textAlign='center'; ppctx.textBaseline='middle'; ppctx.font=(14*DPR)+'px ui-sans-serif'; ppctx.fillText('=',eq[0],eq[1]);
      row.cells.forEach((cell,ci)=>{ const p=toS(cell.a+PG,y); piece(cell.mat,p[0],p[1],diag);
        ppLabel(ppctx,p[0],p[1]+diag+13*DPR,row.w,cell.a);
        if(ci<row.cells.length-1){ const pl=toS(cell.a+PG+0.5,y); ppctx.fillStyle='#6c86ad'; ppctx.textAlign='center'; ppctx.textBaseline='middle'; ppctx.font=(14*DPR)+'px ui-sans-serif'; ppctx.fillText('+',pl[0],pl[1]); } }); } });   // + between the a-columns
  { const yL=(rows.length-1)*RP+RP*0.72, yD=(rows.length-1)*RP+RP*1.36;             // straight line closing the table, then the total row  Σ strings = ◇
    const l0=toS(-0.55,yL), l1=toS(twists?maxCol+PG+0.5:0.55,yL);                   // pol: full width; prim: just the P_w column
    ppctx.strokeStyle='rgba(143,180,230,0.55)'; ppctx.lineWidth=1.4*DPR; ppctx.beginPath(); ppctx.moveTo(l0[0],l0[1]); ppctx.lineTo(l1[0],l1[1]); ppctx.stroke();
    const dl=toS(-0.85,yD); ppctx.fillStyle='#8fb4e6'; ppctx.textAlign='right'; ppctx.textBaseline='middle'; ppctx.font='600 '+(15*DPR)+'px ui-sans-serif'; ppctx.fillText(primGridData.totalLabel,dl[0],dl[1]);
    const dp=toS(0,yD); piece(primGridData.src,dp[0],dp[1],diag); } }
if(ppcv){ let ppDrag=false, ppLast=[0,0];                                          // pan / zoom — its own camera, independent of the main canvas
  ppcv.addEventListener('pointerdown',e=>{ ppcv.setPointerCapture(e.pointerId); ppDrag=true; ppLast=[e.clientX,e.clientY]; });
  ppcv.addEventListener('pointermove',e=>{ if(!ppDrag)return; ppcam.x-=(e.clientX-ppLast[0])*DPR/ppcam.s; ppcam.y-=(e.clientY-ppLast[1])*DPR/ppcam.s; ppLast=[e.clientX,e.clientY]; });
  ppcv.addEventListener('pointerup',e=>{ ppcv.releasePointerCapture(e.pointerId); ppDrag=false; });
  ppcv.addEventListener('pointerleave',()=>{ ppDrag=false; });
  ppcv.addEventListener('wheel',e=>{ e.preventDefault(); ppcam.s=clamp(ppcam.s*Math.exp(-e.deltaY*0.0016),36,360); },{passive:false}); }
addEventListener('resize',()=>{ if(ppShown) ppResize(); });

/*=================== interaction ===================*/
let dragBg=false, dragNode=null, dragWN=null, last=[0,0], moved=false, hoverVid=-1, hoverWN=-1, hoverTreeUid=-1, treeHoverPileUid=-1, treeHoverMt=0;
cv.addEventListener('pointerdown',e=>{ cv.setPointerCapture(e.pointerId); moved=false; last=[e.clientX,e.clientY];
  if(!weakMode&&viz!=='tree'&&mode==='idle'){ const h=hitNode(e.clientX,e.clientY); if(h){ dragNode=h; h.pin=true; autoFrame=false; return; } }
  if(weakMode&&weakLayout==='graph'){ const wi=weakHitNode(e.clientX,e.clientY); if(wi>=0){ dragWN=WN[wi]; dragWN.pin=true; autoFrame=false; return; } }  // weak graph nodes drag like the polarized graph
  dragBg=true; cv.classList.add('drag'); });
cv.addEventListener('pointermove',e=>{ const dx=e.clientX-last[0],dy=e.clientY-last[1];
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  if(dragNode){ const [wx,wy]=toWorldXY(e.clientX,e.clientY); dragNode.x=wx; dragNode.y=wy; last=[e.clientX,e.clientY]; return; }
  if(dragWN){ const [wx,wy]=toWorldXY(e.clientX,e.clientY); dragWN.x=wx; dragWN.y=wy; dragWN.vx=dragWN.vy=0; last=[e.clientX,e.clientY]; return; }
  if(dragBg){ autoFrame=false; cam.x-=dx*DPR/cam.s; cam.y-=dy*DPR/cam.s; cam.tx=cam.x;cam.ty=cam.y;cam.ts=cam.s; last=[e.clientX,e.clientY]; return; }
  if(weakMode && weakLayout!=='tree') hoverWN=weakHitNode(e.clientX,e.clientY);  // hover: focus a vertex's edges
  else if(viz==='tree') hoverTreeUid=treeHitNode(e.clientX,e.clientY);
  else if(mode==='idle'){ const h=hitNode(e.clientX,e.clientY); hoverVid=h?h.vid:-1; }
  else hoverVid=-1; });
cv.addEventListener('pointerleave',()=>{ hoverVid=-1; hoverWN=-1; hoverTreeUid=-1; });
cv.addEventListener('pointerup',e=>{ cv.releasePointerCapture(e.pointerId);
  if(dragWN){ dragWN.pin=false; dragWN=null; }
  else if(dragNode){ dragNode.pin=false; dragNode=null; }
  else if(viz!=='tree'&&mode==='idle'&&!moved){ const h=hitNode(e.clientX,e.clientY);
    if(h){ selected=h.vid; showInfo(h.vid); } else { selected=null; document.getElementById('info').style.display='none'; } }
  dragBg=false; cv.classList.remove('drag'); });
cv.addEventListener('wheel',e=>{ e.preventDefault(); autoFrame=false;
  cam.ts=clamp(cam.s*Math.exp(-e.deltaY*0.0016),8,220); cam.s=cam.ts; },{passive:false});
function hitNode(cx,cy){ const [wx,wy]=toWorldXY(cx,cy); let best=null,bd=1e9;
  for(const n of gnodes){ const d=Math.hypot(n.x-wx,n.y-wy); if(d<bd){bd=d;best=n;} }
  return bd<(G.r+1)*0.7? best:null; }
function weakHitNode(cx,cy){ if(!WG||!WN.length)return -1; const [wx,wy]=toWorldXY(cx,cy); let best=-1,bd=1e9;
  for(let i=0;i<WN.length;i++){ if((WN[i].expl||0)>0.5)continue; const d=Math.hypot(WN[i].x-wx,WN[i].y-wy); if(d<bd){bd=d;best=i;} }
  return bd<(WG.r/2+1.1)*MW? best:-1; }
function treeHitNode(cx,cy){ if(!G)return -1; const [wx,wy]=toWorldXY(cx,cy); let best=-1,bd=1e9;
  for(const n of tree){ if(!n.born)continue; const d=Math.hypot(n.x-wx,n.y-wy); if(d<bd){bd=d;best=n.uid;} }
  return bd<(G.r+1)*0.7? best:-1; }
function showInfo(vid){ const m=G.vertices[vid], el=document.getElementById('info');
  const od=G.edges.filter(e=>e[0]===vid).length, id=G.edges.filter(e=>e[1]===vid).length;
  el.innerHTML='<h3>vertex '+vid+'</h3><div class="k">degenerates to '+od+' · from '+id+'</div>'+
    '<pre style="margin:.5em 0;color:#cfe0f7">'+m.map(r=>'['+r.join(' ')+']').join('\n')+'</pre>'; el.style.display='block'; }

/*=================== view-button state machine ===================*/
function finishTree(){ done=revealOrder.length; revealT=0; curReveal=-1; playing=false; updatePlayIcon(); applyState();
  tree.forEach(n=>{n.born=true;n.mt=1;n.state='done';n.pile=null;n._done=true;n.x=n.tx;n.y=n.ty;});
  if(mode==='grow') mode='idle'; }
function collapseTo(target){
  if(viz==='tree'){ finishTree(); collapseTarget=target; startCollapse(); }
  else { if(target==='poset'){ if(!isPoset()){ showWarn('Not a poset'); scare(); return; }
           viz='poset'; renderVizButtons(); reflow(posetTargets()); }
         else { viz='graph'; renderVizButtons(); const gp={}; gnodes.forEach(n=>gp[n.vid]={x:n.gx,y:n.gy}); reflow(gp); } } }
function scare(){ const b=document.getElementById('toposet'); if(b){ b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } }
function updateChrome(){   // dynamic toolbar: show a button only where its state is meaningful; the rest explode + flush
  const ex=(el,hide)=>{ if(el) el.classList.toggle('explode',hide); };
  const ac=(id,on)=>{ const b=document.getElementById(id); if(b) b.classList.toggle('active',on); };
  ex(document.querySelector('.transport'), !(viz==='tree' && !weakMode && !primMode));   // play/step only in the strict tree (pol) view
  ex(document.getElementById('primbtn'), weakMode);                                       // prim blows away while weak is open
  ex(document.getElementById('matrixbtn'), weakMode); ex(document.getElementById('decompbtn'), weakMode);   // pol-side toggles: present for pol & pol+prim, all views
  ac('matrixbtn', matrixMode); ac('decompbtn', decompMode);
  ex(document.getElementById('weakctrls'), !weakMode);                                    // k / ∘ appear only with weak, left of the weak button
  const now = decompMode && !weakMode;                                                    // KPR decomposition panel: any pol view (tree/graph/poset), with or without prim
  if(now!==ppShown){ ppShown=now; const pp=document.getElementById('primpanel');
    if(pp) pp.classList.toggle('shown',now); document.body.classList.toggle('ppopen',now);
    if(now && G){ ppResize(); if(primStickyVid<0) primStickyVid=(hoverVid>=0?hoverVid:firstLeafVid()); primPanelVid=primStickyVid; updatePrimPanel(primStickyVid); ppFit(); } } }
function renderVizButtons(){ updateHint(); updateChrome(); const c=document.getElementById('vizbtns'); c.innerHTML='';
  const mk=(label,fn,id)=>{ const b=document.createElement('button'); b.textContent=label; b.onclick=fn; if(id)b.id=id; c.appendChild(b); };
  if(weakMode){ if(weakLayout!=='graph') mk('to graph',()=>setWeakLayout('graph'));
    if(weakLayout!=='poset') mk('to poset',()=>setWeakLayout('poset'),'toposet');
    if(weakLayout!=='tree') mk('to tree',()=>setWeakLayout('tree')); return; }
  if(viz==='tree') mk('to graph',()=>collapseTo('graph'));
  else if(viz==='graph'){ mk('to tree',toTree); mk('to poset',()=>collapseTo('poset'),'toposet'); }
  else { mk('to tree',toTree); mk('to graph',()=>collapseTo('graph')); } }

/*=================== validation + warning ===================*/
const errEl=document.getElementById('err'), warnEl=document.getElementById('warn');
function showErr(msg){ errEl.textContent=msg; errEl.style.display='block'; }
function clearErr(){ errEl.style.display='none'; }
let _warnT=null;
function showWarn(msg){ warnEl.textContent=msg; warnEl.style.display='block';
  clearTimeout(_warnT); _warnT=setTimeout(()=>warnEl.style.display='none',4500); }
function hideWarn(){ warnEl.style.display='none'; }
function parseVec(str){ const a=str.split(',').map(s=>s.trim()).filter(s=>s.length).map(Number);
  if(a.some(x=>!Number.isInteger(x)||x<0)) return {err:'entries must be non-negative integers'};
  if(a.length<2) return {err:'need at least two entries'};
  const r=a.length-1; for(let i=0;i<=r;i++) if(a[i]!==a[r-i]) return {err:'not a Hodge vector: must be symmetric (hₚ = h_{r−p})'};
  if(Math.max(...a)>9 || r>6) return {err:'too large to compute in-browser (keep entries ≤ 9, weight ≤ 6)'};
  return {vec:a}; }
function tryRun(str){ const p=parseVec(str); if(p.err){ showErr(p.err); return; } clearErr(); run(p.vec); }

/*=================== controls ===================*/
const vecInput=document.getElementById('vec');
vecInput.addEventListener('input',e=>{ const p=parseVec(e.target.value.replace(/\s/g,'')); if(!p.err) clearErr(); });
vecInput.addEventListener('keydown',e=>{ if(e.key==='Enter') tryRun(vecInput.value.replace(/\s/g,'')); });   // autoplay on changed data
vecInput.addEventListener('change',()=>{ if(curVec.join(',')!==vecInput.value.replace(/\s/g,'')) tryRun(vecInput.value.replace(/\s/g,'')); });
document.getElementById('prev').onclick=stepPrev;
document.getElementById('playpause').onclick=togglePlay;
document.getElementById('next').onclick=stepNext;
document.getElementById('replay').onclick=()=>tryRun(vecInput.value.replace(/\s/g,''));
const menu=document.getElementById('menu'), menubtn=document.getElementById('menubtn');
menubtn.onclick=()=>{ menu.style.display = menu.style.display==='block'?'none':'block'; };
document.getElementById('speed').oninput=e=>{ speed=+e.target.value; };
document.getElementById('graphlayout').onchange=e=>{ graphLayout=e.target.value; autoFrame=true; };   // applies to all graph views (not poset)
document.getElementById('graphlayout').value=graphLayout;   // keep the select in sync with the default (guards against browser form restoration)
document.getElementById('tgl-autoplay').onchange=e=>{ autoplay=e.target.checked; };
document.getElementById('tgl-graph').onchange=e=>{ autoGraph=e.target.checked; if(autoGraph){ document.getElementById('tgl-poset').checked=false; autoPoset=false; } };
document.getElementById('tgl-poset').onchange=e=>{ autoPoset=e.target.checked; if(autoPoset){ document.getElementById('tgl-graph').checked=false; autoGraph=false; } };
document.getElementById('matrixbtn').onclick=()=>{ matrixMode=!matrixMode; autoFrame=true; updateChrome(); updateHint(); };   // upright h-matrix, no box (pol & pol+prim, all views)
document.getElementById('decompbtn').onclick=()=>{ decompMode=!decompMode; autoFrame=true; updateChrome(); updateHint();
  if(viz==='tree'&&G&&mode==='idle') frameTree(); };   // reframe the settled tree into the (now narrower / full) canvas
document.getElementById('primbtn').onclick=()=>{ primMode=!primMode;                 // primitive cohomology; disables the play transport, keeps hover-replay
  if(primMode){ playing=false; updatePlayIcon(); finishTree(); }
  primPanelVid=-1;                                                                   // force the decomposition panel to recompute (◇ vs P(◇)) for the same focused node
  document.getElementById('primbtn').classList.toggle('active',primMode); autoFrame=true; updateChrome(); updateHint(); };
const _origRun=run; run=function(v){ _origRun(v); populateWeakK(); if(weakMode) refreshWeak(); };   // keep weak view + k options in sync with h

/*=================== hint + math labels ===================*/
function updateHint(){ const el=document.getElementById('hinttext'); if(!el)return;
  const v = weakMode? weakLayout : viz, nav=' <span style="opacity:.6">Drag / wheel to navigate.</span>'; let s;
  if(!weakMode){
    if(v==='graph') s='<b>Polarized relations.</b> Vertices are admissible diamonds; an arrow D&rarr;D&prime; means D degenerates to D&prime; (i.e. D&prime;&nbsp;&#8828;&nbsp;D). Drag to rearrange, hover a vertex to highlight its edges.';
    else if(v==='poset') s='<b>Polarized order.</b> The Hasse diagram of the relation&nbsp;&#8828; &mdash; only the cover relations are drawn.';
    else s='Each vertex is an admissible diamond; each leaf degenerates, then pivots an irreducible <b>sl&#8322;&times;sl&#8322;</b> representation (and its conjugate) onto its limit &mdash; a <b>pile</b>. Hover a node to replay its pivot; press&nbsp;&#9654; to grow the whole tree.';
  } else if(weakCirc && weakK===0){
    s='<b>R<sub>0</sub><sup>&#8728;</sup>(<u>h</u>) = R<sub>0</sub>(<u>h</u>).</b> At k = 0 nothing is pure-restricted, so the circ subgraph is the whole weak relation.';
  } else {
    const r=(curVec&&curVec.length>1)? curVec.length-1 : 2*weakK+2;              // actual box coordinates for this h
    const bk='['+(weakK+1)+',&thinsp;'+(r-weakK-1)+']&sup2;', bp='['+weakK+',&thinsp;'+(r-weakK)+']&sup2;';
    if(!weakCirc){
      const Bk='the black box <b>B<sub>'+weakK+'</sub></b> = '+bk;
      if(v==='graph') s='<b>Weak relations R<sub>'+weakK+'</sub>(<u>h</u>).</b> Vertices are classes of diamonds identified once they agree outside '+Bk+'; edges are the induced relation. Drag nodes, hover to focus edges.';
      else if(v==='poset') s='<b>Weak order R<sub>'+weakK+'</sub>(<u>h</u>).</b> Hasse diagram of the order on classes modulo '+Bk+' (shown when it is a poset).';
      else s='<b>Weak tree R<sub>'+weakK+'</sub>(<u>h</u>).</b> Each vertex is a class modulo '+Bk+', drawn as a matrix box; the entry on the box diagonal is forced by the column sums (column p totals h<sup>p</sup>). Hover to replay the pivot between two representatives.';
    } else {
      const core=' Classes must be <b>pure outside</b> the shaded <b>relative box B<sub>'+(weakK-1)+'</sub></b> = '+bp+', which contains the black box <b>B<sub>'+weakK+'</sub></b> = '+bk+'. The only entries that move are those of <b>F<sup>'+weakK+'</sup></b> &mdash; the ring inside the relative box but outside the black box.';
      if(v==='graph') s='<b>R<sub>'+weakK+'</sub><sup>&#8728;</sup>(<u>h</u>) &mdash; circ subgraph.</b>'+core+' Drag nodes, hover to focus edges.';
      else if(v==='poset') s='<b>R<sub>'+weakK+'</sub><sup>&#8728;</sup>(<u>h</u>) &mdash; circ subposet.</b>'+core+' Hasse diagram; cover relations only.';
      else s='<b>R<sub>'+weakK+'</sub><sup>&#8728;</sup>(<u>h</u>) &mdash; circ sub-tree.</b>'+core+' The rest explode away; hover to replay a pivot.';
    }
  }
  if(primMode) s='<b style="color:#8fb4e6">Primitive cohomology.</b> Nodes show their primitive Hodge numbers P<sup>p,q</sup> = h<sup>p,q</sup> &minus; h<sup>p&minus;1,q&minus;1</sup> (zero above the middle weight). '+s;
  if(matrixMode && !weakMode) s='<b style="color:#8fb4e6">Rotated view.</b> Every node is rotated into its upright weight matrix h<sup>p,q</sup>, without the box. '+s;
  if(decompMode && !weakMode) s='<b style="color:#8fb4e6">KPR decomposition.</b> Hover a node to unpack ◇ = &Sigma;<sub>w,a</sub> P<sub>w</sub>(&minus;a) in the left panel; the shaded a = 0 column is P(◇). '+s;
  el.innerHTML = s + nav; }
function renderMathLabels(){ const h=document.getElementById('hlbl'), k=document.getElementById('klbl');
  if(window.katex){ if(h) h.innerHTML=katex.renderToString('\\underline{h}\\;=',{throwOnError:false}); if(k) k.innerHTML=katex.renderToString('k\\;=',{throwOnError:false}); }
  else { if(h) h.innerHTML='<u>h</u>&nbsp;='; if(k) k.textContent='k ='; } }
document.getElementById('hinthide').onclick=()=>{ document.getElementById('hint').style.display='none'; document.getElementById('hintshow').style.display='block'; };
document.getElementById('hintshow').onclick=()=>{ document.getElementById('hint').style.display=''; document.getElementById('hintshow').style.display='none'; };
renderMathLabels(); updateHint(); window.addEventListener('load', renderMathLabels);   // KaTeX loads deferred — re-render once it's ready

/*=================== boot ===================*/
requestAnimationFrame(frame);
tryRun('1,2,2,1');
