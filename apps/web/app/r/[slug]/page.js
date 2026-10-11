import { notFound } from 'next/navigation';
import MenuClient from '@/components/MenuClient';
import { getMenu } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }) {
  const menu = await getMenu(params.slug, searchParams.t);
  if (!menu) return { title: 'Menu not found' };
  return { title: `${menu.settings.name} · Menu`, description: menu.settings.tagline || 'Digital menu' };
}

export default async function Page({ params, searchParams }) {
  const menu = await getMenu(params.slug, searchParams.t);
  if (!menu) notFound();
  return <MenuClient menu={menu} tableToken={searchParams.t} />;
}
