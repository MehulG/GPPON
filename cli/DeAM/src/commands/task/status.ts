import { Command } from '@oclif/core';
import axios from 'axios';
import chalk from 'chalk';

interface TaskStatusInfo {
  taskID: string;
  status: 'completed' | 'failed' | 'in progress';
  error?: string;
}

export default class TaskStatus extends Command {
  static description = 'Check status of all active tasks';

  static examples = [
    '$ deam task status',
  ];

  async run(): Promise<void> {
    try {
      const response = await axios.get('http://localhost:3000/tasks/status');
      const taskStatuses: TaskStatusInfo[] = response.data;

      if (taskStatuses.length === 0) {
        this.log('No active tasks found.');
        return;
      }

      this.log('\nTask Status Summary:');
      this.log('------------------');

      taskStatuses.forEach(({ taskID, status, error }) => {
        // Color coding based on status
        const statusColor = this.getStatusColor(status);
        this.log(`Task ID: ${chalk.bold(taskID)}`);
        this.log(`Status: ${statusColor(status)}`);
        if (error) {
          this.log(`Error: ${chalk.red(error)}`);
        }
        this.log('------------------');
      });

      // Print summary
      const completed = taskStatuses.filter(t => t.status === 'completed').length;
      const inProgress = taskStatuses.filter(t => t.status === 'in progress').length;
      const failed = taskStatuses.filter(t => t.status === 'failed').length;
      
      this.log(`\nSummary:`);
      this.log(`Total Tasks: ${taskStatuses.length}`);
      this.log(`Completed: ${chalk.green(completed)}`);
      this.log(`In Progress: ${chalk.yellow(inProgress)}`);
      this.log(`Failed: ${chalk.red(failed)}`);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.error(`Failed to fetch task status: ${error.response?.data?.message || error.message}`);
      } else {
        this.error('An unexpected error occurred');
      }
    }
  }

  private getStatusColor(status: TaskStatusInfo['status']) {
    switch (status) {
      case 'completed':
        return chalk.green;
      case 'in progress':
        return chalk.yellow;
      case 'failed':
        return chalk.red;
      default:
        return chalk.white;
    }
  }
}