/*=================== combinatorics (port of ds.sage) ===================*/
// Pure — no DOM, no shared UI state. Exposes computeGraph() and its helpers as globals.
function shapeArr(n){ const s=[]; for(let i=0;i<=Math.floor(n/2);i++) s.push(n+1-2*i); return s; }
function A(n,l,k,w){ const D={};
  for(let p=k;p<=k+l;p++) for(let i=0;i<=n-w;i++){ const key=(p+i)+','+(w-p+i); D[key]=(D[key]||0)+1; }
  return D; }
function mirror(D){ const B={}; for(const key in D){ const t=key.split(','); B[t[1]+','+t[0]]=D[key]; } return B; }
function eqDict(X,Y){ const kx=Object.keys(X); if(kx.length!==Object.keys(Y).length) return false;
  for(const k of kx) if(X[k]!==Y[k]) return false; return true; }
function d2M(D,n){ const M=[]; for(let row=0;row<=n;row++){ const r=[];
  for(let col=0;col<=n;col++) r.push(D[(n-row)+','+col]||0); M.push(r); } return M; }
function zeros(n){ return Array.from({length:n+1},()=>new Array(n+1).fill(0)); }
function addM(a,b){ return a.map((r,i)=>r.map((v,j)=>v+b[i][j])); }
function subScaled(a,b,c){ return a.map((r,i)=>r.map((v,j)=>v-c*b[i][j])); }
function addScaled(a,b,c){ return a.map((r,i)=>r.map((v,j)=>v+c*b[i][j])); }
function Lstring(n,l,k,w){ const X=A(n,l,k,w), Y=mirror(X);
  if(eqDict(X,Y)) return d2M(X,n);
  const Z=Object.assign({},X); for(const key in Y) Z[key]=(Z[key]||0)+Y[key]; return d2M(Z,n); }
function Nstring(n,k,w){ return Lstring(n,0,k,w); }
function Mpile(n,l,k,w){ let acc=zeros(n); const lim=Math.min(n-w,l);
  for(let i=0;i<=lim;i++){ const ww=w+2*i-l; if(ww<0||ww>n) continue; acc=addM(acc,Nstring(n,k+i,ww)); } return acc; }
function coordsList(n){ const c=[]; for(let w=0;w<=n;w++)for(let l=0;l<=n;l++)for(let k=0;k<=n;k++)
  if(k>=0&&l>=1&&l+2*k<=w&&w<=n) c.push([n,l,k,w]); return c; }
function sumDict(a,b){ const o=Object.assign({},a); for(const k in b) o[k]=(o[k]||0)+b[k]; return o; }
function Uraw(n,l,k,w){ let acc={}; const lim=Math.min(n-w,l);
  for(let i=0;i<=lim;i++){ const ww=w+2*i-l; if(ww<0||ww>n) continue; acc=sumDict(acc,A(n,0,k+i,ww)); } return acc; }
function basisOf(n){ const C=coordsList(n), S=[],T=[],conj=[],Asp=[],Bsp=[],Usp=[],Vsp=[];
  for(const v of C){ const Ad=A(v[0],v[1],v[2],v[3]), Ud=Uraw(v[0],v[1],v[2],v[3]);
    conj.push(!eqDict(Ad,mirror(Ad)));
    S.push(Lstring(v[0],v[1],v[2],v[3])); T.push(Mpile(v[0],v[1],v[2],v[3]));
    Asp.push(sparse(d2M(Ad,n))); Bsp.push(sparse(d2M(mirror(Ad),n)));
    Usp.push(sparse(d2M(Ud,n))); Vsp.push(sparse(d2M(mirror(Ud),n))); }
  return {S,T,conj,Asp,Bsp,Usp,Vsp}; }
function isDiagram(M){ const n=M.length-1;
  for(let p=0;p<=n;p++)for(let q=0;q<=n;q++) if(M[p][q]!==M[q][p]) return false;
  const C=M.slice().reverse();
  for(let p=0;p<=n;p++)for(let q=0;q<=n;q++){ if(C[p][q]<0) return false;
    if(C[p][q]!==C[n-p][n-q]) return false;
    if(p+q<=n-2 && C[p][q]>C[p+1][q+1]) return false; }
  return true; }
function keyOf(M){ return M.map(r=>r.join(',')).join(';'); }
function colSums(M){ const n=M.length-1, s=new Array(n+1).fill(0);
  for(let i=0;i<=n;i++)for(let j=0;j<=n;j++) s[j]+=M[i][j]; return s; }
function intVectors(sum,parts){ const res=[], cur=new Array(parts).fill(0);
  (function rec(pos,rem){ if(pos===parts-1){ cur[pos]=rem; res.push(cur.slice()); return; }
    for(let v=0;v<=rem;v++){ cur[pos]=v; rec(pos+1,rem-v); } })(0,sum); return res; }
function degenerations(M,S,T,IV){
  const maxh=Math.max(...colSums(M)), len=S.length, out=new Map();
  for(let k=1;k<=maxh;k++){ const vs=IV[k]||(IV[k]=intVectors(k,len));
    for(const P of vs){ let N=M;
      for(let i=0;i<len;i++) if(P[i]) N=subScaled(N,S[i],P[i]);
      if(isDiagram(N)){ let D=N;
        for(let i=0;i<len;i++) if(P[i]) D=addScaled(D,T[i],P[i]);
        const key=keyOf(D), nb=P.reduce((a,x)=>a+(x>0?1:0),0), cur=out.get(key);
        if(!cur||nb<cur.nb||(nb===cur.nb&&k<cur.k)) out.set(key,{D,P,nb,k}); } } }
  return out; }
function sparse(M){ const out=[]; for(let i=0;i<M.length;i++)for(let j=0;j<M.length;j++) if(M[i][j]) out.push([i,j,M[i][j]]); return out; }
// primitive (Lefschetz) Hodge numbers  P^{p,q} = h^{p,q} − h^{p-1,q-1}  (0 above the middle weight).  Port of ds.sage P(M).
function primitivePart(m){ const n=m.length-1, d={};
  for(let p=0;p<=n;p++)for(let q=0;q<=n;q++) d[q+','+(n-p)]=m[p][q];                // M2d: entry m[p][q] keyed (q, n-p)
  const out={};
  for(let a=0;a<=n;a++)for(let b=0;b<=n;b++){ let val=d[a+','+b];
    if(a+b>n) val=0;                                                                // above the middle: nothing primitive
    else if(a>=1&&b>=1) val=val-d[(a-1)+','+(b-1)];                                 // subtract the Lefschetz-lift from weight −2
    out[a+','+b]=val; }
  const res=[]; for(let i=0;i<=n;i++){ const row=[]; for(let j=0;j<=n;j++) row.push(out[(n-i)+','+j]); res.push(row); } return res; }
// Lefschetz / KPR decomposition  DI = Σ_{w=0}^{r} Σ_{a=0}^{r-w} P_w(-a), where P_w is the primitive part in weight w
// (P_w^{p,w-p}=DI^{p,w-p}-DI^{p-1,w-p-1}, living on the anti-diagonal p+q=w) and P_w(-a)^{p,q}=P_w^{p-a,q-a} (Tate twist).
// Returns { r, rows:[{ w, cells:[{a, mat}] }] } — one row per nonzero primitive weight w, one cell per shift a; the cells sum to DI.
function primitiveGrid(m){
  const r=m.length-1, Pc=primitivePart(m).slice().reverse();        // Pc[p][q] = P^{p,q}
  const rows=[];
  for(let w=0;w<=r;w++){
    const Pw=[]; for(let p=0;p<=w;p++){ const q=w-p; if(q>=0&&q<=r&&p<=r){ const v=Pc[p][q]; if(v) Pw.push([p,q,v]); } }   // P_w on p+q=w
    if(!Pw.length) continue;
    const cells=[], sum=Array.from({length:r+1},()=>new Array(r+1).fill(0));
    for(let a=0;a<=r-w;a++){ const Qc=Array.from({length:r+1},()=>new Array(r+1).fill(0));
      for(const [p,q,v] of Pw) Qc[p+a][q+a]=v; const mat=Qc.slice().reverse(); cells.push({a, mat});   // twist the whole string up by (a,a)
      for(let i=0;i<=r;i++)for(let j=0;j<=r;j++) sum[i][j]+=mat[i][j]; }                                // sum = Σ_a P_w(-a), the whole Lefschetz string
    rows.push({w, cells, sum});
  }
  return {r, rows}; }
// ambient poset A^n(m): all "coin distributions" a:{0..n}->Z>=0 with Σa = m (= the gr_F^k / F^k moving vectors for R_k^∘, n=r-2k, m=h^k).
// Returns { nodes:[{a, A, rank, key}], covers:[[fromKey,toKey]] } where A=partial sums, rank=Σ A, and a cover moves one coin down one box (⊑: A1≤A0).
function ambientPoset(n,m){
  const as=intVectors(m,n+1);
  const nodes=as.map(a=>{ const A=[]; let s=0; for(const x of a){ s+=x; A.push(s); } return {a, A, rank:A.reduce((p,q)=>p+q,0), key:a.join(',')}; });
  const covers=[];
  for(const nd of nodes){ const a=nd.a; for(let j=0;j<n;j++){ if(a[j+1]>=1){ const b=a.slice(); b[j]++; b[j+1]--; covers.push([nd.key, b.join(',')]); } } }   // one coin from box j+1 down to box j = a single ⊑ cover
  return {nodes, covers}; }
// onProgress(verticesSoFar, queueRemaining) is called periodically (for the worker's progress bar); capV aborts if the vertex count blows past it (safety against OOM)
function computeGraph(hvec, onProgress, capV){
  const r=hvec.length-1, n=r, BS=basisOf(n), S=BS.S, T=BS.T;
  const pure=zeros(n); for(let i=0;i<=n;i++) pure[i][i]=hvec[i];   // pure HS = diagonal
  const IV=[];
  const vertices=[], index=new Map();
  const add=M=>{ const k=keyOf(M); if(index.has(k)) return index.get(k);
    const id=vertices.length; index.set(k,id); vertices.push(M); return id; };
  const root=add(pure), edges=[], moves=[], q=[root]; let steps=0;
  while(q.length){ const a=q.shift();
    const degs=degenerations(vertices[a],S,T,IV);
    for(const {D,P} of degs.values()){ const wasNew=!index.has(keyOf(D)); const b=add(D);
      if(wasNew) q.push(b);
      edges.push([a,b]); moves.push(P.map((c,i)=>c>0?[i,c]:null).filter(Boolean)); }
    if(capV && vertices.length>capV) throw new Error('CAP:'+vertices.length);
    if(onProgress && ((++steps)&15)===0) onProgress(vertices.length, q.length); }
  if(onProgress) onProgress(vertices.length, 0);
  return {r,root,vertices:vertices.map(M=>M.map(row=>row.slice())),
          primVertices:vertices.map(primitivePart),edges,moves,
          basis:S.map((s,i)=>({S:sparse(S[i]),T:sparse(T[i]),conj:BS.conj[i],
            A:BS.Asp[i],B:BS.Bsp[i],U:BS.Usp[i],V:BS.Vsp[i]}))}; }
