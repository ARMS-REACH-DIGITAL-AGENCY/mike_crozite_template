import assert from "node:assert/strict";
import { planWebzNewsBatches, buildWebzNewsQuery } from "./lib/webzDiscoveryPlan.mjs";
const make = (name,id,team,org,count=0,verified=0) => {
  const parts=name.split(" ");
  return {playerid:String(id),firstname:parts[0],lastname:parts.slice(1).join(" "),current_team:team,current_org:org,recent_news_count:count,recent_verified_count:verified};
};
const players=[
  make("Cody Bellinger",1,"New York Yankees","Yankees",123,30),
  make("Roch Cholowsky",2,"UCLA Bruins","UCLA",51,6),
  make("Drew Swift",3,"Las Vegas Aviators","Athletics",4,2),
  make("Jackson Smith",4,"Arizona State Sun Devils","Arizona State",3,0),
  ...Array.from({length:39},(_,i)=>make("Player"+i+" Sample"+i,i+10,"Nashville Sounds","Milwaukee Brewers",0,0)),
];
const plan=planWebzNewsBatches(players);
assert.equal(plan.length,8,"41 quieter players in six 8-player calls + two isolated high-volume names");
assert.equal(plan[plan.length-1].kind,"high-volume-isolated");
assert.equal(plan[plan.length-2].kind,"high-volume-isolated");
assert.equal(plan[0].names[0],"Player0 Sample0","low-coverage players should be scheduled first");
assert.equal(plan.flatMap(p=>p.players).length,players.length);
assert.equal(new Set(plan.flatMap(p=>p.players).map(p=>p.playerid)).size,players.length);
assert(plan.every(p=>p.players.length>=1&&p.players.length<=8));
const query=buildWebzNewsQuery([players[2]]);
assert(query.includes('"Drew Swift" "Las Vegas Aviators"'),"team context");
assert(query.includes('"Drew Swift" "Athletics"'),"organization context");
assert(query.includes('"Drew Swift"'),"mandatory player identity");
assert(query.includes('"Triple-A"'),"baseball subject terms");
assert(query.includes('NOT ('),"exclude promotional chatter");
assert.throws(()=>buildWebzNewsQuery([]));
assert.throws(()=>buildWebzNewsQuery([players[0],players[0]]));
const generic=buildWebzNewsQuery([make("Sam Pitcher",99,null,null)]);
assert(!generic.includes('"Nashville Sounds"'));
console.log("PASS: YAT?STATS Webz search planner: context, equal coverage, query caps and defensive checks");
