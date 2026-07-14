/*=================== canvas, camera, rendering primitives ===================*/
const MW=0.9;                                                                    // matrix cell step (world units)
const cv=document.getElementById('stage'), ctx=cv.getContext('2d');
let DPR=Math.max(1,Math.min(2,window.devicePixelRatio||1));
function resize(){ cv.width=innerWidth*DPR; cv.height=(innerHeight-52)*DPR;
  cv.style.width=innerWidth+'px'; cv.style.height=(innerHeight-52)+'px'; }
addEventListener('resize',resize); resize();
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const easeIO=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2, easeOut=t=>1-Math.pow(1-t,3);

const cam={x:0,y:0,s:1,tx:0,ty:0,ts:1}; let autoFrame=true;
let viewOffsetX=0;                                                               // shift the main view right when the prim-decomposition panel occupies the left
function toScreen(x,y){ return [(x-cam.x)*cam.s+cv.width/2+viewOffsetX,(y-cam.y)*cam.s+cv.height/2]; }
function toWorldXY(sx,sy){ return [(sx*DPR-cv.width/2-viewOffsetX)/cam.s+cam.x, ((sy-52)*DPR-cv.height/2)/cam.s+cam.y]; }

function cellBase(p,q,r){ return [(q-p)*0.62, (r-(p+q))*0.62]; }   // 180°: low weight (h^{0,0}) at the BOTTOM, high weight at the top
// fraction along center→target where the ray exits the rounded diamond (half-diag Hw): 0.93·Hw at a vertex, Hw on the flat side
function edgeF(dx,dy,Hw){ const L1=Math.abs(dx)+Math.abs(dy)||1e-6, s=L1/(Math.hypot(dx,dy)||1e-6);
  const fac=0.93+0.07*clamp((s-1)/0.148,0,1); return Math.min(0.45, fac*Hw/L1); }
function edgeFsq(dx,dy,S){ const mx=Math.max(Math.abs(dx),Math.abs(dy))||1e-6, mn=Math.min(Math.abs(dx),Math.abs(dy)), c=mn/mx, c0=0.8;   // exact L∞ exit onto the matrix box
  return Math.min(0.45,(c<=c0?1:(1+c0)/(1+c))*S/mx); }   // flat edge out to c0·S (no pull-in); only the corner chamfer beyond it
const boxHalfW=r=>(r/2+0.7)*MW*0.42;   // matrix-box half-side in world-position units
function hstr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }   // stable per-edge seed (chooses a curve side deterministically, no RNG)
// perpendicular bow so a straight edge x1..x2 arcs clear of any node CENTRE it would otherwise pass over (obstacles: screen {x,y}; R = node screen radius)
function bowOffset(x1,y1,x2,y2,obstacles,R,seed){
  const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L, CLEAR=R*1.45;
  let push=0, side=0;
  for(const o of (obstacles||[])){ const t=((o.x-x1)*dx+(o.y-y1)*dy)/(L*L); if(t<=0.06||t>=0.94) continue;   // only nodes strictly between the endpoints
    const px=x1+dx*t, py=y1+dy*t, sd=(o.x-px)*nx+(o.y-py)*ny, ad=Math.abs(sd);
    if(ad<CLEAR){ const need=(CLEAR-ad)+R*0.85; if(need>push){ push=need; side=(ad<0.5)?0:(sd>=0?-1:1); } } }   // bow AWAY from the blocking node
  const base=clamp(L*0.11,0,R*3.5);   // gentle arc on every edge so parallels/longer skips separate (longer ⇒ bows more)
  let mag=push, sgn=side; if(base>mag){ mag=base; sgn=0; }
  if(sgn===0) sgn=(seed&1)?1:-1;      // collinear or unobstructed: pick a stable side from the seed
  return {ox:nx*mag*sgn, oy:ny*mag*sgn}; }
// quadratic-Bézier arrow from (x1,y1) to (x2,y2), bowed to avoid obstacles, with the head tangent to the curve
function drawArrowCurved(x1,y1,x2,y2,obstacles,R,o){ o=o||{};
  const {ox,oy}=bowOffset(x1,y1,x2,y2,obstacles,R,o.seed||0), cx=(x1+x2)/2+ox, cy=(y1+y2)/2+oy;
  ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha;
  ctx.lineWidth=(o.width||1.4)*DPR; ctx.strokeStyle=o.color||'rgba(74,104,143,0.7)'; if(o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(cx,cy,x2,y2); ctx.stroke(); ctx.setLineDash([]);
  const ang=Math.atan2(y2-cy,x2-cx), h=(o.head||7)*DPR; ctx.fillStyle=o.headColor||o.color||'rgba(110,168,255,0.9)';
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-Math.cos(ang-0.4)*h,y2-Math.sin(ang-0.4)*h); ctx.lineTo(x2-Math.cos(ang+0.4)*h,y2-Math.sin(ang+0.4)*h); ctx.closePath(); ctx.fill();
  ctx.restore(); }
// barycentric layer ordering: reorder nodes within each layer toward the mean position of their neighbours in the adjacent layer (fewer crossings, no collinear stacking)
function baryOrder(layerMap, radj, adj){
  const ranks=Object.keys(layerMap).map(Number).sort((a,b)=>a-b); if(ranks.length<2) return;
  for(let s=0;s<6;s++){ const down=(s%2===0), seq= down? ranks : ranks.slice().reverse();
    for(let li=1; li<seq.length; li++){ const R=seq[li], P=seq[li-1], ord={}; layerMap[P].forEach((id,i)=>ord[id]=i);
      const nbr= down? radj : adj;   // sweep down ⇒ order by parents above; sweep up ⇒ by children below
      const rows=layerMap[R].map((id,i)=>{ const xs=(nbr[id]||[]).map(x=>ord[x]).filter(v=>v!=null); return {id, b: xs.length? xs.reduce((a,c)=>a+c,0)/xs.length : i, i}; });
      rows.sort((a,c)=>(a.b-c.b)||(a.i-c.i)); layerMap[R]=rows.map(o=>o.id); } } }
// full layered layout for an arbitrary DAG (node keys + directed edges): longest-path ranks, barycentric within-layer order, uniform grid. Returns Map key->{x,y}.
function layeredLayout(keys, edges, D){
  const set=new Set(keys), adj={}, radj={}, indeg={}; keys.forEach(k=>{ indeg[k]=0; });
  for(const [a,b] of edges){ if(!set.has(a)||!set.has(b)||a===b) continue; (adj[a]=adj[a]||[]).push(b); (radj[b]=radj[b]||[]).push(a); indeg[b]++; }
  const rank={}, ind={}; keys.forEach(k=>{ rank[k]=0; ind[k]=indeg[k]; }); const q=[]; keys.forEach(k=>{ if(!indeg[k]) q.push(k); });
  let guard=keys.length*4+8;
  while(q.length && guard-->0){ const u=q.shift(); for(const w of (adj[u]||[])){ if(rank[u]+1>rank[w]) rank[w]=rank[u]+1; if(--ind[w]===0) q.push(w); } }
  const layers={}; keys.forEach(k=>{ (layers[rank[k]]=layers[rank[k]]||[]).push(k); });
  baryOrder(layers, radj, adj);
  const pos=new Map(); Object.keys(layers).forEach(R=>{ const arr=layers[R]; arr.forEach((k,i)=>pos.set(k,{x:(i-(arr.length-1)/2)*D, y:(+R)*D})); });
  return pos; }
const _slot=[]; (function(){ for(let s=0;s<80;s++){ if(s===0){_slot.push([0,0]);continue;}
  const rr=0.135*Math.sqrt(s), a=s*2.399963; _slot.push([rr*Math.cos(a),rr*Math.sin(a)]); }})();
function latticeDots(r,cx,cy,U){ ctx.fillStyle='#1a2740';
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const b=cellBase(j,r-i,r);
    ctx.beginPath(); ctx.arc(cx+b[0]*U,cy+b[1]*U,Math.max(1,U*0.05),0,7); ctx.fill(); } }
function grain(x,y,rr,fill){ ctx.beginPath(); ctx.arc(x,y,rr,0,7); ctx.fillStyle=fill; ctx.fill(); }
function mixHex(a,b,t){ const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);
  const R=Math.round((pa>>16&255)*(1-t)+(pb>>16&255)*t), Gc=Math.round((pa>>8&255)*(1-t)+(pb>>8&255)*t),
        B=Math.round((pa&255)*(1-t)+(pb&255)*t); return 'rgb('+R+','+Gc+','+B+')'; }
function drawCellVal(x,y,U,v,alpha){ if(v<=0||alpha<=0.01) return;
  ctx.save(); ctx.globalAlpha=alpha;
  if(v===1){ ctx.fillStyle='#e9c377'; ctx.beginPath(); ctx.arc(x,y,Math.max(1.5,U*0.13),0,7); ctx.fill(); }
  else { ctx.fillStyle='#f2d38c'; ctx.font='700 '+Math.max(9,(U*0.52)|0)+'px ui-sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(v),x,y); }
  ctx.restore(); }
function drawSquish(x,y,rr,sq,col,alpha){ if(alpha<=0.01)return; ctx.save(); ctx.globalAlpha=alpha;
  ctx.fillStyle=col; ctx.beginPath(); ctx.ellipse(x,y,rr*sq,rr*(2-sq),0,0,7); ctx.fill(); ctx.restore(); }
function gridBG(r,cx,cy,U,alpha,hi){ const hx=(r+2)*0.62*U;              // fixed diamond: full grid + 2-unit border (same ambient grid for every node of h)
  const V=[[cx,cy-hx],[cx+hx,cy],[cx,cy+hx],[cx-hx,cy]], rf=0.14;
  ctx.save(); ctx.globalAlpha=(alpha==null?1:alpha);
  ctx.beginPath();
  for(let i=0;i<4;i++){ const c=V[i], p=V[(i+3)%4], n=V[(i+1)%4];
    const a=[c[0]+(p[0]-c[0])*rf,c[1]+(p[1]-c[1])*rf], b=[c[0]+(n[0]-c[0])*rf,c[1]+(n[1]-c[1])*rf];
    if(i===0) ctx.moveTo(a[0],a[1]); else ctx.lineTo(a[0],a[1]);
    ctx.quadraticCurveTo(c[0],c[1],b[0],b[1]); }
  ctx.closePath();
  ctx.fillStyle='rgba(211,211,211,0.14)'; ctx.fill();                     // light gray, transparent
  if(hi){ ctx.strokeStyle=hi; ctx.lineWidth=2.4*DPR; }                    // selection/active: colored diamond border
  else { ctx.strokeStyle='rgba(211,211,211,0.28)'; ctx.lineWidth=1.1*DPR; }
  ctx.stroke();
  ctx.restore(); }
function drawStatic(m,r,cx,cy,U,o={}){ gridBG(r,cx,cy,U,o.alpha, o.sel?(o.selColor||'#22c55e'):null); latticeDots(r,cx,cy,U); const a=o.alpha==null?1:o.alpha;
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const v=m[i][j]; if(v<=0)continue;
    const b=cellBase(j,r-i,r); drawCellVal(cx+b[0]*U,cy+b[1]*U,U,v,a); } }
// draw a self-contained diamond into any 2D context, centered at (cx,cy) with unit U (device px). Used by the prim-decomposition grid.
function drawDiamondInto(pctx,mat,r,cx,cy,U,faint){
  const hx=(r+2)*0.62*U;
  pctx.beginPath(); pctx.moveTo(cx,cy-hx); pctx.lineTo(cx+hx,cy); pctx.lineTo(cx,cy+hx); pctx.lineTo(cx-hx,cy); pctx.closePath();
  pctx.fillStyle=faint?'rgba(211,211,211,0.04)':'rgba(211,211,211,0.07)'; pctx.fill();
  pctx.strokeStyle=faint?'rgba(211,211,211,0.14)':'rgba(211,211,211,0.24)'; pctx.lineWidth=1*DPR; pctx.stroke();
  pctx.fillStyle='#1a2740';
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const b=cellBase(j,r-i,r); pctx.beginPath(); pctx.arc(cx+b[0]*U,cy+b[1]*U,Math.max(0.8,U*0.05),0,7); pctx.fill(); }
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const v=mat[i][j]; if(v<=0)continue; const b=cellBase(j,r-i,r), x=cx+b[0]*U, y=cy+b[1]*U;
    if(v===1){ pctx.fillStyle='#e9c377'; pctx.beginPath(); pctx.arc(x,y,Math.max(1.2,U*0.13),0,7); pctx.fill(); }
    else { pctx.fillStyle='#f2d38c'; pctx.font='700 '+Math.max(8,(U*0.5)|0)+'px ui-sans-serif'; pctx.textAlign='center'; pctx.textBaseline='middle'; pctx.fillText(String(v),x,y); } } }
// matrix counterpart of drawDiamondInto: an upright h^{p,q} matrix (no box), centered at (cx,cy) with unit U. Used by the panel when matrix view is on.
function drawMatrixInto(pctx,mat,r,cx,cy,U,faint){
  const hw=(r/2+0.6)*MW*U, rad=Math.min(hw*0.45, 6*DPR);
  pctx.beginPath();
  pctx.moveTo(cx-hw+rad,cy-hw);
  pctx.arcTo(cx+hw,cy-hw, cx+hw,cy+hw, rad); pctx.arcTo(cx+hw,cy+hw, cx-hw,cy+hw, rad);
  pctx.arcTo(cx-hw,cy+hw, cx-hw,cy-hw, rad); pctx.arcTo(cx-hw,cy-hw, cx+hw,cy-hw, rad); pctx.closePath();
  pctx.fillStyle=faint?'rgba(211,211,211,0.04)':'rgba(211,211,211,0.07)'; pctx.fill();
  pctx.strokeStyle=faint?'rgba(211,211,211,0.14)':'rgba(211,211,211,0.24)'; pctx.lineWidth=1*DPR; pctx.stroke();
  pctx.fillStyle='#1a2740';
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const x=cx+(j-r/2)*MW*U, y=cy+(i-r/2)*MW*U; pctx.beginPath(); pctx.arc(x,y,Math.max(0.8,U*0.05),0,7); pctx.fill(); }
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const v=mat[i][j]; if(v<=0)continue; const x=cx+(j-r/2)*MW*U, y=cy+(i-r/2)*MW*U;
    if(v===1){ pctx.fillStyle='#e9c377'; pctx.beginPath(); pctx.arc(x,y,Math.max(1.2,U*0.13),0,7); pctx.fill(); }
    else { pctx.fillStyle='#f2d38c'; pctx.font='700 '+Math.max(8,(U*0.5)|0)+'px ui-sans-serif'; pctx.textAlign='center'; pctx.textBaseline='middle'; pctx.fillText(String(v),x,y); } } }

// an irrep = a set of ∇-rods (grouped by weight v=i-j); each rod is a rigid rod
// that rotates 90° about its own midpoint (all midpoints share the axis x=x_M).
function makePile(Ssp,ci,col,r){
  const rods={}, cells=[];
  for(const [i,j,v] of Ssp){ const u=i+j, vv=i-j; cells.push({i,j,u,vv,mult:v*ci});
    const R=rods[vv]||(rods[vv]={minU:1e9,maxU:-1e9}); R.minU=Math.min(R.minU,u); R.maxU=Math.max(R.maxU,u); }
  const grains=[], slot={};
  for(const c of cells){ const uM=(rods[c.vv].minU+rods[c.vv].maxU)/2;
    const xM=(uM-r)*0.62, yM=(-c.vv)*0.62, cellX=(c.u-r)*0.62, cellY=(-c.vv)*0.62, k=c.i+'_'+c.j;
    for(let t=0;t<c.mult;t++){ const s=(slot[k]=(slot[k]||0)); slot[k]++; const o=_slot[s]||[0,0];
      const ss=[cellX+o[0],cellY+o[1]], ox=ss[0]-xM, oy=ss[1]-yM;
      grains.push({i:c.i, j:c.j, sc:[cellX,cellY], ss, pivot:[xM,yM], ds:[xM-oy, yM+ox], dc:[xM, yM+(c.u-uM)*0.62]}); } }
  return {grains, col}; }
function buildPiles(Pm,Cm,r,move){ const piles=[];
  for(const [bi,ci] of move){ const B=BASIS[bi];
    if(B.conj){ piles.push(makePile(B.A,ci,'#22d3ee',r));    // irrep rods pivot about their midpoints
                piles.push(makePile(B.B,ci,'#e879f9',r)); }  // its conjugate, adjacent axis
    else piles.push(makePile(B.S,ci,'#ffffff',r)); }
  const leave=[]; for(let i=0;i<=r;i++) leave.push(new Array(r+1).fill(0));
  for(const pile of piles) for(const g of pile.grains) leave[g.i][g.j]++;   // # dots leaving each source cell
  return {piles, Pm, Cm, leave}; }
function drawMorph(node,cx,cy,U){ const r=G.r, P=node.pile, mt=node.mt, Pm=P.Pm, Cm=P.Cm, Lv=P.leave;
  gridBG(r,cx,cy,U,1); latticeDots(r,cx,cy,U);
  const splosh=clamp(mt/0.15,0,1), splat=clamp((mt-0.85)/0.15,0,1), rr=Math.max(1.5,U*0.13);
  // each cell holds its NON-moving dots (parent − leaving) fixed through the motion; the moving dots are the piles;
  // splosh: moving dots pop out of the cell (par → fixed); splat: incoming piles recombine (fixed → child)
  for(let i=0;i<=r;i++)for(let j=0;j<=r;j++){ const par=Pm[i][j], ch=Cm[i][j], fx=par-(Lv[i][j]||0);
    if(par===0&&ch===0)continue;
    const b=cellBase(j,r-i,r), X=cx+b[0]*U, Y=cy+b[1]*U;
    drawCellVal(X,Y,U,par,1-splosh);          // full parent value, before its moving dots splosh out
    drawCellVal(X,Y,U,fx,splosh*(1-splat));    // fixed stayers, held throughout the motion
    drawCellVal(X,Y,U,ch,splat); }             // recombined child value, splats in
  const e=easeIO(clamp((mt-0.15)/0.70,0,1));
  for(const pile of P.piles){ const col=mt<0.85? pile.col : mixHex(pile.col,'#e9c377',splat);
    for(const g of pile.grains){ let x,y,sq=1,alpha=1;
      if(mt<0.15){ const t=splosh; x=lerp(g.sc[0],g.ss[0],easeOut(t)); y=lerp(g.sc[1],g.ss[1],easeOut(t)); sq=1+0.5*Math.sin(Math.PI*t); alpha=t; }
      else if(mt<0.85){ const th=e*Math.PI/2, c=Math.cos(th), s=Math.sin(th);
        const ox=g.ss[0]-g.pivot[0], oy=g.ss[1]-g.pivot[1];   // rigid rotation of the rod about its midpoint
        x=g.pivot[0]+ox*c-oy*s; y=g.pivot[1]+ox*s+oy*c; }
      else { const t=splat; x=lerp(g.ds[0],g.dc[0],easeIO(t)); y=lerp(g.ds[1],g.dc[1],easeIO(t)); sq=1+0.6*Math.sin(Math.PI*t); alpha=1-t; }
      drawSquish(cx-x*U, cy-y*U, rr, sq, col, alpha); } } }   // 180° with the flipped cells (cellBase)
