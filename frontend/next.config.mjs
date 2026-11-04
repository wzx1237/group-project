const api = process.env.GRADEFLOW_API || 'http://127.0.0.1:8000'

const nextConfig = {
  allowedDevOrigins: ['gradeflow.test'],
  experimental: {
    proxyClientMaxBodySize: 200 * 1024 * 1024, // the backend's max_upload_mb
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]
  },
}

export default nextConfig
