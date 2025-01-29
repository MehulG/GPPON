import {Command, Flags} from '@oclif/core'
import {cli} from 'cli-ux'
import fetch from 'node-fetch'

interface NetworkConfig {
  registrarCount: number
  nodeCount: number
  baseRegistrarPort: number
  enableMDNS: boolean
  startupDelay: number
  statusInterval: number
}

interface NetworkResponse {
  id: string
  config: NetworkConfig
  registrars: {
    port: number
    multiaddr: string
    peerCount: number
  }[]
  nodes: {
    port: number
    peerCount: number
  }[]
}

export default class NetworkStart extends Command {
  static override description = 'Start the network with specified configuration'

  static override examples = [
    '<%= config.bin %> network start',
    '<%= config.bin %> network start --registrar-count 3',
    '<%= config.bin %> network start --no-interactive',
  ]

  static override flags = {
    'registrar-count': Flags.integer({
      description: 'Number of registrars to start',
      default: 2,
    }),
    'node-count': Flags.integer({
      description: 'Number of nodes to start',
      default: 5,
    }),
    'base-registrar-port': Flags.integer({
      description: 'Base port for registrars',
      default: 6000,
    }),
    'enable-mdns': Flags.boolean({
      description: 'Enable MDNS',
      default: true,
      allowNo: true,
    }),
    'startup-delay': Flags.integer({
      description: 'Startup delay in milliseconds',
      default: 500,
    }),
    'status-interval': Flags.integer({
      description: 'Status check interval in milliseconds',
      default: 10000,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed response information',
      default: false,
    }),
    interactive: Flags.boolean({
      char: 'i',
      description: 'Enable interactive mode',
      default: true,
      allowNo: true,
    }),
  }

  private defaultConfig: NetworkConfig = {
    registrarCount: 2,
    nodeCount: 5,
    baseRegistrarPort: 6000,
    enableMDNS: true,
    startupDelay: 500,
    statusInterval: 10000,
  }

  private async promptForConfig(): Promise<NetworkConfig> {
    const config: NetworkConfig = {
      registrarCount: Number(await cli.prompt('Number of registrars', {
        default: String(this.defaultConfig.registrarCount),
      })),
      nodeCount: Number(await cli.prompt('Number of nodes', {
        default: String(this.defaultConfig.nodeCount),
      })),
      baseRegistrarPort: Number(await cli.prompt('Base registrar port', {
        default: String(this.defaultConfig.baseRegistrarPort),
      })),
      enableMDNS: (await cli.prompt('Enable MDNS? (Y/n)', {
        default: 'Y',
      })).toLowerCase().startsWith('y'),
      startupDelay: Number(await cli.prompt('Startup delay (ms)', {
        default: String(this.defaultConfig.startupDelay),
      })),
      statusInterval: Number(await cli.prompt('Status check interval (ms)', {
        default: String(this.defaultConfig.statusInterval),
      })),
    }
    return config
  }

  private displayConfig(config: NetworkConfig) {
    this.log('\nNetwork Configuration:')
    this.log('--------------------')
    this.log(`Registrars:         ${config.registrarCount}`)
    this.log(`Nodes:              ${config.nodeCount}`)
    this.log(`Base Port:          ${config.baseRegistrarPort}`)
    this.log(`MDNS:               ${config.enableMDNS ? 'Enabled' : 'Disabled'}`)
    this.log(`Startup Delay:      ${config.startupDelay}ms`)
    this.log(`Status Interval:    ${config.statusInterval}ms`)
    this.log('--------------------')
  }

  private displayNetworkInfo(info: NetworkResponse) {
    this.log(`\nNetwork ID: ${info.id}`)
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(NetworkStart)
    let config: NetworkConfig

    if (flags.interactive) {
      config = await this.promptForConfig()
      this.displayConfig(config)
      
      const proceed = (await cli.prompt('\nProceed with this configuration? (Y/n)', {
        default: 'Y',
      })).toLowerCase().startsWith('y')
      
      if (!proceed) {
        this.log('Operation cancelled')
        return
      }
    } else {
      config = {
        registrarCount: flags['registrar-count'],
        nodeCount: flags['node-count'],
        baseRegistrarPort: flags['base-registrar-port'],
        enableMDNS: flags['enable-mdns'],
        startupDelay: flags['startup-delay'],
        statusInterval: flags['status-interval'],
      }
    }

    try {
      cli.action.start('Starting network')

      const response = await fetch('http://localhost:3000/network/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      if (response.ok) {
        cli.action.stop('done')
        this.log('✓ Network started successfully!')
        
        const responseBody = await response.text()
        try {
          const networkInfo = JSON.parse(responseBody) as NetworkResponse
          this.displayNetworkInfo(networkInfo)
          
          if (flags.verbose) {
            this.log('\nRaw Response:')
            this.log(JSON.stringify(networkInfo, null, 2))
          }
        } catch (error) {
          this.log('\nCould not parse network information:', responseBody)
        }
      } else {
        cli.action.stop('failed')
        const errorBody = await response.text()
        this.error(`Failed to start network. Status: ${response.status}\nError: ${errorBody}`)
      }
    } catch (error: any) {
      cli.action.stop('failed')
      this.error(`Error starting network: ${error.message}`)
    }
  }
}