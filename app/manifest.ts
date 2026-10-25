import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pyramid Coach',
    short_name: 'Pyramid',
    description: 'Evidence-based training and nutrition that plans, runs and adapts itself.',
    start_url: '/today',
    display: 'standalone',
    background_color: '#1a1b17',
    theme_color: '#1a1b17',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
