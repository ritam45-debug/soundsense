import { z } from "zod";
import { api } from "@/lib/api";
import { assertCanEdit, loadAssessment, saveRoom } from "@/lib/services/assessments";
import { CEILING_MATERIALS, FLOOR_MATERIALS, WALL_MATERIALS, analyseRoom } from "@/lib/acoustics/room";
import { audit } from "@/lib/audit";

const oneOf = (list: { value: string }[]) => z.enum(list.map((m) => m.value) as [string, ...string[]]);
const roomSchema = z.object({
  length_m: z.number().min(0.5).max(200),
  width_m: z.number().min(0.5).max(200),
  height_m: z.number().min(1.5).max(40),
  occupants: z.number().int().min(0).max(5000),
  floor_material: oneOf(FLOOR_MATERIALS),
  wall_material: oneOf(WALL_MATERIALS),
  ceiling_material: oneOf(CEILING_MATERIALS),
  glass_share: z.enum(["none", "some", "large"]),
  soft_furnishings: z.enum(["none", "some", "lots"]),
  panels: z.enum(["none", "some", "extensive"]),
});

export const PUT = api({ auth: true, schema: roomSchema }, async ({ db, params, user, body, ip }) => {
  const analysis = await db(async (q) => {
    const a = await loadAssessment(q, params.id);
    assertCanEdit(user.role, a, user.id);
    return saveRoom(q, a.id, body, a.answers?.environment ?? "other");
  });
  await audit(user, "room.save", "assessment", params.id, { volume: analysis.volume }, ip);
  return { analysis };
});

/** Stateless preview used by the live calculator (no data stored). */
export const POST = api({ auth: true, schema: roomSchema.extend({ environment: z.string().max(40).default("other") }) }, async ({ body }) => {
  const { environment, ...room } = body;
  return { analysis: analyseRoom(room, environment) };
});
