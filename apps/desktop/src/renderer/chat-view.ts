import type { Connection } from '../shared/contracts';

// Presentation state only; no credentials or new ChatGPT requests.
export interface ChatView {
  connection: Connection;
  selectedModel: string;
  running: boolean;
  hasConversation: boolean;
}
export const initialChatView: ChatView = {
  connection: { state: 'disconnected', models: [] }, selectedModel: '', running: false, hasConversation: false,
};
export const connectionLabel = { disconnected: 'Non collegato', connecting: 'Collegamento in corso', connected: 'Collegato' } as const;
