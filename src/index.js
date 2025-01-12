// index.js
import { setupNetwork } from './setup.js'
import { config } from './config.js'
import { createAndMonitorTask, TASK_CONFIGS } from './createTask.js'

async function main() {
    let network = null
    try {
        console.log('Initializing GPPON network...')
        network = await setupNetwork(config)
        console.log('Network setup complete')

        // Wait a bit for the network to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get a non-registrar node to create tasks
        const taskNode = network.nodes[0] // First non-registrar node
        console.log(taskNode.peerId);

        try {
            const result = await createAndMonitorTask(
                taskNode,
                TASK_CONFIGS.nginxServer
            )
            console.log('Task execution completed:', result)
        } catch (error) {
            console.error('Task execution failed:', error)
        }

        // Setup cleanup
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