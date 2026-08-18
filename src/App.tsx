import { useEffect, useState, type ReactNode } from 'react';
import type { AppState, ClinicalEntry, IdEvent, Patient, Route } from './lib/types';
import { emptyState, loadState, saveState, seedDemoState } from './lib/store';
import { Ecg, ToastProvider, useToast } from './components/ui';
import { IconFace, IconGear, IconSearch, IconUsers, LogoMark } from './components/icons';
import { IdentifyScreen } from './screens/IdentifyScreen';
import { PatientsScreen } from './screens/PatientsScreen';
import { RecordScreen } from './screens/RecordScreen';
import { MissingScreen } from './screens/MissingScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const NAV: Array<{ key: 'identify' | 'patients' | 'missing' | 'settings'; label: string; icon: ReactNode }> = [
  { key: 'identify', label: 'Identificação', icon: <IconFace size={18} /> },
  { key: 'patients', label: 'Pessoas & prontuários', icon: <IconUsers size={18} /> },
  { key: 'missing', label: 'Desaparecidos', icon: <IconSearch size={18} /> },
  { key: 'settings', label: 'Dados & privacidade', icon: <IconGear size={18} /> },
];

function Shell() {
  const toast = useToast();
  const [state, setState] = useState<AppState>(() => loadState());
  const [route, setRoute] = useState<Route>({ name: 'identify' });
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!saveState(state)) {
      toast('error', 'Não foi possível salvar no navegador — armazenamento cheio.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /* ------------------------------ ações ------------------------------ */
  const addPatient = (p: Patient) => setState((s) => ({ ...s, patients: [...s.patients, p] }));
  const updatePatient = (p: Patient) =>
    setState((s) => ({ ...s, patients: s.patients.map((x) => (x.id === p.id ? p : x)) }));
  const deletePatient = (id: string) =>
    setState((s) => ({ ...s, patients: s.patients.filter((x) => x.id !== id) }));
  const replacePatients = (patients: Patient[]) => setState((s) => ({ ...s, patients }));
  const addEntry = (pid: string, e: ClinicalEntry) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) => (p.id === pid ? { ...p, entries: [...p.entries, e] } : p)),
    }));
  const deleteEntry = (pid: string, eid: string) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) =>
        p.id === pid ? { ...p, entries: p.entries.filter((e) => e.id !== eid) } : p,
      ),
    }));
  const logEvent = (evt: IdEvent) => setState((s) => ({ ...s, log: [evt, ...s.log].slice(0, 60) }));
  const loadDemo = () => {
    setState((s) => seedDemoState(s));
    toast('success', 'Dados de exemplo carregados: 3 pacientes com retratos, digitais e histórico.');
  };
  const wipe = () => {
    setState(emptyState());
    toast('info', 'Base local apagada. O dispositivo voltou ao estado inicial.');
  };
  const importState = (s: AppState) => {
    setState(s);
    toast('success', `Backup importado: ${s.patients.length} paciente(s) restaurado(s).`);
  };

  const activeKey = route.name === 'record' ? 'patients' : route.name;
  const currentPatient =
    route.name === 'record' ? state.patients.find((p) => p.id === route.id) : undefined;
  const missingCount = state.patients.filter((p) => p.missing.active).length;

  const navButton = (item: (typeof NAV)[number], mobile: boolean) => {
    const active = activeKey === item.key;
    const badge =
      item.key === 'missing' && missingCount > 0 ? (
        <span
          className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold ${
            active || mobile ? 'bg-danger-500 text-white' : 'bg-danger-500/90 text-white'
          }`}
        >
          {missingCount}
        </span>
      ) : null;
    if (mobile) {
      return (
        <button
          key={item.key}
          onClick={() => setRoute({ name: item.key } as Route)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all ${
            active ? 'bg-moss-600 text-white' : 'text-pine-200 hover:bg-pine-800 hover:text-white'
          }`}
        >
          {item.icon}
          {item.label}
          {badge}
        </button>
      );
    }
    return (
      <button
        key={item.key}
        onClick={() => setRoute({ name: item.key } as Route)}
        className={`group relative flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold transition-all duration-150 ${
          active ? 'bg-pine-800 text-white' : 'text-pine-200 hover:bg-pine-850 hover:text-white'
        }`}
      >
        <span
          className={`absolute left-0 h-6 w-1 rounded-r-full bg-moss-400 transition-all duration-200 ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
          }`}
        />
        <span className={active ? 'text-moss-300' : 'text-pine-200/80 group-hover:text-moss-300'}>{item.icon}</span>
        {item.label}
        {badge}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* sidebar desktop */}
      <aside className="scanlines sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-pine-800 bg-pine-900 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-7">
          <span className="text-moss-300">
            <LogoMark size={34} />
          </span>
          <div>
            <p className="font-display text-[22px] font-bold leading-none tracking-tight text-white">Vitalis</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-pine-200/70">
              prontuário vitalício
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">{NAV.map((n) => navButton(n, false))}</nav>

        <div className="border-t border-pine-800 px-4 pb-5 pt-4">
          <Ecg className="h-9 w-full text-moss-400" />
          <p className="mt-2 font-mono text-[11px] text-pine-200/70">
            {state.patients.length} paciente{state.patients.length === 1 ? '' : 's'} · 100% local
          </p>
          <p className="mt-1 font-mono text-[10px] text-pine-200/40">v0.1.0 · MVP</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* topo mobile */}
        <header className="sticky top-0 z-40 border-b border-pine-800 bg-pine-900 lg:hidden">
          <div className="flex items-center gap-2.5 px-4 pt-3">
            <span className="text-moss-300">
              <LogoMark size={26} />
            </span>
            <p className="font-display text-lg font-bold leading-none text-white">Vitalis</p>
            <p className="ml-auto font-mono text-[10px] uppercase tracking-widest text-pine-200/60">
              {state.patients.length} pac.
            </p>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-3 py-2.5">{NAV.map((n) => navButton(n, true))}</nav>
        </header>

        <main className="dotted-ground">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
            {route.name === 'identify' && (
              <IdentifyScreen
                patients={state.patients}
                log={state.log}
                onPatientsUpdated={replacePatients}
                onLogEvent={logEvent}
                onOpenRecord={(id) => setRoute({ name: 'record', id })}
                onNewPatientWithPhoto={(photo) => {
                  setPendingPhoto(photo);
                  setRoute({ name: 'patients' });
                }}
                onGoPatients={() => setRoute({ name: 'patients' })}
              />
            )}
            {route.name === 'patients' && (
              <PatientsScreen
                patients={state.patients}
                onAdd={addPatient}
                onUpdate={updatePatient}
                onDelete={deletePatient}
                onOpenRecord={(id) => setRoute({ name: 'record', id })}
                onLoadDemo={loadDemo}
                seeded={state.seeded}
                pendingPhoto={pendingPhoto}
                consumePendingPhoto={() => setPendingPhoto(null)}
                pendingEditId={pendingEditId}
                consumePendingEdit={() => setPendingEditId(null)}
              />
            )}
            {route.name === 'record' && (
              <RecordScreen
                patient={currentPatient}
                onBack={() => setRoute({ name: 'patients' })}
                onEditPatient={(id) => {
                  setPendingEditId(id);
                  setRoute({ name: 'patients' });
                }}
                onAddEntry={addEntry}
                onDeleteEntry={deleteEntry}
              />
            )}
            {route.name === 'missing' && (
              <MissingScreen
                patients={state.patients}
                onUpdate={updatePatient}
                onOpenRecord={(id) => setRoute({ name: 'record', id })}
                onGoPatients={() => setRoute({ name: 'patients' })}
              />
            )}
            {route.name === 'settings' && (
              <SettingsScreen state={state} onImport={importState} onWipe={wipe} onLoadDemo={loadDemo} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
