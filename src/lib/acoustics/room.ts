/**
 * Room geometry + reverberation screening.
 *
 * SCREENING ONLY. RT60 here is a Sabine *estimate* from declared materials; a real measurement
 * (impulse response / interrupted noise, ISO 3382) can differ substantially. We label it that way everywhere.
 *
 * Sources (researched):
 *  - Sabine: RT60 = 0.161·V / A  (V in m³, A = Σ S·α in m² sabins).
 *  - Absorption coefficients: representative values from the Montana State EELE 217 table of Sabine
 *    absorptivities; we use the mean of the 500 Hz and 1 kHz values ("mid-frequency", speech-critical).
 *  - Targets: WELL v4 feature 78 (conference rooms ≤ 0.6 s, open office ≤ 0.5 s), US GSA "Sound Matters"
 *    (meeting rooms 0.6 s), ANSI/ASA S12.60 (classrooms ≤ 0.6 s), lecture hall ≈ 0.8 s and worship/speech
 *    ≈ 1.0 s (Maher, EELE 217).
 *  - Per-person absorption ≈ 0.5 m² sabins mid-frequency (conservative end of published 0.5–0.9 range).
 * ASSUMPTIONS (engineering judgement, not from a standard): glass/curtain/panel area fractions for the
 * "none/some/lots" choices, and the speech-source directivity Q = 2 for critical distance.
 */
export interface RoomInput {
  length_m: number;
  width_m: number;
  height_m: number;
  occupants: number;
  floor_material: string;
  wall_material: string;
  ceiling_material: string;
  glass_share: "none" | "some" | "large";
  soft_furnishings: "none" | "some" | "lots";
  panels: "none" | "some" | "extensive";
}

export interface MaterialOption {
  value: string;
  label: string;
  alpha: number;
}

export const FLOOR_MATERIALS: MaterialOption[] = [
  { value: "concrete_tile", label: "Concrete, tile or terrazzo", alpha: 0.02 },
  { value: "vinyl", label: "Vinyl / linoleum", alpha: 0.03 },
  { value: "wood", label: "Wood / laminate", alpha: 0.085 },
  { value: "carpet_thin", label: "Thin carpet on concrete", alpha: 0.245 },
  { value: "carpet_thick", label: "Thick carpet with underlay", alpha: 0.625 },
];
export const WALL_MATERIALS: MaterialOption[] = [
  { value: "concrete_brick", label: "Plastered concrete / brick", alpha: 0.03 },
  { value: "painted_block", label: "Painted concrete block", alpha: 0.065 },
  { value: "gypsum", label: "Plasterboard / drywall", alpha: 0.045 },
  { value: "wood_panel", label: "Wood panelling", alpha: 0.185 },
  { value: "fabric_acoustic", label: "Fabric-wrapped / acoustic wall", alpha: 0.6 },
];
export const CEILING_MATERIALS: MaterialOption[] = [
  { value: "concrete_plaster", label: "Plaster / concrete slab", alpha: 0.05 },
  { value: "gypsum", label: "Plasterboard ceiling", alpha: 0.045 },
  { value: "acoustic_tile", label: "Suspended acoustic tile", alpha: 0.675 },
];
// "Glass, windowpane" mean of 500 Hz / 1 kHz.
const GLASS_ALPHA = 0.15;
const CURTAIN_ALPHA = 0.625; // 0.48 kg/m² velour draped to half area
const PANEL_ALPHA = 0.825; // 2 in fibreglass on rigid backing
const PERSON_SABINS = 0.5;

const GLASS_FRACTION = { none: 0, some: 0.2, large: 0.5 } as const; // of wall area – assumption
const CURTAIN_FRACTION = { none: 0, some: 0.08, lots: 0.2 } as const; // of wall area – assumption
const PANEL_FRACTION = { none: 0, some: 0.08, extensive: 0.25 } as const; // of wall+ceiling area – assumption

export const RT60_TARGETS: Record<string, { target: number; source: string }> = {
  conference_room: { target: 0.6, source: "WELL v4 / US GSA: meeting rooms ≈ 0.6 s" },
  corporate_office: { target: 0.6, source: "WELL v4: conference rooms ≤ 0.6 s" },
  home_office: { target: 0.6, source: "Treated as a meeting room (≈ 0.6 s)" },
  open_workspace: { target: 0.5, source: "WELL v4: open office ≤ 0.5 s" },
  education: { target: 0.6, source: "ANSI/ASA S12.60: classrooms ≤ 0.6 s" },
  auditorium: { target: 0.8, source: "Lecture hall with amplified speech ≈ 0.8 s" },
  temple_public: { target: 1.0, source: "Worship/speech space ≈ 1.0 s (Maher, EELE 217)" },
  other: { target: 0.6, source: "Default speech-room target ≈ 0.6 s" },
};

const find = (list: MaterialOption[], v: string) => list.find((m) => m.value === v) ?? list[0];

export interface RoomAnalysis {
  floorArea: number;
  volume: number;
  wallArea: number;
  surfaceArea: number;
  volumePerPerson: number | null;
  totalAbsorption: number;
  rt60Unoccupied: number;
  rt60Occupied: number;
  target: number;
  targetSource: string;
  ratio: number; // unoccupied RT60 / target
  risk: "low" | "moderate" | "high";
  geometry: {
    aspectRatio: number;
    heightToWidth: number;
    cubeLike: boolean;
    reflectiveSurfaces: boolean;
    schroederHz: number;
    criticalDistanceM: number;
  };
  surfaces: { name: string; area: number; alpha: number; sabins: number }[];
  notes: string[];
  disclaimer: string;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function analyseRoom(r: RoomInput, environment: string): RoomAnalysis {
  const { length_m: L, width_m: W, height_m: H } = r;
  const floorArea = L * W;
  const volume = L * W * H;
  const wallArea = 2 * (L + W) * H;
  const surfaceArea = 2 * floorArea + wallArea;

  const glassArea = wallArea * GLASS_FRACTION[r.glass_share];
  const curtainArea = wallArea * CURTAIN_FRACTION[r.soft_furnishings];
  const panelArea = (wallArea + floorArea) * PANEL_FRACTION[r.panels];
  const bareWall = Math.max(0, wallArea - glassArea - curtainArea);
  // Panels are placed on walls/ceiling; subtract from the bare surface they cover.
  const panelOnWalls = Math.min(panelArea * (wallArea / (wallArea + floorArea)), bareWall);
  const panelOnCeiling = Math.min(panelArea - panelOnWalls, floorArea);

  const floorAlpha = find(FLOOR_MATERIALS, r.floor_material).alpha;
  const wallAlpha = find(WALL_MATERIALS, r.wall_material).alpha;
  const ceilAlpha = find(CEILING_MATERIALS, r.ceiling_material).alpha;

  const surfaces = [
    { name: "Floor", area: floorArea, alpha: floorAlpha },
    { name: "Ceiling (untreated part)", area: floorArea - panelOnCeiling, alpha: ceilAlpha },
    { name: "Walls (bare)", area: bareWall - panelOnWalls, alpha: wallAlpha },
    { name: "Glass", area: glassArea, alpha: GLASS_ALPHA },
    { name: "Curtains / soft furnishings", area: curtainArea, alpha: CURTAIN_ALPHA },
    { name: "Acoustic panels", area: panelOnWalls + panelOnCeiling, alpha: PANEL_ALPHA },
  ]
    .filter((s) => s.area > 0.0001)
    .map((s) => ({ ...s, area: round(s.area), sabins: round(s.area * s.alpha) }));

  const A0 = surfaces.reduce((t, s) => t + s.sabins, 0);
  const people = r.occupants * PERSON_SABINS;
  const rt60Unocc = (0.161 * volume) / Math.max(A0, 0.01);
  const rt60Occ = (0.161 * volume) / Math.max(A0 + people, 0.01);

  const t = RT60_TARGETS[environment] ?? RT60_TARGETS.other;
  const ratio = rt60Unocc / t.target;
  const risk: RoomAnalysis["risk"] = ratio <= 1.1 ? "low" : ratio <= 1.5 ? "moderate" : "high";

  const dims = [L, W, H].sort((a, b) => a - b);
  const cubeLike = dims[2] / dims[0] < 1.25;
  const reflective = wallAlpha < 0.1 && ceilAlpha < 0.1;
  const schroeder = 2000 * Math.sqrt(rt60Unocc / volume);
  const criticalDistance = 0.057 * Math.sqrt((2 * volume) / rt60Unocc); // Q = 2 (assumed talker directivity)

  const notes: string[] = [];
  if (risk !== "low")
    notes.push(
      `Estimated RT60 is ${round(rt60Unocc, 2)} s against a ${t.target} s target for this kind of space (${round(ratio, 1)}× target).`
    );
  if (reflective && r.glass_share !== "none") notes.push("Hard parallel walls plus glass make repeated reflections (flutter echo) likely.");
  else if (reflective) notes.push("Walls and ceiling are both highly reflective, so speech energy lingers.");
  if (cubeLike) notes.push("Room dimensions are nearly equal, which concentrates low-frequency room modes (boomy bass).");
  if (criticalDistance < 1.5)
    notes.push(`Critical distance is about ${round(criticalDistance, 1)} m: a microphone further than this from a talker mostly hears room reverberation rather than the voice.`);
  if (r.floor_material === "carpet_thick" || r.ceiling_material === "acoustic_tile") notes.push("Existing soft floor/ceiling already helps – extra treatment may need to target walls.");
  if (rt60Unocc < 0.3) notes.push("The room is acoustically 'dry'; adding more absorption is unlikely to help.");

  return {
    floorArea: round(floorArea),
    volume: round(volume),
    wallArea: round(wallArea),
    surfaceArea: round(surfaceArea),
    volumePerPerson: r.occupants > 0 ? round(volume / r.occupants) : null,
    totalAbsorption: round(A0),
    rt60Unoccupied: round(rt60Unocc),
    rt60Occupied: round(rt60Occ),
    target: t.target,
    targetSource: t.source,
    ratio: round(ratio),
    risk,
    geometry: {
      aspectRatio: round(Math.max(L, W) / Math.min(L, W)),
      heightToWidth: round(H / Math.min(L, W)),
      cubeLike,
      reflectiveSurfaces: reflective,
      schroederHz: Math.round(schroeder),
      criticalDistanceM: round(criticalDistance, 1),
    },
    surfaces,
    notes,
    disclaimer:
      "Screening estimate from declared materials using the Sabine equation. It is not a measured reverberation time and not a compliance result.",
  };
}
