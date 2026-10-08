import type {Prisma} from '@prisma/client';
// ownerUserId records the originating account; only the active tutor can manage a dependent.
export function managesPatient(patient:{ownerUserId:string;tutorUserId?:string|null;tutorManaged?:boolean;data?:unknown},userId:string){
 const self=(patient.data as any)?.relationshipToOwner==='self';
 return patient.tutorUserId===userId || (patient.ownerUserId===userId && (!patient.tutorManaged||self));
}
export function managedPatientWhere(userId:string):Prisma.PatientWhereInput {
 return {archived:false,OR:[{tutorUserId:userId},{ownerUserId:userId,OR:[{tutorManaged:false},{data:{path:['relationshipToOwner'],equals:'self'}}]}]};
}
export function personalOwnerIds(patient:{ownerUserId:string;tutorUserId?:string|null;tutorManaged?:boolean;data?:unknown}){
 return [...new Set([...(managesPatient(patient,patient.ownerUserId)?[patient.ownerUserId]:[]),...(patient.tutorUserId?[patient.tutorUserId]:[])])];
}
