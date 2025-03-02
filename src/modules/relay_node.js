import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
// import { noise } from '@libp2p/noise'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { identify } from '@libp2p/identify'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'

const relayNode = await createLibp2p({
    addresses: {
        listen: ['/ip4/0.0.0.0/tcp/5001']
    },
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncrypters: [noise()],
    services: {
        identify: identify(),
        relay: circuitRelayServer() // Enable relay
    }
})

await relayNode.start()
console.log(`🚀 Relay node started! Peer ID: ${relayNode.peerId.toString()}`)
