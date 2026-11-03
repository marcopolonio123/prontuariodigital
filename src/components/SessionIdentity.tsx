import {UserRound} from 'lucide-react';
import {useEffect,useState} from 'react';
import {MyDoctorV1Api,type V1User,type PatientProfile} from '../lib/api-v1';

export default function SessionIdentity({api,canAdmin,activeProfile,onSwitch,knownAccount}:{api:MyDoctorV1Api;canAdmin:boolean;knownAccount?:V1User|null;activeProfile?:PatientProfile|null;onSwitch?:()=>void}) {
  const [loadedAccount,setAccount]=useState<V1User|null>(null);
  const [tutor,setTutor]=useState(false);
  const [staff,setStaff]=useState(false);
  useEffect(()=>{
    let current=true;
    setAccount(null);setTutor(false);setStaff(false);
    if(!knownAccount) void api.getAccount().then(value=>{if(current)setAccount(value)}).catch(()=>{});
    void api.listProfiles().then(values=>{if(current)setTutor(values.some(p=>p.relationship!=='self'&&p.isTutor===true))}).catch(()=>{});
    void api.getStaffAssignments().then(values=>{if(current)setStaff(values.some(link=>link.status==='active'))}).catch(()=>{});
    return ()=>{current=false};
  },[api]);
  const account=knownAccount??loadedAccount;
  const roles=['Usuário',...(account?.isHealthProfessional?['Profissional da saúde']:[]),...(tutor?['Responsável / tutor']:[]),...(staff?['Atendente / secretária']:[]),...(canAdmin?['Administrador']:[])];
  return <section aria-label="Usuário e perfis da sessão" className="mb-3 min-w-0 text-moss-800"><details className="rounded-xl border border-moss-200 bg-moss-50 p-2"><summary aria-label="Mostrar usuário e perfis" className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold"><UserRound aria-hidden="true" className="h-5 w-5 shrink-0"/><span>{activeProfile&&activeProfile.relationship!=='self'?activeProfile.name:'Minha conta'}</span></summary>
    <div className="min-w-0 flex-1 break-words text-sm">
      <p className="font-bold">Usuário: {account?.name??'Carregando…'}{account?.userNumber?` · Nº ${account.userNumber}`:''}</p>
      {account&&<p className="text-xs">{account.email}</p>}
      {account&&<div aria-label="Perfis do usuário" className="mt-2 flex flex-wrap gap-1.5">{roles.map(role=><span key={role} className="rounded-full border border-moss-200 bg-white px-2 py-1 text-xs font-semibold">{role}</span>)}</div>}
      {activeProfile&&activeProfile.relationship!=='self'&&<p className="mt-2 text-xs">Prontuário selecionado: <strong>{activeProfile.name}</strong> · Prontuário: {activeProfile.record}</p>}
      {activeProfile?.relationship==='self'&&<p className="mt-2 text-xs">Prontuário: {activeProfile.record}</p>}
    </div>
    {onSwitch&&<button type="button" className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold" onClick={onSwitch}>Trocar usuário / prontuário</button>}
  </details></section>;
}
