// Original procedural pixel-art agents. Each class has its own silhouette;
// palette, weapon, gadget badge and corner (eye glow) are layered on top.
import { memo, type ReactElement } from 'react';
import { GADGETS, PALETTES, type ClassId, type GadgetId, type PaletteId, type WeaponId } from '../../shared/game';

const BODIES: Record<ClassId, string[]> = {
  trooper: [
    '................', '.....HHHHHH.....', '....HHWBBHHH....', '...HHHHHHHHHH...', '...hhhhhhhhhh...', '....FVVFFVVF....',
    '....FVEFFVEF....', '....FFFFFFFF....', '.....fFFFFf.....', '....SSSAASSS....', '...FSSSSSSSSF...', '...FSSssssSSF...',
    '....SSSSSSSS....', '....SS....SS....', '....ss....ss....', '...KKK....KKK...'
  ],
  heavy: [
    '................', '....HHHHHHHH....', '...HHHWBBHHHH...', '..HHHHHHHHHHHH..', '..hhhhhhhhhhhh..', '...FVVVFFVVVF...',
    '...FVEVFFVEVF...', '...FFFFFFFFFF...', '..SSSfFFFFfSSS..', '.SSSSSSAASSSSSS.', '.SSSSSSSSSSSSSS.', '.FSSSssssssSSSF.',
    '..SSSSSSSSSSSS..', '...SSS....SSS...', '...sss....sss...', '..KKKK....KKKK..'
  ],
  flanker: [
    '................', '......HHHH......', '.....HWBBHH.....', '....HHHHHHHH....', '....hHHHHHHh....', '.....FVVVVF.....',
    '.....FEVVEF.....', '.....FFFFFF.....', '..AAAAfFFfS.....', '.AA..ASSSSS.....', '......SSSSSF....', '.....FSssSS.....',
    '......SSSS......', '......S..S......', '.....ss...s.....', '....KK....KK....'
  ],
  sniper: [
    '................', '.....HHHHHH.....', '....HHWBBHHH....', '...HHHHHHHHHH...', '...hhhhhhhhhh...', '....FFFFFFFF....',
    '....VVVVEEVV....', '....FFFFFFFF....', '....AfFFFFfA....', '...AASSSSSSAA...', '...ASSSSSSSSA...', '...AFSssssSFA...',
    '...A.SSSSSS.A...', '......S..S......', '......s..s......', '.....KK..KK.....'
  ]
};

// Weapon art: [x, y, rows]. G = gunmetal, g = dark, M = muzzle accent.
const WEAPON_ART: Record<WeaponId, [number, number, string[]]> = {
  pulse_carbine: [11, 10, ['GGGGGM', '.g....']],
  burst_rifle: [11, 10, ['GGGGGGM', '.g.g...']],
  scatter_cannon: [10, 10, ['gGGGGM', 'gGGGGM', '.g....']],
  arc_maul: [13, 6, ['MMM', 'MMM', '.G.', '.G.', '.G.', '.g.']],
  twin_smg: [11, 10, ['GGGM', 'g...', '.GGGM']],
  needle_pistol: [12, 10, ['GGGM', 'g...']],
  rail_lance: [9, 9, ['....g....', 'GGGGGGGGM', '...g.....']],
  longbow_mk2: [13, 5, ['.M', 'G.', 'G.', 'G.', 'G.', 'G.', '.M']]
};

const FIXED: Record<string, string> = { F: '#ebe9f7', f: '#b9b5d6', V: '#0b0f22', K: '#141933', W: '#ffffff', G: '#8c92b8', g: '#3a4066' };
export const CORNER_EYE = { a: '#d6c8ff', b: '#86f4ff' };

export interface AgentLook { classId: ClassId; weapon: WeaponId; gadget: GadgetId; palette: PaletteId }

function PixelAgentImpl({ look, corner = 'a', size = 96, flip = false, title, className = '' }: { look: AgentLook; corner?: 'a' | 'b'; size?: number; flip?: boolean; title?: string; className?: string }) {
  const pal = PALETTES[look.palette] ?? PALETTES.violet;
  const color = (ch: string) => {
    switch (ch) {
      case 'H': return pal.H; case 'h': return pal.h; case 'S': return pal.S; case 's': return pal.s; case 'A': return pal.A;
      case 'B': return GADGETS[look.gadget]?.badge ?? '#fff'; case 'E': return CORNER_EYE[corner];
      case 'M': return corner === 'a' ? '#b79cff' : '#5ee9f7';
      default: return FIXED[ch];
    }
  };
  const rects: ReactElement[] = [];
  const body = BODIES[look.classId] ?? BODIES.trooper;
  body.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = color(row[x]); if (row[x] !== '.' && c) rects.push(<rect key={`b${x}-${y}`} x={x + 1} y={y} width={1.02} height={1.02} fill={c} />); } });
  const [wx, wy, art] = WEAPON_ART[look.weapon] ?? WEAPON_ART.pulse_carbine;
  art.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) { const ch = row[dx]; if (ch !== '.') rects.push(<rect key={`w${dx}-${dy}`} x={wx + dx + 1} y={wy + dy} width={1.02} height={1.02} fill={color(ch)} />); } });
  return (
    <svg className={`pixel-agent ${className}`} width={size} height={size} viewBox="0 0 20 17" shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <ellipse cx="9" cy="16.4" rx="5" ry="0.6" fill="rgba(0,0,0,.45)" />
      {rects}
    </svg>
  );
}
export const PixelAgent = memo(PixelAgentImpl);
