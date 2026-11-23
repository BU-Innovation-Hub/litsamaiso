// Shared by the maintenance scripts: reading flags, refusing to touch a database on another machine by
// accident, and finding the institution a script should work on.
import { Institution } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";

const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

export function fail(message: string): never {
  throw new Error(message);
}

// The value of --name=value or --name value
export const readFlag = (name: string, argv: string[] = process.argv): string | undefined => {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  const next = index >= 0 ? argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
};

export const hasFlag = (name: string, argv: string[] = process.argv): boolean => argv.includes(`--${name}`);

export const hostOf = (uri: string): string => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  return match?.[1] ?? fail("MONGO_URI isn't a MongoDB connection string");
};

export const databaseOf = (uri: string): string => /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri)?.[1] || "test";

export const isLocalHost = (host: string): boolean => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);

// A database on another machine needs --confirm-host=<host>, so a copied .env can't point a script at production
export const assertHostAllowed = (uri: string, confirmHost: string | undefined, purpose: string): string => {
  const host = hostOf(uri);
  if (!isLocalHost(host) && confirmHost !== host) {
    fail(`MONGO_URI points at ${host}, which isn't this machine. Add --confirm-host=${host} if you want to ${purpose} there.`);
  }
  return host;
};

// The institution named by --institution (a name or an id), or the only one, or the only one with a Registry user
export const findInstitution = async (wanted: string | undefined) => {
  const all = await Institution.find().select("name").sort({ name: 1 }).lean();
  const names = all.map((institution) => `"${institution.name}"`).join(", ") || "none";
  if (wanted) {
    const match = /^[a-f0-9]{24}$/i.test(wanted)
      ? await Institution.findById(wanted).select("name").lean()
      : await Institution.findOne({ name: wanted }).collation(CASE_INSENSITIVE).select("name").lean();
    return match ?? fail(`No institution called "${wanted}". Institutions: ${names}`);
  }
  if (all.length === 1) return all[0]!;

  // With several, the one with a Registry user is the one someone can sign in to and test
  const registry = await Role.findOne({ name: "registry" }).collation(CASE_INSENSITIVE).select("_id").lean();
  const withRegistry = registry
    ? (await User.distinct("institution", { $or: [{ role: registry._id }, { additionalRoles: registry._id }] })).map(String)
    : [];
  const candidates = all.filter((institution) => withRegistry.includes(String(institution._id)));
  if (candidates.length === 1) return candidates[0]!;
  return fail(`Say which institution with --institution "<name>". Institutions: ${names}`);
};
