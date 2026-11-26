// Names of uploaded profile files: "<user id>/<resume|linkedin>-<uuid>.<pdf|jpg|png|webp>".
const NAME = /^(resume|linkedin)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/i;

export const isOwnFile = (path, userId) => {
  if (typeof path !== "string" || !userId) return false;
  const [folder, name, ...rest] = path.split("/");
  return !rest.length && folder === userId && NAME.test(name || "");
};

export const kindOf = (path) => (String(path).split("/").pop().startsWith("resume-") ? "resume" : "linkedin");
export const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
