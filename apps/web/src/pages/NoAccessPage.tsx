import { useAuth } from '../auth/AuthProvider';
import { FullPageMessage } from '../ui/FullPageMessage';

export function NoAccessPage({ error }: { error: string | null }) {
  const { session, signOut, refreshMemberships } = useAuth();
  return (
    <FullPageMessage
      title="No studio access yet"
      body={`You're signed in as ${session?.user.email ?? 'unknown'}, but this email hasn't been invited to a studio.`}
    >
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row gap">
        <button className="btn" onClick={() => void refreshMemberships()}>Check again</button>
        <button className="btn btn-ghost" onClick={() => void signOut()}>Use another account</button>
      </div>
    </FullPageMessage>
  );
}
