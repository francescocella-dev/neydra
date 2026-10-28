import type { AvatarState, StreamEvent } from '../shared/contracts';

export interface DemoState {
  requestId: string | null;
  text: string;
  running: boolean;
  state: AvatarState;
  outcome: string;
}
export const initialState: DemoState = { requestId: null, text: '', running: false, state: 'idle', outcome: 'In attesa' };
export type DemoAction = { type: 'clear' } | { type: 'begin'; requestId: string } | { type: 'rejected'; requestId: string } | StreamEvent;
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'clear') return initialState;
  if (action.type === 'begin') return { requestId: action.requestId, text: '', running: true, state: 'processing', outcome: 'Demo offline in corso' };
  if (action.requestId !== state.requestId || !state.running) return state;
  switch (action.type) {
    case 'responseStarted': return state;
    case 'textDelta': return { ...state, text: (state.text + action.text).slice(0, 16_384) };
    case 'responseCompleted': return { ...state, running: false, state: 'idle', outcome: 'Demo offline completata' };
    case 'responseCancelled': return { ...state, running: false, state: 'interrupted', outcome: 'Demo offline annullata' };
    case 'responseFailed':
    case 'rejected': return { ...state, running: false, state: 'error', outcome: 'Demo non disponibile' };
  }
}
