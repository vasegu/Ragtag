import { z } from 'zod';
import { externalJson } from './http';
import type { Context, Location } from './contracts';
import { db } from './db';


function distance(lat:number,lon:number,a:number,b:number){
  const r=Math.PI/180,x=(a-lat)*r,y=(b-lon)*r;
  return Math.round(6371000*2*Math.atan2(Math.sqrt(Math.sin(x/2)**2+Math.cos(lat*r)*Math.cos(a*r)*Math.sin(y/2)**2),Math.sqrt(1-(Math.sin(x/2)**2+Math.cos(lat*r)*Math.cos(a*r)*Math.sin(y/2)**2))));
}
export async function nearby(location:Location|null):Promise<Context>{
  const base:{places:Context['places'];ownershipEvidence:Context['ownershipEvidence'];fetchedAt:string;source:string;collisions:'Not connected'}={places:[],ownershipEvidence:[],fetchedAt:new Date().toISOString(),source:'OpenStreetMap / Overpass',collisions:'Not connected'};
  if(!location)return {...base,status:'location_needed'};
  try{
    const {data}=await db().from('reports').select('id,category,council').gte('lat',location.lat-.002).lte('lat',location.lat+.002).gte('lon',location.lon-.003).lte('lon',location.lon+.003).limit(6);
    base.ownershipEvidence=(data??[]).flatMap(row=>typeof row.council==='string'&&row.council.trim()?[{reportId:String(row.id),category:String(row.category),reportedRecipient:row.council}]:[]);
  }catch{/* Historical recipients are optional evidence, never verified ownership. */}
  // Nearby places from the harvested `pois` table (OpenStreetMap, loaded by the harvest scripts):
  // a local query instead of a live Overpass call, so assessments stay fast and reliable.
  try{
    const {data,error}=await db().from('pois').select('osm_type,osm_id,category,name,lat,lon')
      .gte('lat',location.lat-.0036).lte('lat',location.lat+.0036).gte('lon',location.lon-.0058).lte('lon',location.lon+.0058).limit(50);
    if(error)throw error;
    const places=(data??[]).flatMap(p=>typeof p.lat==='number'&&typeof p.lon==='number'?[{name:p.name??String(p.category).replace(/_/g,' '),type:String(p.category).replace(/_/g,' '),distance:distance(location.lat,location.lon,p.lat,p.lon),osmId:`${p.osm_type}/${p.osm_id}`}]:[])
      .filter(p=>p.distance<=400).sort((a,b)=>a.distance-b.distance).slice(0,20);
    return {...base,source:'OpenStreetMap points of interest (harvested)',status:'available',places};
  }catch{return {...base,status:'unavailable'};}
}

const geocoded=z.object({lat:z.string(),lon:z.string(),display_name:z.string(),address:z.record(z.string(),z.string()).default({})});
export async function searchLocation(q:string):Promise<Location[]>{
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q,format:'jsonv2',addressdetails:'1',limit:'5',countrycodes:'gb',viewbox:'-0.13,51.61,0.05,51.49'}).toString();
  const json=await externalJson(url.toString(),{headers:{'User-Agent':'HackneyStreetBrain/0.1 (Hackathon council reporting prototype)','Accept-Language':'en-GB'},next:{revalidate:3600}},10000);
  return z.array(geocoded).parse(json).map(r=>({label:r.display_name,lat:Number(r.lat),lon:Number(r.lon),borough:r.address.borough??r.address.city_district??r.address.county??'',source:'OpenStreetMap / Nominatim'}));
}
