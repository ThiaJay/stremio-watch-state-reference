import test from "node:test";
import assert from "node:assert/strict";
import {buildBulkPlan,confirmationPhrase,reconcile,validateBulkApply} from "../src/reference.js";
const snap=(identity,states,unknownKeys=[])=>({complete:true,identity,states,unknownKeys});
test("first baseline imports Trakt watched into Stremio without inventing unwatched",()=>{
  const r=reconcile(null,snap("s",{"movie:tt12345":false}),snap("t",{"movie:tt12345":true}));
  assert.deepEqual(r.operations,[{target:"stremio",key:"movie:tt12345",desired:true}]);
});
test("Stremio-only watched state remains outbound/native pending",()=>{
  const r=reconcile(null,snap("s",{"movie:tt12345":true}),snap("t",{"movie:tt12345":false}));
  assert.equal(r.operations.length,0); assert.equal(r.skipped[0].code,"STREMIO_NATIVE_OUTBOUND_PENDING");
});
test("unknown Stremio state is never interpreted as unwatched",()=>{
  const k="episode:tt12345:1:2",r=reconcile(null,snap("s",{[k]:false},[k]),snap("t",{[k]:false}));
  assert.equal(r.operations.length,0); assert.equal(r.skipped[0].code,"SOURCE_STATE_UNRESOLVED");
});
test("Trakt unwatch requires repeated complete observations",()=>{
  const k="movie:tt12345",previous={stremio:snap("s",{[k]:true}),trakt:snap("t",{[k]:true})};
  const currentS=snap("s",{[k]:true}),currentT=snap("t",{[k]:false});
  const a=reconcile(previous,currentS,currentT,{confirmUnwatchedCycles:2,syncMarkUnwatched:true},{},1);
  assert.equal(a.operations.length,0); assert.equal(a.skipped[0].code,"UNWATCHED_CHANGE_AWAITING_CONFIRMATION");
  const b=reconcile(previous,currentS,currentT,{confirmUnwatchedCycles:2,syncMarkUnwatched:true},a.observations,2);
  assert.deepEqual(b.operations,[{target:"stremio",key:k,desired:false}]);
});
test("unwatch can be policy-disabled",()=>{
  const k="movie:tt12345",previous={stremio:snap("s",{[k]:true}),trakt:snap("t",{[k]:true})};
  const r=reconcile(previous,snap("s",{[k]:true}),snap("t",{[k]:false}),{confirmUnwatchedCycles:2,syncMarkUnwatched:false});
  assert.equal(r.operations.length,0); assert.equal(r.skipped[0].code,"TRAKT_UNWATCH_SYNC_DISABLED");
});
test("opposing simultaneous changes are held as conflict",()=>{
  const k="movie:tt12345",previous={stremio:snap("s",{[k]:false}),trakt:snap("t",{[k]:true})};
  const r=reconcile(previous,snap("s",{[k]:true}),snap("t",{[k]:false}));
  assert.equal(r.operations.length,0); assert.equal(r.conflicts[0].code,"OPPOSING_WATCHED_CHANGES");
});
test("source identity changes invalidate the baseline",()=>{
  const k="movie:tt12345",previous={stremio:snap("old",{[k]:true}),trakt:snap("t",{[k]:true})};
  assert.throws(()=>reconcile(previous,snap("new",{[k]:true}),snap("t",{[k]:true})),/SOURCE_IDENTITY_CHANGED/);
});
const catalog=[
 {seriesId:"tt12345",season:1,episode:1,key:"episode:tt12345:1:1"},
 {seriesId:"tt12345",season:1,episode:2,key:"episode:tt12345:1:2"},
 {seriesId:"tt12345",season:2,episode:1,key:"episode:tt12345:2:1"},
 {seriesId:"tt99999",season:1,episode:1,key:"episode:tt99999:1:1"}
];
test("whole-series intent enumerates only the selected series",()=>{
  const states=Object.fromEntries(catalog.filter(x=>x.seriesId==="tt12345").map(x=>[x.key,false]));
  const p=buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:true},catalog,currentStates:states});
  assert.equal(p.targetCount,3); assert.equal(p.operations.length,3); assert.match(p.confirmation,/MARK 3 EPISODES WATCHED/);
});
test("season intent is independently scoped",()=>{
  const states={"episode:tt12345:1:1":false,"episode:tt12345:1:2":false};
  const p=buildBulkPlan({intent:{kind:"season",seriesId:"tt12345",season:1,desired:true},catalog,currentStates:states});
  assert.equal(p.targetCount,2); assert.deepEqual(p.operations.map(x=>x.key),["episode:tt12345:1:1","episode:tt12345:1:2"]);
});
test("already-correct episodes are not rewritten",()=>{
  const states={"episode:tt12345:1:1":true,"episode:tt12345:1:2":false,"episode:tt12345:2:1":false};
  const p=buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:true},catalog,currentStates:states});
  assert.equal(p.operations.length,2);
});
test("bulk apply requires exact human-readable confirmation",()=>{
  const states=Object.fromEntries(catalog.filter(x=>x.seriesId==="tt12345").map(x=>[x.key,false]));
  const p=buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:true},catalog,currentStates:states});
  assert.throws(()=>validateBulkApply(p,{catalog,currentStates:states,confirmation:"yes"}),/BULK_CONFIRMATION_MISMATCH/);
  assert.equal(validateBulkApply(p,{catalog,currentStates:states,confirmation:p.confirmation}).valid,true);
});
test("bulk unwatch requires a second removal acknowledgement",()=>{
  const states=Object.fromEntries(catalog.filter(x=>x.seriesId==="tt12345").map(x=>[x.key,true]));
  const p=buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:false},catalog,currentStates:states});
  assert.equal(p.requiresRemovalAck,true);
  assert.throws(()=>validateBulkApply(p,{catalog,currentStates:states,confirmation:p.confirmation}),/REMOVALS_REQUIRE_CONFIRMATION/);
  assert.equal(validateBulkApply(p,{catalog,currentStates:states,confirmation:p.confirmation,ackRemovals:true}).valid,true);
});
test("any target-state drift makes a bulk plan stale",()=>{
  const states={"episode:tt12345:1:1":false,"episode:tt12345:1:2":false};
  const p=buildBulkPlan({intent:{kind:"season",seriesId:"tt12345",season:1,desired:true},catalog,currentStates:states});
  const changed={"episode:tt12345:1:1":true,"episode:tt12345:1:2":false};
  assert.throws(()=>validateBulkApply(p,{catalog,currentStates:changed,confirmation:p.confirmation}),/BULK_PLAN_STALE/);
});
test("duplicate episode keys are rejected",()=>{
  assert.throws(()=>buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:true},catalog:[catalog[0],catalog[0]],currentStates:{}}),/DUPLICATE_EPISODE_KEY/);
});
test("confirmation phrase names exact operation count and target",()=>{
  const p=buildBulkPlan({intent:{kind:"season",seriesId:"tt12345",season:2,desired:false},catalog,currentStates:{"episode:tt12345:2:1":true}});
  assert.equal(confirmationPhrase(p),"MARK 1 EPISODES UNWATCHED - SEASON 2 OF tt12345");
});


test("missing current source state is held as unknown rather than inferred unwatched",()=>{
  const k="movie:tt12345";
  const r=reconcile(null,snap("s",{}),snap("t",{[k]:true}));
  assert.equal(r.operations.length,0);
  assert.equal(r.skipped[0].code,"CURRENT_SOURCE_STATE_MISSING");
  assert.equal(r.canonical[k],true);
});

test("bulk planning refuses incomplete current state",()=>{
  const states={"episode:tt12345:1:1":false};
  assert.throws(
    ()=>buildBulkPlan({intent:{kind:"season",seriesId:"tt12345",season:1,desired:true},catalog,currentStates:states}),
    /BULK_CURRENT_STATE_MISSING/
  );
});

test("bulk planning rejects non-boolean current state",()=>{
  const states={"episode:tt12345:1:1":false,"episode:tt12345:1:2":"false"};
  assert.throws(
    ()=>buildBulkPlan({intent:{kind:"season",seriesId:"tt12345",season:1,desired:true},catalog,currentStates:states}),
    /INVALID_CURRENT_STATE_VALUE/
  );
});

test("catalog key must exactly match series season and episode fields",()=>{
  const broken=[{seriesId:"tt12345",season:1,episode:1,key:"episode:tt12345:1:2"}];
  assert.throws(
    ()=>buildBulkPlan({intent:{kind:"series",seriesId:"tt12345",desired:true},catalog:broken,currentStates:{"episode:tt12345:1:2":false}}),
    /CATALOG_KEY_MISMATCH/
  );
});

test("unknown-state keys must be valid unique members of the snapshot",()=>{
  assert.throws(()=>reconcile(null,{complete:true,identity:"s",states:{"movie:tt12345":false},unknownKeys:["movie:tt99999"]},snap("t",{"movie:tt12345":false})),/UNKNOWN_KEY_NOT_IN_STATES/);
  assert.throws(()=>reconcile(null,{complete:true,identity:"s",states:{"movie:tt12345":false},unknownKeys:["bad"]},snap("t",{"movie:tt12345":false})),/INVALID_UNKNOWN_KEY/);
});

test("malformed observations fail closed",()=>{
  const k="movie:tt12345";
  assert.throws(()=>reconcile(null,snap("s",{[k]:true}),snap("t",{[k]:false}),undefined,{[k]:{origin:"trakt",count:0,last:1}},2),/INVALID_OBSERVATION/);
});
