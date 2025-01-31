import {Args, Command, Flags} from '@oclif/core'
import fetch from 'node-fetch'

export default class Ping extends Command {
  static override description = 'Ping a URL and get response details'

  static override examples = [
    '<%= config.bin %> ping https://google.com',
    '<%= config.bin %> ping https://google.com --timeout 5000',
    '<%= config.bin %> ping https://google.com --verbose',
  ]

  static override flags = {
    timeout: Flags.integer({
      char: 't',
      description: 'timeout in milliseconds',
      default: 3000,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'show detailed response information',
      default: false,
    }),
  }

  static override args = {
    url: Args.string({
      description: 'URL to ping',
      required: true,
      default: 'https://google.com',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Ping)
    const startTime = Date.now()

    try {
      this.log(`Pinging ${args.url}...`)

      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort()
      }, flags.timeout)

      const response = await fetch(args.url, {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const endTime = Date.now()
      const duration = endTime - startTime

      if (response.ok) {
        this.log(`✓ Success! Response received in ${duration}ms`)
        
        if (flags.verbose) {
          this.log('\nResponse details:')
          this.log(`Status: ${response.status} ${response.statusText}`)
          this.log('Headers:')
          response.headers.forEach((value, name) => {
            this.log(`  ${name}: ${value}`)
          })
          
          const body = await response.text()
          this.log(`\nBody length: ${body.length} characters`)
        }
      } else {
        this.error(`HTTP error! Status: ${response.status} ${response.statusText}`)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.error(`Request timed out after ${flags.timeout}ms`)
      } else {
        this.error(`Failed to ping ${args.url}: ${error.message}`)
      }
    }
  }
}