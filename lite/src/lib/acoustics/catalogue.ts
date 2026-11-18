import { CategoryId, Tier } from "./types";

/**
 * Seed catalogue of SOLUTION TYPES (not specific vendor SKUs).
 *
 * PRICES ARE INDICATIVE ESTIMATES set by the SoundSense team for the Indian market – they were NOT
 * taken from vendor quotes or price lists. Administrators must replace them with verified figures in
 * Admin → Products & pricing (and set price_basis to vendor_quote / catalogue_price).
 */
export interface SeedProduct {
  sku: string;
  name: string;
  group: "equipment" | "room" | "software";
  category: CategoryId;
  tier: Tier;
  description: string;
  min: number;
  max: number;
  advantages: string[];
  limitations: string[];
  suitability: { minOccupants?: number; maxOccupants?: number; environments?: string[] };
  maintenance: string;
  improvement: string;
  complexity: "low" | "medium" | "high";
}

const P = (
  sku: string,
  name: string,
  group: SeedProduct["group"],
  category: CategoryId,
  tier: Tier,
  description: string,
  [min, max]: [number, number],
  advantages: string[],
  limitations: string[],
  suitability: SeedProduct["suitability"],
  maintenance: string,
  improvement: string,
  complexity: SeedProduct["complexity"]
): SeedProduct => ({ sku, name, group, category, tier, description, min, max, advantages, limitations, suitability, maintenance, improvement, complexity });

const PA_ENV = ["temple_public", "auditorium"];

export const SEED_PRODUCTS: SeedProduct[] = [
  // ── Room acoustics ───────────────────────────────────────────────
  P("ROOM-B-SOFT", "Soft furnishings and layout changes", "room", "room", "budget", "Heavy curtains, rugs, bookshelves and a few desktop/portable absorbers, plus moving seating closer to the microphone.", [15000, 60000], ["Lowest cost, no construction", "Reversible – good test before bigger spend"], ["Limited effect in large or very hard rooms", "Mostly mid/high frequencies"], { maxOccupants: 20 }, "Occasional cleaning of fabrics", "Noticeable in small rooms; modest in large ones", "low"),
  P("ROOM-R-PANELS", "Targeted wall and ceiling acoustic panels", "room", "room", "recommended", "Fabric-wrapped absorber panels covering roughly 15–25% of wall/ceiling area, positioned at first-reflection points and opposite hard/glass surfaces.", [60000, 250000], ["Directly lowers reverberation time", "Works for everyone in the room, no behaviour change", "Can be sized to the measured RT60 gap"], ["Needs layout planning and fixing", "Does not cure electronic echo or noise from outside"], { minOccupants: 4, maxOccupants: 60 }, "Dust brushing; check fixings yearly", "Clearer speech and less echo on calls", "medium"),
  P("ROOM-P-DESIGN", "Professional acoustic design with ceiling and wall treatment", "room", "room", "premium", "Site survey with RT60 measurement, designed ceiling clouds/baffles, wall absorbers and glass treatment, verified after installation.", [250000, 800000], ["Designed to a measured target", "Verified result", "Handles large or high-ceiling rooms"], ["Highest cost and longest lead time", "May disrupt use during installation"], { minOccupants: 15 }, "Inspection every 1–2 years", "Largest and most predictable improvement", "high"),
  P("ROOM-R-PA-REVERB", "Hall treatment: ceiling and rear-wall absorption", "room", "room", "recommended", "Absorption on the rear wall and ceiling of a hall to reduce reverberation reaching the back rows.", [150000, 600000], ["Improves intelligibility without more loudness"], ["Heritage/religious structures may restrict fixings"], { minOccupants: 40, environments: PA_ENV }, "Periodic inspection", "Clearer speech at the back", "high"),
  // ── Microphone ───────────────────────────────────────────────────
  P("MIC-B-PLACE", "Reposition microphone and add a USB boundary/desk microphone", "equipment", "microphone", "budget", "Move pickup to the table centre and add a low-cost USB desk or boundary microphone for the speaking position.", [3000, 12000], ["Quick to test", "Often fixes the 'laptop in the corner' problem"], ["Covers a few seats only"], { maxOccupants: 6 }, "None beyond cable checks", "Clearer voices for small groups", "low"),
  P("MIC-R-SPEAKERPHONE", "USB conference speakerphone or beamforming microphone bar", "equipment", "microphone", "recommended", "Speakerphone or mic bar with multiple microphones and built-in echo cancellation, placed at the table centre or under the display.", [12000, 45000], ["Plug-and-play", "Built-in echo cancellation", "Even pickup for small/medium rooms"], ["Range limit around 5–6 m", "Single position for the whole room"], { minOccupants: 2, maxOccupants: 14 }, "Firmware updates twice a year", "Even pickup and cleaner remote audio", "low"),
  P("MIC-R-TABLEARRAY", "Table-top microphone array for larger rooms", "equipment", "microphone", "recommended", "Two or more daisy-chained table microphone pods with echo cancellation.", [60000, 200000], ["Covers long tables"], ["Cabling on table", "Needs a compatible conferencing unit"], { minOccupants: 10, maxOccupants: 30 }, "Firmware updates", "Consistent pickup along the table", "medium"),
  P("MIC-P-CEILING", "Ceiling beamforming microphone array with DSP", "equipment", "microphone", "premium", "Ceiling array that tracks talkers and rejects noise, with a DSP for echo cancellation and automatic mixing.", [150000, 500000], ["Clean tables, hands-free", "Best coverage in large rooms"], ["Needs professional installation and tuning", "High cost"], { minOccupants: 12 }, "Annual tuning check", "Best-in-class pickup", "high"),
  // ── Speaker ──────────────────────────────────────────────────────
  P("SPK-B-REPOSITION", "Reposition speakers and add a powered desktop/wall speaker", "equipment", "speaker", "budget", "Re-aim or raise existing speakers and add one powered speaker for coverage gaps.", [3000, 12000], ["Quick and low cost"], ["Limited headroom in larger rooms"], { maxOccupants: 12 }, "None", "Better coverage for small rooms", "low"),
  P("SPK-R-BAR", "Conference speaker bar or wall-mounted speaker pair with amplifier", "equipment", "speaker", "recommended", "Properly sized speakers with amplifier, positioned for even coverage and tuned for speech.", [25000, 120000], ["Even coverage", "Cleaner at higher volume"], ["Requires mounting and cabling"], { minOccupants: 6, maxOccupants: 40 }, "Occasional dust cleaning", "Louder and clearer speech", "medium"),
  P("SPK-P-DISTRIBUTED", "Distributed ceiling speakers with DSP tuning", "equipment", "speaker", "premium", "Multiple ceiling speakers with zoned amplification and DSP equalisation and delay.", [150000, 600000], ["Uniform level across the room", "Lower volume needed per speaker"], ["Highest cost", "Needs ceiling access"], { minOccupants: 20 }, "Annual check", "Most uniform coverage", "high"),
  P("SPK-B-PA-TUNE", "PA tuning: aiming, equalisation and microphone technique", "equipment", "speaker", "budget", "Re-aim speakers at the audience, reduce bass and boost the speech range on the mixer, and train speakers in close microphone technique.", [5000, 40000], ["Low cost", "Often removes 'booming' immediately"], ["Cannot overcome a very reverberant hall"], { environments: PA_ENV }, "Re-check after changes in the hall", "Clearer announcements", "low"),
  P("SPK-R-PA-COLUMN", "Distributed column or line-array speakers with zoning", "equipment", "speaker", "recommended", "Speech-optimised speakers distributed along the audience, with time-delayed zones.", [150000, 600000], ["Directs sound at the audience, not the walls", "Better intelligibility at the back"], ["Needs a site survey", "Rigging and cabling"], { minOccupants: 40, environments: PA_ENV }, "Annual check", "Large intelligibility gain", "high"),
  P("SPK-P-PA-DSP", "DSP-tuned distributed PA with acoustic survey", "equipment", "speaker", "premium", "Full survey, designed speaker layout, DSP processing and verified speech intelligibility.", [500000, 2000000], ["Designed to a measured target", "Verified intelligibility"], ["Highest cost", "Long lead time"], { minOccupants: 100, environments: PA_ENV }, "Annual service", "Best achievable intelligibility", "high"),
  // ── Background noise ─────────────────────────────────────────────
  P("NOISE-B-HEADSET", "Noise-cancelling headset or directional microphone + software noise suppression", "equipment", "noise", "budget", "Close-talk headset with a boom microphone, plus the meeting platform's noise removal or a noise-suppression app.", [2500, 15000], ["Cheapest effective fix for open offices", "Takes effect immediately"], ["Per-person device", "Does not change the room"], { environments: ["open_workspace", "corporate_office", "home_office", "education"] }, "Replace ear cushions yearly", "Large reduction in picked-up noise", "low"),
  P("NOISE-R-MIC-SEAL", "Directional microphone, door seals and desk-height partitions", "equipment", "noise", "recommended", "Beamforming/cardioid microphone, door and window seals, and acoustic desk screens where the noise comes from.", [40000, 150000], ["Treats the path as well as the pickup", "Works for several users"], ["Needs a noise-source check first"], { minOccupants: 2, maxOccupants: 30 }, "Check seals yearly", "Better signal-to-noise for meetings", "medium"),
  P("NOISE-P-POD", "Acoustic meeting pod or partitioned meeting room", "room", "noise", "premium", "Pre-built meeting pod or a partitioned room with sound isolation for calls.", [200000, 800000], ["Isolates calls from the environment", "Moves quickly"], ["Highest cost", "Takes floor space"], { maxOccupants: 8 }, "Ventilation filter changes", "Biggest noise reduction", "medium"),
  P("NOISE-B-SOFT", "Noise suppression and AI cleanup in meeting software", "software", "noise", "budget", "Enable platform noise removal or a noise-suppression app; set the microphone gain properly.", [0, 8000], ["Almost free", "Reversible"], ["Can distort speech or leave music/voices through"], {}, "Keep software updated", "Reduces steady noise", "low"),
  // ── Conference system ────────────────────────────────────────────
  P("CONF-B-CONFIG", "Reconfigure the existing system and add a USB conferencing speakerphone", "equipment", "conference", "budget", "Update firmware, set AEC and gain, make one device the default, and use a USB speakerphone with built-in echo cancellation.", [0, 25000], ["Fastest, cheapest first move", "Often solves echo and feedback"], ["Depends on the existing hardware quality"], { maxOccupants: 12 }, "Firmware updates", "Removes most electronic echo", "low"),
  P("CONF-R-BAR", "All-in-one conference bar with beamforming microphones and AEC", "equipment", "conference", "recommended", "Video/audio bar with microphones, speakers and echo cancellation designed together.", [45000, 160000], ["Works out of the box", "Designed as one system"], ["Limited coverage for large rooms"], { minOccupants: 4, maxOccupants: 20 }, "Firmware updates", "Reliable audio on calls", "low"),
  P("CONF-P-ROOM", "Integrated room system: DSP, ceiling microphones, speakers and control", "equipment", "conference", "premium", "Engineered room system with DSP, microphones, speakers, control surface and monitoring.", [300000, 1200000], ["Scales to large rooms", "Central monitoring"], ["Highest cost", "Needs integrator support"], { minOccupants: 15 }, "Annual service contract", "Highest reliability and quality", "high"),
  // ── Connectivity ─────────────────────────────────────────────────
  P("CONN-B-FIX", "Troubleshoot: firmware, drivers, cable, port and re-pairing", "equipment", "connectivity", "budget", "Systematic isolation: update firmware/drivers, swap cable and port, try wired/USB, disable power saving.", [0, 5000], ["No or minimal cost", "Fixes most faults"], ["Does not help a failed device"], {}, "Keep software updated", "Removes drop-outs if caused by software/cable", "low"),
  P("CONN-R-REPLACE", "Replace with a certified USB/wired conferencing audio device", "equipment", "connectivity", "recommended", "Use a wired or USB device from a mainstream vendor with up-to-date firmware instead of a failing link.", [5000, 25000], ["Wired links avoid wireless interference", "Compatible with major platforms"], ["Less mobile than wireless"], { maxOccupants: 12 }, "Firmware updates", "Stable connection", "low"),
  P("CONN-P-AV", "Dedicated room PC with managed AV and monitoring", "equipment", "connectivity", "premium", "Dedicated, managed room computer and AV over IP with remote monitoring.", [100000, 400000], ["Predictable and monitored"], ["Overkill for a single faulty device"], { minOccupants: 12 }, "Managed service", "Highest stability", "high"),
  // ── Hybrid ───────────────────────────────────────────────────────
  P("HYB-B-PROCESS", "Hybrid meeting rules and audio settings", "software", "hybrid", "budget", "One room microphone/speaker, laptops muted, facilitator and turn-taking, platform audio settings.", [0, 10000], ["Free or nearly free", "Quick to test"], ["Depends on discipline"], {}, "Reinforce rules in meeting invites", "Fewer overlaps and echoes", "low"),
  P("HYB-R-BAR", "Hybrid kit: room bar with voice tracking and remote-participant monitor", "equipment", "hybrid", "recommended", "Conference bar with speaker tracking and a display or speaker that makes remote participants easy to hear.", [60000, 200000], ["Designed for hybrid meetings", "Makes remote participants present"], ["Fixed coverage area"], { minOccupants: 4, maxOccupants: 20 }, "Firmware updates", "Cleaner hybrid meetings", "medium"),
  P("HYB-P-FULL", "Full hybrid room: multi-zone microphones, DSP, cameras and AI transcription", "equipment", "hybrid", "premium", "Zoned microphones, DSP, multiple cameras and AI transcription for large hybrid rooms.", [300000, 1000000], ["Best experience", "Searchable transcripts"], ["Highest cost", "Needs integration"], { minOccupants: 15 }, "Annual service", "Best hybrid experience", "high"),
];
