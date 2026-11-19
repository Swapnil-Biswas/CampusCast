"use server";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { BRANCHES, YEARS, parseStudentEmail } from "../../lib/college";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Only the front of the ID card is collected.
function checkImage(file) {
  if (!file || typeof file === "string" || file.size === 0) {
    return "Please add a photo of the front of your ID card.";
  }
  if (!TYPES[file.type]) return "The photo must be a JPG, PNG or WebP image.";
  if (file.size > MAX_BYTES) return "The photo is larger than 4 MB. Try a smaller photo.";
  return null;
}

export async function submitVerification(_prev, formData) {
  const fullName = String(formData.get("full_name") || "").trim();
  let branch = String(formData.get("branch") || "");
  const year = Number(formData.get("year"));
  const front = formData.get("id_front");
  const values = { fullName, branch, year: year || "" };

  const supabase = await createClient();
  if (!supabase) return { error: "Sign-in isn't set up yet.", values };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Student emails like 25ug1byai282@bmsit.in fix the branch, batch and USN.
  const fromEmail = parseStudentEmail(user.email);
  if (fromEmail?.branch) branch = fromEmail.branch;

  if (fullName.length < 2) return { error: "Please enter your full name as it appears on your ID card.", values };
  if (!BRANCHES.includes(branch)) return { error: "Please choose your branch.", values };
  if (!YEARS.includes(year)) return { error: "Please choose your year.", values };
  const fileError = checkImage(front);
  if (fileError) return { error: fileError, values };

  const stamp = Date.now();
  const upload = async (file, side) => {
    const path = `${user.id}/${side}-${stamp}.${TYPES[file.type]}`;
    const { error } = await supabase.storage.from("id-cards").upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return path;
  };

  let frontPath;
  try {
    frontPath = await upload(front, "front");
  } catch (e) {
    return { error: `Couldn't upload your ID card (${e.message}). Please try again.`, values };
  }

  const { error } = await supabase.rpc("submit_verification", {
    p_full_name: fullName,
    p_branch: branch,
    p_year: year,
    p_id_card_front: frontPath,
    p_id_card_back: null,
    p_batch: fromEmail?.batch ?? null,
    p_usn: fromEmail?.usn ?? null,
  });
  if (error) return { error: error.message, values };

  redirect("/verify");
}
