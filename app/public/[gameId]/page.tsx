import PublicScreen from '@/components/PublicScreen';

export const dynamic = 'force-dynamic';

export default async function PublicPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <PublicScreen gameId={gameId} />;
}
