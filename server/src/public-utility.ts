import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import { administrator } from './professional-admin.js';
import { visiblePatientIds } from './v1.js';
interface UtilityRequest extends Request { userId?: string }
const router=Router();
function auth(req:UtilityRequest,res:Response,next:NextFunction){try{req.userId=(jwt.verify((req.headers.authorization??'').replace(/^Bearer /,''),process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me') as {uid:string}).uid;next()}catch{res.status(401).json({error:'Entre na sua conta para continuar.'})}}
const prefix='mydoctor-utility-v1:';
function metadata(detail:string|null){try{return detail?.startsWith(prefix)?JSON.parse(detail.slice(prefix.length)):null}catch{return null}}
router.post('/utility/usage',auth,async(req:UtilityRequest,res:Response)=>{
  const body=req.body??{};
  if(!['open','finger','finger_photo'].includes(body.method))return res.status(400).json({error:'Método inválido.'});
  const location=body.location;
  if(!location||!['obtained','denied','unavailable','timeout','error'].includes(location.status))return res.status(400).json({error:'Informe o resultado da localização.'});
  let geo:any={status:location.status};
  if(location.status==='obtained'){
    if(typeof location.latitude!=='number'||!Number.isFinite(location.latitude)||Math.abs(location.latitude)>90||typeof location.longitude!=='number'||!Number.isFinite(location.longitude)||Math.abs(location.longitude)>180||typeof location.accuracy!=='number'||!Number.isFinite(location.accuracy)||location.accuracy<0)return res.status(400).json({error:'Coordenadas inválidas.'});
    geo={status:'obtained',latitude:location.latitude,longitude:location.longitude,accuracy:location.accuracy,source:'browser'};
  }
  const actions=['camera_opened','camera_failed','photo_captured','photo_discarded','photo_failed'];
  if(body.method==='finger_photo'&&!actions.includes(body.action))return res.status(400).json({error:'Etapa de captura inválida.'});
  let diagnostic:any;
  if(body.method==='finger_photo'&&body.action==='photo_captured'){
    const d=body.diagnostic;
    if(!d||!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<1||d.height<1||d.width*d.height>24000000||typeof d.brightness!=='number'||!Number.isFinite(d.brightness)||d.brightness<0||d.brightness>255||typeof d.sharpness!=='number'||!Number.isFinite(d.sharpness)||d.sharpness<0||d.sharpness>10000000)return res.status(400).json({error:'Indicadores fotográficos inválidos.'});
    diagnostic={width:d.width,height:d.height,brightness:d.brightness,sharpness:d.sharpness,source:'client_photographic_check'};
  }
  const user=await prisma.user.findUnique({where:{id:req.userId!},select:{id:true,name:true}});
  if(!user)return res.status(401).json({error:'Conta não encontrada.'});
  // O cliente nunca determina pessoa, confiança ou resultado de reconhecimento.
  const log=await prisma.identificationLog.create({data:{method:body.method,byUserId:user.id,byName:user.name,result:body.method==='open'?'module_opened':body.method==='finger_photo'?body.action:'reader_not_configured',detail:prefix+JSON.stringify({location:geo,...(diagnostic?{diagnostic}:{}),...(body.method==='finger_photo'?{biometricComparison:'not_performed'}:{})})}});
  return res.status(201).json({id:log.id,at:log.at,result:log.result});
});
router.get('/utility/logs',auth,async(req:UtilityRequest,res:Response)=>{
  const admin=req.query.admin==='1';
  let where:any;
  if(admin){if(!(await administrator(req)).authorized)return res.status(403).json({error:'Acesso restrito à administração.'});where={}}
  else{
    const ids=await visiblePatientIds(req.userId!);
    const patientId=typeof req.query.patientId==='string'?req.query.patientId:'';
    if(patientId&&!ids.has(patientId))return res.status(403).json({error:'Sem acesso ao histórico desta pessoa.'});
    where=patientId?{patientId}:{byUserId:req.userId!};
  }
  const cursor=typeof req.query.cursor==='string'?req.query.cursor:undefined;
  const rows=await prisma.identificationLog.findMany({where,orderBy:[{at:'desc'},{id:'desc'}],take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const items=rows.slice(0,50).map(l=>({id:l.id,at:l.at,method:l.method,result:l.result,patientName:l.patientId?l.patientName:null,byName:l.byName,location:metadata(l.detail)?.location??{status:'legacy_not_recorded'},diagnostic:metadata(l.detail)?.diagnostic??null}));
  res.json({items,nextCursor:rows.length>50?items[items.length-1].id:null});
});
export default router;
