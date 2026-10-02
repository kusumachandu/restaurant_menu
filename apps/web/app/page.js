import MenuClient from '@/components/MenuClient';
import { getMenu } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { settings } = await getMenu();
  return { title: `${settings.name} · Menu`, description: settings.tagline || 'Digital menu' };
}

export default async function Page() {
  const menu = await getMenu();
  return <MenuClient menu={menu} />;
}
