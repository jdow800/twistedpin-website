/** Recording is over; work continues until the review is ready. No estimated %:
 * uploads and extraction can overlap, and neither reports measured progress. */
export default function VoiceProcessing({ transcribing, destination }: {
  transcribing: boolean;
  destination: string;
}) {
  return (
    <div className="lq-voice-processing" role="status" aria-live="polite" aria-atomic="true"
      data-phase={transcribing ? "transcribing" : "matching"}>
      <strong>Processing your recording</strong>
      <span>{transcribing ? "Finishing your transcript…" : "Matching items and quantities…"}</span>
      <div className="lq-voice-processing-track" aria-hidden="true"><span /></div>
      <small>For <strong>{destination}</strong> · Review opens when ready.</small>
    </div>
  );
}
