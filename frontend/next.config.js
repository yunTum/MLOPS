/** @type {import('next').NextConfig} */
const apiHost = process.env.API_HOST || 'localhost';
const apiPort = process.env.API_PORT || '8000';

const nextConfig = {
    output: 'standalone',
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: `http://${apiHost}:${apiPort}/api/:path*`,
            },
            {
                source: '/server-mlflow/:path*',
                destination: `http://${apiHost}:5000/:path*`,
            }
        ]
    },
}

module.exports = nextConfig
