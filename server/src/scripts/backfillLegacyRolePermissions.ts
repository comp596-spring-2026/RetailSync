import mongoose, { Types } from "mongoose";
import { connectDb } from "../db/connect";
import { RoleModel } from "../models/Role";
import {
  getRolePermissionsNormalizationResult,
} from "../services/rolePermissionsService";

type ScriptOptions = {
  apply: boolean;
  verbose: boolean;
  limit: number | null;
  companyId: string | null;
};

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);
  const getValue = (key: string) => {
    const prefixed = args.find((arg) => arg.startsWith(`${key}=`));
    if (prefixed) return prefixed.slice(key.length + 1);
    const index = args.findIndex((arg) => arg === key);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const limitValue = getValue("--limit");
  const companyIdValue = getValue("--companyId");
  const parsedLimit = limitValue ? Number(limitValue) : null;

  return {
    apply: args.includes("--apply"),
    verbose: args.includes("--verbose"),
    limit:
      Number.isFinite(parsedLimit) && Number(parsedLimit) > 0
        ? Number(parsedLimit)
        : null,
    companyId: companyIdValue ? String(companyIdValue).trim() : null,
  };
};

const main = async () => {
  const options = parseArgs();
  await connectDb();

  const query: Record<string, unknown> = {};
  if (options.companyId) {
    if (!Types.ObjectId.isValid(options.companyId)) {
      throw new Error(`Invalid companyId: ${options.companyId}`);
    }
    query.companyId = new Types.ObjectId(options.companyId);
  }

  const docs = await RoleModel.find(query)
    .setOptions({ bypassTenant: true })
    .sort({ companyId: 1, name: 1 })
    .limit(options.limit ?? 0);

  let changed = 0;
  let updated = 0;
  const touchedRoles: Array<{
    roleId: string;
    name: string;
    missing: string[];
  }> = [];

  for (const role of docs) {
    const result = getRolePermissionsNormalizationResult(role.permissions, {
      roleName: String(role.name ?? ""),
      isSystem: Boolean(role.isSystem),
    });

    if (!result.changed) {
      continue;
    }

    changed += 1;
    touchedRoles.push({
      roleId: String(role._id),
      name: String(role.name ?? ""),
      missing: result.missingModules,
    });

    if (options.verbose) {
      console.log(
        `[permissions.backfill] role=${role.name} id=${String(role._id)} missing=${result.missingModules.join(",") || "none"}`,
      );
    }

    if (options.apply) {
      role.permissions = result.normalized as any;
      await RoleModel.updateOne(
        { _id: role._id },
        { $set: { permissions: role.permissions } },
      ).setOptions({ bypassTenant: true });
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        scanned: docs.length,
        changed,
        updated,
        roles: touchedRoles,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
