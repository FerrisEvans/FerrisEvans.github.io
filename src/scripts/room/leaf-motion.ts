/** Independent, bounded blade flex. Rest coordinates are never accumulated. */
export function leafMotion(time:number,phase:number,motion:boolean) {
  if(!motion)return {bend:0,twist:0};
  const wind=(Math.sin(time*.57+phase)*.53+Math.sin(time*.93+phase*1.71)*.29+Math.sin(time*.19-phase*.43)*.18);
  return {bend:wind*.33,twist:Math.sin(time*.71+phase*1.23)*.004};
}
