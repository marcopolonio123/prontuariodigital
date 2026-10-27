import type { Prisma } from '@prisma/client';
type Db = Prisma.TransactionClient;
const time = (minutes: number) => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export const minute = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5));
export async function lockDirectory(tx: Db, userId: string) {
  // Serialize location edits, agenda changes and encounter assignment per owner.
  await tx.user.update({where:{id:userId},data:{updatedAt:new Date()},select:{id:true}});
}
export async function directory(db: Db, userId: string) {
  const rows = await db.professionalLocation.findMany({where:{userId},include:{location:true,availability:{orderBy:[{weekday:'asc'},{startMinute:'asc'}]}},orderBy:{createdAt:'asc'}});
  return rows.map(row => ({id:row.id,name:row.location.name,address:row.location.formattedAddress??'',active:row.active,
    fullAddress:row.location.addressLine1 ? {postalCode:row.location.postalCode??'',street:row.location.addressLine1,number:row.location.number??'',complement:row.location.addressLine2??'',neighborhood:row.location.neighborhood??'',city:row.location.city??'',state:row.location.state??'',country:row.location.country} : null,
    availability:row.availability.map(slot=>({weekday:slot.weekday,start:time(slot.startMinute),end:time(slot.endMinute)}))}));
}
export async function locationAssociated(db: Db, id: string) {
  const [events, appointments] = await Promise.all([db.healthEvent.count({where:{locationId:id}}),db.professionalAppointment.count({where:{locationId:id}})]);
  return events>0||appointments>0;
}
export async function encounterLocation(tx: Db, userId: string, body: {locationId?:unknown;organizationName?:unknown;homeVisit?:unknown;onlineVisit?:unknown}, existingId?: string | null) {
  await lockDirectory(tx,userId);
  if(body.homeVisit===true||body.onlineVisit===true) return null;
  const name=String(body.organizationName??'').trim(), id=String(body.locationId??'');
  if(body.locationId!==undefined && !id) return null; // Explicit "Other".
  const place=await tx.professionalLocation.findFirst({where:{userId,...(id?{id}:{normalizedName:name.toLowerCase()})},include:{location:true}});
  if(id&&!place)throw new Error('LOCATION');
  if(!place)return null; // Legacy/free text location remains a snapshot.
  if(!place.active && place.id!==existingId)throw new Error('LOCATION');
  return place.location;
}

export async function patientEncounterLocation(tx: Db, body: {locationId?:unknown;payload?:any;practitionerName?:unknown;council?:unknown;registration?:unknown;registrationRegion?:unknown}, existingId?: string|null) {
  if(body.payload?.homeVisit===true||body.payload?.onlineVisit===true)return null;
  const id=String(body.locationId??'');
  if(!id)return null;
  const owner=await tx.professionalLocation.findUnique({where:{id},select:{userId:true}});
  if(!owner)throw new Error('LOCATION');
  await lockDirectory(tx,owner.userId);
  const place=await tx.professionalLocation.findUnique({where:{id},include:{location:true,user:{select:{practitioner:{select:{name:true,active:true,verificationStatus:true,registrations:{include:{authority:true}}}}}}}});
  if(!place||!place.user.practitioner?.active||place.user.practitioner.verificationStatus!=='verified'||(!place.active&&id!==existingId))throw new Error('LOCATION');
  const practitioner=place.user.practitioner;
  const registration=String(body.registration??'').trim(), region=String(body.registrationRegion??'').trim().toUpperCase();
  if(registration&&region){
    const council=String(body.council??'').trim().toUpperCase();
    if(!practitioner.registrations.some(item=>item.status==='active'&&item.registration===registration&&item.region?.toUpperCase()===region&&(!council||item.authority.code.toUpperCase()===council)))throw new Error('LOCATION');
  }else if(body.practitionerName&&String(body.practitionerName).trim().toLowerCase()!==practitioner.name.trim().toLowerCase())throw new Error('LOCATION');
  return place.location;
}
