// Pure constants shared by the server booking service and the browser UI (no server-only imports here).
export const BOOKING_TYPES: { value: string; label: string }[] = [
  { value: "room_acoustics", label: "Room acoustics assessment" },
  { value: "conference_room", label: "Conference-room sound evaluation" },
  { value: "equipment", label: "Equipment consultation" },
  { value: "noise_cancellation", label: "Noise cancellation consultation" },
  { value: "temple_pa", label: "Temple / public-address sound assessment" },
  { value: "general", label: "General acoustic consultation" },
];
export const bookingTypeLabel = (v: string) => BOOKING_TYPES.find((t) => t.value === v)?.label ?? v;
