/** Rule-based assistant: no AI model, no network. Same knowledge base as the full platform's offline mode. */
export interface ChatContext { ref: string; headline?: string; environment?: string; problems?: string[]; diagnosis?: string; confidence?: string; nextSteps?: string[]; budget?: string }
export interface ChatReply { text: string; source: "fallback"; suggestEscalation: boolean }

export const wantsHuman = (m: string) => /\b(human|consultant|person|agent|someone|expert|call me|speak to|talk to)\b/i.test(m);

interface Topic {
  id: string;
  keys: RegExp;
  answer: string;
  ask: string;
}

const TOPICS: Topic[] = [
  {
    id: "echo",
    keys: /\becho|hear (my|their|own) voice|repeat(ed|ing)? back/i,
    answer:
      "Two causes. Remote people hearing their OWN voice means echo cancellation is failing, often from two devices open at once. A hollow, lingering sound in the room means reverberation.\nTry: leave one room mic and speaker on, then clap once in the empty room and listen for a ring.",
    ask: "Do the remote participants hear themselves, or is the sound hollow/lingering in the room?",
  },
  {
    id: "reverb",
    keys: /reverb|rt60|hollow|boomy|lingers|decay|reverberation/i,
    answer:
      "Reverberation is how long sound lingers (RT60). Speech rooms aim for about 0.6 s or less; bare concrete and glass rooms often exceed it.\nTry: curtains, rugs, soft furniture, and a mic closer to talkers. Only a measurement confirms the real figure.",
    ask: "Roughly what size is the room and what are the walls, floor and ceiling made of?",
  },
  {
    id: "noise",
    keys: /noise cancel|background noise|\bnoise\b|\bac\b|hum|hiss|chatter|suppress/i,
    answer:
      "Steady noise (AC, fans) and nearby voices need different fixes. A closer mic (boom headset or directional) plus your platform's noise removal helps most; panels won't stop noise from outside.\nTry: record 30 s of noise and 30 s of speech in Measure. Aim for a relative SNR of 25 dB, at least about 10.",
    ask: "Is the audio clear when the room is quiet and only one person speaks?",
  },
  {
    id: "mic",
    keys: /microphone|\bmic\b|pickup|too quiet|far end|quiet voice|inaudible|cut(s|ting)? out/i,
    answer:
      "Beyond about 1–2 m, one omnidirectional mic hears more room than voice. Put it at table centre, away from laptop fans, and set gain so speech peaks mid-to-high on the meter.\nTry: compare a headset recording with the room mic to rule out the network or platform.",
    ask: "How far is the farthest talker from the microphone, and what microphone are you using now?",
  },
  {
    id: "speaker",
    keys: /speaker|volume|loud|can'?t hear|cannot hear|low sound|distort|crackl|feedback|whistl|squeal|public address|\bpa\b|announce/i,
    answer:
      "First check: quiet everywhere (equipment) or only far from the speakers (coverage, reverberation)? Distortion often passes for 'low volume', so check for clipping. For squeal, lower speaker volume or mic gain and keep mics away from speaker fronts.\nIn halls, re-aim speakers at the audience first.",
    ask: "Is it too quiet everywhere, or only in some seats or the back rows?",
  },
  {
    id: "bluetooth",
    keys: /bluetooth|disconnect|pair|not recogni[sz]ed|usb|drop(s|ping)? out|intermittent|cuts? in and out/i,
    answer:
      "This is an equipment fault, so panels won't help. Try in order: re-pair and stay within 2 m; update firmware and drivers; swap cable, port and adapter; turn off power-saving; test on another computer. If it fails everywhere, the device is the cause.",
    ask: "Does the same fault appear on another computer or in another room?",
  },
  {
    id: "hybrid",
    keys: /hybrid|overlap|talk(ing)? over|remote participants?|teams|zoom|google meet|webex/i,
    answer:
      "Usually too many open mics and no meeting rules. Use ONE room mic and speaker, mute every laptop in the room, and name a facilitator for remote people. Process fixes are free; a voice-tracking room bar is the next step.",
    ask: "How many devices have a microphone open in the room during a meeting?",
  },
  {
    id: "panels",
    keys: /panel|soundproof|insulat|isolat|treatment|absorb/i,
    answer:
      "Panels absorb sound inside a room (less echo). Soundproofing stops sound passing between rooms. Different problems, different fixes. As a rough rule, speech rooms often need absorption on about a fifth to a third of wall and ceiling area, sized from a measured RT60.",
    ask: "Is your main problem echo inside the room, or noise leaking in from outside?",
  },
  {
    id: "equipment",
    keys: /buy|recommend|which (mic|speaker|device|product)|equipment|cost|price|budget|how much/i,
    answer:
      "Diagnose before buying: room, mic, speaker, noise, set-up or connection each need a different purchase, or none. Finish the assessment for a budget, recommended and premium plan. Prices are indicative, not vendor quotes.",
    ask: "What is the main symptom people notice, and roughly what budget do you have in mind?",
  },
  {
    id: "measure",
    keys: /\bdb\b|decibel|spl|measure|calibrat|sound level|meter/i,
    answer:
      "Measure shows relative input (dBFS), not calibrated dB SPL; phone and laptop mics have unknown sensitivity. It suits comparisons on one device (speech vs noise = relative SNR). For true dB SPL you need a calibrated meter.",
    ask: "Do you need a comparison between two situations, or an absolute dB value for compliance?",
  },
];

const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|namaste)\b/i;

export function fallbackReply(message: string, ctx?: ChatContext | null): ChatReply {
  const wantsPerson = wantsHuman(message);
  let best: { t: Topic; score: number } | null = null;
  for (const t of TOPICS) {
    const m = message.match(new RegExp(t.keys.source, "gi"));
    const score = m ? m.length : 0;
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  let text: string;
  if (best) {
    text = `${best.t.answer}\n\n${best.t.ask}`;
  } else if (GREETING.test(message.trim())) {
    text = "Hello! I can help with echo, reverberation, noise, microphones, speakers, hybrid meetings and equipment. What are you hearing, and where?";
  } else {
    text = "I can help with sound problems in meeting rooms, offices, halls and temples. What are you hearing (echo, noise, quiet voices, audio cutting out) and where?";
  }
  if (ctx?.diagnosis && best) text += `\n\nYour assessment points to: ${ctx.diagnosis} (${ctx.confidence} confidence).`;
  else if (ctx?.diagnosis) text += `\n\nYour assessment points to: ${ctx.diagnosis} (${ctx.confidence} confidence).${ctx.nextSteps?.[0] ? " First step: " + ctx.nextSteps[0] : ""}`;
  if (wantsPerson) text += "\n\nThis free edition has no live consultants. Share your PDF report with an acoustic professional for a second opinion.";
  return { text, source: "fallback", suggestEscalation: false };
}

