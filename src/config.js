// config.js
import dotenv from 'dotenv'
dotenv.config()

export const config = {
  registrarCount: parseInt(process.env.REGISTRAR_COUNT),
  nodeCount: parseInt(process.env.NODE_COUNT),
  baseRegistrarPort: parseInt(process.env.BASE_REGISTRAR_PORT),
  statusInterval: parseInt(process.env.STATUS_INTERVAL),
  enableMDNS: process.env.ENABLE_MDNS === 'true',
  startupDelay: parseInt(process.env.STARTUP_DELAY)
}