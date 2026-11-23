/** Send personalized YAT?STATS pilot reports from the authenticated subdomain. */
export async function sendDailyPilotEmail(contactId:string,subject:string,html:string,options?:{format:'html'|'text';text:string}):Promise<boolean>{
 const key=process.env.GHL_API_KEY;
 if(!key) return false;
 try{
  const response=await fetch('https://services.leadconnectorhq.com/conversations/messages',{
   method:'POST',
   headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+key,Version:'2021-04-15'},
   // HighLevel's existing 2021-04-15 endpoint accepts `message` for text
   // content and `html` for HTML. Preserve the saved recipient format.
   body:JSON.stringify({type:'Email',contactId,subject,
    ...(options?.format==='text'?{message:options.text}:{html}),
    emailFrom:'YAT?STATS Daily <daily@yatstats.com>'}),
  });
  if(!response.ok) console.error('[fan-daily-pilot] ARMS email rejected',response.status,(await response.text()).slice(0,250));
  return response.ok;
 }catch(error){
  console.error('[fan-daily-pilot] ARMS email error',String(error).slice(0,200));
  return false;
 }
}
