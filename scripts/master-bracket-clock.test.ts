// Run: npx tsx --test scripts/master-bracket-clock.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import type { Live } from '../src/components/bracket/liveSeason';
import { bracketDay, runSeason, SQL_ROWS, SQL_RULINGS, SQL_CLUB_ARCHIVE, SQL_CLUB_ARCHIVE_EXISTS, clubArchiveHash, writeSeason, type Row, type Season } from './master-bracket-results';

const season: Season = {
  season_key: '2027', is_test: false, opening_day: '2026-03-23', last_day: '2026-11-15',
  weeks: 34, regions: 8, schools_per_region: 128,
};
const initial: Row = {
  stage: 'bracket', region: 1, round: 1, series_no: 1, game_no: 1, game_id: 1, week: 1,
  home_hsid: 1, away_hsid: 2, home_seed: 1, away_seed: 128,
  home_school_name: 'Home', away_school_name: 'Away', status: 'scheduled', innings: null,
  winner_hsid: null, decided_by: null, locked_at: null,
};
const hot = [4, 4, 2, 0, 0, 1, 0, 0, 0];
const cold = [4, 4, 0, 0, 0, 0, 0, 0, 0];
function feed(): Live {
  return {
    asOf: '2026-03-25', clubs: {},
    roster: { '1': [['YAT000001', 'Home batter', 'MLB', 0, 'H']], '2': [['YAT000002', 'Away batter', 'MLB', 0, 'A']] },
    // Future-day rows intentionally arrive together: the real scorer must
    // reveal each day's contribution only when the replay clock reaches it.
    lines: [0, 1, 2].flatMap((day): Live['lines'] => [
      ['1', 'YAT000001', day, 'b', [...(day === 1 ? cold : hot)], `h${day}`, 'H', 1, 'MLB'],
      ['2', 'YAT000002', day, 'b', [...(day === 1 ? hot : cold)], `a${day}`, 'A', 1, 'MLB'],
    ]),
  };
}

// Only IO is replaced. runSeason, its production transport, scorer, frozen
// day handling and writer execute unchanged. Actual Postgres persistence is
// covered by the isolated full-season replay, not claimed by this unit test.
function database(seed: Row = initial, archive: Record<string, any> = {}, otherRows: Row[] = []) {
  let row: Row = structuredClone(seed);
  const archiveReads: string[] = [];
  const writes: { sql: string; values: unknown[] }[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql === SQL_ROWS) return { rows: [row, ...otherRows] };
    if (sql === SQL_RULINGS) return { rows: [] };
    if (sql === SQL_CLUB_ARCHIVE_EXISTS) return { rows: [{ relation: 'bracket_rehearsal_days' }] };
    if (sql === SQL_CLUB_ARCHIVE) { archiveReads.push(String(values[1])); return { rows: archive[String(values[1])] ? [structuredClone(archive[String(values[1])])] : [] }; }
    if (sql.includes('computed_at =')) {
      writes.push({ sql, values });
      assert.match(sql, /computed_at = COALESCE\(\$4::timestamptz, now\(\)\)/);
      assert.match(sql, /locked_at = CASE WHEN x.lock THEN COALESCE\(\$4::timestamptz, now\(\)\)/);
      const [result] = JSON.parse(String(values[1]));
      if (result) row = {
        ...row, ...result, innings: result.innings.slice(1, -1).split(',').map(Number),
        computed_at: values[3] as string | null, locked_at: result.lock ? values[3] as string : null,
        box_in_progress: result.box,
      };
    }
    return { rows: [] };
  };
  const client = { query, release() {} } as unknown as PoolClient;
  return { pool: { query, connect: async () => client } as unknown as Pool, client, writes, archiveReads, row: () => row };
}

test('historical daily writes advance new innings and preserve closed-day precision', async () => {
  const live = feed();
  const request: typeof fetch = async () => new Response(JSON.stringify(live));
  const db = database();
  const run = (day: string, effectiveAt: string) => runSeason(db.pool, season, day, { base: 'https://replay.invalid', effectiveAt, request });

  await run('2026-03-23', '2026-03-24T10:59:59Z');
  assert.equal(db.row().computed_at, '2026-03-24T10:59:59.000Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 0, 0, 0]);

  await run('2026-03-24', '2026-03-25T10:59:59Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 1, 0, 0]);
  const frozen = structuredClone(db.row().box_in_progress!);
  assert.notEqual(frozen.x?.[0][0], frozen.d[0][0], 'fixture must exercise raw precision beyond rounded display');
  // A late correction to Monday must not change its now-closed inning or
  // its raw Stat Ledger values when Wednesday is scored.
  live.lines[0][4] = [...cold];
  live.lines[1][4] = [...hot];
  await run('2026-03-25', '2026-03-26T10:59:59Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 1, 1, 0]);
  assert.deepEqual(db.row().box_in_progress?.x?.[0], frozen.x?.[0]);
  assert.deepEqual(db.row().box_in_progress?.d[0], frozen.d[0]);
  assert.deepEqual(db.row().box_in_progress?.h.days?.[0], frozen.h.days?.[0]);

  // Finalization still occurs on the next Monday's bracket day, and both
  // persisted timestamps use that run's historical scoring instant.
  await run('2026-03-30', '2026-03-31T10:59:59Z');
  assert.equal(db.row().status, 'final');
  assert.equal(db.row().locked_at, '2026-03-31T10:59:59.000Z');
  assert.equal(db.row().computed_at, db.row().locked_at);
});

test('normal writes retain database time and explicit offsets normalize to UTC', async () => {
  const db = database();
  const empty = { results: [], fills: [], decisions: [], boxFills: [] };
  await writeSeason(db.client, season.season_key, empty, true);
  assert.equal(db.writes[0].values[3], null, 'omitted effectiveAt must preserve database now()');
  await writeSeason(db.client, season.season_key, empty, true, { effectiveAt: '2026-03-24T03:59:59-07:00' });
  assert.equal(db.writes[1].values[3], '2026-03-24T10:59:59.000Z');
});

test('clock validation rejects a mismatched bracket day before any database work', async () => {
  const pool = { query: () => assert.fail('invalid clock reached the database') } as unknown as Pool;
  assert.equal(bracketDay(Date.parse('2026-03-24T10:59:59Z')), '2026-03-23');
  assert.equal(bracketDay(Date.parse('2026-03-24T11:00:00Z')), '2026-03-24');
  await assert.rejects(runSeason(pool, season, '2026-03-23', {
    base: 'https://replay.invalid', effectiveAt: '2026-03-24T11:00:00Z',
  }), /effectiveAt falls on bracket day 2026-03-24, not asof 2026-03-23/);
  for (const effectiveAt of ['2026-03-24T10:59:59', '2026-03-24', 'invalid']) {
    await assert.rejects(runSeason(pool, season, '2026-03-23', { base: 'https://replay.invalid', effectiveAt }), /explicit timezone/);
  }
});

// April 2026 regression: MLB's same gamePk moved from Tuesday to Thursday
// after Tuesday's result was frozen. The Thursday game is a separate loss.
test('a moved final club game is credited exactly once after the daily lock, including final ninth inning', async () => {
  const live = feed();
  live.lines = [];
  live.clubs = { H: [[1, '820363', 1, 3]], A: [[1, '820363', 0, -3]] };
  const request: typeof fetch = async () => new Response(JSON.stringify(live));
  const db = database();
  const run = (day: string, effectiveAt: string) => runSeason(db.pool, season, day, { base: 'https://replay.invalid', effectiveAt, request });
  await run('2026-03-25', '2026-03-25T11:00:00Z');
  const locked = structuredClone(db.row().box_in_progress!);
  assert.deepEqual(locked.h.days?.[1][0][8], [1, 0]);
  assert.deepEqual(locked.h.clubGames?.YAT000001[1], [['820363', 1, 3]]);
  live.clubs = { H: [[3, '820363', 1, 3], [3, '820369', 0, -1]], A: [[3, '820363', 0, -3], [3, '820369', 1, 1], [3, 'other', 0, -2]] };
  await run('2026-03-27', '2026-03-27T11:00:00Z');
  const box = db.row().box_in_progress!;
  assert.deepEqual(box.h.days?.[1], locked.h.days?.[1]);
  assert.deepEqual(box.h.days?.[3][0][8], [0, 1]);
  assert.deepEqual(box.h.p[0][8], [1, 1]);
  assert.deepEqual(box.h.wl, [1, 1]);
  assert.equal(box.h.rd, 2);
  assert.deepEqual(box.a.wl, [1, 2]);
  assert.equal(box.a.rd, -4);
  assert.deepEqual(box.h.clubGames?.YAT000001[3], [['820369', 0, -1]]);
  await run('2026-03-30', '2026-03-30T11:00:00Z');
  assert.deepEqual(db.row().box_in_progress?.h.wl, [1, 1]);
  assert.deepEqual(db.row().box_in_progress?.h.days?.[1][0][8], [1, 0]);
  assert.deepEqual(db.row().innings?.slice(16, 18), [1, 0]);
  assert.equal(db.row().winner_hsid, 1);
});


// The April 8 checkpoint was produced before PR #907: the frozen daily
// ledgers are intact but have no credited game IDs. Simulate the same
// situation via real production writes, stripping only the newer metadata
// from the captured legacy box. No live DB or network is used.
async function legacyAprilFixture() {
  const actual: Live = {
    asOf: '2026-04-08', roster: {'1': [['YAT066037','Jeremy Rodriguez','SINGLE-A',0,'St. Lucie Mets']], '2': [['YAT167043','Away alum','SINGLE-A',0,'Dunedin Blue Jays']]},
    lines: [], clubs: {}, games: {},
  };
  const oldDb = database({...initial, game_id: 21, week: 3});
  const captures: Record<string, any> = {};
  const dates = ['2026-04-06','2026-04-07','2026-04-08'];
  const next = ['2026-04-07','2026-04-08','2026-04-09'];
  for (let i = 0; i < dates.length; i++) {
    if (i === 1) actual.clubs = {'St. Lucie Mets': [[15,'820363',1,3]], 'Dunedin Blue Jays': [[15,'820363',0,-3]]};
    await runSeason(oldDb.pool, season, next[i], {base:'https://replay.invalid',effectiveAt:next[i]+'T11:00:00Z',request:async()=>Response.json(actual)});
    const saved = structuredClone(oldDb.row());
    delete saved.box_in_progress!.h.clubGames;
    delete saved.box_in_progress!.a.clubGames;
    const {box_in_progress: box, ...other} = saved;
    const stored = [{...other, box}];
    const live = structuredClone(actual);
    const source_snapshot = {start:season.opening_day,weeks:3,branch:'br-archive',endpoint:'ep-archive.example',commit:'verified-original',fieldHash:'verified-field',live};
    captures[dates[i]] = {report_date:dates[i],branch_id:'br-archive',effective_at:next[i]+'T11:00:00Z',phase:'awaiting_review',source_snapshot,
      stored_results:stored,evidence:{branch:'br-archive',endpoint:source_snapshot.endpoint,reportDate:dates[i],cutoffAt:next[i]+'T11:00:00Z',
        commit:source_snapshot.commit,fieldHash:source_snapshot.fieldHash,sourceHash:clubArchiveHash(live),storedHash:clubArchiveHash(stored),ingestion:{complete:true}}};
  }
  const legacy = structuredClone(oldDb.row());
  delete legacy.box_in_progress!.h.clubGames;
  delete legacy.box_in_progress!.a.clubGames;
  const current: Live = {...structuredClone(actual),asOf:'2026-04-09',clubs:{
    'St. Lucie Mets': [[17,'820363',1,3],[17,'820369',0,-1]],
    'Dunedin Blue Jays': [[17,'820363',0,-3],[17,'820369',1,1]],
  }};
  return { legacy, captures, current };
}

test('legacy April 8 box recovers the exact Tuesday identity from its archived cutoff before scoring April 9', async () => {
  const {legacy,captures,current}=await legacyAprilFixture();
  const untouched=structuredClone(legacy);
  const archiveBefore=structuredClone(captures);
  const db=database(legacy,captures);
  const run=(day:string,cutoff:string)=>runSeason(db.pool,season,day,{base:'https://replay.invalid',effectiveAt:cutoff,request:async()=>Response.json(current)});
  await run('2026-04-09','2026-04-10T10:59:59Z');
  const box=db.row().box_in_progress!;
  assert.deepEqual(db.archiveReads,['2026-04-06','2026-04-07','2026-04-08']);
  assert.deepEqual(box.h.days?.slice(0,3),untouched.box_in_progress!.h.days?.slice(0,3));
  assert.deepEqual(box.a.days?.slice(0,3),untouched.box_in_progress!.a.days?.slice(0,3));
  assert.deepEqual(box.h.clubGames?.YAT066037[1],[['820363',1,3]]);
  assert.deepEqual(box.h.clubGames?.YAT066037[3],[['820369',0,-1]]);
  assert.deepEqual(box.h.days?.[3][0][8],[0,1]);assert.deepEqual(box.a.days?.[3][0][8],[1,0]);
  assert.deepEqual(box.h.wl,[1,1]);assert.deepEqual(box.a.wl,[1,1]);
  assert.equal(box.h.rd,2);assert.equal(box.a.rd,-2);
  // The normal 4 a.m. boundary write reuses the recovered IDs, not archives.
  await run('2026-04-10','2026-04-10T11:00:00Z');
  assert.deepEqual(db.archiveReads,['2026-04-06','2026-04-07','2026-04-08']);
  assert.deepEqual(db.row().box_in_progress!.h.days?.slice(0,3),untouched.box_in_progress!.h.days?.slice(0,3));
  assert.deepEqual(legacy,untouched);assert.deepEqual(captures,archiveBefore);
});

test('a matching present-day W-L is not proof of the original identity; fail closed without a valid archived day', async () => {
  const {legacy,captures,current}=await legacyAprilFixture();
  current.clubs['St. Lucie Mets'].push([15,'replacement-with-same-win',1,3]);
  const cases = [
    {...captures,'2026-04-07':undefined},
    {...captures,'2026-04-07':{...captures['2026-04-07'],evidence:{...captures['2026-04-07'].evidence,sourceHash:'tampered'}}},
    {...captures,'2026-04-07':{...captures['2026-04-07'],effective_at:'2026-04-08T11:01:00Z'}},
  ];
  for(const archive of cases) {
    const db=database(legacy,archive);
    await assert.rejects(runSeason(db.pool,season,'2026-04-09',{base:'https://replay.invalid',effectiveAt:'2026-04-10T10:59:59Z',request:async()=>Response.json(current)}),/Locked club game identity cannot be reconciled/);
    assert.equal(db.writes.length,0);assert.deepEqual(db.row(),legacy);
  }
});

// April 16 2026 regression: Jeremiah Boyd joined his school's roster mid-week
// (no record on the locked Monday-Wednesday days). Locked days stay exactly as
// published; he counts from the day he appears; the run never stops on him.
test('a player who joins mid-week gets nothing on locked days and counts from his first day', async () => {
  const live = feed();
  live.lines = [];
  live.clubs = { H: [[0, 'g0', 1, 2]], A: [[0, 'g0', 0, -2]] };
  const request: typeof fetch = async () => new Response(JSON.stringify(live));
  const db = database();
  const run = (day: string, effectiveAt: string) => runSeason(db.pool, season, day, { base: 'https://replay.invalid', effectiveAt, request });
  await run('2026-03-25', '2026-03-25T11:00:00Z');
  const locked = structuredClone(db.row().box_in_progress!);
  live.roster['1'].push(['YAT000003', 'New arrival', 'TRIPLE-A', 0, 'R']);
  live.clubs.R = [[0, 'r0', 1, 5], [3, 'r3', 1, 4]];
  await run('2026-03-27', '2026-03-27T11:00:00Z');
  const box = db.row().box_in_progress!;
  for (const d of [0, 1, 2]) {
    // Everyone already on the locked day is unchanged; the new arrival shows only as an empty 0-0 row.
    assert.deepEqual(box.h.days?.[d].filter(r => r[0] !== 'YAT000003'), locked.h.days?.[d]);
    const added = box.h.days?.[d].find(r => r[0] === 'YAT000003');
    assert.ok(added, 'every day tab lists the whole roster');
    assert.deepEqual(added![8], [0, 0]);
  }
  assert.deepEqual(box.h.clubGames?.YAT000003?.slice(0, 3), [[], [], []]);
  assert.deepEqual(box.h.clubGames?.YAT000003?.[3], [['r3', 1, 4]]);
  assert.deepEqual(box.h.wl, [2, 0]);
});

 
// Game 3679 (HSID 13070 vs 6289), April 15-17: the captured roster
// inserted Boyd between DeVos and Rhyne. Young's two frozen club wins must
// never be attributed to Baucom by shifting the daily ledger positions.
test('game 3679: midweek arrival preserves frozen rows in weekly YAT ID order', async () => {
  const live = feed();
  live.roster = {
    '13070': [
      ['YAT112861','Nolan DeVos','DOUBLE-A',1,'Corpus Christi Hooks'],
      ['YAT168099','Davis Rhyne','NCAA-D1',1,'United States Air Force Academy'],
      ['YAT175000','Gavin Baucom','NJCAA',0,'Louisburg College'],
      ['YAT183426','Ethan Young','SINGLE-A',1,'Palm Beach Cardinals'],
    ],
    '6289': [['YAT000002','Away batter','MLB',0,'A']],
  };
  live.lines = [['13070','YAT183426',23,'p',[12,0,0,1,6,4,2,2],'820424','Palm Beach Cardinals',1,'A']];
  live.clubs = {'Palm Beach Cardinals': [[22,'820423',1,3],[23,'820424',1,2]]};
  // buildIndex gets the registered field from bracket rows, not total-runs rows.
  // An unplayed future bracket row supplies the field without writing another
  // scored game into this single-game persistence fixture.
  const db = database({...initial,stage:'total_runs',region:0,round:2,series_no:199,game_id:3679,week:4,home_hsid:13070,away_hsid:6289}, {}, [
    {...initial,game_id:99999,week:5,round:2,home_hsid:13070,away_hsid:6289},
  ]);
  const run = (asof:string) => runSeason(db.pool,season,asof,{base:'https://replay.invalid',effectiveAt:asof+'T11:00:00Z',request:async()=>Response.json(live)});
  await run('2026-04-16');
  const before = structuredClone(db.row().box_in_progress!.h);
  live.roster['13070'].splice(1,0,['YAT105152','Jeremiah Boyd','',0,'',-1,24]);
  live.lines.push(['13070','YAT105152',24,'b',[4,3,1,0,0,0,1,0,0],'815169','Reno Aces',1,'AAA']);
  live.clubs['Palm Beach Cardinals'].push([24,'820425',0,-2]);
  await run('2026-04-17');
  live.clubs['Palm Beach Cardinals'].push([25,'820429',1,3]);
  await run('2026-04-18');
  const side = db.row().box_in_progress!.h;
  const ids = side.p.map(r=>r[0]);
  assert.equal(ids[1],'YAT105152');
  for (const day of side.days!) assert.deepEqual(day.map(r=>r[0]),ids);
  for (let d=0;d<3;d++) {
    assert.deepEqual(side.days![d].filter(r=>r[0]!=='YAT105152'),before.days![d]);
    assert.deepEqual(side.days![d][1][8],[0,0]);
  }
  for (const [id,expected] of [['YAT175000',[0,0]],['YAT183426',[3,1]]] as const) {
    const i=ids.indexOf(id);
    assert.deepEqual(side.p[i][8],expected);
    assert.deepEqual(side.days!.reduce((wl,day)=>[wl[0]+(day[i][8]?.[0]??0),wl[1]+(day[i][8]?.[1]??0)],[0,0]),expected);
  }
});

 
// Orange Lutheran vs Northview, March 30-April 5, 2026 (game 2).
// Actual roster dates and game IDs from the saved replay and player Game Log.
test('Tarlow: historical club membership on non-appearance days, not July current club', async () => {
  const id = 'YAT117822';
  const stl = 'St. Louis Cardinals', sp = 'Springfield Cardinals', mem = 'Memphis Redbirds';
  const live: Live = {
    asOf: '2026-04-05',
    roster: {'8805': [[id, 'Graysen Tarlow', 'TRIPLE-A', 0, mem]], '1641': []},
    lines: [['8805',id,12,'b',[5,3,0,0,0,0,1,1,0],'817666',sp,1,'AA']],
    clubStints: {[id]: [[-56,11,stl],[12,123,sp],[124,null,mem]]},
    clubs: {
      [stl]: [[7,'823080',0,-2],[8,'823077',1,3],[9,'823078',1,1],[11,'824299',0,-4],[12,'824295',0,-5],[13,'824296',1,2]],
      [sp]: [[11,'817671',1,9],[12,'817666',1,3],[13,'817670',1,2]],
      [mem]: [[8,'816225',1,5],[9,'816227',1,1],[10,'816228',1,4],[11,'816226',1,1],[13,'816220',1,4],[13,'816217',0,-8]],
    },
  };
  const db = database({...initial,game_id:2,game_no:2,week:2,home_hsid:8805,away_hsid:1641});
  const request: typeof fetch = async () => Response.json(live);
  for (const day of ['2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05']) {
    const next = new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    await runSeason(db.pool,season,day,{base:'https://replay.invalid',effectiveAt:next+'T10:59:59Z',request});
  }
  await runSeason(db.pool,season,'2026-04-06',{base:'https://replay.invalid',effectiveAt:'2026-04-06T11:00:00Z',request});
  const box = db.row().box_in_progress!.h;
  assert.deepEqual(box.p[0][8],[4,2]);
  assert.deepEqual(box.days!.map(rows=>rows[0][8]),[[0,1],[1,0],[1,0],[0,0],[0,1],[1,0],[1,0]]);
  assert.deepEqual(box.clubGames?.[id].flat().map(g=>g[0]),['823080','823077','823078','824299','817666','817670']);
  assert.deepEqual(box.wl,[4,2]);
  assert.equal(box.rd,3);
});
