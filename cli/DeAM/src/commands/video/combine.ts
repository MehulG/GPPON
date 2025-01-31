import { Command, Flags } from '@oclif/core';
import { cli } from 'cli-ux';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export default class CombineVideos extends Command {
  static description = 'Combine processed video parts into a single video';

  static examples = [
    '$ deam video combine',
    '$ deam video combine --dir ./output',
  ];

  static flags = {
    dir: Flags.string({
      char: 'd',
      description: 'Directory containing video parts',
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CombineVideos);
    
    // Get directory path
    let outputDirectory:any = flags.dir;
    if (!outputDirectory) {
      outputDirectory = await cli.prompt('Enter the directory containing video parts', {
        default: './output',
        required: true,
      });
    }

    // Validate directory
    const resolvedPath = path.resolve(outputDirectory);
    if (!fs.existsSync(resolvedPath)) {
      this.error(`Directory doesn't exist: ${resolvedPath}`);
      return;
    }

    // Get output filename
    const outputFileName = await cli.prompt('Enter the output filename', {
      default: 'final_combined.mp4',
      required: true,
    });

    // Validate filename
    if (!outputFileName.endsWith('.mp4')) {
      this.error('Filename must end with .mp4');
      return;
    }

    // Show confirmation with details
    this.log('\nVideo Combination Details:');
    this.log('------------------------');
    this.log(`Input Directory: ${chalk.blue(resolvedPath)}`);
    this.log(`Output Filename: ${chalk.blue(outputFileName)}`);
    
    const confirmed = await cli.confirm('Proceed with video combination? (y/n)');

    if (!confirmed) {
      this.log(chalk.yellow('Operation cancelled'));
      return;
    }

    cli.action.start('Combining videos');

    try {
      const response = await axios.post(
        'http://localhost:3000/combine-videos',
        {
          outputDirectory: resolvedPath,
          outputFileName,
        },
        {
          responseType: 'stream',
        }
      );

      // Create write stream for combined video
      const outputPath = path.join(process.cwd(), outputFileName);
      const writer = fs.createWriteStream(outputPath);

      // Pipe the response to the file
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          cli.action.stop(chalk.green('done'));
          this.log(`Output saved to: ${chalk.blue(outputPath)}`);
          resolve();
        });

        writer.on('error', (error) => {
          cli.action.stop(chalk.red('failed'));
          fs.unlink(outputPath, () => {});
          this.error(`Failed to save combined video: ${error.message}`);
          reject(error);
        });

        // Handle response errors
        response.data.on('error', (error: Error) => {
          cli.action.stop(chalk.red('failed'));
          fs.unlink(outputPath, () => {});
          this.error(`Error receiving video data: ${error.message}`);
          reject(error);
        });
      });

    } catch (error) {
      cli.action.stop(chalk.red('failed'));
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          this.error(`Invalid request: ${error.response.data.message}`);
        } else if (error.response?.status === 500) {
          this.error(`Server error: ${error.response.data.message}`);
        } else {
          this.error(`Failed to combine videos: ${error.message}`);
        }
      } else {
        this.error('An unexpected error occurred');
      }
    }
  }
}