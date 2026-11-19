"use client";
import { useActionState, useState } from "react";
import { ArrowRight, ImagePlus } from "lucide-react";
import { submitVerification } from "../../app/verify/actions";
import { BRANCHES, YEARS } from "../../lib/college";

// Phone photos are often 3-8 MB. Shrink them in the browser (longest side 1800px, JPEG)
// before upload, so they stay well under the 4 MB limit and upload quickly.
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // unsupported format in this browser: let the server validate it
  }
}

function IdPhoto({ name, label, required }) {
  const [preview, setPreview] = useState(null);

  const onChange = async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return setPreview(null);
    const small = await shrinkImage(file);
    if (small !== file) {
      const dt = new DataTransfer();
      dt.items.add(small);
      input.files = dt.files;
    }
    setPreview(URL.createObjectURL(small));
  };

  return (
    <label className="id-drop">
      <span className="id-drop-label">{label}{required ? "" : " (optional)"}</span>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`${label} preview`} />
      ) : (
        <span className="id-drop-empty"><ImagePlus size={28} /> Tap to add a photo</span>
      )}
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp" capture="environment"
        required={required} onChange={onChange} />
    </label>
  );
}

// `detected` comes from a student email like 25ug1byai282@bmsit.in (see parseStudentEmail).
export default function VerifyForm({ defaults, detected }) {
  const [state, action, pending] = useActionState(submitVerification, null);
  const v = state?.values ?? defaults;
  const lockedBranch = detected?.branch;

  return (
    <form className="auth-form" action={action}>
      {detected && (
        <div className="detected" aria-label="Details from your college email">
          <span className="field-hint">From your college email</span>
          <dl>
            <div><dt>USN</dt><dd>{detected.usn}</dd></div>
            <div><dt>Batch</dt><dd>{detected.batch}</dd></div>
            {lockedBranch && <div className="wide"><dt>Branch</dt><dd>{lockedBranch}</dd></div>}
          </dl>
        </div>
      )}
      <label className="field">
        <span>Full name (as on your ID card)</span>
        <input name="full_name" autoComplete="name" required defaultValue={v.fullName} />
      </label>
      <div className={lockedBranch ? "field-row single" : "field-row"}>
        {lockedBranch ? (
          <input type="hidden" name="branch" value={lockedBranch} />
        ) : (
          <label className="field">
            <span>Branch</span>
            <select name="branch" required defaultValue={v.branch || ""}>
              <option value="" disabled>Choose…</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Year</span>
          <select name="year" required defaultValue={v.year || ""}>
            <option value="" disabled>Choose…</option>
            {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Student ID card</span>
        <IdPhoto name="id_front" label="Front" required />
        <small className="field-hint">A clear photo where your name, photo and college are readable. Only CampusCast admins can see it.</small>
      </div>

      {state?.error && <p className="form-msg" role="alert">{state.error}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Submit for verification"}
        {!pending && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
