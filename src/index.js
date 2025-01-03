import { setupNetwork } from './setup.js'
import { config } from './config.js'

async function main() {
    let network = null
    try {
        console.log('Initializing GPPON network...')
        network = await setupNetwork(config)
        console.log('Network setup complete')

        process.on('SIGINT', async () => {
            console.log('\nShutting down GPPON network...')
            if (network) {
                network.cleanup()
                await Promise.all([
                    ...network.registrars.map(r => r.stop()),
                    ...network.nodes.map(n => n.stop())
                ])
            }
            process.exit(0)
        })

        process.stdin.resume()

    } catch (error) {
        console.error('Failed to initialize network:', error)
        if (network) {
            network.cleanup()
        }
        process.exit(1)
    }
}

main()