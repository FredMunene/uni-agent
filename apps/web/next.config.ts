import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

const nextConfig: NextConfig = {
  transpilePackages: ['@uni-agent/shared'],
};

export default nextConfig;
