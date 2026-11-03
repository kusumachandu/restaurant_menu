'use client';
import { useMemo, useState } from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import { PageHeader } from './shell/AdminShell';
import { BarList, Card, Donut, Empty, Insight, Kpi, Legend, RangePicker, Segmented, Skeleton, Spark, Stat, TrendChart } from './charts';
import { C } from '@/components/menu/ui';
import { change, count, loadRange, money, percent, ratio, saveRange, useStats } from '@/lib/stats';

const AGO = (d) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};
const age = (d) => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return days < 1 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`; };

// Platform owner's overview: every restaurant together. Amounts are added up as rupees.
export default function PlatformDashboard({ onOpenRestaurants }) {
  const [pick, setPick] = useState(loadRange);
  const [metric, setMetric] = useState('revenue');
  const choose = (p) => { setPick(p); saveRange(p); };
  const { data, error, loading, reload } = useStats('/super/analytics', pick);
  const cash = '₹';
  const cur = data?.totals.cur;
  const prev = data?.totals.prev;
  const rs = data?.restaurants;
  const wh = data?.webhooks;
  const sparks = useMemo(() => (data ? {
    revenue: data.series.map((s) => s.revenue),
    orders: data.series.map((s) => s.orders),
  } : null), [data]);
  const delivered = wh ? ratio(wh.sent, wh.sent + wh.pending + wh.failed) : 0;

  return (
    <Box>
      <PageHeader
        eyebrow="Platform" title="Overview"
        subtitle={(
          <>
            {data ? `All restaurants · updated ${AGO(data.generatedAt)}` : 'loading…'}
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
            <Kpi label="Revenue" icon="cash" value={cur.revenue} format={(v) => money(v, cash)} delta={change(cur.revenue, prev.revenue)} sub="through the menus" hint="Value of orders placed through all restaurants, not counting cancelled orders." spark={<Spark values={sparks.revenue} />} />
            <Kpi label="Orders" icon="bag" value={cur.orders} delta={change(cur.orders, prev.orders)} sub={`${count(cur.cancelled)} cancelled`} spark={<Spark values={sparks.orders} color={C.ember} />} />
            <Kpi
              label="Restaurants" icon="building" value={rs.active} sub={`${rs.added ? `${rs.added} joined · ` : ''}${rs.total} in total${rs.suspended ? ` · ${rs.suspended} suspended` : ''}`} hint="Active restaurants, and how many joined in this period."
              foot={<Box h="6px" borderRadius="99px" bg="rgba(233,213,176,.08)" overflow="hidden" mt="14px"><Box h="100%" w={`${rs.total ? (rs.active / rs.total) * 100 : 0}%`} bg={`linear-gradient(90deg, ${C.ember}, ${C.gold})`} borderRadius="99px" /></Box>}
            />
            <Kpi
              label="Selling now" icon="trend" value={rs.selling} format={(v) => `${Math.round(v)} / ${rs.active}`} sub="restaurants with orders" hint="Active restaurants that received at least one order in this period."
              foot={<Box h="6px" borderRadius="99px" bg="rgba(233,213,176,.08)" overflow="hidden" mt="14px"><Box h="100%" w={`${rs.active ? (rs.selling / rs.active) * 100 : 0}%`} bg={`linear-gradient(90deg, ${C.ember}, ${C.gold})`} borderRadius="99px" /></Box>}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 2, xl: 4 }} spacing={{ base: '14px', md: '18px' }}>
            <Stat icon="seat" label="Tables seated" value={data.guests.visits} delta={change(data.guests.visits, data.guests.prevVisits)} sub="guest check-ins" />
            <Stat icon="guests" label="People" value={data.guests.people} />
            <Stat icon="spark" label="New guests" value={data.guests.newGuests} delta={change(data.guests.newGuests, data.guests.prevNewGuests)} sub={`${count(data.guests.total)} saved in all`} />
            <Stat icon="receipt" label="Average order" value={cur.avgOrder} format={(v) => money(v, cash)} delta={change(cur.avgOrder, prev.avgOrder)} />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={{ base: '14px', md: '18px' }}>
            <Card
              gridColumn={{ xl: 'span 2' }} title={metric === 'revenue' ? 'Revenue over time' : 'Orders over time'} hint={data.range.bucket === 'hour' ? 'By the hour' : 'By day'}
              action={<Flex gap="14px" align="center" wrap="wrap"><Legend /><Segmented size="sm" label="Show" options={[['revenue', 'Revenue'], ['orders', 'Orders']]} value={metric} onChange={setMetric} /></Flex>}
            >
              {cur.orders === 0 && prev.orders === 0 ? <Empty>No orders on the platform in this period yet.</Empty> : (
                <TrendChart series={data.series} metric={metric} currency={cash} bucket={data.range.bucket} tz={data.range.tz} />
              )}
            </Card>
            <Card title="Adoption" hint="How restaurants use the platform">
              <Insight icon="seat" label="Guest check-in on" value={`${rs.withCheckIn} of ${rs.active} restaurants`} sub={`${percent(ratio(rs.withCheckIn, rs.active))} of active`} />
              <Insight icon="plug" label="Webhook on" value={`${rs.withWebhook} of ${rs.active} restaurants`} sub={`${percent(ratio(rs.withWebhook, rs.active))} of active`} />
              <Insight icon="alert" label="Webhook delivered (24 h)" value={wh.sent + wh.pending + wh.failed ? percent(delivered) : 'No events yet'} sub={`${count(wh.sent)} sent · ${count(wh.pending)} retrying · ${count(wh.failed)} failed`} />
            </Card>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: '14px', md: '18px' }}>
            <Card title="Top restaurants" hint="By revenue in this period">
              <BarList rows={data.top.map((t) => ({ label: t.name, value: t.revenue, sub: `${count(t.orders)} orders · ${t.plan}` }))} format={(v) => money(v, cash)} empty="No restaurant has received an order in this period." />
            </Card>
            <Card title="Needs a call" hint="Restaurants on an ordering plan with no orders in this period">
              {data.quiet.length === 0 ? <Empty icon="spark">Every ordering restaurant received orders.</Empty> : (
                <Box as="ul" listStyleType="none" m={0} p={0}>
                  {data.quiet.map((q) => (
                    <Flex as="li" key={q.id} justify="space-between" gap={3} py="12px" borderTop="1px solid" borderColor="line" _first={{ borderTop: 0, pt: 0 }}>
                      <Flex gap="12px" align="center" minW={0}>
                        <Flex flex="none" w="36px" h="36px" borderRadius="11px" align="center" justify="center" bg="rgba(226,89,78,.12)" color={C.nonveg} fontWeight={700}>{q.name.slice(0, 1).toUpperCase()}</Flex>
                        <Box minW={0}>
                          <Text fontWeight={700} noOfLines={1}>{q.name}</Text>
                          <Text fontSize="12.5px" color="mute" noOfLines={1}>/r/{q.slug} · joined {age(q.since)}</Text>
                        </Box>
                      </Flex>
                      <Text alignSelf="center" fontSize="11px" letterSpacing=".12em" textTransform="uppercase" px="10px" py="3px" borderRadius="99px" bg="rgba(212,168,75,.12)" color={C.goldSoft}>{q.plan}</Text>
                    </Flex>
                  ))}
                </Box>
              )}
              {onOpenRestaurants && (
                <Box as="button" type="button" onClick={onOpenRestaurants} mt="16px" px="16px" py="8px" borderRadius="99px" border="1px solid" borderColor={C.lineHi} color={C.goldSoft} fontWeight={600} fontSize="13.5px" _hover={{ bg: 'rgba(212,168,75,.1)' }}>Manage restaurants</Box>
              )}
            </Card>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: '14px', md: '18px' }}>
            <Card title="Plans" hint="Active restaurants on each plan">
              <Donut size={150} thickness={16} center={count(rs.active)} caption="active" parts={rs.plans.map((p, i) => ({ label: p.label, value: p.active, color: [C.mute, C.ember, C.gold][i % 3] }))} />
              {rs.suspended > 0 && <Text fontSize="13px" color="mute" mt="14px">{rs.suspended} suspended restaurant{rs.suspended === 1 ? '' : 's'} not counted.</Text>}
            </Card>
            <Card title="Webhook deliveries" hint="Events in the last 24 hours">
              <Donut size={150} thickness={16} center={count(wh.sent + wh.pending + wh.failed)} caption="events" parts={[{ label: 'Delivered', value: wh.sent, color: C.gold }, { label: 'Retrying', value: wh.pending, color: C.mute }, { label: 'Failed', value: wh.failed, color: C.nonveg }]} />
              {wh.failed > 0 && <Text fontSize="13px" color={C.nonveg} mt="14px">{wh.failed} event{wh.failed === 1 ? '' : 's'} gave up after all retries. The restaurant can press Retry in its Webhook settings.</Text>}
            </Card>
          </SimpleGrid>

          <Box fontSize="12px" color="mute" mt="4px">
            Times are shown in {data.range.tz.replace('_', ' ')}. Arrows compare with the same length of time just before. Revenue adds up every restaurant’s orders as {cash}.
          </Box>
        </Box>
      )}
    </Box>
  );
}
