import type { SVGProps } from 'react';

/**
 * A top-down rice bowl (paneer tikka, chole, raita, salad) drawn in SVG, used on the
 * sign-in page. Self-contained: no image files or external requests.
 */

// Rice grains on a sunflower spiral: evenly spread, and the same on every render.
const GRAINS = Array.from({ length: 150 }, (_, i) => {
  const angle = i * 2.39996; // the golden angle, in radians
  const radius = 146 * Math.sqrt((i + 0.5) / 150);
  return {
    x: 200 + radius * Math.cos(angle),
    y: 200 + radius * Math.sin(angle),
    rotate: (i * 47) % 180,
  };
});

const PANEER = [
  { x: 234, y: 112, rotate: 12 },
  { x: 270, y: 102, rotate: -18 },
  { x: 298, y: 134, rotate: 24 },
  { x: 252, y: 148, rotate: -6 },
  { x: 288, y: 172, rotate: 14 },
];

const CHICKPEAS = [
  [112, 262],
  [130, 250],
  [149, 258],
  [121, 282],
  [140, 278],
  [159, 276],
  [102, 283],
  [131, 299],
  [151, 296],
  [167, 259],
  [113, 302],
];

const LEAVES = [
  { x: 178, y: 158, rotate: 20 },
  { x: 214, y: 166, rotate: -40 },
  { x: 164, y: 228, rotate: 70 },
  { x: 226, y: 236, rotate: -10 },
  { x: 206, y: 122, rotate: 110 },
  { x: 150, y: 196, rotate: -60 },
  { x: 248, y: 210, rotate: 35 },
  { x: 190, y: 266, rotate: -25 },
  { x: 106, y: 212, rotate: 80 },
  { x: 312, y: 212, rotate: -70 },
  { x: 92, y: 172, rotate: 15 },
  { x: 236, y: 330, rotate: 60 },
];

export function MealBowl({
  idPrefix,
  ...props
}: SVGProps<SVGSVGElement> & {
  /** Gradient ids must be unique on the page when more than one bowl is drawn. */
  idPrefix: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="A bowl of rice with paneer tikka" {...props}>
      <defs>
        {/* A terracotta clay bowl, lit from the top left. */}
        <radialGradient id={id('bowl')} cx="0.36" cy="0.32" r="0.78">
          <stop offset="0.6" stopColor="#d9794a" />
          <stop offset="0.86" stopColor="#bb5a30" />
          <stop offset="1" stopColor="#9a4322" />
        </radialGradient>
        <radialGradient id={id('rice')} cx="0.45" cy="0.42" r="0.65">
          <stop offset="0" stopColor="#fff9ec" />
          <stop offset="1" stopColor="#f1ddb9" />
        </radialGradient>
        <linearGradient id={id('tikka')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8b25a" />
          <stop offset="1" stopColor="#d4501d" />
        </linearGradient>
        <radialGradient id={id('chana')} cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#f5d39b" />
          <stop offset="1" stopColor="#c98a3d" />
        </radialGradient>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      {/* bowl */}
      <circle
        cx="210"
        cy="216"
        r="186"
        fill="#7c3d16"
        opacity="0.22"
        filter={`url(#${id('shadow')})`}
      />
      <circle cx="200" cy="200" r="188" fill={`url(#${id('bowl')})`} />
      <circle
        cx="200"
        cy="200"
        r="181"
        fill="none"
        stroke="#f0a77b"
        strokeOpacity="0.45"
        strokeWidth="2"
      />
      <circle cx="200" cy="200" r="161" fill="#8f3c1d" />
      <circle cx="200" cy="200" r="154" fill={`url(#${id('rice')})`} />

      {/* jeera rice */}
      {GRAINS.map((grain, i) => (
        <ellipse
          key={i}
          cx={grain.x}
          cy={grain.y}
          rx="5.2"
          ry="2"
          transform={`rotate(${grain.rotate} ${grain.x} ${grain.y})`}
          fill="#fffdf6"
          stroke="#ead3ae"
          strokeWidth="0.7"
        />
      ))}

      {/* chole: chickpeas in masala */}
      <ellipse
        cx="136"
        cy="276"
        rx="54"
        ry="42"
        transform="rotate(-20 136 276)"
        fill="#c4672a"
        opacity="0.9"
      />
      {CHICKPEAS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i % 3 === 0 ? 11 : 10} fill={`url(#${id('chana')})`} />
          <circle cx={(x ?? 0) - 3} cy={(y ?? 0) - 3.5} r="2.6" fill="#fff" opacity="0.55" />
        </g>
      ))}

      {/* raita */}
      <circle cx="130" cy="132" r="43" fill="#fffdf8" stroke="#e8d7bf" strokeWidth="3" />
      <circle cx="130" cy="132" r="34" fill="#f9f5ea" />
      {[
        [118, 122],
        [139, 117],
        [146, 138],
        [124, 146],
        [131, 131],
        [112, 136],
        [138, 151],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2} fill={i % 3 ? '#5e9f4a' : '#b5642b'} />
      ))}

      {/* paneer tikka */}
      {PANEER.map((cube, i) => (
        <g key={i} transform={`translate(${cube.x} ${cube.y}) rotate(${cube.rotate})`}>
          <rect x="-16" y="-16" width="32" height="32" rx="8" fill={`url(#${id('tikka')})`} />
          <path
            d="M-10 -3 L4 -11 M-7 8 L9 -1"
            stroke="#8a2c0a"
            strokeOpacity="0.5"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* salad: cucumber, tomato, red onion */}
      {[
        [250, 288],
        [286, 262],
        [276, 306],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="19" fill="#d3e8a6" stroke="#5c9a43" strokeWidth="3.5" />
          <circle cx={x} cy={y} r="7" fill="#eef6d6" />
        </g>
      ))}
      {[
        [312, 238],
        [230, 262],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="13" fill="#e2483a" />
          <circle cx={x} cy={y} r="7" fill="#f58a72" />
        </g>
      ))}
      <circle cx="262" cy="240" r="10" fill="none" stroke="#a83b6e" strokeWidth="2.5" />
      <circle cx="316" cy="278" r="9" fill="none" stroke="#a83b6e" strokeWidth="2.5" />

      {/* green chilli */}
      <path
        d="M152 332 Q200 346 246 328"
        fill="none"
        stroke="#4e9a3d"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M246 328 l9 -5" stroke="#3b7a2d" strokeWidth="4" strokeLinecap="round" />

      {/* lime wedge */}
      <g transform="translate(196 204) rotate(-25)">
        <path d="M-27 0 A27 27 0 0 1 27 0 Z" fill="#d9e46c" stroke="#a5ba3b" strokeWidth="3" />
        <path
          d="M0 0 L-19 -11 M0 0 L-8 -20 M0 0 L8 -20 M0 0 L19 -11"
          stroke="#bccd4e"
          strokeWidth="1.6"
        />
      </g>

      {/* coriander */}
      {LEAVES.map((leaf, i) => (
        <g key={i} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotate})`}>
          <path d="M0 -8 C5 -4 5 4 0 8 C-5 4 -5 -4 0 -8 Z" fill={i % 2 ? '#3f8f46' : '#5aa85a'} />
          <path d="M0 -6 L0 6" stroke="#2f6f35" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}
