'use client';
export type WhereYatProof = {displayName:string; city?:string; state?:string; occupation?:string; company?:string; website?:string; linkedin?:string; instagram?:string; facebook?:string; x?:string; story?:string; photoUrl?:string | null };
export default function WhereYatProofCard({ proof }: {proof:WhereYatProof}) {
 const rows = [['LOCATION',[proof.city,proof.state].filter(Boolean).join(', ')],['NOW',proof.occupation],['BUSINESS',proof.company]] as const;
 const socials = [['WEBSITE',proof.website],['LINKEDIN',proof.linkedin],['INSTAGRAM',proof.instagram],['FACEBOOK',proof.facebook],['X',proof.x]] as const;
 return <article style={{backgroundColor:'#c2b9ae',backgroundImage:'repeating-linear-gradient(168deg,transparent 0px,transparent 3px,rgba(255,255,255,0.05) 3px,rgba(255,255,255,0.05) 4px),repeating-linear-gradient(78deg,transparent 0px,transparent 5px,rgba(0,0,0,0.04) 5px,rgba(0,0,0,0.04) 6px)',color:'#1e160e',border:'2px solid rgba(30,22,14,0.65)',padding:16,fontFamily:'Archivo,Arial,sans-serif',borderRadius:2}}>
   <div style={{fontFamily:'Oswald,Arial Narrow,sans-serif',color:'#493526',letterSpacing:'.1em',fontSize:12}}>YAT?STATS / WHERE YAT NOW?</div>
   <div style={{display:'flex',gap:14,alignItems:'flex-start',marginTop:12}}>
     <div style={{flex:1,minWidth:0}}>
       <h3 style={{fontFamily:'Oswald,Arial Narrow,sans-serif',fontSize:27,lineHeight:1.1,margin:'0 0 10px'}}>{proof.displayName}</h3>
       {rows.map(([name,value])=>value&&<p key={name} style={{margin:'5px 0',fontSize:13}}><b>{name}:</b> {value}</p>)}
     </div>
     {proof.photoUrl?<img src={proof.photoUrl} alt="Alumni update photo preview" style={{width:'35%',maxWidth:150,objectFit:'contain'}}/>:
       <div style={{width:'35%',minHeight:150,border:'1px dashed #777',display:'grid',placeItems:'center',textAlign:'center',fontSize:12,color:'#463b32',padding:8}}>NO RECENT PHOTO ADDED</div>}
   </div>
   {proof.story&&<p style={{whiteSpace:'pre-wrap',lineHeight:1.6,fontSize:14}}>{proof.story}</p>}
   <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
     {socials.map(([name,value])=>value?<span key={name} style={{color:'#4c3724',fontWeight:700,fontSize:12,overflowWrap:'anywhere'}}>{name}: {value}</span>:null)}
   </div>
 </article>;
}
