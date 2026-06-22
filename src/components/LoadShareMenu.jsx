// #82: Share a load from the detail view — Email / Text / Copy.
// Thin wrapper over the generic ShareMenu (#175): supplies load-specific content
// (buildCopyText) and send (shareLoad). One shared component for v1 and v2; the
// host passes a palette so it matches either theme.
import { ShareMenu } from './ShareMenu';
import { useAuth } from '../contexts/AuthContext';
import { shareLoad, buildCopyText } from '../utils/loadShareService';
import { NOTE_MAX_EMAIL, NOTE_MAX_TEXT } from '../utils/loadShareContent';

export function LoadShareMenu({ match, request, fleetHome, palette }) {
  const { user } = useAuth();
  return (
    <ShareMenu
      palette={palette}
      noun="load"
      copiedLabel="Load copied"
      emailFootnote={`Includes full load details and a route map. Replies go to ${user?.email}.`}
      noteMaxEmail={NOTE_MAX_EMAIL}
      noteMaxText={NOTE_MAX_TEXT}
      onCopyText={() => buildCopyText({ match, request })}
      onShare={({ channel, recipient, note }) =>
        shareLoad({ channel, recipient, note, match, request, fleetHome, user })}
    />
  );
}
