export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, service: 'pyramid-coach', time: new Date().toISOString() });
}
