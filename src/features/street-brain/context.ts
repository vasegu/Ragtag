import { z } from 'zod';
import { externalJson } from './http';
import type { Context, Location } from './contracts';
import { db } from './db';

const osmElement=z.object({type:z.string(),id:z.number(),lat:z.number().optional(),lon:z.number().optional(),
  center:z.object({lat:z.number(),lon:z.number()}).optional(),tags:z.record(z.string(),z.string()).default({})});

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
  const query=`[out:json][timeout:8];(nwr(around:300,${location.lat},${location.lon})[amenity~"^(school|university|college)$"];nwr(around:300,${location.lat},${location.lon})[highway=bus_stop];nwr(around:300,${location.lat},${location.lon})[railway=station];);out center tags;`;
  try{
    const json=await externalJson('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}).toString()},10000);
    const parsed=z.object({elements:z.array(osmElement)}).parse(json);
    const places=parsed.elements.flatMap(e=>{
      const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;
      if(lat===undefined||lon===undefined)return [];
      const type=e.tags.amenity??(e.tags.highway==='bus_stop'?'Bus stop':'Station');
      return [{name:e.tags.name??type,type,distance:distance(location.lat,location.lon,lat,lon),osmId:`${e.type}/${e.id}`}];
    }).sort((a,b)=>a.distance-b.distance).slice(0,20);
    return {...base,status:'available',places};
  }catch{return {...base,status:'unavailable'};}
}

const geocoded=z.object({lat:z.string(),lon:z.string(),display_name:z.string(),address:z.record(z.string(),z.string()).default({})});
export async function searchLocation(q:string):Promise<Location[]>{
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q,format:'jsonv2',addressdetails:'1',limit:'5',countrycodes:'gb',viewbox:'-0.13,51.61,0.05,51.49'}).toString();
  const json=await externalJson(url.toString(),{headers:{'User-Agent':'HackneyStreetBrain/0.1 (Hackathon council reporting prototype)','Accept-Language':'en-GB'},next:{revalidate:3600}},10000);
  return z.array(geocoded).parse(json).map(r=>({label:r.display_name,lat:Number(r.lat),lon:Number(r.lon),borough:r.address.borough??r.address.city_district??r.address.county??'',source:'OpenStreetMap / Nominatim'}));
}
