'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Box, Flex, Input, Text } from '@chakra-ui/react';
import { C, FONT } from '@/components/menu/ui';
import Icon from './shell/Icon';
import { count, hourName, money, slotLabel, slotTitle, weekday } from '@/lib/stats';

// Charts and cards for the dashboards, drawn in the guest menu's palette (gold, ember, ivory on near-black).
// No chart library: everything is small SVG, so the dashboard stays light.
const SURFACE = 'linear-gradient(150deg, rgba(31,23,17,.94), rgba(18,13,10,.94))';
const RING = 'inset 0 1px 0 rgba(255,244,214,.05), 0 24px 44px -28px rgba(0,0,0,.75)';
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- cards ---------- */
export function Card({ title, hint, action, children, pad = true, ...rest }) {
  return (
    <Box as="section" bg={SURFACE} border="1px solid" borderColor="line" borderRadius="22px" boxShadow={RING} p={pad ? { base: '16px', md: '22px' } : 0} minW={0} position="relative" overflow="hidden" {...rest}>
      {(title || action) && (
        <Flex justify="space-between" align="flex-start" gap={3} mb="16px" wrap="wrap">
          <Box>
            <Text as="h3" fontFamily={FONT.display} fontWeight={700} fontSize="21px" lineHeight={1.1}>{title}</Text>
            {hint && <Text fontSize="12.5px" color="mute" mt="4px">{hint}</Text>}
          </Box>
          {action}
        </Flex>
      )}
      {children}
    </Box>
  );
}

export function Empty({ children, icon = 'trend' }) {
  return (
    <Flex direction="column" align="center" gap="10px" color="mute" py="28px" textAlign="center">
      <Flex w="44px" h="44px" borderRadius="14px" align="center" justify="center" bg="rgba(212,168,75,.08)" color={C.gold}><Icon name={icon} size={20} /></Flex>
      <Text fontSize="14px" maxW="34ch">{children}</Text>
    </Flex>
  );
}

export const Skeleton = (props) => (
  <Box
    borderRadius="22px" border="1px solid" borderColor="line" sx={{ '@keyframes sh': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } } }}
    bg="linear-gradient(100deg, rgba(31,23,17,.9) 30%, rgba(52,40,28,.9) 50%, rgba(31,23,17,.9) 70%)" backgroundSize="200% 100%" animation="sh 1.6s linear infinite" {...props}
  />
);

/* ---------- numbers ---------- */
function useCountUp(target, ms = 800) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return undefined; }
    const a = from.current; const t0 = performance.now(); let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(a + (target - a) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** "▲ 12%" against the period before. `bad` flips the colours where up is worse (cancellations). */
export function Delta({ value, bad = false }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: '4px', px: '8px', py: '2px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 };
  if (value === null || value === undefined) return <Flex {...base} bg="rgba(212,168,75,.14)" color={C.goldSoft}>new</Flex>;
  const r = Math.round(value);
  if (r === 0) return <Flex {...base} bg="rgba(165,150,128,.14)" color="mute">no change</Flex>;
  const good = (r > 0) !== bad;
  return (
    <Flex {...base} bg={good ? 'rgba(63,182,118,.14)' : 'rgba(226,89,78,.15)'} color={good ? C.veg : C.nonveg} aria-label={`${r > 0 ? 'up' : 'down'} ${Math.abs(r)} percent`}>
      <span aria-hidden="true">{r > 0 ? '▲' : '▼'}</span>{Math.abs(r)}%
    </Flex>
  );
}

/** Smooth line through points (x, y), kept inside [lo, hi] so curves never dip below the baseline. */
function curve(pts, lo, hi) {
  if (!pts.length) return '';
  const clamp = (y) => Math.min(hi, Math.max(lo, y));
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2; const t = 0.17;
    d += `C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${clamp(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${clamp(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A tiny trend line for the bottom of a card. */
export function Spark({ values, height = 46, color = C.gold }) {
  const gid = useId().replace(/:/g, '');
  const w = 240;
  if (!values || values.length < 2) return <Box h={`${height}px`} />;
  const max = Math.max(...values, 1); const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i * w) / (values.length - 1), height - 4 - ((v - min) / span) * (height - 10)]);
  const line = curve(pts, 0, height);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".38" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line}L${w} ${height}L0 ${height}Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Headline number. `value` is a number, `format` turns it into text (money, count, percent). */
export function Kpi({ label, icon, value, format = count, delta, bad, sub, hint, spark, foot }) {
  const shown = useCountUp(value);
  return (
    <Box
      bg={SURFACE} border="1px solid" borderColor="line" borderRadius="22px" boxShadow={RING} position="relative" overflow="hidden" minW={0} title={hint}
      transition="border-color .2s, transform .2s" _hover={{ borderColor: C.lineHi, transform: 'translateY(-2px)' }}
    >
      <Box position="absolute" top="-40px" right="-30px" w="140px" h="140px" borderRadius="50%" bg="radial-gradient(circle, rgba(212,168,75,.16), transparent 68%)" pointerEvents="none" />
      <Box p={{ base: '16px', md: '20px' }} pb={spark || foot ? '8px' : undefined} position="relative">
        <Flex align="center" gap="10px" mb="14px">
          {icon && <Flex w="30px" h="30px" borderRadius="10px" align="center" justify="center" bg="rgba(212,168,75,.12)" color={C.gold}><Icon name={icon} size={16} /></Flex>}
          <Text fontSize="11.5px" letterSpacing=".12em" textTransform="uppercase" color="mute" noOfLines={1}>{label}</Text>
        </Flex>
        <Text
          fontFamily={FONT.display} fontWeight={700} fontSize={{ base: '34px', md: '44px' }} lineHeight={1} letterSpacing="-.01em" sx={{ fontVariantNumeric: 'tabular-nums' }}
          bg="linear-gradient(180deg, #fff3d6 10%, #e8c677 60%, #d4a84b)" backgroundClip="text" color="transparent" w="fit-content" maxW="100%" noOfLines={1}
        >{format(shown)}</Text>
        <Flex gap="8px" align="center" mt="12px" wrap="wrap" minH="24px">
          {delta !== undefined && <Delta value={delta} bad={bad} />}
          {sub && <Text as="span" fontSize="12.5px" color="mute">{sub}</Text>}
        </Flex>
      </Box>
      {spark && <Box mt="2px">{spark}</Box>}
      {foot && <Box px={{ base: '16px', md: '20px' }} pb="18px">{foot}</Box>}
    </Box>
  );
}

/** A smaller figure with an icon. */
export function Stat({ icon, label, value, format = count, delta, bad, sub, hint }) {
  const shown = useCountUp(value);
  return (
    <Flex bg={SURFACE} border="1px solid" borderColor="line" borderRadius="18px" p={{ base: '14px', md: '16px' }} gap={{ base: '10px', sm: '14px' }} direction={{ base: 'column', sm: 'row' }} align={{ base: 'flex-start', sm: 'center' }} minW={0} title={hint} boxShadow={RING}>
      <Flex flex="none" w="42px" h="42px" borderRadius="14px" align="center" justify="center" bg="rgba(212,168,75,.1)" color={C.gold}><Icon name={icon} size={20} /></Flex>
      <Box minW={0}>
        <Text fontSize="11px" letterSpacing=".12em" textTransform="uppercase" color="mute" noOfLines={1}>{label}</Text>
        <Flex align="baseline" gap="8px" wrap="wrap">
          <Text fontFamily={FONT.display} fontWeight={700} fontSize="28px" lineHeight={1.15} sx={{ fontVariantNumeric: 'tabular-nums' }}>{format(shown)}</Text>
          {delta !== undefined && <Delta value={delta} bad={bad} />}
        </Flex>
        {sub && <Text fontSize="12px" color="mute" noOfLines={1}>{sub}</Text>}
      </Box>
    </Flex>
  );
}

/** A finding, in a sentence. */
export function Insight({ icon, label, value, sub }) {
  return (
    <Flex gap="14px" align="center" py="13px" borderTop="1px solid" borderColor="line" _first={{ borderTop: 0, pt: 0 }} _last={{ pb: 0 }}>
      <Flex flex="none" w="38px" h="38px" borderRadius="12px" align="center" justify="center" bg="rgba(212,168,75,.1)" color={C.gold}><Icon name={icon} size={18} /></Flex>
      <Box minW={0}>
        <Text fontSize="11px" letterSpacing=".12em" textTransform="uppercase" color="mute">{label}</Text>
        <Text fontWeight={700} fontSize="15.5px" noOfLines={1} title={value}>{value}</Text>
        {sub && <Text fontSize="12.5px" color="mute" noOfLines={1}>{sub}</Text>}
      </Box>
    </Flex>
  );
}

/* ---------- controls ---------- */
export function Segmented({ options, value, onChange, size = 'md', label }) {
  const pad = size === 'sm' ? { px: '12px', py: '5px', fontSize: '12.5px' } : { px: '14px', py: '7px', fontSize: '13.5px' };
  return (
    <Flex role="group" aria-label={label} p="3px" gap="2px" borderRadius="99px" bg="rgba(233,213,176,.06)" border="1px solid" borderColor="line" wrap="wrap" w="fit-content">
      {options.map(([k, text]) => {
        const on = value === k;
        return (
          <Box
            key={k} as="button" type="button" aria-pressed={on} onClick={() => onChange(k)} borderRadius="99px" fontWeight={on ? 700 : 500} transition="all .18s" {...pad}
            color={on ? '#1a1209' : 'mute'} bg={on ? `linear-gradient(135deg, ${C.goldSoft}, ${C.gold})` : 'transparent'} boxShadow={on ? '0 4px 14px -4px rgba(212,168,75,.6)' : 'none'} _hover={{ color: on ? '#1a1209' : 'ink' }}
          >{text}</Box>
        );
      })}
    </Flex>
  );
}

const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom']];
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function RangePicker({ value, onChange }) {
  const today = iso(new Date());
  const [from, setFrom] = useState(value.from || iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(value.to || today);
  const bad = !from || !to || from > to;
  return (
    <Flex direction="column" align={{ base: 'flex-start', md: 'flex-end' }} gap="10px">
      <Segmented label="Period" options={PRESETS} value={value.range} onChange={(k) => (k === 'custom' ? onChange({ range: 'custom', from, to }) : onChange({ range: k }))} size="sm" />
      {value.range === 'custom' && (
        <Flex gap="8px" align="center" wrap="wrap">
          <Input type="date" size="sm" w="auto" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Text color="mute" fontSize="13px">to</Text>
          <Input type="date" size="sm" w="auto" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <Box as="button" type="button" disabled={bad} onClick={() => onChange({ range: 'custom', from, to })} px="14px" py="6px" borderRadius="99px" fontSize="13px" fontWeight={700} color="#1a1209" bg={`linear-gradient(135deg, ${C.goldSoft}, ${C.gold})`} opacity={bad ? 0.5 : 1}>Apply</Box>
        </Flex>
      )}
    </Flex>
  );
}

/* ---------- trend line ---------- */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 0 to 1 over a second whenever `key` changes: drives the left-to-right reveal of a chart. */
function useReveal(key, ms = 1000) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduced()) { setP(1); return undefined; }
    setP(0);
    const t0 = performance.now(); let raf;
    const step = (t) => {
      const x = Math.max(0, Math.min(1, (t - t0) / ms)); // the frame time can be a hair before t0
      setP(1 - (1 - x) ** 3);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms]);
  return p;
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * p;
};

/** This period as a glowing gold line over a soft fill, the period before as a dashed one. Hover or touch to read a point. */
export function TrendChart({ series, metric, currency, bucket, tz, height = 344 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  const cur = metric === 'revenue' ? 'revenue' : 'orders';
  const prev = metric === 'revenue' ? 'prevRevenue' : 'prevOrders';
  const fmt = (v, short) => (metric === 'revenue' ? money(v, currency, short) : count(v));

  const n = series.length;
  const pad = { l: metric === 'revenue' ? 58 : 40, r: 12, t: 14, b: 28 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.map((s) => s[cur]), ...series.map((s) => s[prev])));
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const pts = (k) => series.map((s, i) => [x(i), y(s[k])]);
  const base = y(0);
  const line = curve(pts(cur), pad.t, base);
  const area = n ? `${line}L${x(n - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z` : '';
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const total = series.reduce((a, s) => a + s[cur], 0);
  const reveal = useReveal(`${metric}-${n}-${total}`);

  function move(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }
  const h = hover === null ? null : series[hover];
  const tipLeft = h ? Math.min(Math.max(x(hover) - 88, 0), Math.max(0, width - 184)) : 0;

  return (
    <Box ref={ref} position="relative" w="100%" h={`${height}px`} sx={{ touchAction: 'pan-y' }}>
      {width > 0 && (
        <svg
          width={width} height={height} role="img" aria-label={`${metric === 'revenue' ? 'Revenue' : 'Orders'} over time, ${fmt(total)} in total`}
          onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.gold} stopOpacity=".34" /><stop offset="70%" stopColor={C.ember} stopOpacity=".05" /><stop offset="100%" stopColor={C.ember} stopOpacity="0" /></linearGradient>
            <linearGradient id={`l${gid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={C.ember} /><stop offset="55%" stopColor={C.goldSoft} /><stop offset="100%" stopColor={C.gold} /></linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y((max * t) / 4)} y2={y((max * t) / 4)} stroke="rgba(233,213,176,.09)" strokeWidth="1" strokeDasharray={t ? '2 5' : undefined} />
              <text x={pad.l - 10} y={y((max * t) / 4) + 4} textAnchor="end" fontSize="11" fill={C.mute}>{fmt((max * t) / 4, true)}</text>
            </g>
          ))}
          {series.map((s, i) => (i % every === 0 ? (
            <text key={s.t} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : x(i) > width - pad.r - 28 ? 'end' : 'middle'} fontSize="11" fill={C.mute}>{slotLabel(s.t, bucket, tz)}</text>
          ) : null))}
          <path d={curve(pts(prev), pad.t, base)} fill="none" stroke={C.mute} strokeWidth="1.5" strokeDasharray="5 5" opacity=".65" />
          {/* The line and fill are revealed left to right through a clip that grows. */}
          <clipPath id={`c${gid}`}><rect x={pad.l - 4} y={0} width={(iw + 8) * reveal} height={height} /></clipPath>
          <g clipPath={`url(#c${gid})`}>
            <path d={area} fill={`url(#a${gid})`} />
            <path d={line} fill="none" stroke={C.gold} strokeOpacity=".16" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line} fill="none" stroke={`url(#l${gid})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={base} stroke={C.gold} strokeWidth="1" opacity=".4" strokeDasharray="3 4" />
              <circle cx={x(hover)} cy={y(h[prev])} r="3.5" fill={C.panel} stroke={C.mute} strokeWidth="1.5" />
              <circle cx={x(hover)} cy={y(h[cur])} r="9" fill={C.gold} opacity=".18" />
              <circle cx={x(hover)} cy={y(h[cur])} r="4.5" fill={C.goldSoft} stroke={C.panel} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {h && (
        <Box position="absolute" top="4px" left={`${tipLeft}px`} pointerEvents="none" bg="rgba(21,16,12,.94)" backdropFilter="blur(8px)" border="1px solid" borderColor={C.lineHi} borderRadius="12px" px="12px" py="8px" fontSize="12.5px" boxShadow="0 14px 30px rgba(0,0,0,.5)" w="176px">
          <Text fontWeight={700} mb="3px">{slotTitle(h.t, bucket, tz)}</Text>
          <Flex justify="space-between"><Text color={C.goldSoft}>This period</Text><Text fontWeight={700}>{fmt(h[cur])}</Text></Flex>
          <Flex justify="space-between"><Text color="mute">Before</Text><Text>{fmt(h[prev])}</Text></Flex>
        </Box>
      )}
    </Box>
  );
}

export function Legend() {
  return (
    <Flex gap="16px" fontSize="12px" color="mute" align="center">
      <Flex align="center" gap="6px"><Box w="18px" h="3px" borderRadius="2px" bg={`linear-gradient(90deg, ${C.ember}, ${C.gold})`} />This period</Flex>
      <Flex align="center" gap="6px"><Box w="18px" h="0" borderTop="2px dashed" borderColor="mute" opacity={0.7} />Before</Flex>
    </Flex>
  );
}

/* ---------- ranked bars ---------- */
export function BarList({ rows, format = count, empty = 'Nothing yet.' }) {
  if (!rows.length) return <Empty icon="dishes">{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Box as="ol" listStyleType="none" m={0} p={0}>
      {rows.map((r, i) => (
        <Flex as="li" key={`${r.label}-${i}`} gap="12px" align="flex-start" mb={i === rows.length - 1 ? 0 : '14px'}>
          <Flex
            flex="none" w="26px" h="26px" borderRadius="8px" align="center" justify="center" fontSize="12px" fontWeight={700} mt="1px"
            bg={i === 0 ? `linear-gradient(135deg, ${C.goldSoft}, ${C.gold})` : 'rgba(233,213,176,.07)'} color={i === 0 ? '#1a1209' : 'mute'}
          >{i + 1}</Flex>
          <Box flex={1} minW={0}>
            <Flex justify="space-between" gap={3} fontSize="14.5px">
              <Text noOfLines={1} fontWeight={600} title={r.label}>{r.label}</Text>
              <Text flex="none" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{format(r.value)}</Text>
            </Flex>
            <Box h="6px" bg="rgba(233,213,176,.08)" borderRadius="99px" mt="7px" overflow="hidden">
              <Box h="100%" w={`${Math.max(3, (r.value / max) * 100)}%`} bg={`linear-gradient(90deg, ${C.ember}, ${C.gold} 70%, ${C.goldSoft})`} borderRadius="99px" boxShadow="0 0 10px rgba(212,168,75,.4)" transition="width .6s cubic-bezier(.2,.8,.2,1)" />
            </Box>
            {r.sub && <Text fontSize="12px" color="mute" mt="5px">{r.sub}</Text>}
          </Box>
        </Flex>
      ))}
    </Box>
  );
}

/* ---------- donut ---------- */
export function Donut({ parts, center, caption, size = 168, thickness = 18 }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - thickness) / 2; const circ = 2 * Math.PI * r;
  let offset = 0;
  const live = parts.filter((p) => p.value > 0);
  return (
    <Flex align="center" gap="22px" wrap="wrap">
      <Box position="relative" w={`${size}px`} h={`${size}px`} flex="none">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(233,213,176,.08)" strokeWidth={thickness} />
          {total > 0 && live.map((p) => {
            const len = (p.value / total) * circ; const gap = live.length > 1 ? 4 : 0;
            const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${Math.max(0, len - gap)} ${circ}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
            offset += len;
            return el;
          })}
        </svg>
        <Flex position="absolute" inset={0} direction="column" align="center" justify="center" textAlign="center">
          <Text fontFamily={FONT.display} fontWeight={700} fontSize="32px" lineHeight={1}>{center}</Text>
          {caption && <Text fontSize="11px" letterSpacing=".12em" textTransform="uppercase" color="mute" mt="4px">{caption}</Text>}
        </Flex>
      </Box>
      <Box flex={1} minW="150px">
        {parts.map((p) => (
          <Flex key={p.label} align="center" gap="10px" py="6px" fontSize="14px">
            <Box w="10px" h="10px" borderRadius="3px" bg={p.color} flex="none" />
            <Text flex={1}>{p.label}</Text>
            <Text fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{count(p.value)}</Text>
            <Text color="mute" w="40px" textAlign="right" fontSize="13px">{total ? `${Math.round((p.value / total) * 100)}%` : '0%'}</Text>
          </Flex>
        ))}
      </Box>
    </Flex>
  );
}

/* ---------- weekday x hour heat map ---------- */
const ORDER = [2, 3, 4, 5, 6, 7, 1]; // Monday first; MongoDB's 1 = Sunday

export function Heatmap({ cells }) {
  if (!cells.length) return <Empty icon="clock">No orders in this period.</Empty>;
  const grid = new Map(cells.map((c) => [`${c.d}-${c.h}`, c.n]));
  const max = Math.max(...cells.map((c) => c.n));
  let lo = Math.min(...cells.map((c) => c.h)); let hi = Math.max(...cells.map((c) => c.h));
  lo = Math.max(0, Math.min(lo, hi - 7)); hi = Math.min(23, Math.max(hi, lo + 7));
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const short = (h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
  const tone = (n) => { const t = n / max; return t > 0.78 ? `rgba(224,138,70,${0.55 + t * 0.45})` : `rgba(212,168,75,${0.1 + t * 0.75})`; };
  return (
    <Box overflowX="auto" pb="2px">
      <Box minW={`${hours.length * 16 + 40}px`}>
        <Flex pl="40px" mb="6px">
          {hours.map((h) => (
            <Box key={h} flex={1} minW={0} position="relative" h="12px">
              {(h - lo) % 3 === 0 && <Text position="absolute" left={0} fontSize="10px" color="mute" whiteSpace="nowrap" lineHeight="12px">{short(h)}</Text>}
            </Box>
          ))}
        </Flex>
        {ORDER.map((d) => (
          <Flex key={d} align="center" mb="3px">
            <Text w="40px" fontSize="11.5px" color="mute">{weekday(d)}</Text>
            {hours.map((h) => {
              const n = grid.get(`${d}-${h}`) || 0;
              return (
                <Box
                  key={h} flex={1} minW={0} h="24px" mr="3px" borderRadius="6px" bg="rgba(233,213,176,.05)" title={`${weekday(d)} ${hourName(h)}: ${n} order${n === 1 ? '' : 's'}`}
                  aria-label={`${weekday(d)} ${hourName(h)}: ${n} orders`} sx={n ? { background: tone(n), boxShadow: n / max > 0.78 ? '0 0 12px rgba(224,138,70,.45)' : 'none' } : undefined}
                />
              );
            })}
          </Flex>
        ))}
        <Flex pl="40px" mt="12px" align="center" gap="8px" fontSize="11px" color="mute">
          <Text>Quiet</Text>
          <Box h="6px" w="110px" borderRadius="99px" bg={`linear-gradient(90deg, rgba(212,168,75,.12), rgba(212,168,75,.85), ${C.ember})`} />
          <Text>Busy</Text>
        </Flex>
      </Box>
    </Box>
  );
}
