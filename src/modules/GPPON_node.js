import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { EventEmitter } from 'events'
import PeerConnectionManager from './PeerConnectionManager.js'

class GPPONNode extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.node = null
    this.peerId = null
    this.discoveredPeers = new Set()
    this.isRegistrar = config.isRegistrar || false
    this.connectionManager = null
  }

  async start() {
    const options = {
      addresses: {
        listen: [`/ip4/127.0.0.1/tcp/${this.config.port}`]
      },
      transports: [tcp()],
      streamMuxers: [mplex()],
      connectionEncrypters: [noise()],
      services: {
        identify: identify(),
        dht: kadDHT({
          clientMode: false,
          protocol: '/gppon/1.0.0',
          initialStabilizeDelay: 1000,
          queryDelay: 500,
          enabled: true,
          querySelfInterval: 1000,
          randomWalk: {
            enabled: true,
            interval: 3000,
            timeout: 1000
          }
        })
      },
      connectionManager: {
        minConnections: 5
      },
      peerDiscovery: [
        ...(this.config.bootstrapList?.length ? [bootstrap({
          list: this.config.bootstrapList,
          timeout: 5000
        })] : []),
        ...(this.config.enableMDNS ? [mdns()] : [])
      ]
    }

    this.node = await createLibp2p(options)
    this.peerId = this.node.peerId.toString()

    // Initialize peer connection manager
    this.connectionManager = new PeerConnectionManager(this.node)

    // Set up event listeners
    this.setupEventListeners()

    await this.node.start()
    console.log(`Node started on port ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} with ID: ${this.peerId}`)
    return this.peerId
  }

  setupEventListeners() {
    // Handle peer discovery
    this.node.addEventListener('peer:discovery', (evt) => {
      try {
        if (evt?.detail?.id) {
          const peerId = evt.detail.id.toString()
          if (!this.discoveredPeers.has(peerId)) {
            this.discoveredPeers.add(peerId)
            this.emit('peerDiscovered', peerId)
          }
        }
      } catch (error) {
        console.error('Error in peer:discovery event:', error)
      }
    })

    // Forward connection manager events
    this.connectionManager.on('peerConnected', (data) => {
      console.log(`Node ${this.config.port}: Connected to peer ${data.peerId}`)
      this.emit('peerConnected', data)
    })

    this.connectionManager.on('peerDisconnected', (data) => {
      console.log(`Node ${this.config.port}: Disconnected from peer ${data.peerId}`)
      this.emit('peerDisconnected', data)
    })

    this.connectionManager.on('heartbeat', (data) => {
      this.emit('heartbeat', data)
    })

    this.connectionManager.on('reconnectFailed', (data) => {
      console.warn(`Node ${this.config.port}: Failed to reconnect to peer ${data.peerId}`)
      this.emit('reconnectFailed', data)
    })
  }

  getMultiaddr() {
    return `/ip4/127.0.0.1/tcp/${this.config.port}/p2p/${this.peerId}`
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers)
  }

  async getNetworkStats() {
    if (this.connectionManager) {
      return await this.connectionManager.getNetworkStats()
    }
    return null
  }

  async disconnectPeer(peerId) {
    if (this.connectionManager) {
      await this.connectionManager.disconnectPeer(peerId)
    }
  }

  async stop() {
    if (this.node) {
      await this.node.stop()
    }
  }
}

export default GPPONNode