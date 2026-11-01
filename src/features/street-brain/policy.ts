import type { DecisionAnswer } from './contracts';

export function predicate(answers:DecisionAnswer[],name:string):number {
  const a=answers.find(a=>a.name===name); return a?.type==='predicate'?a.probability:0.5;
}
export function choice(answers:DecisionAnswer[],name:string) {
  const a=answers.find(a=>a.name===name);return a?.type==='choice'?{value:a.choice,confidence:a.confidence}:{value:'uncertain',confidence:0};
}
export function score(answers:DecisionAnswer[],name:string) {
  const a=answers.find(a=>a.name===name);return a?.type==='score'?a:null;
}
function riskLevel(l:number,c:number){return c===5||l*c>=15?'S1':l*c>=6?'S2':'S3';}

/** Proposed thresholds are review gates, not validated accuracy or council approval. */
export function prioritise(answers:DecisionAnswer[],borough:string) {
  const relevance=predicate(answers,'relevant_issue'),emergency=predicate(answers,'immediate_danger');
  const owner=choice(answers,'responsibility'),category=choice(answers,'category');
  const severity=score(answers,'severity');
  const common={responsibility:owner.value,confidence:Math.min(category.confidence,owner.confidence,severity?.confidence??0),validation:{relevance,emergency}};
  // Safety screening precedes rejection or routing, including non-council assets.
  if(emergency>=0.7)return {...common,outcome:'review' as const,severity:5,policyLevel:'S0 · provisional',queue:'Immediate safety review',queueOrder:0,reason:'Evidence suggests a current serious danger. A qualified person must review it now; no alert or crew dispatch has been sent.'};
  if(relevance<=0.2)return {...common,outcome:'rejected' as const,severity:null,policyLevel:'Not assessed',queue:'Photo not accepted',queueOrder:9,reason:'The photo does not clearly show a reportable issue. Add a photo of the defect; a selfie alone cannot be assessed.'};
  if(owner.confidence>=0.8&&['TfL','Utility company','Private owner','Other council'].includes(owner.value))return {...common,outcome:'referred' as const,severity:null,policyLevel:'Routing review',queue:'Refer to responsible organisation',queueOrder:8,reason:`This appears to be a ${owner.value} issue. Responsibility needs confirmation; no external referral has been sent.`};
  const supported=predicate(answers,'risk_evidence_sufficient')>=0.7;
  const l=score(answers,'likelihood'),c=score(answers,'consequence');
  const lb=l?.probabilities.filter(p=>p.probability>=0.1).map(p=>p.value+1)??[];
  const cb=c?.probabilities.filter(p=>p.probability>=0.1).map(p=>p.value+1)??[];
  const level=supported&&lb.length&&cb.length&&riskLevel(Math.min(...lb),Math.min(...cb))===riskLevel(Math.max(...lb),Math.max(...cb))?riskLevel(Math.min(...lb),Math.min(...cb)):'U · unassessed';
  const candidate=severity?Math.max(1,Math.min(5,Math.round(severity.score+1))):null;
  const unknown=level.startsWith('U')||relevance<0.7||owner.confidence<0.65||owner.value==='uncertain'||!borough.toLowerCase().includes('hackney');
  return {...common,outcome:unknown?'review' as const:'accepted' as const,severity:candidate,policyLevel:level,
    queue:unknown?'Evidence review':candidate&&candidate>=4?'High priority':candidate===3?'Priority inspection':'Routine inspection',
    queueOrder:unknown?1:candidate&&candidate>=4?2:candidate===3?3:4,
    reason:unknown?'The suggested 1–5 rating is provisional. Confirm safety, location, ownership and missing risk evidence before setting repair priority.':`Supported evidence fits the proposed ${level} risk band. A council worker must confirm the suggested priority.`};
}
