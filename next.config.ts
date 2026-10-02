import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  basePath: process.env.BASE_PATH || '',
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: { root: process.cwd() },
  env: { NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || '' },
};

export default config;
