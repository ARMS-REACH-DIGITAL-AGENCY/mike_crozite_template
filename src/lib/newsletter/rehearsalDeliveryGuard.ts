// The production mail transport can be reached by the existing rehearsal token
// only through the fixed isolated replay, never arbitrary destinations/content.
export const QA_ENDPOINT='ep-shy-forest-a4s3qsv6';
export const QA_BRANCH='br-falling-wind-a4ew8f1p';
export const LIVE_ENDPOINT='ep-tiny-bird-a44r67gp';
export const SEASON='2027';
export const REVIEW_BASE='https://mike-crozite-template-git-test-a81a21-arms-reach-digital-agency.vercel.app';
const assets='https://raw.githubusercontent.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/ccr-0ad18095-umgndf/nl';
export const REHEARSAL_IMAGE_ENV={
  NEWSLETTER_BOARD_IMAGE_BASE:assets+'/digest',
  NEWSLETTER_GAZETTE_BANNER_BASE:assets+'/gazette/banner',
  NEWSLETTER_TEAM_LOGO_BASE:assets+'/gazette/logo',
  NEWSLETTER_BRACKET_MADNESS_BASE:assets+'/gazette/bracket',
  NEWSLETTER_RUNS_LEADERBOARD_BASE:assets+'/gazette/leaders',
};
export function verifiedHost(connection:string,endpoint:string) {
  const url=new URL(connection);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname.split('.')[0].replace(/-pooler$/,'')!==endpoint)
    throw Error('wrong_database_endpoint');
  url.hostname=url.hostname.replace(new RegExp('^'+endpoint+'-pooler\\.'),endpoint+'.');
  return url.toString();
}
export function validReportDay(day:unknown):day is string {
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'2026-03-23'||day>'2026-11-15')return false;
  const t=Date.parse(day+'T00:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===day;
}
export type DeliveryRequest={action:'preflight'}|{action:'deliver';day:string;email:string};
export function parseDeliveryRequest(input:unknown):DeliveryRequest|null {
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const x=input as Record<string,unknown>;
  if(x.action==='preflight'&&Object.keys(x).length===1)return {action:'preflight'};
  if(x.action!=='deliver'||Object.keys(x).sort().join(',')!=='action,day,email'||!validReportDay(x.day)||
    typeof x.email!=='string'||x.email.length>320||!x.email||x.email!==x.email.trim().toLowerCase()||!/^\S+@\S+$/.test(x.email))return null;
  return {action:'deliver',day:x.day,email:x.email};
}
export function canDeliverDay(day:string,control:{enabled:boolean;first_report_date:string|null},checkpoint:{report_date:string;phase:string;branch_id:string;audit_status:string;effective_at:string}|undefined,approved:boolean) {
  if(!approved||!control.enabled||!validReportDay(control.first_report_date)||!validReportDay(day)||day<control.first_report_date||!checkpoint)return false;
  return checkpoint.report_date===day&&checkpoint.branch_id===QA_BRANCH&&checkpoint.phase==='awaiting_review'&&checkpoint.audit_status==='passed'
    && Date.parse(checkpoint.effective_at)===Date.parse(day+'T11:00:00Z')+86400000;
}
