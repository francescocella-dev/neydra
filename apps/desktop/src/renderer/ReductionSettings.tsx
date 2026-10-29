import { useEffect, useRef, useState } from 'react';
import type { ReductionMode, ReductionPreference } from '../shared/reduction-contracts';

export function ReductionSettings() {
  const [preference, setPreference] = useState<ReductionPreference>({ mode: 'circle', status: 'default' });
  const [pending, setPending] = useState(true);
  const mounted = useRef(false), locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    void window.neydra.getReductionPreference().then(result => {
      if (current) setPreference(result.ok ? result.preference : { mode: 'circle', status: 'read-failed' });
    }).catch(() => { if (current) setPreference({ mode: 'circle', status: 'read-failed' }); })
      .finally(() => { if (current) setPending(false); });
    return () => { current = false; mounted.current = false; };
  }, []);
  async function select(mode: ReductionMode) {
    if (locked.current) return;
    locked.current = true; setPending(true);
    try {
      const result = await window.neydra.setReductionMode({ mode });
      if (mounted.current) setPreference(result.ok ? result.preference : { mode: 'circle', status: 'save-failed' });
    } catch { if (mounted.current) setPreference({ mode: 'circle', status: 'save-failed' }); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  }
  const notice = pending ? 'Verifica o salvataggio della preferenza…' : preference.status === 'save-failed'
    ? 'Salvataggio non riuscito. Per questa sessione verrà usato Cerchio Mini; riprova per salvare la scelta.' : preference.status === 'read-failed'
      ? 'Preferenza non leggibile. Verrà usato Cerchio Mini.' : preference.status === 'saved'
        ? 'Preferenza salvata. Si applica alla prossima riduzione.' : 'Cerchio Mini è la scelta predefinita. Si applica alla prossima riduzione.';
  return <fieldset className="reduction-settings" disabled={pending} aria-describedby="reduction-notice">
    <legend>Modalità di riduzione</legend>
    <label><input type="radio" name="reduction-mode" checked={preference.mode === 'circle'} onChange={() => { void select('circle'); }} /> Cerchio Mini — in basso a destra</label>
    <label><input type="radio" name="reduction-mode" checked={preference.mode === 'island'} onChange={() => { void select('island'); }} /> NEYDRA Island — in alto al centro</label>
    <p id="reduction-notice" role="status">{notice}</p>
  </fieldset>;
}
