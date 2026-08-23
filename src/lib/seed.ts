import type { DockFile, MemoryItem, Seat, Session } from "./types";

export const IVO = "seat_ivo";
export const REED = "seat_reed";
export const VALE = "seat_vale";
export const KADE = "seat_kade";

export const SESSION_SEED = "session_seed";

export const seedSeats: Seat[] = [
  {
    id: IVO,
    name: "Ivo",
    role: "Chair",
    mandate:
      "Hear every seat. Seal a verdict that names the decision, the owners, and the dissent. Never flatten disagreement into fake consensus.",
    initials: "IV",
    chair: true,
    model: "cloud",
    status: "idle",
  },
  {
    id: REED,
    name: "Reed",
    role: "Evidence",
    mandate:
      "Source the room. Prefer facts, citations, and what would change your mind. Write briefs others can reuse.",
    initials: "RD",
    chair: false,
    model: "cloud",
    status: "idle",
  },
  {
    id: VALE,
    name: "Vale",
    role: "Voice",
    mandate:
      "Draft in the operator's register: plain, specific, no filler. Leave copy in the dock — never send it outward.",
    initials: "VA",
    chair: false,
    model: "cloud",
    status: "idle",
  },
  {
    id: KADE,
    name: "Kade",
    role: "Adversary",
    mandate:
      "Attack the majority reading. Find the hidden cost, the missing user, the vendor lock. If the room agrees too fast, you are failing.",
    initials: "KD",
    chair: false,
    model: "cloud",
    status: "idle",
  },
];

export const seedSessions: Session[] = [
  {
    id: SESSION_SEED,
    question:
      "Should a self-hosted Grok Bot alternative be a chat app with bots, or a council that records dissent?",
    seatIds: [REED, KADE, VALE],
    chairId: IVO,
    status: "sealed",
    positions: [
      {
        seatId: REED,
        stance:
          "The gap is hosting, inspectable memory, and a different unit of work — not another model picker.",
        body: "Grok Bot is a capable teammate on a computer you do not own. It gets named roles and parallel work right. It withholds the VM, the memory ledger, and any channel that is not theirs. A clone that is still a transcript will lose. A chamber that seals artifacts can win on sovereignty.",
        dissent: false,
      },
      {
        seatId: KADE,
        stance:
          "If you ship chat-first, you are late. If you auto-fire four models on every question, you burn the operator's quota.",
        body: "Dissent is the feature. Cap sitting seats at three. Never convene on page load. Never hide a minority report inside a cheerful summary. The adversary seat is not optional — without it this is a committee that agrees with itself.",
        dissent: true,
      },
      {
        seatId: VALE,
        stance: "Write the decision as a verdict file. Do not narrate the meeting.",
        body: "Voice stays in the dock. The operator should hand a stranger a single verdict page and have them understand the call.",
        dissent: false,
      },
    ],
    verdict:
      "Build a chamber, not a chat clone. Evidence and Adversary sit by default. Work lands as a sealed verdict with a minority report. Cloud models think; the ledger stays here.",
    dissent:
      "Kade: token cost of parallel seats is real. Hard cap of three specialists. No automatic convene.",
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    sealedAt: Date.now() - 1000 * 60 * 60 * 5 + 40000,
  },
];

export const seedMemories: MemoryItem[] = [
  {
    id: "mem_1",
    text: "Operator prefers short, specific writing. No hype. Name the artifact.",
    source: "Standing order",
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: "mem_2",
    text: "Nothing leaves this chamber (email, post, publish) without a seal.",
    source: "Policy",
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: "mem_3",
    text: "A quorum is Evidence + Adversary at minimum. Voice sits when the output is copy.",
    source: "Ivo · procedure",
    createdAt: Date.now() - 1000 * 60 * 60 * 19,
  },
];

export const seedFiles: DockFile[] = [
  {
    id: "file_1",
    path: "/standing/orders.md",
    updatedAt: Date.now() - 1000 * 60 * 60 * 19,
    content: `# Standing orders

1. The unit of work is a session, not a chat bubble.
2. Evidence and Adversary sit by default. Voice sits for drafts.
3. Memory is a ledger. If it is wrong, the operator edits it.
4. External send requires a seal — always.
5. Prefer a file in the dock over a long reply.
`,
  },
  {
    id: "file_2",
    path: "/verdicts/why-not-chat.md",
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    content: `# Verdict — Why Quorum is not a chat app

Decision: Build a chamber. Do not clone Grok Bot's messaging surface.

Why
- Grok Bot is a teammate-in-a-thread with a vendor-hosted computer.
- The lock-in is the computer, the opaque memory, and the chat-as-work metaphor.
- A self-hosted alternative that is still a chat window loses on distribution.

Dissent (Kade)
- Parallel seats cost more tokens than a single router. Cap specialists at three. Never auto-convene.

Owners
- Reed: keep the comparison brief current.
- Vale: voice notes stay in /standing/.
`,
  },
];

export const EXAMPLE_PROMPTS = [
  "Should we ship as a chat app or a council that records dissent?",
  "What is the real product gap versus Grok Bot?",
  "Draft a standing order for when memory may be written.",
  "Where does a self-hosted agent product still lose to a hosted VM?",
];
