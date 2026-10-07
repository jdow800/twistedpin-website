import { useRef } from "react";

export const MAX_WASTE_PHOTOS = 10;
export interface WastePhotoSelection {
  id: string;
  file: File;
  url: string;
  state: "waiting" | "sending" | "sent" | "failed";
  error?: string;
}

/** A normal gallery picker lets a phone/tablet select existing photos together.
 * Capture is intentionally a separate capability, not a picker restriction. */
export default function FoodWastePhotos({ photos, busy, onFiles, onRemove }: {
  photos: WastePhotoSelection[];
  busy: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return <section className="lq-fw-photos" aria-label="Waste log photos">
    <input ref={picker} type="file" accept="image/*,.heic,.heif" multiple hidden
      aria-label="Choose waste log photos" disabled={busy}
      onChange={event => {
        if (event.target.files) onFiles(Array.from(event.target.files));
        event.target.value = "";
      }} />
    <button type="button" className="lq-btn lq-btn-primary lq-fw-gallery" disabled={busy || photos.length >= MAX_WASTE_PHOTOS}
      onClick={() => picker.current?.click()}>{photos.length ? "Add log photos" : "Choose log photos"}</button>
    <p className="lq-muted">Choose up to {MAX_WASTE_PHOTOS} photos from your gallery. Include every written entry.</p>
    {photos.length > 0 && <ol className="lq-fw-photo-grid">
      {photos.map((photo, index) => <li key={photo.id} className="lq-fw-photo">
        <img src={photo.url} alt={`Waste log photo ${index + 1}`} />
        <span className="lq-fw-photo-number">Photo {index + 1}</span>
        <span className="lq-muted" role={photo.state === "sending" ? "status" : undefined}>
          {photo.state === "sending" ? "Sending…" : photo.state === "sent" ? "Uploaded" : photo.state === "failed" ? "Needs retry" : photo.file.name}
        </span>
        {photo.error && <p className="lq-error" role="alert">{photo.error}</p>}
        <button type="button" className="lq-linkbtn" disabled={busy} aria-label={`Remove photo ${index + 1}`}
          onClick={() => onRemove(photo.id)}>Remove</button>
      </li>)}
    </ol>}
  </section>;
}
