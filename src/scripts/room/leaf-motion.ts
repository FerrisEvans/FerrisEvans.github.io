/** Independent, bounded blade flex. Rest coordinates are never accumulated. */
export function leafMotion(time:number,phase:number,motion:boolean) {
  if(!motion)return {bend:0,twist:0};
  const wind=(Math.sin(time*.57+phase)*.53+Math.sin(time*.93+phase*1.71)*.29+Math.sin(time*.19-phase*.43)*.18);
  return {bend:wind*.33,twist:Math.sin(time*.71+phase*1.23)*.004};
}

export type LeafResponse={bend:number;velocity:number};
const frequency=(phase:number)=>7.8+Math.sin(phase*.83)*1.1;

/** Add a touch without resetting the blade or accumulating unlimited energy. */
export function nudgeLeaf(response:LeafResponse,phase:number){
  const w=frequency(phase),limit=Math.sqrt(Math.max(0,(w*1.2)**2-(w*response.bend)**2));
  response.velocity=Math.min(limit,response.velocity+w*(1+.15*Math.sin(phase*1.3)));
}

/** Exact damped spring step; different blades have different natural periods. */
export function advanceLeaf(response:LeafResponse,phase:number,dt:number){
  if(!response.bend&&!response.velocity)return;
  const w=frequency(phase),decay=3.2+.35*Math.cos(phase*.67),damped=Math.sqrt(w*w-decay*decay);
  const step=Math.max(0,Math.min(.1,dt)),fade=Math.exp(-decay*step),c=Math.cos(damped*step),s=Math.sin(damped*step);
  const {bend,velocity}=response;
  response.bend=fade*(bend*c+(velocity+decay*bend)/damped*s);
  response.velocity=fade*(velocity*c-(decay*velocity+w*w*bend)/damped*s);
  if(Math.abs(response.bend)<.00001&&Math.abs(response.velocity)<.00001)response.bend=response.velocity=0;
}
