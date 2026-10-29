import { useEffect, useRef, useState } from 'react';
import type { ReductionMode, ReductionPreference } from '../shared/reduction-contracts';

export function ReductionSettings() {
  const [preference, setPreference] = useState<ReductionPreference>({ mode: 'circle', status: 'default' });
  const [selection, setSelection] = useState<ReductionMode>('circle');
  const [pending, setPending] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false), locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    void window.neydra.getReductionPreference().then(result => {
      if (current) {
        const next = result.ok ? result.preference : { mode: 'circle' as const, status: 'read-failed' as const };
        setPreference(next); setSelection(next.mode);
      }
    }).catch(() => { if (current) setPreference({ mode: 'circle', status: 'read-failed' }); })
      .finally(() => { if (current) setPending(false); });
    return () => { current = false; mounted.current = false; };
  }, []);
  async function select(mode: ReductionMode) {
    if (locked.current) return;
    // A controlled radio must acknowledge the native change in this event,
    // before awaiting IPC/disk. The persisted value remains separate.
    locked.current = true; setSelection(mode); setPending(true); setSaving(true);
    try {
      const result = await window.neydra.setReductionMode({ mode });
      if (mounted.current) {
        const next = result.ok ? result.preference : { mode: 'circle' as const, status: 'save-failed' as const };
        setPreference(next); setSelection(next.mode);
      }
    } catch { if (mounted.current) { setPreference({ mode: 'circle', status: 'save-failed' }); setSelection('circle'); } }
    finally { locked.current = false; if (mounted.current) { setPending(false); setSaving(false); } }
  }
  const notice = pending ? saving ? 'Scelta provvisoria. Salvataggio in corso…' : 'Verifica della preferenza…' : preference.status === 'save-failed'
    ? 'Salvataggio non riuscito. Per questa sessione verrà usato Cerchio Mini; riprova per salvare la scelta.' : preference.status === 'read-failed'
      ? 'Preferenza non leggibile. Verrà usato Cerchio Mini.' : preference.status === 'saved'
        ? 'Preferenza salvata. Si applica alla prossima riduzione.' : 'Cerchio Mini è la scelta predefinita. Si applica alla prossima riduzione.';
  return <fieldset className="reduction-settings" disabled={pending} aria-describedby="reduction-notice">
    <legend>Modalità di riduzione</legend>
    <label><input type="radio" name="reduction-mode" checked={selection === 'circle'} onChange={() => { void select('circle'); }} /> Cerchio Mini — in basso a destra</label>
    <label><input type="radio" name="reduction-mode" checked={selection === 'island'} onChange={() => { void select('island'); }} /> NEYDRA Island — in alto al centro</label>
    <p id="reduction-notice" role="status">{notice}</p>
  </fieldset>;
}
