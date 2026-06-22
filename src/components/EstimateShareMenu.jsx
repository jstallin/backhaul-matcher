// #175: Share an estimate report — Email / Text / Copy. Thin wrapper over the
// generic ShareMenu, supplying estimate-summary content (buildEstimateClipboard)
// and send (shareEstimate). Used by both v1 (EstimateResults) and v2 (EstimateReport).
import { ShareMenu } from './ShareMenu';
import { useAuth } from '../contexts/AuthContext';
import { shareEstimate, buildEstimateClipboard } from '../utils/estimateShareService';
import { NOTE_MAX_EMAIL, NOTE_MAX_TEXT } from '../utils/loadShareContent';

export function EstimateShareMenu({ estimate, fleet, metrics, annualVolume, palette }) {
  const { user } = useAuth();
  const ctx = { estimate, fleet, metrics, annualVolume };
  return (
    <ShareMenu
      palette={palette}
      noun="estimate"
      copiedLabel="Estimate copied"
      emailFootnote={`Includes the full estimate summary. Replies go to ${user?.email}.`}
      noteMaxEmail={NOTE_MAX_EMAIL}
      noteMaxText={NOTE_MAX_TEXT}
      onCopyText={() => buildEstimateClipboard(ctx)}
      onShare={({ channel, recipient, note }) =>
        shareEstimate({ channel, recipient, note, estimate, fleet, metrics, annualVolume, user })}
    />
  );
}
