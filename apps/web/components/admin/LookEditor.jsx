'use client';
import { useRef } from 'react';
import { Box, Button, Flex, SimpleGrid, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Text } from '@chakra-ui/react';
import Dish3D from '../Dish3D';
import { DEFAULT_LOOK, LOOK_FIELDS, resolveLook } from '@/lib/look';

/** Live 3D preview plus lighting sliders. Drag the preview to check every angle. */
export default function LookEditor({ dish, currency, look, onChange }) {
  const api = useRef(null);
  const cur = resolveLook(look);
  return (
    <Box display="grid" gap="10px" mt={1}>
      <Text fontWeight="bold">3D look</Text>
      <Dish3D dish={dish} currency={currency} look={cur} mode="viewer" apiRef={api} width="min(100%, 360px)" />
      <Text color="mute" fontSize="14px" textAlign="center">Drag to rotate · scroll or pinch to zoom. Changes show instantly.</Text>
      <SimpleGrid minChildWidth="220px" columnGap="18px" rowGap="10px">
        {LOOK_FIELDS.map(([k, label, min, max, step]) => (
          <Box key={k}>
            <Flex justify="space-between" fontSize="13px" fontWeight={600} color="mute" id={`look-${k}`}>
              <Text>{label}</Text>
              <Text fontWeight={500}>{Number(cur[k]).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</Text>
            </Flex>
            <Slider aria-labelledby={`look-${k}`} min={min} max={max} step={step} value={cur[k]} onChange={(v) => onChange({ ...cur, [k]: v })} focusThumbOnChange={false}>
              <SliderTrack bg="line"><SliderFilledTrack bg="ac" /></SliderTrack>
              <SliderThumb />
            </Slider>
          </Box>
        ))}
      </SimpleGrid>
      <Flex gap={2} wrap="wrap">
        <Button type="button" variant="outline" onClick={() => api.current?.reset()}>Reset view</Button>
        <Button type="button" variant="outline" onClick={() => onChange({ ...DEFAULT_LOOK })}>Reset lighting</Button>
      </Flex>
    </Box>
  );
}
