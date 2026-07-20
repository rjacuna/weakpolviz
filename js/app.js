/*=================== shared state ===================*/
let G=null, BASIS=null, tree=[], byUid={}, parentsOrder=[], gnodes=[], gpos={};
let mode='idle', speed=1, selected=null, _rankY={};
const EDGE_DRAW_MAX=111;   // above this many edges the graph view draws only the hovered/selected diamond's incident edges
const TREE_NODE_MAX=2000;  // if the tree's full unfolding would exceed this, tree view is DISABLED and graph view is the default (a DAG has exponentially many root→leaf paths)
let treeTooBig=false;
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
function unfoldSize(adj){   // # nodes a FULL unfolding would have = Σ_v (# root→v paths); early-exits once it passes the cap
  const V=G.vertices.length, indeg=new Array(V).fill(0);
  for(let u=0;u<V;u++) for(const w of adj[u]) indeg[w]++;
  const ind=indeg.slice(), q=[]; for(let i=0;i<V;i++) if(ind[i]===0) q.push(i);
  const order=[]; while(q.length){ const u=q.shift(); order.push(u); for(const w of adj[u]) if(--ind[w]===0) q.push(w); }
  const paths=new Array(V).fill(0); paths[G.root]=1; let total=1;
  for(const u of order) for(const w of adj[u]){ paths[w]+=paths[u]; total+=paths[u]; if(total>TREE_NODE_MAX) return total; }
  return total; }
function buildTree(){   // FULL UNFOLDING of the degeneration DAG: every root→…→v path is its own branch, so a vertex reached k ways appears k times — the "all the ways to decompose". If the unfolding would exceed TREE_NODE_MAX the tree is left as just the root and disabled (graph view takes over).
  tree=[]; byUid={}; let uid=0;
  const adj={}, mvOf={};
  for(let i=0;i<G.vertices.length;i++) adj[i]=[];
  G.edges.forEach((e,ei)=>{ adj[e[0]].push(e[1]); if(G.moves) mvOf[e[0]+'>'+e[1]]=G.moves[ei]; });   // moves optional: else deduced on the fly (moveFor)
  treeTooBig = unfoldSize(adj) > TREE_NODE_MAX;
  const mk=(vid,par,depth,done,mv)=>{ const n={uid:uid++,vid,depth,parent:par,kids:[],born:!!done,state:done?'done':'hidden',x:0,y:0,tx:0,ty:0,mt:done?1:0,move:(mv==null?null:mv),pile:null,_done:!!done,jit:0}; tree.push(n); byUid[n.uid]=n; return n; };
  const root=mk(G.root,-1,0,true,null);
  if(!treeTooBig){ const queue=[root];
    while(queue.length){ const node=queue.shift();
      for(const w of adj[node.vid]){ const c=mk(w, node.uid, node.depth+1, false, G.moves? mvOf[node.vid+'>'+w] : null); node.kids.push(c.uid); queue.push(c); } } }
  layoutTree();
  parentsOrder=tree.filter(n=>n.kids.length>0).sort((a,b)=>a.depth-b.depth||a.tx-b.tx).map(n=>n.uid); }
function layoutTree(){ let leafX=0; const dW=(G.r+2)*0.62*0.42*2, XS=Math.max(3.2,dW*1.12), YS=Math.max(3.8,dW*1.18);   // step ≥ diamond width so unrotated diamonds never overlap
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
  const dW=(G.r+2)*0.62*0.42*2, XS=Math.max(3.4,dW*1.15), YS=Math.max(5.2,dW*1.25);   // step ≥ diamond width so unrotated diamonds never overlap (matrix boxes are narrower, so they always clear)
  Object.keys(layers).forEach(r=>{ const arr=layers[r]; arr.forEach((n,k)=>{
    n.x=(k-(arr.length-1)/2)*XS; n.y=(+r)*YS; n.grank=(rank[n.vid]==null?9:rank[n.vid]); }); });
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
  try{ G=cachedComputeGraph(hvec); }catch(e){ showErr('compute failed: '+e); return; }
  BASIS=G.basis; selected=null; hideWarn();
  buildTree(); buildGraph();
  revealOrder=[]; for(const puid of parentsOrder){ const p=byUid[puid];
    for(const kuid of p.kids) revealOrder.push({parentUid:puid, child:byUid[kuid]}); }
  done=0; revealT=0; curReveal=-1;
  if(treeTooBig){ viz='graph'; mode='idle'; renderVizButtons();                       // unfolding too large ⇒ open in graph view; tree view is disabled
    gnodes.forEach(n=>{ n.x=n.gx; n.y=n.gy; }); frameGraph(); cam.x=cam.tx; cam.y=cam.ty; cam.s=cam.ts; }
  else { mode='grow'; viz='tree'; renderVizButtons();
    if(autoplay){ applyState(); cam.x=cam.tx=tree[0].tx; cam.y=cam.ty=tree[0].ty; cam.s=cam.ts=fitZoom(G.r); playing=true; updatePlayIcon(); }
    else { finishTree(); frameTree(); cam.x=cam.tx; cam.y=cam.ty; cam.s=cam.ts; } }   // default: whole tree, settled & static — movie plays only on ▶
}
function applyState(){ for(let i=0;i<revealOrder.length;i++){ const c=revealOrder[i].child;
    if(i<done){ c.born=true; c.state='done'; c._done=true; c.pile=null; c.mt=1; c.x=c.tx; c.y=c.ty; }
    else { c.born=false; c.state='hidden'; c._done=false; c.pile=null; c.mt=0; } }
  curReveal=-1; revealT=0; }
function beginReveal(idx){ const r=revealOrder[idx], c=r.child, p=byUid[r.parentUid];
  c.born=true; c.state='fly'; c.mt=0; c.x=p.x; c.y=p.y;
  c.pile=buildPiles(G.vertices[p.vid], G.vertices[c.vid], G.r, moveFor(c));
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
function replayGrow(){ if(!G){ tryRun(vecInput.value.replace(/\s/g,'')); return; }   // ↺ restarts the tree-grow movie from the root and plays it
  ensureTreeGrow(); done=0; revealT=0; curReveal=-1; applyState();
  cam.x=cam.tx=tree[0].tx; cam.y=cam.ty=tree[0].ty; cam.s=cam.ts=fitZoom(G.r);
  playing=true; updatePlayIcon(); }
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
  const w=(c-a)+6,h=(d-b)+6, availW=cv.width*(1-ppFrac());                          // the decomposition panel eats its (resizable) share on the left
  cam.tx=(a+c)/2; cam.ty=(b+d)/2; cam.ts=clamp(Math.min(availW/w,cv.height/h)*0.9,0.5,70); }   // low floor so even a big graph fits on load
function toTree(){ tree.forEach(n=>{ n.born=true; n.mt=1; n.state='done'; n.pile=null; n._done=true; n._sx=n.x; n._sy=n.y; });
  viz='tree'; mode='expand'; expandT=0; renderVizButtons(); autoFrame=false; }
function stepExpand(dt){ expandT+=dt*speed/900; const tt=clamp(expandT,0,1);
  tree.forEach(n=>{ n.x=lerp(n._sx,n.tx,easeIO(tt)); n.y=lerp(n._sy,n.ty,easeIO(tt)); });
  frameTree(); if(tt>=1) mode='idle'; }
function frameTree(){ let a=1e9,b=1e9,c=-1e9,d=-1e9;
  for(const n of tree){ if(!n.born)continue; a=Math.min(a,n.tx);c=Math.max(c,n.tx);b=Math.min(b,n.ty);d=Math.max(d,n.ty); }
  const w=(c-a)+4,h=(d-b)+4, availW=cv.width*(1-ppFrac()); cam.tx=(a+c)/2; cam.ty=(b+d)/2;   // decomposition panel eats its (resizable) share on the left
  cam.ts=clamp(Math.min(availW/w,cv.height/h)*0.9,0.1,fitZoom(G.r)); }   // low floor so even a very wide tree fits on load
function viewMinZoom(){   // wheel/pinch may zoom out until the whole current view fits (+ a diamond of margin), even below the usual floor — but never RAISE the floor for small content
  const useTree=(viz==='tree'||mode==='collapse')||(weakMode&&weakLayout==='tree');
  let a=1e9,b=1e9,c=-1e9,d=-1e9,any=false;
  if(useTree){ for(const n of tree){ a=Math.min(a,n.tx);b=Math.min(b,n.ty);c=Math.max(c,n.tx);d=Math.max(d,n.ty); any=true; } }
  else if(!weakMode){ for(const n of gnodes){ a=Math.min(a,n.x);b=Math.min(b,n.y);c=Math.max(c,n.x);d=Math.max(d,n.y); any=true; } }
  if(!any) return 8;
  const pad=(G?(G.r+2)*0.62*0.42*2:4), w=(c-a)+pad*2, h=(d-b)+pad*2, availW=cv.width*(1-ppFrac());
  return Math.min(8, Math.min(availW/w, cv.height/h)*0.82); }

/*=================== render loop ===================*/
function frame(now){ const dt=Math.min(40,now-(frame._p||now)); frame._p=now;
  cam.x=lerp(cam.x,cam.tx,0.08); cam.y=lerp(cam.y,cam.ty,0.08); cam.s=lerp(cam.s,cam.ts,0.08);
  viewOffsetX=lerp(viewOffsetX, cv.width*ppFrac()/2, 0.14);                       // slide the main view right to clear the (resizable) decomposition panel
  ctx.clearRect(0,0,cv.width,cv.height);
  if((weakMode || weakClosing) && weakLayout!=='tree'){ stepWeak(dt); if(abMode&&weakMode&&!weakClosing) drawAmbientOverlay(); else drawWeakMain(); requestAnimationFrame(frame); return; }   // weak tree falls through to the tree renderer
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
  if(wk){ const hn = hoverTreeUid>=0 ? byUid[hoverTreeUid] : null, hmv=hn?moveFor(hn):null;   // hovered class: replay its incoming pivot
    if(hn && hn.parent>=0 && hmv && hmv.length){
      if(weakHoverPileUid!==hn.uid){ weakHoverPileUid=hn.uid; hn.wpile=buildPiles(G.vertices[byUid[hn.parent].vid],G.vertices[hn.vid],G.r,hmv); weakTreeMt=0; }
      weakTreeMt += 0.012*speed; if(weakTreeMt>1.55) weakTreeMt=0; }                // loop: fall (0..1) then hold, then repeat
    else weakHoverPileUid=-1; }
  else { const hn = (!playing && hoverTreeUid>=0) ? byUid[hoverTreeUid] : null, hmv=hn?moveFor(hn):null;   // strict tree: hover replays the diamond pivot
    if(hn && hn.parent>=0 && hmv && hmv.length && hn.state==='done'){
      if(treeHoverPileUid!==hn.uid){ treeHoverPileUid=hn.uid; hn.hpile=buildPiles(G.vertices[byUid[hn.parent].vid],G.vertices[hn.vid],G.r,hmv); treeHoverMt=0; }
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
  const EE=(viz==='poset')? getHasse() : G.edges, Hw=(G.r+2)*0.62*0.42, Sw=boxHalfW(G.r);   // connect to diamond (or square, in matrix/prim) boundary
  const sel=(selected==null?-1:selected), hov=(hoverVid>=0||sel>=0);   // edges light for the SELECTED node (sticky — same as a mobile tap) and, on desktop, the hovered node
  const tooMany=EE.length>EDGE_DRAW_MAX;   // past the cap the full edge set is unrenderable: draw ONLY the hovered/selected diamond's incident edges
  for(const [a,b] of EE){ const n=gpos[a],m=gpos[b]; if(!n||!m)continue;
    const inc=hov&&(a===hoverVid||b===hoverVid||a===sel||b===sel), dim=hov&&!inc;
    if(tooMany && !inc) continue;
    const dx=m.x-n.x, dy=m.y-n.y, f=mtx?edgeFsq(dx,dy,Sw):edgeF(dx,dy,Hw);
    const [bx,by]=toScreen(n.x+dx*f,n.y+dy*f),[ex,ey]=toScreen(m.x-dx*f,m.y-dy*f);
    const ang=Math.atan2(ey-by,ex-bx);
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

/*=================== ambient-poset overlay (a / A vectors on R_k^∘) ===================*/
// Overlays the full poset 𝒜^{r-2k}(h^k) on the weak-circ graph: realized classes = diamonds (F^k ring highlit),
// missing profiles = dashed ghosts, missing ⊑-covers = red. Maximal ⇔ no ghosts, saturated ⇔ no red.
let abMode=null, abFramePending=false, abAnim=0;                                    // null | 'a' | 'A' ; abAnim 0→1 collapses every diamond onto its A-vector
let abPos=new Map(), abHover=null, abHoverT=0, abEox=0;                              // overlay vertex positions (for hit-testing) + hovered vertex key + hover animation + collapse box offset
let abLay=new Map(), abLaySig=null;                                                 // PERSISTENT, drag-editable overlay layout (honours the graphLayout menu: layered / force / radial); rebuilt when its signature changes
function movingVec(rep,r,k){ const C=rep.slice().reverse(); const a=[]; for(let q=k;q<=r-k;q++) a.push(C[k][q]); return a; }   // F^k frontier column p=k, q∈[k,r−k]
function drawFkGreen(cx,cy,U,r,k,col){                                              // box around the moving vector: the LEFT column j=k (a coin here FALLS down the column), rows k..r−k — green for realized, red for ghosts
  const x=cx+(k-r/2)*MW*U, y0=cy+(k-r/2-0.5)*MW*U, hh=(r-2*k+1)*MW*U;
  ctx.save(); ctx.strokeStyle=col||'#3ecf8e'; ctx.lineWidth=2.2*DPR; ctx.strokeRect(x-MW*U/2, y0, MW*U, hh); ctx.restore(); }
function drawGhostNode(cx,cy,U,r,k,aVec,AVec,et){                                   // missing profile: dashed box that (like the realized ones) collapses onto its vector; a-vector (et=0) crossfades to the A-vector (et=1) down the green column
  const cb=collapseBox(cx,cy,U,r,k,et);
  ctx.save(); wBoxPath(cb.bcx,cy,(r+2)*0.62*U,cb.hsx,1,cb.hsy); ctx.setLineDash([4*DPR,3*DPR]); ctx.strokeStyle='rgba(138,160,191,0.5)'; ctx.lineWidth=1.4*DPR; ctx.stroke(); ctx.restore();
  const x=cx+(k-r/2)*MW*U;                                                          // reversed order matches the left column of the real matrix (top = high weight)
  for(let i=0;i<aVec.length;i++) wTxt(x, cy+(k+i-r/2)*MW*U, U, aVec[aVec.length-1-i], 1-et, '#cfe0f7');
  if(AVec&&et>0.01) for(let i=0;i<AVec.length;i++) wTxt(x, cy+(k+i-r/2)*MW*U, U, AVec[AVec.length-1-i], et, '#cfe0f7');
  drawFkGreen(cx,cy,U,r,k,'#e85656'); }                                             // ghost: red border on the vector
// world→screen half-dims of the collapse box as it morphs (et:0→1) from the full square onto a thin box hugging the A-column
function collapseBox(cx,cy,U,r,k,et){ const colOff=(k-r/2)*MW*U;
  return { bcx:cx+et*colOff, hsx:lerp((r/2+0.7),0.65,et)*MW*U, hsy:lerp((r/2+0.7),(r-2*k+1)/2+0.35,et)*MW*U }; }
// realized node collapsing (et:0→1) from the full weak matrix onto its A-vector: the box shrinks onto the green column (edges follow) as the interior slides in and fades and the A-vector fades in
function drawCollapseNode(m,cx,cy,U,r,k,et,hvec,AVec){
  const cb=collapseBox(cx,cy,U,r,k,et);
  wBoxPath(cb.bcx,cy,(r+2)*0.62*U,cb.hsx,1,cb.hsy); ctx.fillStyle='rgba(211,211,211,0.09)'; ctx.fill();
  ctx.strokeStyle='rgba(211,211,211,0.30)'; ctx.lineWidth=1.1*DPR; ctx.stroke();
  const colX=cx+(k-r/2)*MW*U, fade=1-et;
  if(fade>0.01){ ctx.save(); ctx.globalAlpha*=fade;                                 // inner F^k / black-box frames fade out as the interior collapses
    if(weakCirc && k>=1){ const lo=(k-r/2)*MW, hi=(r-k-r/2)*MW, pd=MW*0.5, ox=cx+(lo-pd)*U, oy=cy+(lo-pd)*U, ow=(hi-lo+2*pd)*U;
      ctx.fillStyle='rgba(140,165,205,0.11)'; ctx.fillRect(ox,oy,ow,ow); ctx.strokeStyle='rgba(140,165,205,0.55)'; ctx.lineWidth=1*DPR; ctx.strokeRect(ox,oy,ow,ow); }
    if(r-2*k-2>=0){ const lo=(k+1-r/2)*MW, hi2=(r-k-1-r/2)*MW, pd=MW*0.5; ctx.strokeStyle='rgba(140,165,205,0.8)'; ctx.lineWidth=1.3*DPR; ctx.strokeRect(cx+(lo-pd)*U, cy+(lo-pd)*U, (hi2-lo+2*pd)*U, (hi2-lo+2*pd)*U); }
    for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const x=cx+lerp((j-r/2)*MW,(k-r/2)*MW,et)*U, y=cy+(i-r/2)*MW*U;   // every cell slides toward column k
      if(inBk(i,j,r,k)){ if(i===j && hvec){ let out=0; for(let ii=0;ii<=r;ii++){ if(ii<k+1||ii>r-k-1) out+=m[ii][j]; } const bd=hvec[j]-out; wTxt(x,y,U,bd,(bd>0?1:0.45),'#8fb4e6'); } }
      else { const v=m[i][j]; if(v>=1) wTxt(x,y,U,v,1,'#f2d38c'); else wTxt(x,y,U,0,0.45,'#33415e'); } }
    ctx.restore(); }
  if(et>0.01) for(let i=0;i<AVec.length;i++) wTxt(colX, cy+(k+i-r/2)*MW*U, U, AVec[AVec.length-1-i], et, '#cfe0f7');   // A-vector fades in down the green column
  drawFkGreen(cx,cy,U,r,k); }
function abBuildLayout(AP, byKey, mv, D){                                               // persistent overlay positions honouring the chosen graph layout (drag-editable)
  const lay=new Map();
  if(graphLayout==='radial'){                                                          // concentric rings by ambient rank ΣA (root centred)
    const rks=[...new Set(AP.nodes.map(nd=>nd.rank))].sort((a,b)=>a-b), idx={}; rks.forEach((v,i)=>idx[v]=i);
    const ranks={}; AP.nodes.forEach(nd=>ranks[nd.key]=idx[nd.rank]);
    const p=radialLayout(ranks,(WG.r+2)*MW*1.15);
    AP.nodes.forEach(nd=>lay.set(nd.key,{x:p[nd.key].x,y:p[nd.key].y,pin:false,vx:0,vy:0}));
    return lay; }
  // layered (also the seed for force): realized vertices at their weak tree-level positions; ghosts relaxed into the grid at their ambient-rank layer
  const pos=new Map(); WG.classes.forEach((c,ci)=>{ if(WG.kept[ci]) pos.set(mv(c.rep), {x:WG.posC[ci].x, y:WG.posC[ci].y}); });
  const ghosts=AP.nodes.filter(nd=>!pos.has(nd.key));
  if(ghosts.length){
    const nbr=new Map(); AP.nodes.forEach(nd=>nbr.set(nd.key,[])); AP.covers.forEach(([f,t])=>{ nbr.get(f).push(t); nbr.get(t).push(f); });
    let ymin=1e9,ymax=-1e9,rmin=1e9,rmax=-1e9;
    WG.classes.forEach((c,ci)=>{ if(!WG.kept[ci])return; const y=WG.posC[ci].y, R=byKey.get(mv(c.rep)).rank; if(y<ymin)ymin=y; if(y>ymax)ymax=y; if(R<rmin)rmin=R; if(R>rmax)rmax=R; });
    const r2y=R=> rmax===rmin? (ymin+ymax)/2 : ymin+(ymax-ymin)*(R-rmin)/(rmax-rmin);   // ambient rank ΣA → y (higher ΣA = more degenerate = lower, matching the realized layout)
    ghosts.forEach((g,i)=>pos.set(g.key,{x:(i%2?1:-1)*(1+((i/2)|0))*D, y:r2y(g.rank)}));                            // seed off the spine (alternating sides) so repulsion can't leave them collinear
    for(let it=0; it<180; it++) for(const g of ghosts){ const P=pos.get(g.key); let fx=0;
      const ns=nbr.get(g.key).map(kk=>pos.get(kk)).filter(Boolean);
      if(ns.length){ const cx=ns.reduce((s,q)=>s+q.x,0)/ns.length; fx+=(cx-P.x)*0.09; }                            // gentle pull toward its ⊑-neighbours' column
      for(const nd of AP.nodes){ if(nd.key===g.key)continue; const q=pos.get(nd.key); if(!q)continue;
        const dx=P.x-q.x, dy=P.y-q.y, d=Math.hypot(dx,dy)+0.3; if(d<D*1.5) fx+=(dx/d)*(D*1.5-d)*0.32; }            // horizontal repulsion pushes ghosts off the realized spine onto side branches
      P.x+=fx; P.y=r2y(g.rank); }
  }
  AP.nodes.forEach(nd=>{ const p=pos.get(nd.key)||{x:0,y:0}; lay.set(nd.key,{x:p.x,y:p.y,pin:false,vx:0,vy:0}); });
  return lay; }
function abForceStep(AP, D){ const REP=4*(D/3.6)*(D/3.6);                               // force-directed step over the ambient poset (skips pinned/dragged nodes)
  const nodes=AP.nodes.map(nd=>abLay.get(nd.key)).filter(Boolean);
  for(const n of nodes){ if(n.pin){ n._fx=0; n._fy=0; continue; } let fx=-n.x*0.02, fy=-n.y*0.02;
    for(const m of nodes){ if(m===n)continue; const dx=n.x-m.x,dy=n.y-m.y,d2=dx*dx+dy*dy+1,f=REP/d2; fx+=dx*f; fy+=dy*f; }
    n._fx=fx; n._fy=fy; }
  for(const [f,t] of AP.covers){ const n=abLay.get(f),m=abLay.get(t); if(!n||!m)continue;
    const dx=m.x-n.x,dy=m.y-n.y,d=Math.hypot(dx,dy)+0.01,ff=(d-D)*0.02;
    if(!n.pin){ n._fx+=dx/d*ff; n._fy+=dy/d*ff; } if(!m.pin){ m._fx-=dx/d*ff; m._fy-=dy/d*ff; } }
  for(const n of nodes){ if(n.pin)continue; n.vx=(n.vx+n._fx)*0.8; n.vy=(n.vy+n._fy)*0.8; n.x+=n.vx*0.1; n.y+=n.vy*0.1; } }
function drawAmbientOverlay(){ if(!WG){ drawWeakMain(); return; }
  const r=WG.r, k=WG.k, n=r-2*k, m=WG.hvec[k], U=cam.s*0.42, AP=ambientPoset(n,m);
  if(AP.nodes.length>160){ drawWeakMain(); return; }
  abAnim += ((abMode==='A'?1:0)-abAnim)*0.16; const et=easeIO(clamp(abAnim,0,1));   // 𝒜 view collapses each diamond onto its A-vector
  abHoverT += ((abHover!=null?1:0)-abHoverT)*0.2;
  const mv=rep=>movingVec(rep,r,k).join(',');
  const repOf=new Map(); WG.classes.forEach((c,ci)=>{ if(WG.kept[ci]) repOf.set(mv(c.rep), c.rep); });   // realized profiles (R_k^∘) → representative matrix
  const directE=new Set();   // R_k^∘'s DIRECT degeneration edges (moving-vector pairs). Saturation = every ⊑-comparable pair IS one of these — not merely reachable through others (R_k^∘ need not be transitively closed)
  (WG.keptEdges||[]).forEach(([ci,cj])=>{ directE.add(mv(WG.classes[ci].rep)+'>'+mv(WG.classes[cj].rep)); });
  const byKey=new Map(); AP.nodes.forEach(nd=>byKey.set(nd.key,nd));
  const leq=(a,d)=>{ const Aa=byKey.get(a).A, Ad=byKey.get(d).A; for(let i=0;i<Aa.length;i++) if(Aa[i]>Ad[i]) return false; return true; };   // 𝒜's order: a ⊑ d ⟺ A_a ≤ A_d componentwise
  const D=(r+2)*MW*1.25;
  // LAYOUT: persistent + drag-editable, driven by the graphLayout menu. layered keeps realized vertices at their exact tree-level positions (so the Hodge–Tate MHS lands at the bottom) with ghosts relaxed into the grid; force/radial re-arrange the whole ambient poset.
  const sig=[curVec.join(','),k,weakCirc?1:0,graphLayout,AP.nodes.length].join('|');
  if(sig!==abLaySig){ abLay=abBuildLayout(AP,byKey,mv,D); abLaySig=sig; abFramePending=true; }
  if(graphLayout==='force') abForceStep(AP,D);                                          // force keeps simulating; layered/radial are static until dragged
  const pos=abLay; abPos=pos;
  if(abFramePending){ abFramePending=false; let a=1e9,b=1e9,c=-1e9,d=-1e9; for(const p of pos.values()){ a=Math.min(a,p.x);c=Math.max(c,p.x);b=Math.min(b,p.y);d=Math.max(d,p.y); }
    const mg=(r+2)*MW*1.4; a-=mg;c+=mg;b-=mg;d+=mg; const w=(c-a)||1,h=(d-b)||1, TOP=54*DPR;   // reserve a top band so the #abstat legend never covers the top vertex
    cam.ts=cam.s=clamp(Math.min(cv.width/w,(cv.height-TOP)/h)*0.9,8,110); cam.tx=cam.x=(a+c)/2; cam.ty=cam.y=(b+d)/2 - (TOP/2)/cam.s; autoFrame=false; }
  const Sw=boxHalfW(r), Rsc=Sw*cam.s;
  const eox=et*(k-r/2)*MW*0.42, ehw=lerp(Sw,0.65*MW*0.42,et), ehh=lerp(Sw,((r-2*k+1)/2+0.35)*MW*0.42,et); abEox=eox;   // edges follow the collapsing box: shift toward the A-column + exit a thin rectangle
  const obs=[]; for(const p of pos.values()){ const [sx,sy]=toScreen(p.x+eox,p.y); obs.push({x:sx,y:sy}); }   // node/box centres — edges bow to route around them
  const arrow=(pf,pt,col,dash,lw,seed)=>{ if(!pf||!pt)return; const dx=pt.x-pf.x, dy=pt.y-pf.y, adx=Math.abs(dx)||1e-6, ady=Math.abs(dy)||1e-6;
    const fr=lerp(edgeFsq(dx,dy,Sw), Math.min(0.47,ehw/adx,ehh/ady), et);
    const [x1,y1]=toScreen(pf.x+eox+dx*fr,pf.y+dy*fr), [x2,y2]=toScreen(pt.x+eox-dx*fr,pt.y-dy*fr);
    drawArrowCurved(x1,y1,x2,y2,obs,Rsc,{ color:col, dash:dash, width:lw, headColor:col, seed:seed||0 }); };
  // EDGES: draw every ⊑-comparable pair. realized (a DIRECT R_k^∘ edge) = solid blue; missing (comparable but no direct edge — incl. ghost-incident) = dashed red. Saturated ⟺ no red. On hover, non-incident edges fade and incident ones brighten.
  const hv=abHover!=null && pos.has(abHover), T=abHoverT, rel=[];
  for(const x of AP.nodes) for(const y of AP.nodes){ if(x.key===y.key||!leq(x.key,y.key))continue; rel.push({f:x.key,t:y.key, realized: directE.has(x.key+'>'+y.key)}); }
  const drawRel=e=>{ const inc=hv&&(e.f===abHover||e.t===abHover), base=e.realized?0.72:0.9;
    const a= inc? base+(1-base)*T : base*(1-0.85*T), w=(e.realized?1.4:1.7)+(inc?1.3*T:0);
    arrow(pos.get(e.f),pos.get(e.t), (e.realized?'rgba(96,128,170,':'rgba(232,86,86,')+a+')', e.realized?null:[6*DPR,4*DPR], w, hstr(e.f+'>'+e.t)); };
  for(const e of rel) if(!(hv&&(e.f===abHover||e.t===abHover))) drawRel(e);   // non-incident first
  for(const e of rel) if(hv&&(e.f===abHover||e.t===abHover)) drawRel(e);       // incident on top
  for(const nd of AP.nodes){ const p=pos.get(nd.key), rep=repOf.get(nd.key); const [cx,cy]=toScreen(p.x,p.y);
    if(rep){ ctx.save(); drawCollapseNode(rep,cx,cy,U,r,k,et,WG.hvec,nd.A); ctx.restore(); }   // realized: weak matrix collapsing onto A (et=0 ⇒ full matrix)
    else drawGhostNode(cx,cy,U,r,k, nd.a, nd.A, et); } }                                        // ghost: a-vector crossfading to A-vector — the R_k^∘ ⊆ 𝒜 legend is the #abstat HTML pillbox (updateABStat)
function supN(n){ const s='⁰¹²³⁴⁵⁶⁷⁸⁹'; return String(n).split('').map(d=>s[+d]).join(''); }
// the a/𝒜 overlay legend, rendered as an HTML pillbox (top-right) instead of canvas text — mirrors #weakstat's styling
function updateABStat(){ const el=document.getElementById('abstat'); if(!el)return;
  if(!(abMode && weakMode && WG && weakLayout!=='tree')){ el.style.display='none'; return; }
  const r=WG.r, k=WG.k, n=r-2*k, m=WG.hvec[k], AP=ambientPoset(n,m);
  const mv=rep=>movingVec(rep,r,k).join(',');
  const realized=new Set(); WG.classes.forEach((c,ci)=>{ if(WG.kept[ci]) realized.add(mv(c.rep)); });
  const directE=new Set(); (WG.keptEdges||[]).forEach(([ci,cj])=>{ directE.add(mv(WG.classes[ci].rep)+'>'+mv(WG.classes[cj].rep)); });
  const byK={}; AP.nodes.forEach(nd=>byK[nd.key]=nd);
  const leq=(a,d)=>{ const Aa=byK[a].A, Ad=byK[d].A; for(let i=0;i<Aa.length;i++) if(Aa[i]>Ad[i]) return false; return true; };
  let missE=0, pairs=0; for(const x of AP.nodes) for(const y of AP.nodes){ if(x.key!==y.key && leq(x.key,y.key)){ pairs++; if(!directE.has(x.key+'>'+y.key)) missE++; } }   // saturated ⟺ EVERY ⊑-comparable pair is a direct edge (R_k^∘ = ⊑ as relations, not just via transitive closure)
  const missV=AP.nodes.filter(nd=>!realized.has(nd.key)).length, maxi=missV===0, sat=missE===0;
  const name=katexStr('R_'+k+'^{\\circ}\\ \\subseteq\\ \\mathcal{A}^{'+n+'}('+m+')');
  const maxS=maxi? '<b class="ok">maximal ✓</b>' : 'not maximal — '+missV+' missing <span class="bad">(dashed)</span>';
  const satS=sat? '<b class="ok">saturated ✓</b>' : 'not saturated — '+missE+' missing edge'+(missE===1?'':'s')+' <span class="bad">(red)</span>';
  el.innerHTML=name+' &nbsp;·&nbsp; '+(AP.nodes.length-missV)+'/'+AP.nodes.length+' vertices &nbsp;·&nbsp; '+(pairs-missE)+'/'+pairs+' edges &nbsp;·&nbsp; '+maxS+' &nbsp;·&nbsp; '+satS;
  el.style.display='block'; }

/*=================== primitive-decomposition panel (grid of KPR pieces P_w(-a)) ===================*/
// A pannable "infinite canvas" on the left: rows = primitive weight w, columns = Tate twist a; the cells sum to the focused diamond.
const ppcv=document.getElementById('ppcanvas'), ppctx=ppcv?ppcv.getContext('2d'):null;
let ppcam={x:-0.85,y:-1.05,s:150}, primGridData=null, primPanelVid=-1, ppShown=false, ppHeadCv=null, ppHeadR=-1, ppHeadPrim=null, ppHeadExpl=null, primStickyVid=-1;
let panelW=0, panelUserSized=false;                                                 // decomposition panel width in px (0 ⇒ default 48vw); the pull-tab drags it
function ppW(){ return panelW>0? panelW : Math.round(window.innerWidth*0.48); }
function ppFrac(){ return ppShown? clamp(ppW()/window.innerWidth,0.12,0.85) : 0; }   // fraction of the viewport the panel eats (0 when closed)
function applyPanelW(){ document.documentElement.style.setProperty('--ppw', ppW()+'px'); }
function setPanelW(w){ panelW=clamp(Math.round(w),220,Math.round(window.innerWidth*0.82)); panelUserSized=true; applyPanelW();
  if(ppShown){ ppResize(); ppFit(); } autoFrame=true; if(viz==='tree'&&G&&mode==='idle') frameTree(); }
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
  if(!ppHeadCv || !ppHeadCv.isConnected || ppHeadR!==G.r || ppHeadPrim!==useP || ppHeadExpl!==explLoaded){   // (re)build the equation + inline node; canvas redrawn each frame
    t.innerHTML=renderMd(EXPL[useP?'decomp-title-prim':'decomp-title']||'', {r:G.r})   // the panel's header equation is markdown+KaTeX too (explanations/decomp-title*.md)
      +'<canvas id="pp-head" style="vertical-align:middle;margin-left:8px"></canvas>';
    ppHeadCv=document.getElementById('pp-head'); ppHeadR=G.r; ppHeadPrim=useP; ppHeadExpl=explLoaded;
    const HH=44; ppHeadCv.width=HH*DPR; ppHeadCv.height=HH*DPR; ppHeadCv.style.width=HH+'px'; ppHeadCv.style.height=HH+'px'; }
  const ex=document.getElementById('pp-expl');                                          // panel-side "what the decomposition is" — changes for pol vs pol+prim
  if(ex) ex.innerHTML = explLoaded? renderMd(useP? (EXPL['decomp-panel-prim']||'') : (EXPL['decomp-panel']||''), {}) : ''; }
function ppLabel(pctx,x,y,w,a){ pctx.textAlign='left'; pctx.textBaseline='alphabetic';   // "P_w(−a)" with a real subscript (a=0 is the untwisted piece P_w)
  const f1=12*DPR, f2=9*DPR; pctx.font='600 '+f1+'px ui-sans-serif'; const pw=pctx.measureText('P').width;
  pctx.font=f2+'px ui-sans-serif'; const sw=''+w, swW=pctx.measureText(sw).width;
  pctx.font='600 '+f1+'px ui-sans-serif'; const tail=a===0?'':'(−'+a+')', tW=pctx.measureText(tail).width, sx=x-(pw+swW+tW)/2;
  pctx.fillStyle='#7f9bc4'; pctx.fillText('P',sx,y);
  pctx.font=f2+'px ui-sans-serif'; pctx.fillText(sw,sx+pw,y+3*DPR);
  pctx.font='600 '+f1+'px ui-sans-serif'; pctx.fillText(tail,sx+pw+swW,y); }
function ppHeaderSum(pctx,x,y){ pctx.textBaseline='middle'; pctx.fillStyle='#8fb4e6';   // "Σₐ" centered at (x,y) — the sum column header (the first column is the a-sum of each row)
  const f1=13*DPR, f2=9*DPR, seg=[['Σ','a']];
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
  /* prim: no first-column header (the column is just the P_w pile bottoms) */
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
if(ppcv){ let ppLast=[0,0]; const ppPtrs=new Map(); let ppPinch=null;               // pan / pinch-zoom (touch) / wheel-zoom (desktop) — its own camera
  const ppInfo=()=>{ const p=[...ppPtrs.values()], a=p[0],b=p[1]; return {d:Math.hypot(a.x-b.x,a.y-b.y)||1,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2}; };
  ppcv.addEventListener('pointerdown',e=>{ ppcv.setPointerCapture(e.pointerId); ppPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ppPtrs.size>=2) ppPinch=ppInfo(); ppLast=[e.clientX,e.clientY]; });
  ppcv.addEventListener('pointermove',e=>{ if(ppPtrs.has(e.pointerId)) ppPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ppPinch && ppPtrs.size>=2){ const ni=ppInfo(); ppcam.s=clamp(ppcam.s*(ni.d/ppPinch.d),36,360);   // two-finger pinch: zoom + pan
      ppcam.x-=(ni.cx-ppPinch.cx)*DPR/ppcam.s; ppcam.y-=(ni.cy-ppPinch.cy)*DPR/ppcam.s; ppPinch=ni; return; }
    if(ppPtrs.size!==1) return;                                                     // one finger / mouse-drag: pan
    ppcam.x-=(e.clientX-ppLast[0])*DPR/ppcam.s; ppcam.y-=(e.clientY-ppLast[1])*DPR/ppcam.s; ppLast=[e.clientX,e.clientY]; });
  const ppEnd=e=>{ ppPtrs.delete(e.pointerId); try{ppcv.releasePointerCapture(e.pointerId);}catch(_){}
    if(ppPtrs.size<2) ppPinch=null; if(ppPtrs.size===1){ const r=[...ppPtrs.values()][0]; ppLast=[r.x,r.y]; } };
  ppcv.addEventListener('pointerup',ppEnd); ppcv.addEventListener('pointercancel',ppEnd);
  ppcv.addEventListener('wheel',e=>{ e.preventDefault(); ppcam.s=clamp(ppcam.s*Math.exp(-e.deltaY*0.0016),36,360); },{passive:false}); }
addEventListener('resize',()=>{ if(panelUserSized) panelW=clamp(panelW,220,Math.round(window.innerWidth*0.82)); applyPanelW(); if(ppShown) ppResize(); fitBar(); });
addEventListener('orientationchange',()=>setTimeout(fitBar,120));
// Split the toolbar into two rows when the current button set doesn't fit on one (portrait phones); a single row otherwise (landscape / desktop).
// BARH (the real bar height) feeds the canvas offset + everything anchored below the bar, so the layout stays correct at either height.
let _fitting=false, _wasSplit=null;
function fitBar(){ if(_fitting)return; _fitting=true;
  const bar=document.getElementById('bar');
  if(bar.clientWidth<=0){ _fitting=false; return; }   // not laid out yet (hidden/zero-size tab): any measurement here is nonsense — leave BARH alone until a real resize
  document.body.classList.remove('barsplit');   // measure the single-row width first
  const overflow = bar.scrollWidth > bar.clientWidth + 2;
  if(overflow) document.body.classList.add('barsplit');
  if(overflow!==_wasSplit){ _wasSplit=overflow; setHintCollapsed(overflow); }   // only on the transition, so a manual re-open isn't fought: the hint is too crowded on a split (phone) layout
  const h = overflow ? Math.ceil(bar.getBoundingClientRect().height) : 52;
  if(h!==BARH){ BARH=h; document.documentElement.style.setProperty('--barh', h+'px'); resize(); autoFrame=true; }
  else document.documentElement.style.setProperty('--barh', h+'px');
  _fitting=false; }

/*=================== interaction ===================*/
let dragBg=false, dragNode=null, dragWN=null, dragAB=null, last=[0,0], moved=false, hoverVid=-1, hoverWN=-1, hoverTreeUid=-1, treeHoverPileUid=-1, treeHoverMt=0;
const cvPtrs=new Map();          // active pointers on the main canvas (for multi-touch pinch)
let pinch=null;                  // {d,cx,cy}: last two-finger state — pinch-zoom + two-finger pan
function cancelCvDrags(){ dragBg=false; if(dragNode){dragNode.pin=false;dragNode=null;} if(dragWN){dragWN.pin=false;dragWN=null;}
  if(dragAB!=null){ const q=abLay.get(dragAB); if(q)q.pin=false; dragAB=null; } cv.classList.remove('drag'); }
function pinchInfo(){ const p=[...cvPtrs.values()], a=p[0],b=p[1]; return {d:Math.hypot(a.x-b.x,a.y-b.y)||1, cx:(a.x+b.x)/2, cy:(a.y+b.y)/2}; }
// a tap does on touch what hover does on desktop: choose the decomposition node, replay a tree pivot, focus a vertex's edges (+ select in the graph)
function tapFocus(cx,cy){
  if(weakMode && weakLayout!=='tree'){ if(abMode) abHover=abHitNode(cx,cy); else hoverWN=weakHitNode(cx,cy); return; }
  if(viz==='tree'){ hoverTreeUid=treeHitNode(cx,cy); return; }
  if(mode==='idle'){ const h=hitNode(cx,cy); if(h){ selected=h.vid; hoverVid=h.vid; } else { selected=null; hoverVid=-1; } } }
cv.addEventListener('pointerdown',e=>{ cv.setPointerCapture(e.pointerId); cvPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(cvPtrs.size>=2){ cancelCvDrags(); pinch=pinchInfo(); autoFrame=false; return; }   // second finger ⇒ pinch (zoom + two-finger pan)
  moved=false; last=[e.clientX,e.clientY];
  if(!weakMode&&viz!=='tree'&&mode==='idle'){ const h=hitNode(e.clientX,e.clientY); if(h){ dragNode=h; h.pin=true; autoFrame=false; return; } }
  if(weakMode&&abMode&&weakLayout!=='tree'){ const key=abHitNode(e.clientX,e.clientY); if(key!=null){ dragAB=key; const p=abLay.get(key); if(p){ p.pin=true; p.vx=p.vy=0; } autoFrame=false; return; } }  // ambient overlay vertices drag too
  if(weakMode&&!abMode&&weakLayout==='graph'){ const wi=weakHitNode(e.clientX,e.clientY); if(wi>=0){ dragWN=WN[wi]; dragWN.pin=true; autoFrame=false; return; } }  // weak graph nodes drag like the polarized graph
  dragBg=true; cv.classList.add('drag'); });
cv.addEventListener('pointermove',e=>{ if(cvPtrs.has(e.pointerId)) cvPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && cvPtrs.size>=2){ const ni=pinchInfo();                               // pinch: zoom about the finger midpoint, panning with it
    const [wx,wy]=toWorldXY(pinch.cx,pinch.cy); cam.s=cam.ts=clamp(cam.s*(ni.d/pinch.d),viewMinZoom(),220);
    cam.x=wx-(ni.cx*DPR-cv.width/2-viewOffsetX)/cam.s; cam.y=wy-((ni.cy-BARH)*DPR-cv.height/2)/cam.s; cam.tx=cam.x; cam.ty=cam.y; pinch=ni; return; }
  const dx=e.clientX-last[0],dy=e.clientY-last[1];
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  if(dragNode){ const [wx,wy]=toWorldXY(e.clientX,e.clientY); dragNode.x=wx; dragNode.y=wy; last=[e.clientX,e.clientY]; return; }
  if(dragWN){ const [wx,wy]=toWorldXY(e.clientX,e.clientY); dragWN.x=wx; dragWN.y=wy; dragWN.vx=dragWN.vy=0; last=[e.clientX,e.clientY]; return; }
  if(dragAB!=null){ const p=abLay.get(dragAB); if(p){ const [wx,wy]=toWorldXY(e.clientX,e.clientY); p.x=wx-abEox; p.y=wy; p.vx=p.vy=0; } last=[e.clientX,e.clientY]; return; }
  if(dragBg){ autoFrame=false; cam.x-=dx*DPR/cam.s; cam.y-=dy*DPR/cam.s; cam.tx=cam.x;cam.ty=cam.y;cam.ts=cam.s; last=[e.clientX,e.clientY]; return; }
  if(e.pointerType==='touch') return;                                              // touch has no hover; tap drives these instead (pointerup → tapFocus)
  if(weakMode && weakLayout!=='tree'){ if(abMode) abHover=abHitNode(e.clientX,e.clientY); else hoverWN=weakHitNode(e.clientX,e.clientY); }  // hover: focus a vertex's edges (overlay hits its own layout)
  else if(viz==='tree') hoverTreeUid=treeHitNode(e.clientX,e.clientY);
  else if(mode==='idle'){ const h=hitNode(e.clientX,e.clientY); hoverVid=h?h.vid:-1; }
  else hoverVid=-1; });
cv.addEventListener('pointerleave',e=>{ if(pinch||e.pointerType==='touch')return; hoverVid=-1; hoverWN=-1; hoverTreeUid=-1; abHover=null; });   // touch has no hover: a lifted finger must NOT wipe the highlight a tap just set
function cvPtrEnd(e){ cvPtrs.delete(e.pointerId); try{cv.releasePointerCapture(e.pointerId);}catch(_){}
  if(pinch){ if(cvPtrs.size>=2) return;                                             // still pinching
    pinch=null; if(cvPtrs.size===1){ const r=[...cvPtrs.values()][0]; last=[r.x,r.y]; moved=true; dragBg=true; cv.classList.add('drag'); }  // last finger keeps panning; not a tap
    return; }
  const wasTap=!moved;                                                             // unpin any grabbed node first, THEN a no-move release is a tap (select / focus)
  if(dragAB!=null){ const p=abLay.get(dragAB); if(p) p.pin=false; dragAB=null; }
  else if(dragWN){ dragWN.pin=false; dragWN=null; }
  else if(dragNode){ dragNode.pin=false; dragNode=null; }
  if(wasTap) tapFocus(e.clientX,e.clientY);
  dragBg=false; cv.classList.remove('drag'); }
cv.addEventListener('pointerup',cvPtrEnd); cv.addEventListener('pointercancel',cvPtrEnd);
cv.addEventListener('wheel',e=>{ e.preventDefault(); autoFrame=false;
  cam.ts=clamp(cam.s*Math.exp(-e.deltaY*0.0016),viewMinZoom(),220); cam.s=cam.ts; },{passive:false});
function hitNode(cx,cy){ const [wx,wy]=toWorldXY(cx,cy); let best=null,bd=1e9;
  for(const n of gnodes){ const d=Math.hypot(n.x-wx,n.y-wy); if(d<bd){bd=d;best=n;} }
  return bd<(G.r+1)*0.7? best:null; }
function weakHitNode(cx,cy){ if(!WG||!WN.length)return -1; const [wx,wy]=toWorldXY(cx,cy); let best=-1,bd=1e9;
  for(let i=0;i<WN.length;i++){ if((WN[i].expl||0)>0.5)continue; const d=Math.hypot(WN[i].x-wx,WN[i].y-wy); if(d<bd){bd=d;best=i;} }
  return bd<(WG.r/2+1.1)*MW? best:-1; }
function abHitNode(cx,cy){ if(!WG||!abPos.size)return null; const [wx,wy]=toWorldXY(cx,cy); let best=null,bd=1e9;   // hit-test the a/𝒜 overlay's own vertex positions (+ collapse offset)
  for(const [key,p] of abPos){ const d=Math.hypot(p.x+abEox-wx,p.y-wy); if(d<bd){bd=d;best=key;} }
  return bd<(WG.r/2+1.1)*MW? best:null; }
function treeHitNode(cx,cy){ if(!G)return -1; const [wx,wy]=toWorldXY(cx,cy); let best=-1,bd=1e9;
  for(const n of tree){ if(!n.born)continue; const d=Math.hypot(n.x-wx,n.y-wy); if(d<bd){bd=d;best=n.uid;} }
  return bd<(G.r+1)*0.7? best:-1; }

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
  // prim now lives inside the decomposition panel (top-right), so it hides/shows with the panel — no toolbar explode needed
  ex(document.getElementById('matrixbtn'), weakMode);                                     // rotate: present for pol & pol+prim, all views
  const _dt=document.getElementById('decomptab'); if(_dt) _dt.classList.toggle('tabhide', weakMode);   // decomposition pull-tab: pol-side only (hidden while weak is open)
  ac('matrixbtn', matrixMode); ac('decomptab', decompMode);
  ex(document.getElementById('weakctrls'), !weakMode);                                    // k / ∘ appear only with weak, left of the weak button
  ex(document.getElementById('abctrls'), !(weakMode && weakCirc && weakLayout!=='tree'));   // a / 𝒜 overlay buttons: weak graph/poset, and only with ∘ on (the overlay is about R_k^∘)
  ac('abtn', abMode==='a'); ac('Abtn', abMode==='A'); updateABStat(); polStat();           // keep the overlay legend + pol legend in sync with the view
  const now = decompMode && !weakMode;                                                    // KPR decomposition panel: any pol view (tree/graph/poset), with or without prim
  if(now!==ppShown){ ppShown=now; const pp=document.getElementById('primpanel');
    if(now) applyPanelW();                                                                // set --ppw before showing so the panel + tab + hint line up
    if(pp) pp.classList.toggle('shown',now); document.body.classList.toggle('ppopen',now);
    if(now && G){ ppResize(); if(primStickyVid<0) primStickyVid=(hoverVid>=0?hoverVid:firstLeafVid()); primPanelVid=primStickyVid; updatePrimPanel(primStickyVid); ppFit(); } }
  fitBar(); }                                                                             // the visible button set just changed — re-check whether the toolbar needs to split into two rows
// pol-graph legend (#polstat): vertex/edge counts + the hidden "poset" trigger. Shown in the pol graph/poset views (not tree, not weak).
function polStat(){ const el=document.getElementById('polstat'); if(!el)return;
  if(weakMode || !G || !(viz==='graph'||viz==='poset')){ el.style.display='none'; return; }
  const V=gnodes.length, E=G.edges.length, isP=isPoset();   // static text — poset view is disconnected (collapseTo('poset') kept but no longer wired)
  let html = katexStr('R(\\underline{h})')+' · '+V+' vertices, '+E+' edges · '+(isP?'poset':'not a poset');
  if(E>EDGE_DRAW_MAX) html += '<div style="margin-top:5px;font-size:11px;line-height:1.35;color:#e8b366;opacity:.92">'+E.toLocaleString()+' edges — too many to draw; hover / tap a diamond to see its incident edges</div>';
  el.innerHTML = html;
  el.style.display='block'; }
function treeTooBigMsg(){ return 'tree view disabled — too many decomposition paths to unfold (over '+TREE_NODE_MAX.toLocaleString()+' branches)'; }
function renderVizButtons(){ updateHint(); updateChrome(); const c=document.getElementById('vizbtns'); c.innerHTML='';
  const mk=(label,fn,id)=>{ const b=document.createElement('button'); b.textContent=label; b.onclick=fn; if(id)b.id=id; c.appendChild(b); return b; };
  const toTreeBtn=()=>{ if(treeTooBig){ const b=mk('to tree',()=>showWarn(treeTooBigMsg())); b.style.opacity='0.4'; b.style.cursor='not-allowed'; b.title=treeTooBigMsg(); }   // disabled: click just flashes the reason
    else mk('to tree',toTree); };
  // NB: no "to poset" button — the poset (Hasse) view is reached by hovering/tapping the "poset" word in the legend (these graphs are rarely posets, so it stays out of the toolbar)
  if(weakMode){ if(weakLayout!=='graph') mk('to graph',()=>setWeakLayout('graph'));
    if(weakLayout!=='tree'){ if(treeTooBig){ const b=mk('to tree',()=>showWarn(treeTooBigMsg())); b.style.opacity='0.4'; b.style.cursor='not-allowed'; b.title=treeTooBigMsg(); }   // weak tree rides the pol unfolding — disabled when it's too big
      else mk('to tree',()=>setWeakLayout('tree')); } return; }
  if(viz==='tree') mk('to graph',()=>collapseTo('graph'));
  else if(viz==='graph'){ toTreeBtn(); }
  else { toTreeBtn(); mk('to graph',()=>collapseTo('graph')); } }

/*=================== compute cache: worker + IndexedDB + progress ===================*/
const AV=(()=>{ const s=[...document.scripts].find(x=>/app\.js/.test(x.src||'')); return s?((new URL(s.src)).searchParams.get('v')||'0'):'0'; })();   // this build's ?v=… (for the worker + its model.js import)
const MODEL_V=1;                          // bump ONLY when computeGraph's output changes → invalidates persisted graphs
const SAFETY_CAP=120000;                  // abort a runaway computation past this many diamonds (protects the tab)
const graphCache=new Map();               // gKey -> G, in-memory for this session
function gKey(hvec){ return MODEL_V+'|'+hvec.join(','); }
let _db=null;                             // IndexedDB: persist computed graphs across reloads
function idbOpen(){ return _db?Promise.resolve(_db):new Promise((res,rej)=>{ let r; try{ r=indexedDB.open('weakpolviz',1);}catch(e){return rej(e);}
  r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('graphs')) r.result.createObjectStore('graphs'); };
  r.onsuccess=()=>{ _db=r.result; res(_db); }; r.onerror=()=>rej(r.error); }); }
function idbGet(key){ return idbOpen().then(db=>new Promise((res,rej)=>{ const q=db.transaction('graphs').objectStore('graphs').get(key); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); })); }
function idbPut(key,val){ return idbOpen().then(db=>new Promise((res,rej)=>{ const q=db.transaction('graphs','readwrite').objectStore('graphs').put(val,key); q.onsuccess=()=>res(); q.onerror=()=>rej(q.error); })); }
function cachedComputeGraph(hvec){ const k=gKey(hvec); let G=graphCache.get(k); if(!G){ G=computeGraph(hvec); graphCache.set(k,G); } return G; }   // sync fallback; big graphs are pre-populated by ensureGraph()
/*=================== moves deduced on the fly + graph-file I/O ===================*/
let _denseB=null, _denseBR=-1;                                                           // cache the dense L-string/M-pile basis for the current weight
function moveFor(node){                                                                  // the c-vector [[stringIdx,count],…] realizing parent→node; use the shipped move, else deduce it once
  if(node.move!=null) return node.move;
  if(node.parent<0) return (node.move=[]);
  if(_denseBR!==G.r){ _denseB=basisOf(G.r); _denseBR=G.r; }                              // one degeneration search from the parent recovers the exact same c the writer stored
  const hit=degenerations(G.vertices[byUid[node.parent].vid], _denseB.S, _denseB.T).get(keyOf(G.vertices[node.vid]));
  return (node.move = hit ? hit.P.map((c,i)=>c>0?[i,c]:null).filter(Boolean) : []); }
function hydrateGraph(lean){                                                             // {r,root,vertices,edges,moves?} → full G (basis + primVertices rebuilt; moves optional, deduced on demand)
  const r=lean.r, BS=basisOf(r);
  return { r, root:lean.root, vertices:lean.vertices, edges:lean.edges, moves:lean.moves||null,
    primVertices:lean.vertices.map(primitivePart),
    basis:BS.S.map((s,i)=>({S:sparse(BS.S[i]),T:sparse(BS.T[i]),conj:BS.conj[i],A:BS.Asp[i],B:BS.Bsp[i],U:BS.Usp[i],V:BS.Vsp[i]})) }; }
function fetchFolderGraph(hvec){                                                         // look for a shipped precompute in data/graphs/ before spending a compute
  return fetch('data/graphs/'+hvec.join(',')+'.json').then(r=>r.ok?r.json():null).then(l=>l?hydrateGraph(l):null).catch(()=>null); }
function leanOf(G){ return { r:G.r, root:G.root, vertices:G.vertices, edges:G.edges }; }  // download format: no moves (deduced on load), no basis/primVertices (rebuilt on load)
function hvecOf(G){ const m=G.vertices[G.root]; return m.map((row,i)=>row[i]); }          // the pure (root) diamond's diagonal is the Hodge vector
function downloadGraph(){ if(!G){ showErr('no graph loaded to download'); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(leanOf(G))],{type:'application/json'}));
  a.download=curVec.join(',')+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
function uploadGraph(file){ const rd=new FileReader();
  rd.onload=()=>{ let lean; try{ lean=JSON.parse(rd.result); }catch(e){ showErr('not a JSON graph file'); return; }
    if(!lean||!Array.isArray(lean.vertices)||!Array.isArray(lean.edges)||lean.r==null||lean.root==null){ showErr('not a weakpolviz graph file'); return; }
    let G2; try{ G2=hydrateGraph(lean); }catch(e){ showErr('could not load graph: '+e.message); return; }
    const hvec=hvecOf(G2), k=gKey(hvec); graphCache.set(k,G2); idbPut(k,G2).catch(()=>{});
    vecInput.value=hvec.join(','); clearErr(); run(hvec); };
  rd.readAsText(file); }
const progEl=document.getElementById('progress');
function capMsg(e){ return String(e).indexOf('CAP:')>=0? ('too large — aborted past '+SAFETY_CAP.toLocaleString()+' diamonds') : ('compute failed: '+e); }
/* one visible progress bar PER h being computed. jobs keyed by gKey; input locks while more than MAX_KNOTS run at once. */
const MAX_KNOTS=3;                  // lock the h-input while strictly more than this many h's compute concurrently
const jobs=new Map();               // gKey -> {hvec,row,txt}  (one row = one worker in flight)
const pending=new Map();            // gKey -> promise, so a repeated request for the same h shares one compute
function updateInputLock(){ const el=document.getElementById('vec'); if(!el)return; const over=jobs.size>MAX_KNOTS;
  el.disabled=over; el.classList.toggle('locked',over);
  el.title=over?('computing '+jobs.size+' graphs — input locked until it drops to '+MAX_KNOTS):''; }
function addJob(k,hvec){                                   // build + show this h's own progress row
  const row=document.createElement('div'); row.className='progjob';
  const bar=document.createElement('div'); bar.className='progbar';
  const rr=document.createElement('div'); rr.className='progrow';
  const txt=document.createElement('span'); txt.className='progtxt'; txt.textContent='computing '+hvec.join(',')+' …';
  const cancel=document.createElement('button'); cancel.className='progcancel'; cancel.title='cancel'; cancel.textContent='✕';
  rr.appendChild(txt); rr.appendChild(cancel); row.appendChild(bar); row.appendChild(rr);
  progEl.appendChild(row); progEl.classList.add('shown');
  const job={hvec,row,txt,cancel}; jobs.set(k,job); updateInputLock(); return job; }
function endJob(k){ const j=jobs.get(k); if(!j)return; if(j.row.parentNode) j.row.parentNode.removeChild(j.row);
  jobs.delete(k); if(jobs.size===0) progEl.classList.remove('shown'); updateInputLock(); }
// ensure hvec's graph is cached. tiny ⇒ instant; else compute in a worker with its own labelled bar + live count + cancel;
// if workers are unavailable (e.g. file://) fall back to a SYNCHRONOUS compute that still paints its row first so it is never silent.
function ensureGraph(hvec){ const k=gKey(hvec);
  if(graphCache.has(k)) return Promise.resolve(true);
  if(pending.has(k)) return pending.get(k);                                   // same h already computing — share it
  if(hvec.length-1<=4 && Math.max(...hvec)<=4){ try{ graphCache.set(k,computeGraph(hvec)); }catch(e){ showErr(capMsg(e)); return Promise.resolve(false); } return Promise.resolve(true); }   // trivially tiny ⇒ instant, no bar
  const p=idbGet(k).catch(()=>null).then(stored=>{ if(stored){ graphCache.set(k,stored); return true; }
    return fetchFolderGraph(hvec).then(cached=>{ if(cached){ graphCache.set(k,cached); idbPut(k,cached).catch(()=>{}); return true; }   // shipped precompute in data/graphs/ ⇒ load instead of compute
    return new Promise(resolve=>{
      const job=addJob(k,hvec);
      const syncFallback=()=>{ job.cancel.style.display='none'; job.txt.textContent='computing '+hvec.join(',')+' … (tab may freeze briefly)';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{                 // paint the row first, THEN block on the compute so it is visible
          let G2; try{ G2=computeGraph(hvec,null,SAFETY_CAP); }catch(e){ endJob(k); showErr(capMsg(e)); resolve(false); return; }
          graphCache.set(k,G2); idbPut(k,G2).catch(()=>{}); endJob(k); resolve(true); })); };
      let w; try{ w=new Worker('js/gwork.js?v='+AV); }catch(e){ w=null; }
      if(!w){ syncFallback(); return; }
      let settled=false;
      w.onmessage=ev=>{ const d=ev.data; if(d.t==='p'){ job.txt.textContent=hvec.join(',')+' — '+d.n.toLocaleString()+' diamonds …'; return; }
        settled=true; try{w.terminate();}catch(_){}
        if(d.t==='ok'){ graphCache.set(k,d.G); idbPut(k,d.G).catch(()=>{}); endJob(k); resolve(true); }
        else { endJob(k); showErr(d.cap?('too large — aborted past '+d.n.toLocaleString()+' diamonds'):('compute failed: '+d.m)); resolve(false); } };
      w.onerror=()=>{ if(settled)return; settled=true; try{w.terminate();}catch(_){} syncFallback(); };   // worker couldn't load ⇒ synchronous, still with the row
      job.cancel.onclick=()=>{ if(settled)return; settled=true; try{w.terminate();}catch(_){} endJob(k); resolve(false); };
      w.postMessage({hvec, cap:SAFETY_CAP});
    }); }); });
  pending.set(k,p); p.then(()=>pending.delete(k),()=>pending.delete(k)); return p; }

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
  if(r>24) return {err:'weight too large (keep it ≤ 24)'};   // sanity guard; heavier-but-feasible h compute with a progress bar + are cached
  return {vec:a}; }
function tryRun(str){ const p=parseVec(str); if(p.err){ showErr(p.err); return; } clearErr();   // big graphs compute in a worker (progress bar) then cache; cached/small ones run immediately
  ensureGraph(p.vec).then(ok=>{ if(ok) run(p.vec); }); }

/*=================== controls ===================*/
const vecInput=document.getElementById('vec');
vecInput.addEventListener('input',e=>{ const p=parseVec(e.target.value.replace(/\s/g,'')); if(!p.err) clearErr(); });
vecInput.addEventListener('keydown',e=>{ if(e.key==='Enter') tryRun(vecInput.value.replace(/\s/g,'')); });   // autoplay on changed data
vecInput.addEventListener('change',()=>{ if(curVec.join(',')!==vecInput.value.replace(/\s/g,'')) tryRun(vecInput.value.replace(/\s/g,'')); });
document.getElementById('prev').onclick=stepPrev;
document.getElementById('playpause').onclick=togglePlay;
document.getElementById('next').onclick=stepNext;
document.getElementById('replay').onclick=replayGrow;
const menu=document.getElementById('menu'), menubtn=document.getElementById('menubtn');
menubtn.onclick=()=>{ menu.style.display = menu.style.display==='block'?'none':'block'; };
document.getElementById('dlgraph').onclick=()=>{ downloadGraph(); menu.style.display='none'; };
const _ulfile=document.getElementById('ulfile');
document.getElementById('ulgraph').onclick=()=>{ _ulfile.click(); };
_ulfile.onchange=e=>{ const f=e.target.files&&e.target.files[0]; if(f) uploadGraph(f); e.target.value=''; menu.style.display='none'; };
document.getElementById('speed').oninput=e=>{ speed=+e.target.value; };
document.getElementById('graphlayout').onchange=e=>{ graphLayout=e.target.value; autoFrame=true; };   // applies to all graph views (not poset)
document.getElementById('graphlayout').value=graphLayout;   // keep the select in sync with the default (guards against browser form restoration)
document.getElementById('tgl-autoplay').onchange=e=>{ autoplay=e.target.checked; };
document.getElementById('tgl-graph').onchange=e=>{ autoGraph=e.target.checked; };   // auto→poset toggle removed (poset feature disconnected); onGrowComplete's autoPoset branch stays dead since autoPoset can never be set true
document.getElementById('matrixbtn').onclick=()=>{ matrixMode=!matrixMode; autoFrame=true; updateChrome(); updateHint(); };   // upright h-matrix, no box (pol & pol+prim, all views)
function syncAB(){ const a=document.getElementById('abtn'), A=document.getElementById('Abtn');   // ambient-poset overlay on the weak-circ graph
  if(a) a.classList.toggle('active',abMode==='a'); if(A) A.classList.toggle('active',abMode==='A');
  const ws=document.getElementById('weakstat'); if(ws && abMode) ws.style.display='none';
  if(abMode){ if(weakLayout==='tree') setWeakLayout('graph');
    if(!weakCirc){ weakCirc=true; const cb=document.getElementById('weakcirc'); if(cb) cb.checked=true; if(weakMode) refreshWeak(); }   // the overlay is about R_k^∘, so force the circ subgraph
    abFramePending=true; }
  else updateWeakStat();
  updateABStat(); updateHint(); }
document.getElementById('abtn').onclick=()=>{ const was=abMode; abMode = abMode==='a'? null : 'a'; if(!was && abMode) abAnim=0; syncAB(); };   // open from off ⇒ start un-collapsed
document.getElementById('Abtn').onclick=()=>{ const was=abMode; abMode = abMode==='A'? null : 'A'; if(!was && abMode) abAnim=0; syncAB(); };   // open straight into 𝒜 ⇒ animate the collapse
(function(){ const tab=document.getElementById('decomptab'); let down=false, sx=0, sw=0, movedT=false;   // pull-tab: click toggles the panel, drag resizes it
  const toggle=()=>{ decompMode=!decompMode; autoFrame=true; updateChrome(); updateHint(); if(viz==='tree'&&G&&mode==='idle') frameTree(); };
  tab.addEventListener('pointerdown',e=>{ down=true; movedT=false; sx=e.clientX; sw=decompMode? ppW() : 0; try{tab.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); });
  tab.addEventListener('pointermove',e=>{ if(!down)return; const dx=e.clientX-sx; if(Math.abs(dx)>4) movedT=true;
    if(movedT){ if(!decompMode && dx>4){ decompMode=true; updateChrome(); updateHint(); }   // pull it open, then size to the drag
      if(decompMode) setPanelW(sw+dx); } });
  const end=e=>{ if(!down)return; down=false; try{tab.releasePointerCapture(e.pointerId);}catch(_){} if(!movedT) toggle(); };   // a clean click (no drag) toggles
  tab.addEventListener('pointerup',end); tab.addEventListener('pointercancel',end); })();
document.getElementById('primbtn').onclick=()=>{ primMode=!primMode;                 // primitive cohomology; disables the play transport, keeps hover-replay
  if(primMode){ playing=false; updatePlayIcon(); finishTree(); }
  primPanelVid=-1;                                                                   // force the decomposition panel to recompute (◇ vs P(◇)) for the same focused node
  document.getElementById('primbtn').classList.toggle('active',primMode); autoFrame=true; updateChrome(); updateHint(); };
const _origRun=run; run=function(v){ _origRun(v); populateWeakK(); if(weakMode) refreshWeak(); };   // keep weak view + k options in sync with h

/*=================== hint + math labels ===================*/
/* Hint text lives in editable Markdown files under explanations/ (see explanations/README.md).
   Each view/mode maps to one file; dynamic bits are [[template]] vars; $…$ is KaTeX. */
const EXPL={};                          // name -> raw markdown
const EXPL_FILES=['tree','graph','poset','weak-circ0','weak-graph','weak-poset','weak-tree',
                  'weak-circ-graph','weak-circ-poset','weak-circ-tree','mod-prim','mod-matrix','mod-decomp',
                  'decomp-panel','decomp-panel-prim','decomp-title','decomp-title-prim'];
let explLoaded=false;
function loadExplanations(){ return Promise.all(EXPL_FILES.map(n=>                     // ?t= so edits show on reload without a version bump
    fetch('explanations/'+n+'.md?t='+Date.now()).then(r=>r.ok?r.text():'').catch(()=>'').then(t=>{ EXPL[n]=t; })
  )).then(()=>{ explLoaded=true; updateHint();
    if(ppShown && primPanelVid>=0) updatePrimPanel(primPanelVid); }); }   // panel already open when the files landed: re-render its (now markdown) title + explanation
function renderMd(md, ctx){                                                             // [[var]] → ctx, then Markdown, with $…$ math protected from marked and rendered by KaTeX
  let s=md.replace(/\[\[(\w+)\]\]/g,(m,k)=> (ctx && k in ctx)? ctx[k] : m);
  const math=[];
  s=s.replace(/\$\$([\s\S]+?)\$\$/g,(m,x)=>{ math.push({d:true,x:x}); return 'MJXMATH'+(math.length-1)+'END'; });
  s=s.replace(/\$([^\$\n]+?)\$/g,(m,x)=>{ math.push({d:false,x:x}); return 'MJXMATH'+(math.length-1)+'END'; });
  let html=window.marked? marked.parse(s) : ('<p>'+s.replace(/\n{2,}/g,'</p><p>')+'</p>');
  return html.replace(/MJXMATH(\d+)END/g,(m,i)=>{ const it=math[+i]; if(!it) return m;
    if(window.katex){ try{ return katex.renderToString(it.x,{throwOnError:false,displayMode:it.d}); }catch(e){ return it.x; } }
    return it.x; }); }
function updateHint(){ const el=document.getElementById('hinttext'); if(!el||!explLoaded)return;
  const v = weakMode? weakLayout : viz;
  let name;
  if(!weakMode) name=(v==='graph')?'graph':(v==='poset')?'poset':'tree';
  else if(weakCirc && weakK===0) name='weak-circ0';
  else if(!weakCirc) name=(v==='graph')?'weak-graph':(v==='poset')?'weak-poset':'weak-tree';
  else name=(v==='graph')?'weak-circ-graph':(v==='poset')?'weak-circ-poset':'weak-circ-tree';
  const r=(curVec&&curVec.length>1)? curVec.length-1 : 2*weakK+2;                        // actual box coordinates for this h
  const ctx={ k:weakK, km1:weakK-1, k1:weakK+1, r:r,
    boxK:'['+(weakK+1)+',\\,'+(r-weakK-1)+']^2', boxRel:'['+weakK+',\\,'+(r-weakK)+']^2' };
  const parts=[];
  if(decompMode && !weakMode) parts.push('mod-decomp');
  if(matrixMode && !weakMode) parts.push('mod-matrix');
  if(primMode) parts.push('mod-prim');
  // collapse the base explanation when a modifier owns the message: rotate/prim on the tree, or the decomposition panel (its "what it is" lives on the panel)
  const collapseBase = (decompMode && !weakMode) || (name==='tree' && (primMode || (matrixMode && !weakMode)));
  if(!collapseBase) parts.push(name);
  const md = parts.map(n=>EXPL[n]||'').filter(Boolean).join('\n\n') + '\n\n*Drag / wheel to navigate.*';
  el.innerHTML = renderMd(md, ctx); }
function renderMathLabels(){ const h=document.getElementById('hlbl'), k=document.getElementById('klbl');
  if(window.katex){ if(h) h.innerHTML=katex.renderToString('\\underline{h}\\;=',{throwOnError:false}); if(k) k.innerHTML=katex.renderToString('k\\;=',{throwOnError:false}); }
  else { if(h) h.innerHTML='<u>h</u>&nbsp;='; if(k) k.textContent='k ='; } }
function setHintCollapsed(on){ const h=document.getElementById('hint'), s=document.getElementById('hintshow');   // collapsed = just the "?" pill
  if(!h||!s)return; h.style.display=on?'none':''; s.style.display=on?'block':'none'; }
document.getElementById('hinthide').onclick=()=>setHintCollapsed(true);
document.getElementById('hintshow').onclick=()=>setHintCollapsed(false);
renderMathLabels(); loadExplanations(); window.addEventListener('load', ()=>{ renderMathLabels(); updateHint(); fitBar(); });   // KaTeX/marked load deferred — re-render + re-fit once ready (label widths settle)

/*=================== boot ===================*/
requestAnimationFrame(frame);
tryRun('1,2,2,1');
fitBar();
