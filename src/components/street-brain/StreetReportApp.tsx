'use client';

/* eslint-disable @next/next/no-img-element -- Local object URLs and expiring signed evidence URLs are displayed without Next image optimisation. */
import Link from 'next/link';

import { useEffect,useRef,useState,type FormEvent } from 'react';
import { z } from 'zod';
import { assessmentSchema,locationSchema,type Assessment,type Location } from '@/features/street-brain/contracts';
import { readJsonResponse as readResponse } from '@/features/street-brain/client-response';

function message(error:unknown){return error instanceof TypeError?'Cannot reach the report service. Check your connection and try again.':error instanceof Error?error.message:'Something went wrong. Please try again.';}

async function preparePhoto(file:File):Promise<File>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose JPEG, PNG or WebP photos under 10 MB each.');
  let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This image could not be opened. Choose another photo.');}
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Your browser could not prepare the photo.');}
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let quality=0.85,blob:Blob|null=null;
  do{blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=0.15;}while(blob&&blob.size>900000&&quality>=0.35);
  if(!blob||blob.size>1100000)throw new Error('This photo is still too large. Choose a smaller image.');
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
}

function Mark(){return <span className="mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M10 6v20M22 6v20M10 16h12"/></svg></span>;}
function Arrow(){return <span aria-hidden="true">↗</span>;}

export default function StreetReports(){
  return <div className="app"><header className="header"><Link href="/street-report" className="brand"><Mark/><span><strong>One Hackney</strong><small>STREET REPORTS</small></span></Link><nav aria-label="Workspace"><Link href="/street-report" className="nav-active">Report an issue</Link><Link href="/dashboard">Council workspace <Arrow/></Link></nav></header>
    <Resident/>
    <footer><span>Built for the Hackney hackathon · an independent prototype.</span><Link href="/street-report/pipeline">How reports are assessed <Arrow/></Link><a href="https://www.hackney.gov.uk/" target="_blank" rel="noreferrer">Official council website <Arrow/></a></footer>
  </div>;
}

function Resident(){
  const [photos,setPhotos]=useState<File[]>([]),[urls,setUrls]=useState<string[]>([]),[address,setAddress]=useState(''),[description,setDescription]=useState('');
  const [location,setLocation]=useState<Location|null>(null),[options,setOptions]=useState<Location[]>([]),[searching,setSearching]=useState(false);
  const [busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[dragging,setDragging]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Assessment|null>(null);
  const input=useRef<HTMLInputElement>(null),resultRef=useRef<HTMLElement>(null);
  useEffect(()=>{const next=photos.map(p=>URL.createObjectURL(p));setUrls(next);return()=>next.forEach(URL.revokeObjectURL);},[photos]);
  useEffect(()=>{if(result)resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'});},[result]);

  async function addPhotos(files:File[]){
    setError('');setResult(null);
    if(files.length+photos.length>3){setError('You can add up to three photos.');return;}
    setPreparing(true);try{const prepared=await Promise.all(files.map(preparePhoto));setPhotos(current=>[...current,...prepared]);}catch(e){setError(message(e));}finally{setPreparing(false);}
  }
  async function findLocation(){
    setSearching(true);setError('');setOptions([]);
    try{const q=/hackney|london/i.test(address)?address:address+', Hackney London';const raw=await readResponse(await fetch('/api/street-brain/location?q='+encodeURIComponent(q)));setOptions(z.object({locations:z.array(locationSchema)}).parse(raw).locations);}catch(e){setError(message(e));}finally{setSearching(false);}
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy||!photos.length||!address.trim()||!description.trim())return;
    setBusy(true);setError('');setResult(null);
    const form=new FormData();photos.forEach(p=>form.append('photos',p));form.set('address',address);form.set('description',description);if(location)form.set('location',JSON.stringify(location));
    try{
      const data=await readResponse(await fetch('/api/street-brain/assess',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}));
      const job=z.object({jobId:z.string(),receipt:z.string()}).parse(data);
      let completed=false;
      for(let n=0;n<70;n++){
        const raw=await readResponse(await fetch('/api/street-brain/jobs/'+job.jobId,{headers:{'x-report-receipt':job.receipt},cache:'no-store',signal:AbortSignal.timeout(15000)}));
        const state=z.object({status:z.string(),assessment:assessmentSchema.nullable(),error:z.string().nullable()}).parse(raw);
        if(state.status==='failed')throw new Error(state.error??'The assessment failed. The council team can retry the queued job.');
        if(state.status==='completed'&&state.assessment){setResult(state.assessment);completed=true;break;}
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      if(!completed)throw new Error('Your upload is saved, but assessment is still running. The council workspace will show its result when ready.');
    }catch(e){setError(message(e));}finally{setBusy(false);}
  }

  return <main><section className="hero"><div><p className="eyebrow"><span className="status-dot"/>YOUR NEIGHBOURHOOD. YOUR VOICE.</p><h1>Small reports.<br/><span>Better streets.</span></h1><p className="hero-copy">A pothole. A broken light. A pavement you can’t use.<br className="desktop"/> Show us the problem. We’ll help find the right next step.</p></div><div className="hero-stamp"><span className="stamp-icon">↗</span><strong>A clearer picture<br/>for the right team.</strong><p>Your photo becomes a structured report, with a suggested priority for review.</p></div></section>
    <div className="report-grid"><form onSubmit={submit} className="report-card"><div className="card-title"><div><p className="eyebrow">START A REPORT</p><h2>What needs attention?</h2></div><span className="pill">About 2 minutes</span></div>
      <section className="form-step"><div className="step-heading"><span className="step-number">01</span><div><h3>Add a photo</h3><p>Show the issue and a little of its surroundings.</p></div></div>
        <div className={'dropzone '+(dragging?'dragging':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void addPhotos(Array.from(e.dataTransfer.files));}} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void addPhotos(Array.from(e.clipboardData.files));}}}>
          <svg className="camera-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M17 12l3-5h8l3 5h8a3 3 0 0 1 3 3v23a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3z"/><circle cx="24" cy="26" r="9"/></svg>
          <strong>{preparing?'Preparing your photos…':'Drop your photos here'}</strong><span>or choose a photo from your device</span><button type="button" className="button green small" disabled={busy||preparing||photos.length>=3} onClick={()=>input.current?.click()}>Choose photos <span>＋</span></button><small>JPG, PNG or WebP · up to 3 photos · 10 MB each</small>
          <input ref={input} aria-label="Choose issue photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>{void addPhotos(Array.from(e.target.files??[]));e.target.value='';}}/>
        </div>
        {photos.length>0&&<div className="thumbnails">{photos.map((p,i)=><div key={p.name+i}>{/* Local object URL; image intentionally stays on device until submit. */}<img src={urls[i]} alt={`Issue photo ${i+1}`}/><button type="button" aria-label={`Remove photo ${i+1}`} onClick={()=>setPhotos(photos.filter((_,index)=>index!==i))}>×</button><small>{p.name}</small></div>)}</div>}
      </section>
      <section className="form-step"><div className="step-heading"><span className="step-number">02</span><div><h3>Where is it?</h3><p>A street, postcode or nearby landmark.</p></div></div><label className="sr-only" htmlFor="address">Issue location</label><div className="location-input"><span aria-hidden="true">⌖</span><input id="address" value={address} required maxLength={400} placeholder="e.g. Cremer Street, E2" onChange={e=>{setAddress(e.target.value);setLocation(null);setOptions([]);setResult(null);}}/><button type="button" disabled={searching||address.length<4} onClick={()=>void findLocation()}>{searching?'Searching…':'Find'}</button></div>
        {options.length>0&&<div className="location-options">{options.map(o=><button key={o.lat+','+o.lon} type="button" onClick={()=>{setLocation(o);setAddress(o.label);setOptions([]);}}>⌖ {o.label}</button>)}</div>}
        <p className={'input-note '+(location?'verified':'')}>{location?'✓ Location selected · nearby schools and transport can be checked.':'Use Find to select the location for a map context check. You can still report an uncertain location.'}</p>
      </section>
      <section className="form-step"><div className="step-heading"><span className="step-number">03</span><div><h3>Tell us what’s wrong</h3><p>What can you see? Is access blocked or anyone in danger?</p></div></div><label htmlFor="description" className="sr-only">Problem description</label><textarea id="description" rows={4} required maxLength={3000} value={description} onChange={e=>{setDescription(e.target.value);setResult(null);}} placeholder="Describe the issue in your own words…"/><p className="input-note">Stay somewhere safe. You don’t need to measure or approach the defect.</p></section>
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="submit-row"><button type="submit" className="button primary" disabled={busy||preparing||!photos.length||!address.trim()||!description.trim()}>{busy?'Checking your report…':'Check and prepare report'} <span>→</span></button><p>Your photos and description will be sent for AI assessment when you continue.</p></div>
      {busy&&<div className="loading" role="status"><span className="spinner"/>Checking photo relevance, responsibility and risk. This can take a minute.</div>}
    </form><aside className="report-aside"><div className="aside-note"><p className="eyebrow">WHAT HAPPENS NEXT</p><h2>Every report<br/>needs a clear path.</h2><ol><li><span>1</span><div><strong>Check the photo</strong><p>Is there a visible problem we can assess?</p></div></li><li><span>2</span><div><strong>Find the right organisation</strong><p>Hackney, TfL, a utility, or an owner to confirm.</p></div></li><li><span>3</span><div><strong>Suggest a priority</strong><p>Evidence, local context and the policy guide the review.</p></div></li></ol></div><div className="safety-note"><span>!</span><div><strong>Immediate danger?</strong><p>If someone’s life is at risk, contact emergency services. This form does not send an emergency alert.</p></div></div><p className="aside-caption">Photographs can suggest a hazard. They cannot reliably measure pothole depth without a scale.</p></aside></div>
    {result&&<section ref={resultRef} className="result-section"><AssessmentView result={result}/></section>}
  </main>;
}

function AssessmentView({result}:{result:Assessment}){
  const colour=result.outcome==='rejected'?'red':result.outcome==='referred'?'amber':result.queueOrder===0?'red':'green';
  return <article className="result-card"><div className="result-heading"><div><p className="eyebrow">{result.saved?'SAVED FOR REVIEW':'ASSESSMENT RESULT'}</p><h2>{result.title}</h2><p>{result.address}</p></div><span className={'outcome '+colour}>{result.outcome==='rejected'?'New photo needed':result.outcome==='referred'?'Responsibility check':result.outcome==='review'?'Human review needed':'Ready for review'}</span></div>
    <div className="result-body"><div><p className="report-description">{result.councilDescription}</p><div className="detail-block"><span className="eyebrow">CATEGORY</span><strong>{result.category}</strong></div><div className="evidence-grid"><div><h3>Visible in the photos</h3>{result.visibleEvidence.length?<ul>{result.visibleEvidence.map((e,i)=><li key={i}>{e}</li>)}</ul>:<p>No reliable defect evidence extracted.</p>}</div><div><h3>Still to confirm</h3><ul>{result.missingEvidence.map((e,i)=><li key={i}>{e}</li>)}</ul></div></div>{result.reportedClaims.length>0&&<div className="reported"><h3>Reported by the resident</h3><ul>{result.reportedClaims.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}</div>
      <aside className="priority-panel"><span className="eyebrow">SUGGESTED SEVERITY</span><div className="severity">{result.severity??'—'}<span>/ 5</span></div><strong>{result.queue}</strong><p>{result.reason}</p><dl><div><dt>Policy assessment</dt><dd>{result.policyLevel}</dd></div><div><dt>Likely responsibility</dt><dd>{result.responsibility}</dd></div><div><dt>Model confidence</dt><dd>{Math.round(result.confidence*100)}% · uncalibrated</dd></div><div><dt>Visible extent · unmeasured</dt><dd>{result.extentDescription}</dd></div><div><dt>Risk position</dt><dd>{result.riskLocation}</dd></div></dl><small>Human confirmation required. No repair date or dispatch is confirmed.</small></aside></div>
    {result.outcome!=='rejected'&&<div className="resource-panel"><div><p className="eyebrow">REPAIR PLANNING ESTIMATE</p><h3>{result.resources.trade}</h3><p>Resource types to confirm after inspection. Quantities, availability and dispatch are unconfirmed.</p></div><div><h3>Actions</h3><ul>{result.resources.actions.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h3>Materials & equipment</h3><ul>{[...result.resources.materials,...result.resources.equipment].map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h3>Policy & legal checks</h3><ul>{result.legalFlags.map((x,i)=><li key={i}>{x}</li>)}</ul></div></div>}
    <div className="context-panel"><div><p className="eyebrow">LOCATION CONTEXT</p><h3>What’s nearby?</h3><p>Proximity suggests possible exposure. It does not measure footfall or change priority automatically.</p></div><div className="places">{result.context.status==='available'?(result.context.places.length?result.context.places.slice(0,6).map(p=><a key={p.osmId} href={'https://www.openstreetmap.org/'+p.osmId} target="_blank" rel="noreferrer"><strong>{p.name}</strong><span>{p.type} · {p.distance} m</span></a>):<p>No matching schools or transport stops were returned within 300 m.</p>):<p>{result.context.status==='location_needed'?'Select a location to check nearby schools and transport.':'The live map service was unavailable. No proximity data was assumed.'}</p>}<small>© OpenStreetMap contributors · STATS19: {result.context.collisions.toLowerCase()}</small></div></div>
    <details className="decision-tree"><summary>Why this answer? <span>Follow the five decision stages</span></summary><div className="trace-list">{result.decisionTrace.map(step=><details className="trace-step" key={step.stage}><summary><span className="trace-number">{step.stage}</span><span><strong>{step.question}</strong><small>{step.answer}</small></span><span className={'trace-status '+step.status}>{step.status}</span></summary><div className="trace-content"><p className="trace-method">{step.method}{step.confidence!==null?` · ${Math.round(step.confidence*100)}% model estimate, uncalibrated`:''}</p>{step.evidence.length>0&&<ul>{step.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul>}<p>{step.alternative}</p><div>{step.sources.map((link,i)=><a key={link} href={link} target="_blank" rel="noreferrer">Policy source {i+1} ↗</a>)}</div></div></details>)}<details className="original-description"><summary>Resident’s original description</summary><p>{result.residentDescription}</p></details></div></details>
    <div className="policy-note"><span>Policy v{result.policyVersion}. Proposed decision support.</span><a href={result.policySources[0]} target="_blank" rel="noreferrer">View policy source <Arrow/></a><span>Reference: {result.id.slice(0,8).toUpperCase()}</span></div>
  </article>;
}

// Live evidence review remains protected; the demo workspace opens /dashboard.
export function Council(){
  const [password,setPassword]=useState(''),[signedIn,setSignedIn]=useState(false),[items,setItems]=useState<Assessment[]>([]),[selected,setSelected]=useState<Assessment|null>(null),[filter,setFilter]=useState('All reports'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[source,setSource]=useState(0);
  async function load(){setBusy(true);setError('');try{const raw=await readResponse(await fetch('/api/street-brain/queue',{cache:'no-store'}));const data=z.object({assessments:z.array(assessmentSchema),source:z.object({reports:z.number()})}).parse(raw);setItems(data.assessments);setSource(data.source.reports);setSignedIn(true);}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function login(e:FormEvent){e.preventDefault();setError('');try{await readResponse(await fetch('/api/street-brain/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}));setPassword('');await load();}catch(cause){setError(message(cause));}}
  const visible=items.filter(i=>filter==='All reports'||i.queue===filter);
  return <main className="council-main"><div className="workspace-title"><div><p className="eyebrow">COUNCIL WORKSPACE</p><h1>Evidence before action.</h1><p>Review incoming reports, understand the risk, and confirm the right next step.</p></div>{signedIn&&<button className="button secondary" onClick={()=>void load()} disabled={busy}>{busy?'Refreshing…':'Refresh queue ↻'}</button>}</div>
    {!signedIn?<form className="login-card" onSubmit={login}><span className="login-icon">⌁</span><h2>Sign in to review reports</h2><p>The council workspace contains report photos and assessment evidence.</p><label htmlFor="access">Council access code</label><input id="access" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>{error&&<div className="error" role="alert">{error}</div>}<button className="button primary" type="submit">Open workspace →</button></form>:<>
      <div className="queue-stats"><div><span>INCOMING ASSESSMENTS</span><strong>{items.length}</strong></div><div><span>IMMEDIATE SAFETY REVIEW</span><strong>{items.filter(i=>i.queueOrder===0).length}</strong></div><div><span>NEED MORE EVIDENCE</span><strong>{items.filter(i=>i.queueOrder===1).length}</strong></div><div><span>CONNECTED SOURCE REPORTS</span><strong>{source.toLocaleString()}</strong></div></div>
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="queue-toolbar"><h2>Review queue <span>{items.length}</span></h2><label><span className="sr-only">Filter queue</span><select value={filter} onChange={e=>setFilter(e.target.value)}>{['All reports',...Array.from(new Set(items.map(i=>i.queue)))].map(q=><option key={q}>{q}</option>)}</select></label></div>
      <div className="queue-table"><div className="queue-table-head"><span>REPORT</span><span>SEVERITY</span><span>REVIEW QUEUE</span><span>CONFIDENCE</span><span/></div>{visible.length?visible.map(i=><button key={i.id} className={'queue-row '+(selected?.id===i.id?'selected':'')} onClick={()=>setSelected(i)}><span><strong>{i.title}</strong><small>{i.category} · {new Date(i.createdAt).toLocaleDateString('en-GB')}</small></span><span className={'severity-badge severity-'+(i.severity??0)}>{i.severity??'U'}<small>/5</small></span><span>{i.queue}</span><span>{Math.round(i.confidence*100)}%<small>model estimate</small></span><span>↗</span></button>):<div className="empty-queue"><h3>No reports in this queue yet.</h3><p>Reports appear here after a real assessment is saved. Existing harvested reports have not been given invented scores.</p></div>}</div>
      <p className="queue-caption">Ordered by safety review, evidence gaps, suggested severity, then waiting time. Repair commitments and crew availability need a confirmed operational plan.</p>
      <Evaluation/>
      {selected&&<section className="selected-assessment">{selected.photoUrls.length>0&&<div className="staff-photos">{selected.photoUrls.map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Submitted evidence ${i+1}`}/></a>)}</div>}<AssessmentView result={selected}/></section>}
      <button className="text-button" onClick={async()=>{await fetch('/api/street-brain/session',{method:'DELETE'});setSignedIn(false);setItems([]);setSelected(null);}}>Sign out</button>
    </>}
  </main>;
}

const evaluationSchema=z.object({jobs:z.array(z.object({id:z.string(),status:z.string(),expected_category:z.string().nullable(),result:z.unknown(),error:z.string().nullable()})),candidates:z.array(z.object({id:z.union([z.string(),z.number()]).transform(String),title:z.string(),category:z.string()}))});
type EvaluationData=z.infer<typeof evaluationSchema>;
function Evaluation(){
  const [data,setData]=useState<EvaluationData|null>(null),[reportId,setReportId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){setError('');try{setData(evaluationSchema.parse(await readResponse(await fetch('/api/street-brain/evaluation',{cache:'no-store'}))));}catch(e){setError(message(e));}}
  async function run(){if(!reportId)return;setBusy(true);setError('');try{await readResponse(await fetch('/api/street-brain/evaluation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reportId})}));await refresh();}catch(e){setError(message(e));}finally{setBusy(false);}}
  const completed=data?.jobs.flatMap(j=>{const a=assessmentSchema.safeParse(j.result);return j.status==='completed'&&j.expected_category&&a.success?[{id:j.id,expected:j.expected_category,predicted:a.data.category,correct:j.expected_category===a.data.category}]:[];})??[];
  return <details className="evaluation" onToggle={e=>{if(e.currentTarget.open&&!data)void refresh();}}><summary>Category backtesting <span>Compare predictions with existing report categories</span></summary><div className="evaluation-content"><p>Historical images stay in the <code>images</code> bucket. New uploads use <code>street-brain-uploads</code>. A source category is a weak label; agreement does not validate urgency or safety.</p>
    {data&&<><div className="evaluation-controls"><label htmlFor="test-report">Choose an existing report</label><select id="test-report" value={reportId} onChange={e=>setReportId(e.target.value)}><option value="">Select a stored image…</option>{data.candidates.map(r=><option key={r.id} value={r.id}>{r.category} · {r.title.slice(0,55)}</option>)}</select><button className="button green small" disabled={busy||!reportId} onClick={()=>void run()}>{busy?'Queuing…':'Assess selected image · uses AI'}</button><button className="text-button" onClick={()=>void refresh()}>Refresh results</button></div>
      <p className="agreement">{completed.length?`${completed.filter(x=>x.correct).length} / ${completed.length} completed category matches (${Math.round(100*completed.filter(x=>x.correct).length/completed.length)}%)`:'No completed backtest assessments yet.'}</p>
      {completed.length>0&&<table><thead><tr><th>Source label</th><th>Predicted category</th><th>Agreement</th></tr></thead><tbody>{completed.map(c=><tr key={c.id}><td>{c.expected}</td><td>{c.predicted}</td><td>{c.correct?'Match':'Review mismatch'}</td></tr>)}</tbody></table>}
      {data.jobs.filter(j=>j.status!=='completed').map(j=><p key={j.id} className="input-note">{j.id.slice(0,8)} · {j.status}{j.error?' · '+j.error:''}</p>)}
    </>}{error&&<div className="error" role="alert">{error}</div>}</div></details>;
}
