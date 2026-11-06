import { useContext } from 'react';
import { SessionContext, type SessionState } from './sessionContext';

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
