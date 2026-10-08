// CI fixture cleanup only. Uses explicit test account IDs, never a production sweep.
export async function cleanupTutorshipFixtures(db,userIds){
 const patients=await db.patient.findMany({where:{ownerUserId:{in:userIds}},select:{id:true}});const ids=patients.map(p=>p.id);
 const requests=await db.tutorRequest.findMany({where:{OR:[{patientId:{in:ids}},{requesterUserId:{in:userIds}}]},select:{id:true}});
 await db.tutorDocument.deleteMany({where:{requestId:{in:requests.map(r=>r.id)}}});
 await db.tutorRequest.deleteMany({where:{id:{in:requests.map(r=>r.id)}}});
 await db.tutorHistory.deleteMany({where:{patientId:{in:ids}}});
 await db.patientIdentityDocument.deleteMany({where:{patientId:{in:ids}}});
 await db.personIdentity.deleteMany({where:{patientId:{in:ids}}});
 await db.patient.updateMany({where:{tutorUserId:{in:userIds}},data:{tutorUserId:null}});
}
