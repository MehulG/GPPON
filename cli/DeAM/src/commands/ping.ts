import {Args, Command, Flags} from '@oclif/core'
import fetch from 'node-fetch'

export default class Ping extends Command {
  static override description = 'Make HTTP requests to a URL and get response details'

  static override examples = [
    '<%= config.bin %> ping https://api.example.com',
    '<%= config.bin %> ping https://api.example.com --method POST',
    '<%= config.bin %> ping https://api.example.com --method POST --data \'{"key": "value"}\'',
    '<%= config.bin %> ping https://api.example.com --headers \'{"Authorization": "Bearer token"}\'',
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
    method: Flags.string({
      char: 'm',
      description: 'HTTP method to use',
      default: 'GET',
      options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    }),
    data: Flags.string({
      char: 'd',
      description: 'request body data as JSON string',
      default: '',
    }),
    headers: Flags.string({
      char: 'h',
      description: 'request headers as JSON string',
      default: '{}',
    }),
    contentType: Flags.string({
      char: 'c',
      description: 'content type header',
      default: 'application/json',
    }),
  }

  static override args = {
    url: Args.string({
      description: 'URL to send request to',
      required: true,
      default: 'https://google.com',
    }),
  }

  private parseJSON(str: string, defaultValue: any = {}): any {
    try {
      return str ? JSON.parse(str) : defaultValue
    } catch (error:any) {
      this.error(`Invalid JSON: ${error.message}`)
      return defaultValue
    }
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Ping)
    const startTime = Date.now()

    try {
      // Parse headers and data
      const headers = this.parseJSON(flags.headers)
      const data = this.parseJSON(flags.data)
      
      // Set content type if body is present
      if (flags.method !== 'GET' && flags.data) {
        headers['Content-Type'] = flags.contentType
      }

      this.log(`Sending ${flags.method} request to ${args.url}...`)

      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort()
      }, flags.timeout)

      // Prepare fetch options
      const fetchOptions: any = {
        method: flags.method,
        headers,
        signal: controller.signal,
      }

      // Add body for non-GET requests if data is provided
      if (flags.method !== 'GET' && flags.data) {
        fetchOptions.body = JSON.stringify(data)
      }

      const response = await fetch(args.url, fetchOptions)
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
          try {
            // Try to parse and display JSON response
            const jsonBody = JSON.parse(body)
            this.log('Response body:')
            this.log(JSON.stringify(jsonBody, null, 2))
          } catch {
            // If not JSON, show raw body if not too long
            if (body.length < 1000) {
              this.log('Response body:')
              this.log(body)
            }
          }
        }
      } else {
        this.error(`HTTP error! Status: ${response.status} ${response.statusText}`)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.error(`Request timed out after ${flags.timeout}ms`)
      } else {
        this.error(`Request failed: ${error.message}`)
      }
    }
  }
}