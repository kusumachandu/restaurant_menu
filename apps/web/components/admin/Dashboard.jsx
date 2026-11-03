'use client';
import { useMemo, useState } from 'react';
import { Box, SimpleGrid } from '@chakra-ui/react';
import { PageHeader } from './shell/AdminShell';
import { BarList, Card, Donut, Empty, Heatmap, Insight, Kpi, Legend, RangePicker, Segmented, Skeleton, Spark, Stat, TrendChart } from './charts';
import { C } from '@/components/menu/ui';
import { change, count, hourName, loadRange, money, percent, ratio, saveRange, slotTitle, useStats, weekday } from '@/lib/stats';

const AGO = (d) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

// "Saturday, around 8 PM": the busiest weekday and hour in the period.
function busiest(cells) {
  if (!cells.length) return null;
  const days = {}; const hours = {};
  for (const c of cells) { days[c.d] = (days[c.d] || 0) + c.n; hours[c.h] = (hours[c.h] || 0) + c.n; }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  const [d, dn] = top(days); const [h] = top(hours);
  return { day: weekday(Number(d)), dayOrders: dn, hour: hourName(Number(h)) };
}

export default function Dashboard({ name }) {
  const [pick, setPick] = useState(loadRange); // the screen only loads in the browser, so localStorage is there
  const [metric, setMetric] = useState('revenue');
  const [dishBy, setDishBy] = useState('byRevenue');
  const choose = (p) => { setPick(p); saveRange(p); };

  const { data, error, loading, reload } = useStats('/admin/analytics', pick);
  const cur = data?.totals.cur;
  const prev = data?.totals.prev;
  const cash = data?.currency || '₹';
  const g = data?.guests;
  const peak = useMemo(() => (data ? busiest(data.heatmap) : null), [data]);
  const sparks = useMemo(() => (data ? {
    revenue: data.series.map((s) => s.revenue),
    orders: data.series.map((s) => s.orders),
    avg: data.series.map((s) => (s.orders ? s.revenue / s.orders : 0)),
  } : null), [data]);
  const best = useMemo(() => (data ? data.series.reduce((a, s) => (s.revenue > (a?.revenue ?? -1) ? s : a), null) : null), [data]);

  const rate = (t) => ratio(t.cancelled, t.orders + t.cancelled);
  const seen = g ? g.newGuests + g.returning : 0;
  const showGuests = data && (data.checkIn || g.total > 0);

  return (
    <Box>
      <PageHeader
        eyebrow="Insights" title="Dashboard"
        subtitle={(
          <>
            {name ? `${name} · ` : ''}{data ? `updated ${AGO(data.generatedAt)}` : 'loading…'}
            {data && <Box as="button" type="button" ml="10px" color={C.gold} fontWeight={600} disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Box>}
          </>
        )}
        actions={<RangePicker value={pick} onChange={choose} />}
      />

      {error && <Box color="danger" fontSize="14px" role="alert" mb={3}>{error}</Box>}

      {!data && !error && (
        <Box>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing="16px">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h="190px" />)}</SimpleGrid>
          <Skeleton h="380px" mt="18px" />
        </Box>
      )}

      {data && (
        <Box opacity={loading ? 0.75 : 1} transition="opacity .2s" display="flex" flexDirection="column" gap={{ base: '14px', md: '18px' }}>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={{ base: '14px', md: '18px' }}>
            <Kpi
              label="Revenue" icon="cash" value={cur.revenue} format={(v) => money(v, cash)} delta={change(cur.revenue, prev.revenue)} sub={`${money(cur.settled, cash, true)} settled`}
              hint="Value of orders that were not cancelled. Settled = tables whose bill is paid." spark={<Spark values={sparks.revenue} />}
            />
            <Kpi label="Orders" icon="bag" value={cur.orders} delta={change(cur.orders, prev.orders)} sub={`${count(cur.items)} items`} spark={<Spark values={sparks.orders} color={C.ember} />} />
            <Kpi label="Average order" icon="receipt" value={cur.avgOrder} format={(v) => money(v, cash)} delta={change(cur.avgOrder, prev.avgOrder)} sub="per order" spark={<Spark values={sparks.avg} />} />
            <Kpi
              label="Cancelled" icon="ban" value={rate(cur)} format={(v) => percent(v, 1)} delta={change(rate(cur), rate(prev))} bad sub={`${count(cur.cancelled)} orders`}
              hint="Cancelled orders as a share of all orders placed."
              foot={<Box h="6px" borderRadius="99px" bg="rgba(226,89,78,.25)" overflow="hidden" mt="14px"><Box h="100%" w={`${Math.max(0, 100 - rate(cur))}%`} bg={`linear-gradient(90deg, ${C.ember}, ${C.gold})`} borderRadius="99px" /></Box>}
            />
          </SimpleGrid>

          {showGuests ? (
            <SimpleGrid columns={{ base: 2, xl: 4 }} spacing={{ base: '14px', md: '18px' }}>
              <Stat icon="seat" label="Tables seated" value={g.visits} delta={change(g.visits, g.prevVisits)} sub="guest check-ins" hint="Parties that verified their mobile number at a table." />
              <Stat icon="guests" label="People" value={g.people} delta={change(g.people, g.prevPeople)} sub={g.visits ? `${(g.people / g.visits).toFixed(1)} per table` : undefined} />
              <Stat icon="spark" label="New guests" value={g.newGuests} delta={change(g.newGuests, g.prevNewGuests)} sub="first visit" />
              <Stat icon="repeat" label="Returning" value={g.returning} sub={seen ? `${Math.round(ratio(g.returning, seen))}% of guests` : undefined} hint="Guests who had visited before this period and came back." />
            </SimpleGrid>
          ) : (
            <Card pad={false}><Box px="22px" py="16px" fontSize="14px" color="mute">Guest numbers appear here once you switch on “Ask guests to verify their mobile number” in Restaurant settings.</Box></Card>
          )}

          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={{ base: '14px', md: '18px' }}>
            <Card
              gridColumn={{ xl: 'span 2' }} title={metric === 'revenue' ? 'Revenue over time' : 'Orders over time'} hint={data.range.bucket === 'hour' ? 'By the hour' : 'By day'}
              action={<Box display="flex" gap="14px" alignItems="center" flexWrap="wrap"><Legend /><Segmented size="sm" label="Show" options={[['revenue', 'Revenue'], ['orders', 'Orders']]} value={metric} onChange={setMetric} /></Box>}
            >
              {cur.orders === 0 && prev.orders === 0 ? <Empty>No orders in this period yet. They will appear here as guests order.</Empty> : (
                <TrendChart series={data.series} metric={metric} currency={cash} bucket={data.range.bucket} tz={data.range.tz} />
              )}
            </Card>
            <Card title="Highlights" hint="What stands out in this period">
              {cur.orders === 0 ? <Empty icon="spark">Highlights show up after the first orders.</Empty> : (
                <>
                  {peak && <Insight icon="flame" label="Busiest" value={`${peak.day}, around ${peak.hour}`} sub={`${count(peak.dayOrders)} orders on ${peak.day}s`} />}
                  {best && best.revenue > 0 && <Insight icon="trend" label={data.range.bucket === 'hour' ? 'Best hour' : 'Best day'} value={slotTitle(best.t, data.range.bucket, data.range.tz)} sub={money(best.revenue, cash)} />}
                  {data.dishes.byQty[0] && <Insight icon="dishes" label="Best seller" value={data.dishes.byQty[0]._id} sub={`${count(data.dishes.byQty[0].qty)} sold`} />}
                  {data.tables[0] && <Insight icon="tables" label="Top table" value={data.tables[0].name} sub={`${money(data.tables[0].revenue, cash)} · ${count(data.tables[0].orders)} orders`} />}
                  <Insight icon="bag" label="Items per order" value={(cur.items / cur.orders).toFixed(1)} sub={`${percent(ratio(cur.linked, cur.orders))} of orders linked to a guest`} />
                </>
              )}
            </Card>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={{ base: '14px', md: '18px' }}>
            <Card gridColumn={{ xl: 'span 2' }} title="Busiest times" hint={peak ? `${peak.day} is the busiest day and ${peak.hour} the busiest hour` : 'Orders by weekday and hour'}>
              <Heatmap cells={data.heatmap} />
            </Card>
            <Card title="How orders ended" hint="Not cancelled, and who cancelled">
              <Donut
                size={150} thickness={16} center={count(cur.orders + cur.cancelled)} caption="orders placed"
                parts={[
                  { label: 'Not cancelled', value: cur.orders, color: C.gold },
                  { label: 'Cancelled by guest', value: cur.cancelledByCustomer, color: C.mute },
                  { label: 'Cancelled by kitchen', value: cur.cancelledByKitchen, color: C.nonveg },
                ]}
              />
            </Card>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: '14px', md: '18px' }}>
            <Card
              title="Top dishes" hint="Not counting cancelled orders"
              action={<Segmented size="sm" label="Rank by" options={[['byRevenue', 'Revenue'], ['byQty', 'Sold']]} value={dishBy} onChange={setDishBy} />}
            >
              <BarList
                rows={data.dishes[dishBy].map((d) => ({ label: d._id, value: dishBy === 'byQty' ? d.qty : d.revenue, sub: dishBy === 'byQty' ? money(d.revenue, cash) : `${count(d.qty)} sold` }))}
                format={dishBy === 'byQty' ? count : (v) => money(v, cash)} empty="No dishes sold in this period."
              />
            </Card>
            <Card title="Tables" hint="Revenue by table">
              <BarList rows={data.tables.map((t) => ({ label: t.name, value: t.revenue, sub: `${count(t.orders)} orders` }))} format={(v) => money(v, cash)} empty="No table orders in this period." />
            </Card>
          </SimpleGrid>

          {showGuests && (
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: '14px', md: '18px' }}>
              <Card title="Guests" hint={`${count(g.total)} numbers saved · ${count(g.verified)} verified by SMS`}>
                <Donut size={150} thickness={16} center={count(seen)} caption="guests" parts={[{ label: 'New', value: g.newGuests, color: C.gold }, { label: 'Returning', value: g.returning, color: C.ember }]} />
                <Box fontSize="12px" letterSpacing=".12em" textTransform="uppercase" color="mute" mt="22px" mb="14px">Most visits in this period</Box>
                <BarList rows={g.regulars.map((r) => ({ label: r.phone, value: r.visits }))} format={(v) => `${v} visit${v === 1 ? '' : 's'}`} empty="No repeat guests yet." />
              </Card>
              <Card title="Top spenders" hint="Guests who ordered the most, by verified number">
                <BarList rows={g.spenders.map((s) => ({ label: s.phone, value: s.spend, sub: `${count(s.orders)} orders` }))} format={(v) => money(v, cash)} empty="No orders linked to a guest in this period." />
              </Card>
            </SimpleGrid>
          )}

          <Box fontSize="12px" color="mute" mt="4px">
            Times are shown in {data.range.tz.replace('_', ' ')}. Arrows compare with the same length of time just before. Revenue is the value of orders that were not cancelled; settled means the table’s bill is paid.
          </Box>
        </Box>
      )}
    </Box>
  );
}
