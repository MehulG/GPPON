// PeerConnectionManager.js
import { EventEmitter } from 'events'

class PeerConnectionManager extends EventEmitter {
  constructor(node) {
    super()
    this.node = node
    this.connections = new Map()
    this.connectionAttempts = new Map()
    this.maxRetries = 3
    this.reconnectDelay = 5000
    this.heartbeatInterval = 30000
    this.knownPeers = new Set()
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Monitor connections directly
    setInterval(() => {
      this.checkConnections()
    }, 1000)

    // Handle basic events for logging
    this.node.addEventListener('peer:connect', () => {
      this.checkConnections()
    })

    this.node.addEventListener('peer:disconnect', () => {
      this.checkConnections()
    })
  }

  async checkConnections() {
    try {
      // Get current connections
      const currentConnections = new Set(
        Array.from(this.node.getConnections())
          .map(conn => conn.remotePeer.toString())
      )

      // Handle new connections
      for (const peerId of currentConnections) {
        if (!this.knownPeers.has(peerId)) {
          this.knownPeers.add(peerId)
          await this.handlePeerConnect(peerId)
        }
      }

      // Handle disconnections
      for (const peerId of this.knownPeers) {
        if (!currentConnections.has(peerId)) {
          this.knownPeers.delete(peerId)
          await this.handlePeerDisconnect(peerId)
        }
      }
    } catch (error) {
      console.error('Error checking connections:', error)
    }
  }

  async handlePeerConnect(peerId) {
    if (!peerId) return

    this.connections.set(peerId, {
      status: 'connected',
      lastSeen: Date.now(),
      metrics: {
        latency: null,
        reliability: 1.0,
        bandwidth: { up: 0, down: 0 }
      }
    })

    this.connectionAttempts.delete(peerId)
    this.startHeartbeat(peerId)
    
    // console.log(`Node ${this.node.peerId.toString().slice(-4)}: Connected to peer ${peerId}`)
    this.emit('peerConnected', {
      peerId,
      timestamp: Date.now(),
      connectionState: this.connections.get(peerId)
    })
  }

  async handlePeerDisconnect(peerId) {
    if (!peerId) return

    const connection = this.connections.get(peerId)
    if (connection) {
      connection.status = 'disconnected'
      connection.lastSeen = Date.now()
      
      const attempts = this.connectionAttempts.get(peerId) || 0
      if (attempts < this.maxRetries) {
        this.connectionAttempts.set(peerId, attempts + 1)
        setTimeout(() => this.attemptReconnect(peerId), this.reconnectDelay)
      } else {
        this.connections.delete(peerId)
        this.connectionAttempts.delete(peerId)
      }

      console.log(`Node ${this.node.peerId.toString().slice(-4)}: Disconnected from peer ${peerId}`)
      this.emit('peerDisconnected', {
        peerId,
        timestamp: Date.now(),
        attempts
      })
    }
  }

  async attemptReconnect(peerId) {
    try {
      const peer = await this.node.peerStore.get(peerId)
      if (peer) {
        await this.node.dial(peer.id)
        console.log(`Successfully reconnected to peer ${peerId}`)
      }
    } catch (error) {
      console.error(`Failed to reconnect to peer ${peerId}:`, error)
      this.emit('reconnectFailed', {
        peerId,
        timestamp: Date.now(),
        error: error.message
      })
    }
  }

  async startHeartbeat(peerId) {
    const interval = setInterval(async () => {
      try {
        const connection = this.connections.get(peerId)
        if (!connection || connection.status !== 'connected') {
          clearInterval(interval)
          return
        }

        const startTime = Date.now()
        const isConnected = this.node.getConnections()
          .some(conn => conn.remotePeer.toString() === peerId)
        
        if (!isConnected) {
          throw new Error('Peer no longer connected')
        }

        const latency = Date.now() - startTime
        connection.metrics.latency = latency
        connection.metrics.reliability = this.calculateReliability(peerId, true)
        connection.lastSeen = Date.now()

        this.emit('heartbeat', {
          peerId,
          timestamp: Date.now(),
          metrics: connection.metrics
        })
      } catch (error) {
        clearInterval(interval)
        await this.handlePeerDisconnect(peerId)
      }
    }, this.heartbeatInterval)
  }

  calculateReliability(peerId, pingSuccess) {
    const connection = this.connections.get(peerId)
    if (!connection) return 0
    
    const alpha = 0.2
    const currentReliability = connection.metrics.reliability
    return alpha * (pingSuccess ? 1 : 0) + (1 - alpha) * currentReliability
  }

  getPeerConnections() {
    return Array.from(this.connections.entries()).map(([peerId, state]) => ({
      peerId,
      ...state
    }))
  }

  getConnectionMetrics(peerId) {
    return this.connections.get(peerId)?.metrics || null
  }

  async getNetworkStats() {
    const connectedPeers = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected')
    
    return {
      totalPeers: this.connections.size,
      activePeers: connectedPeers.length,
      averageLatency: connectedPeers.reduce((sum, conn) => sum + (conn.metrics.latency || 0), 0) / connectedPeers.length || 0,
      totalBandwidthUp: connectedPeers.reduce((sum, conn) => sum + conn.metrics.bandwidth.up, 0),
      totalBandwidthDown: connectedPeers.reduce((sum, conn) => sum + conn.metrics.bandwidth.down, 0)
    }
  }
}

export default PeerConnectionManager