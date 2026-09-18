import crypto from "node:crypto";

export class ContractError extends Error {
  constructor(code){ super(code); this.name="ContractError"; this.code=code; }
}
export function assert(x,code){ if(!x) throw new ContractError(code); }
export function digest(value){ return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function validateSnapshot(s){
  assert(s && s.complete===true,"INCOMPLETE_SOURCE");
  assert(typeof s.identity==="string" && s.identity.length>0,"SOURCE_IDENTITY_MISSING");
  assert(s.states && typeof s.states==="object" && !Array.isArray(s.states),"INVALID_STATES");
  for(const [key,value] of Object.entries(s.states)){
    assert(/^(?:movie:tt\d{5,12}|episode:tt\d{5,12}:\d+:\d+)$/.test(key),"INVALID_WATCH_KEY");
    assert(typeof value==="boolean","INVALID_WATCH_VALUE");
  }
  const unknown=new Set(s.unknownKeys??[]);
  for(const key of unknown) assert(typeof key==="string","INVALID_UNKNOWN_KEY");
  return s;
}

export function reconcile(previous, stremio, trakt, policy={confirmUnwatchedCycles:2,syncMarkUnwatched:true}, observations={}, now=Date.now()){
  validateSnapshot(stremio); validateSnapshot(trakt);
  if(previous){
    validateSnapshot(previous.stremio); validateSnapshot(previous.trakt);
    assert(previous.stremio.identity===stremio.identity && previous.trakt.identity===trakt.identity,"SOURCE_IDENTITY_CHANGED");
  }
  assert(Number.isInteger(policy.confirmUnwatchedCycles)&&policy.confirmUnwatchedCycles>=2&&policy.confirmUnwatchedCycles<=10,"INVALID_CONFIRMATION_CYCLES");
  const unknown=new Set(stremio.unknownKeys??[]);
  const keys=new Set([...Object.keys(stremio.states),...Object.keys(trakt.states),...Object.keys(previous?.stremio.states??{}),...Object.keys(previous?.trakt.states??{})]);
  const operations=[],conflicts=[],skipped=[],nextObservations={...observations},canonical={};
  for(const key of [...keys].sort()){
    const s=stremio.states[key],t=trakt.states[key],ps=previous?.stremio.states[key],pt=previous?.trakt.states[key];
    if(unknown.has(key)){ canonical[key]=s===true||t===true; skipped.push({key,code:"STREMIO_STATE_UNRESOLVED"}); delete nextObservations[key]; continue; }
    const sAdd=!!previous&&ps!==true&&s===true;
    const sRemove=!!previous&&ps===true&&s===false;
    const tAdd=!!previous&&pt!==true&&t===true;
    const tRemove=!!previous&&pt===true&&t===false;
    if((sAdd&&tRemove)||(sRemove&&tAdd)){ canonical[key]=s===true||t===true; conflicts.push({key,code:"OPPOSING_WATCHED_CHANGES"}); delete nextObservations[key]; continue; }
    canonical[key]=s===true||t===true;
    if(!previous){
      if(t===true&&s!==true) operations.push({target:"stremio",key,desired:true});
      else if(s===true&&t!==true) skipped.push({key,code:"STREMIO_NATIVE_OUTBOUND_PENDING"});
      continue;
    }
    if(tAdd&&s!==true){ operations.push({target:"stremio",key,desired:true}); delete nextObservations[key]; continue; }
    if((tRemove||nextObservations[key]?.origin==="trakt")&&s===true&&t===false){
      if(!policy.syncMarkUnwatched){ skipped.push({key,code:"TRAKT_UNWATCH_SYNC_DISABLED"}); continue; }
      const old=nextObservations[key];
      const count=old?.origin==="trakt" ? old.count : 0;
      const next={origin:"trakt",count:count+1,last:now};
      nextObservations[key]=next;
      if(next.count>=policy.confirmUnwatchedCycles) operations.push({target:"stremio",key,desired:false});
      else skipped.push({key,code:"UNWATCHED_CHANGE_AWAITING_CONFIRMATION",observed:next.count,required:policy.confirmUnwatchedCycles});
      continue;
    }
    if(s!==t) skipped.push({key,code:"STREMIO_NATIVE_OUTBOUND_PENDING"});
    else delete nextObservations[key];
  }
  return {operations,conflicts,skipped,observations:nextObservations,canonical};
}

function validateCatalog(catalog){
  assert(Array.isArray(catalog)&&catalog.length>0&&catalog.length<=500,"INVALID_CATALOG");
  const seen=new Set();
  for(const row of catalog){
    assert(row&&typeof row.seriesId==="string"&&/^tt\d{5,12}$/.test(row.seriesId),"INVALID_SERIES_ID");
    assert(Number.isInteger(row.season)&&row.season>=0,"INVALID_SEASON");
    assert(Number.isInteger(row.episode)&&row.episode>=1,"INVALID_EPISODE");
    assert(/^episode:tt\d{5,12}:\d+:\d+$/.test(row.key),"INVALID_WATCH_KEY");
    assert(!seen.has(row.key),"DUPLICATE_EPISODE_KEY"); seen.add(row.key);
  }
  return catalog;
}
function intentRows(intent,catalog){
  assert(intent&&["series","season"].includes(intent.kind),"INVALID_BULK_KIND");
  assert(/^tt\d{5,12}$/.test(intent.seriesId),"INVALID_SERIES_ID");
  assert(typeof intent.desired==="boolean","INVALID_DESIRED_STATE");
  if(intent.kind==="season") assert(Number.isInteger(intent.season)&&intent.season>=0,"INVALID_SEASON");
  const rows=catalog.filter(x=>x.seriesId===intent.seriesId&&(intent.kind==="series"||x.season===intent.season));
  assert(rows.length>0,"BULK_TARGET_EMPTY");
  return rows;
}
export function confirmationPhrase(plan){
  const action=plan.intent.desired?"WATCHED":"UNWATCHED";
  const target=plan.intent.kind==="series" ? `SERIES ${plan.intent.seriesId}` : `SEASON ${plan.intent.season} OF ${plan.intent.seriesId}`;
  return `MARK ${plan.operations.length} EPISODES ${action} - ${target}`;
}
export function buildBulkPlan({intent,catalog,currentStates}){
  validateCatalog(catalog);
  assert(currentStates&&typeof currentStates==="object"&&!Array.isArray(currentStates),"INVALID_CURRENT_STATES");
  const rows=intentRows(intent,catalog);
  const operations=rows.filter(row=>currentStates[row.key]!==intent.desired).map(row=>({key:row.key,desired:intent.desired}));
  assert(operations.length>0,"NO_BULK_CHANGES");
  const sourceDigest=digest({catalog:rows,currentStates:Object.fromEntries(rows.map(r=>[r.key,currentStates[r.key]??false]))});
  const plan={schema:1,kind:"watched-bulk-intent",intent:{...intent},targetCount:rows.length,operations,sourceDigest,requiresRemovalAck:intent.desired===false};
  plan.confirmation=confirmationPhrase(plan);
  plan.planDigest=digest({...plan,confirmation:undefined,planDigest:undefined});
  return plan;
}
export function validateBulkApply(plan,{catalog,currentStates,confirmation,ackRemovals=false}){
  assert(plan?.schema===1&&plan.kind==="watched-bulk-intent","INVALID_PLAN");
  validateCatalog(catalog);
  const rows=intentRows(plan.intent,catalog);
  const freshDigest=digest({catalog:rows,currentStates:Object.fromEntries(rows.map(r=>[r.key,currentStates[r.key]??false]))});
  assert(freshDigest===plan.sourceDigest,"BULK_PLAN_STALE");
  assert(confirmation===plan.confirmation,"BULK_CONFIRMATION_MISMATCH");
  if(plan.requiresRemovalAck) assert(ackRemovals===true,"REMOVALS_REQUIRE_CONFIRMATION");
  const rebuilt=buildBulkPlan({intent:plan.intent,catalog,currentStates});
  assert(rebuilt.planDigest===plan.planDigest,"BULK_PLAN_CHANGED");
  return {valid:true,operations:structuredClone(plan.operations)};
}
