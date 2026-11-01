'use client';
import {openContribute} from '@/lib/contribute';
export default function WhereYatDesignCTA({playerId,hsid,name,school}:{playerId:string;hsid:string;name:string;school:string}){
 return <div className="wyn-design-cta-wrap">
  <button type="button" className="wyn-design-card-cta" onClick={()=>openContribute({tab:'retired_card',player:{playerId,displayName:name,schoolId:hsid,schoolName:school}})}>
   <i className="ri-id-card-line" aria-hidden="true"/> NOW DESIGN YOUR FLIP CARD
  </button>
  <style>{`.wyn-design-cta-wrap{width:100%;min-width:0;padding:8px 0 12px;box-sizing:border-box}.wyn-design-card-cta{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:52px;background:#e5ba42;color:#111;border:1px solid #bc8a19;border-radius:6px;font:800 15px Oswald,Arial,sans-serif;cursor:pointer}.wyn-design-card-cta:focus-visible{outline:3px solid #e5ba42;outline-offset:3px}`}</style>
 </div>;
}
