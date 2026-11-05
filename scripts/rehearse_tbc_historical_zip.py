#!/usr/bin/env python3
"""Validate Gary's ZIP; optionally stage with COPY on an isolated Neon clone.

No database connection in default mode. --apply requires a non-production
branch label AND explicit exact Neon host. Does not modify live player/cards.
Run the matching isolated migration before --apply.
"""
import argparse,csv,hashlib,io,json,os,uuid,zipfile
from pathlib import Path

HASH='03dc689f07efed73d8410bd12c9722bbf3f5210ccaede9c11637be48999cb31b'
SPEC={
 'batting': ('deluca_deluca_batting_history.csv',501243,501242,46),
 'pitching': ('deluca_deluca_pitching_history.csv',438097,438097,40)
}
RUN_ID=uuid.uuid5(uuid.NAMESPACE_URL,'yatstats-historical-archive:'+HASH)

def sha_file(path):
 h=hashlib.sha256()
 with open(path,'rb') as src:
  for buf in iter(lambda:src.read(4*1024*1024),b''): h.update(buf)
 return h.hexdigest()

def rows(archive,kind):
 filename,_,_,columns=SPEC[kind]
 with archive.open(filename) as raw:
  reader=csv.reader(io.TextIOWrapper(raw,encoding='utf-8-sig',errors='replace',newline=''))
  head=next(reader)
  if len(head)!=columns or head[:3]!=['teamid','playerid','year']:
   raise ValueError(kind+' schema/header mismatch')
  for num,row in enumerate(reader,2):
   if len(row)!=columns or not row[0].strip() or not row[1].strip():
    yield {'invalid':(num,str(len(row))+' CSV fields; expected '+str(columns),repr(row)[:500])}
    continue
   payload=json.dumps(dict(zip(head,row)),ensure_ascii=False,separators=(',',':'))
   year=row[2].strip()
   yield {'line':num,'playerid':row[1].strip(),'teamid':row[0].strip(),
          'year':int(year) if year.isdigit() else None,'payload':payload}

def inspect_zip(path):
 digest=sha_file(path)
 if digest!=HASH:raise RuntimeError('STOP: source ZIP hash mismatch')
 result={'sha256':digest,'run_id':str(RUN_ID),'files':{},'exceptions':[]}
 with zipfile.ZipFile(path) as z:
  for kind,(_,physical_expected,valid_expected,_) in SPEC.items():
   physical=valid=season2026=0
   for r in rows(z,kind):
    physical+=1
    if 'invalid' in r:
     num,reason,sample=r['invalid']
     result['exceptions'].append({'source':kind,'line':num,'reason':reason,'sample':sample})
    else:
     valid+=1
     season2026+=r['year']==2026
   if (physical,valid)!=(physical_expected,valid_expected):
    raise RuntimeError('STOP: '+kind+' row counts differ from verified archive')
   result['files'][kind]={'physical':physical,'valid':valid,'2026_rows':season2026}
 return result

def import_to_isolated(path,report):
 branch=os.environ.get('NEON_TARGET_BRANCH_LABEL','')
 expected_host=os.environ.get('NEON_ISOLATED_DB_HOST','')
 url=os.environ.get('DATABASE_URL','')
 if not branch.startswith(('test-','preview-','rehearsal-')) or 'prod' in branch.lower():
  raise RuntimeError('STOP: isolated branch label required')
 if not url or not expected_host.endswith('.neon.tech'):
  raise RuntimeError('STOP: isolated Neon host required')
 from urllib.parse import urlparse
 if urlparse(url).hostname!=expected_host:
  raise RuntimeError('STOP: DATABASE_URL does not match explicitly named test DB')
 try:import psycopg
 except ImportError as exc:raise RuntimeError('pip install psycopg[binary]') from exc
 with psycopg.connect(url,connect_timeout=15) as conn:
  with conn.cursor() as cur:
   cur.execute("SELECT count(*) FROM public.tbc_historical_archive_runs WHERE source_sha256=%s",(HASH,))
   if cur.fetchone()[0]:raise RuntimeError('STOP: immutable archive run already exists')
   cur.execute("SET LOCAL lock_timeout='5s'")
   cur.execute("INSERT INTO public.tbc_historical_archive_runs(run_id,source_sha256,status,notes) VALUES (%s,%s,'loading','Test-only source archive')",(str(RUN_ID),HASH))
   with zipfile.ZipFile(path) as z:
    for kind in ('batting','pitching'):
     sql=f'COPY public.tbc_historical_{kind}_stage (run_id,source_row,playerid,teamid,season_year,payload) FROM STDIN'
     copied=0
     with cur.copy(sql) as cp:
      for row in rows(z,kind):
       if 'invalid' in row:continue
       cp.write_row((str(RUN_ID),row['line'],row['playerid'],row['teamid'],row['year'],row['payload']))
       copied+=1
     if copied!=SPEC[kind][2]:raise RuntimeError('STOP: COPY count mismatch')
    for ex in report['exceptions']:
     cur.execute("INSERT INTO public.tbc_historical_archive_quarantine(run_id,source_kind,source_row,reason,raw_excerpt) VALUES (%s,%s,%s,%s,%s)",(str(RUN_ID),ex['source'],ex['line'],ex['reason'],ex['sample']))
   cur.execute("""SELECT
     (SELECT count(*) FROM public.tbc_historical_batting_stage WHERE run_id=%s),
     (SELECT count(*) FROM public.tbc_historical_pitching_stage WHERE run_id=%s),
     (SELECT count(*) FROM public.tbc_historical_archive_quarantine WHERE run_id=%s)""",(str(RUN_ID),)*3)
   counts=cur.fetchone()
   if tuple(counts)!=(501242,438097,1):raise RuntimeError('STOP: verification mismatch; rollback')
   cur.execute("""UPDATE public.tbc_historical_archive_runs
     SET status='verified',batting_rows=%s,pitching_rows=%s,rejected_rows=%s,imported_at=now()
     WHERE run_id=%s""",(*counts,str(RUN_ID)))
  conn.commit()
 print('ISOLATED VERIFIED: 939339 rows staged, 1 quarantined, zero canonical changes')

if __name__=='__main__':
 p=argparse.ArgumentParser()
 p.add_argument('zipfile',type=Path)
 p.add_argument('--apply',action='store_true')
 p.add_argument('--report',type=Path)
 a=p.parse_args()
 result=inspect_zip(a.zipfile)
 report=json.dumps(result,indent=2)
 print(report)
 if a.report:a.report.write_text(report+'\n')
 if a.apply:import_to_isolated(a.zipfile,result)
