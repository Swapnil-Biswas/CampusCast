// One small clay-style illustration per section (260 x 170 box). Thick ink outline, flat fills, a few floating accents.
const K = "#1b1a17", CR = "#fff7dc", CL = "#e8603c", MU = "#f3b63f", SK = "#8ec5d6", GN = "#7fb48a", LI = "#c58ad1", PK = "#ffb8c6";
const S = { stroke: K, strokeWidth: 4.5, strokeLinejoin: "round", strokeLinecap: "round" };
const Spark = ({ x, y, s = 1, c = CR }) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -10c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" fill={c} stroke={K} strokeWidth="3" strokeLinejoin="round" />;

const SCENES = {
  // 01 Hackathon: laptop with code, a timer chip, a trophy
  Hackathon: (
    <>
      <rect x="40" y="34" width="132" height="86" rx="10" fill={SK} />
      <path d="M22 132h168l-12-12H34z" fill={LI} />
      <path d="M72 62l-16 16 16 16M140 62l16 16-16 16M114 56l-12 44" fill="none" />
      <rect x="150" y="14" width="86" height="36" rx="18" fill={MU} />
      <text x="193" y="39" textAnchor="middle" fontFamily="monospace" fontWeight="700" fontSize="19" fill={K} stroke="none">02:14:09</text>
      <g transform="translate(196 84)"><path d="M0 0h40v26c0 14-9 22-20 22S0 40 0 26z" fill={MU} /><path d="M20 48v14M8 70h24" fill="none" /></g>
      <Spark x={30} y={22} s={0.9} />
    </>
  ),
  // 02 Department notifications: a college building with a flag and a circular
  "Department Notifications": (
    <>
      <path d="M30 150V70l70-34 70 34v80z" fill={CR} />
      <path d="M30 70l70-34 70 34" fill={CL} />
      <path d="M100 36V12l24 8-24 8" fill={MU} />
      {[56, 88, 120, 144].map((x, i) => <rect key={i} x={x} y={92} width="16" height="24" rx="8" fill={SK} />)}
      <path d="M86 150v-26a14 14 0 0128 0v26z" fill={K} />
      <g transform="translate(176 38) rotate(8)"><rect width="64" height="80" rx="8" fill={PK} /><path d="M12 22h40M12 38h40M12 54h26" fill="none" /><circle cx="48" cy="62" r="9" fill={GN} /></g>
      <Spark x={228} y={24} s={0.8} c={MU} />
    </>
  ),
  // 03 Examinations: calendar with the date circled, alarm bell, pencil
  Examinations: (
    <>
      <rect x="34" y="30" width="130" height="118" rx="14" fill={CR} />
      <path d="M34 62h130" fill="none" /><path d="M66 20v22M132 20v22" fill="none" strokeWidth="6" />
      <path d="M34 44a14 14 0 0114-14h102a14 14 0 0114 14v18H34z" fill={CL} />
      {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={56 + (i % 3) * 36} cy={86 + Math.floor(i / 3) * 30} r="5" fill={K} stroke="none" />)}
      <circle cx="128" cy="116" r="19" fill="none" stroke={CL} strokeWidth="5" />
      <g transform="translate(188 46)"><path d="M0 40a26 26 0 0152 0v12H0z" fill={MU} /><circle cx="26" cy="62" r="7" fill={CL} /><path d="M-8 22l-8-8M60 22l8-8" fill="none" /></g>
      <g transform="translate(176 112) rotate(-20)"><rect width="70" height="14" rx="3" fill={SK} /><path d="M70 0l14 7-14 7z" fill={PK} /></g>
    </>
  ),
  // 04 Workshops: a screen with a presenter, seats below
  Workshops: (
    <>
      <rect x="38" y="20" width="186" height="96" rx="10" fill={CR} />
      <path d="M62 44h90M62 62h66M62 80h80" fill="none" />
      <rect x="152" y="68" width="52" height="32" rx="6" fill={SK} />
      <path d="M66 148v-14a12 12 0 0124 0v14" fill={GN} />
      <circle cx="78" cy="118" r="0" />
      {[84, 128, 172, 216].map((x, i) => <g key={i}><circle cx={x} cy={142} r="11" fill={[MU, LI, PK, SK][i]} /><path d={`M${x - 14} 168v-6a14 14 0 0128 0v6`} fill={[MU, LI, PK, SK][i]} /></g>)}
      <path d="M232 52l22-10" fill="none" />
      <circle cx="236" cy="22" r="10" fill={MU} />
    </>
  ),
  // 05 Cultural events: theatre masks and a music note
  "Cultural Events": (
    <>
      <g transform="translate(46 28) rotate(-10)"><path d="M0 0h74v44c0 32-16 52-37 52S0 76 0 44z" fill={MU} /><circle cx="22" cy="38" r="7" fill={K} stroke="none" /><circle cx="52" cy="38" r="7" fill={K} stroke="none" /><path d="M20 62q17 18 34 0" fill="none" /></g>
      <g transform="translate(126 44) rotate(12)"><path d="M0 0h74v44c0 32-16 52-37 52S0 76 0 44z" fill={LI} /><path d="M14 38q8-9 16 0M44 38q8-9 16 0" fill="none" /><path d="M20 76q17-14 34 0" fill="none" /></g>
      <g transform="translate(218 16)"><circle cx="8" cy="48" r="10" fill={CL} /><path d="M17 48V6l22 8" fill="none" /></g>
      <Spark x={36} y={142} s={0.9} c={PK} /><Spark x={228} y={130} s={0.7} />
    </>
  ),
  // 06 Connect: two people linked by a dotted line, with a chat bubble
  Connect: (
    <>
      <g><circle cx="70" cy="62" r="24" fill={PK} /><path d="M26 138a44 44 0 0188 0z" fill={SK} /></g>
      <g><circle cx="192" cy="62" r="24" fill={MU} /><path d="M148 138a44 44 0 0188 0z" fill={GN} /></g>
      <path d="M100 98q30-34 62 0" fill="none" strokeDasharray="2 10" strokeWidth="6" />
      <g transform="translate(96 14)"><rect width="70" height="36" rx="16" fill={CR} /><path d="M20 36l-6 12 18-12z" fill={CR} /><circle cx="22" cy="18" r="4" fill={K} stroke="none" /><circle cx="35" cy="18" r="4" fill={K} stroke="none" /><circle cx="48" cy="18" r="4" fill={K} stroke="none" /></g>
    </>
  ),
  // 07 Notes & previous papers: stacked papers, a tab and a magnifier
  "Notes & Previous Papers": (
    <>
      <g transform="rotate(-8 100 90)"><rect x="46" y="26" width="110" height="130" rx="8" fill={SK} /></g>
      <g transform="rotate(4 100 90)"><rect x="56" y="24" width="110" height="130" rx="8" fill={PK} /></g>
      <rect x="66" y="22" width="110" height="130" rx="8" fill={CR} />
      <path d="M84 52h72M84 70h72M84 88h50M84 106h62" fill="none" />
      <rect x="156" y="36" width="34" height="22" rx="6" fill={MU} />
      <circle cx="196" cy="108" r="26" fill="#cfeaf4" /><path d="M214 128l26 26" fill="none" strokeWidth="9" />
      <path d="M184 100a14 14 0 0114-8" fill="none" strokeWidth="3.5" />
    </>
  ),
  // 08 CampusXchange: a book and a tag swapping places
  CampusXchange: (
    <>
      <g transform="translate(34 38)"><rect width="74" height="94" rx="8" fill={CL} /><path d="M14 0v94" fill="none" /><path d="M30 28h30M30 44h22" fill="none" stroke={CR} /></g>
      <g transform="translate(160 56) rotate(10)"><path d="M0 14L28 0h38a8 8 0 018 8v50a8 8 0 01-8 8H8a8 8 0 01-8-8z" fill={MU} /><circle cx="22" cy="18" r="6" fill={CR} /><path d="M26 44h34" fill="none" /></g>
      <path d="M112 62h40l-12-12M148 108h-40l12 12" fill="none" strokeWidth="6" />
      <Spark x={130} y={26} s={0.9} c={GN} />
    </>
  ),
  // 09 Free mentorship: a senior in a cap passing a lightbulb to a junior
  "Free Mentorship": (
    <>
      <circle cx="74" cy="76" r="22" fill={PK} /><path d="M30 148a44 44 0 0188 0z" fill={GN} />
      <path d="M44 62l30-14 30 14-30 12z" fill={K} /><path d="M104 62v16" fill="none" />
      <circle cx="196" cy="94" r="18" fill={MU} /><path d="M164 154a32 32 0 0164 0z" fill={SK} />
      <g transform="translate(120 20)"><path d="M20 4a22 22 0 0112 40v10H8V44A22 22 0 0120 4z" fill={MU} /><path d="M10 62h20M13 70h14" fill="none" /></g>
      <path d="M112 100q10 14 34 0" fill="none" strokeDasharray="2 9" strokeWidth="5" />
    </>
  ),
};

export default function ModuleArt({ name }) {
  return (
    <svg viewBox="0 0 260 172" {...S} fill="none" aria-hidden="true">
      {SCENES[name]}
    </svg>
  );
}
